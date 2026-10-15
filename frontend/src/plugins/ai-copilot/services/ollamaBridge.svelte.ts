// frontend/src/plugins/ai-copilot/services/ollamaBridge.svelte.ts
// Local Ollama AI Copilot & Rules Archivist Bridge with Svelte 5 Runes

import type { PluginContext } from '$lib/types/plugin';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class OllamaBridge {
  selectedModel = $state('llama3.1:8b');
  isGenerating = $state(false);
  recentCombatLog = $state<string[]>([]);
  chatHistory = $state<ChatMessage[]>([]);

  addCombatLog(entry: string): void {
    this.recentCombatLog.push(entry);
    if (this.recentCombatLog.length > 15) {
      this.recentCombatLog.splice(0, this.recentCombatLog.length - 15);
    }
  }

  buildTacticalSystemPrompt(
    context: PluginContext,
    mode: 'copilot' | 'archivist' = 'copilot'
  ): string {
    const sceneId = context.activeSceneId() || 'none';
    const turnActorId = context.activeTurnActorId() || 'none';

    let prompt =
      mode === 'archivist'
        ? 'You are an authoritative D&D 5e SRD 5.1 rules referee and rules archivist. Cite specific rules, DCs, and conditions precisely. Be direct, concise, and mechanical.'
        : 'You are an improvisational D&D 5e Dungeon Master copilot. Suggest dynamic narrative twists, tactical monster tactics, sensory environmental descriptions, and situational DCs.';

    prompt += `\n\n[Active Tactical Context]\n- Active Scene ID: ${sceneId}\n- Active Turn Actor ID: ${turnActorId}`;

    if (this.recentCombatLog.length > 0) {
      prompt += `\n- Recent Combat Events (Chronological):\n${this.recentCombatLog.map((log) => `  * ${log}`).join('\n')}`;
    } else {
      prompt += `\n- Recent Combat Events: No active combat logs recorded yet.`;
    }

    return prompt;
  }

  async queryLocalLlm(
    prompt: string,
    mode: 'copilot' | 'archivist',
    context: PluginContext
  ): Promise<string> {
    this.isGenerating = true;

    // Process slash commands
    let userContent = prompt.trim();
    let systemPrefix = '';

    if (userContent.startsWith('/npc')) {
      userContent = userContent.replace(/^\/npc\s*/, '');
      systemPrefix =
        'Task: Generate a memorable D&D 5e NPC including Name, Race/Class, Distinct Physical Quirk, Personality Trait, Secret Motivation, and quick stat block reference.';
    } else if (userContent.startsWith('/scene')) {
      userContent = userContent.replace(/^\/scene\s*/, '');
      systemPrefix =
        'Task: Describe a vivid battlemat scene setting with sensory lighting, cover obstacles, dynamic terrain hazards, and atmosphere.';
    } else if (userContent.startsWith('/trap')) {
      userContent = userContent.replace(/^\/trap\s*/, '');
      systemPrefix =
        'Task: Design a dangerous 5e hazard or trap including Detection DC, Trigger mechanism, Saving Throw/Damage, and Countermeasures/Disarm DC.';
    } else if (userContent.startsWith('/rule')) {
      userContent = userContent.replace(/^\/rule\s*/, '');
      systemPrefix =
        'Task: Deliver an authoritative 5e SRD rules adjudication detailing exact mechanics, action economy, and conditions.';
    }

    const effectivePrompt = systemPrefix ? `${systemPrefix}\n\nQuery: ${userContent}` : userContent;

    this.chatHistory.push({ role: 'user', content: prompt });

    const systemPrompt = this.buildTacticalSystemPrompt(context, mode);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.chatHistory.slice(-6).map((msg) => ({
        role: msg.role,
        content: msg.role === 'user' && msg.content === prompt ? effectivePrompt : msg.content
      }))
    ];

    try {
      const response = await fetch('/api/proxy/llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.selectedModel,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama proxy error HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage =
        data.message?.content ||
        data.response ||
        data.choices?.[0]?.message?.content ||
        'No response received from local LLM.';

      this.chatHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      return assistantMessage;
    } catch (err) {
      const fallbackMsg = `[Copilot Offline] Failed to reach /api/proxy/llm: ${err instanceof Error ? err.message : String(err)}`;
      this.chatHistory.push({
        role: 'assistant',
        content: fallbackMsg
      });
      return fallbackMsg;
    } finally {
      this.isGenerating = false;
    }
  }
}

export const ollamaBridge = new OllamaBridge();

export function buildTacticalSystemPrompt(context: PluginContext): string {
  return ollamaBridge.buildTacticalSystemPrompt(context, 'copilot');
}

export function queryLocalLlm(
  prompt: string,
  mode: 'copilot' | 'archivist',
  context: PluginContext
): Promise<string> {
  return ollamaBridge.queryLocalLlm(prompt, mode, context);
}
