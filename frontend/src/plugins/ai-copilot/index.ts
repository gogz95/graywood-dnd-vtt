import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import DualChatPanel from '$lib/components/ai/DualChatPanel.svelte';
import {
  ollamaBridge,
  buildTacticalSystemPrompt,
  queryLocalLlm
} from './services/ollamaBridge.svelte';

export { ollamaBridge, buildTacticalSystemPrompt, queryLocalLlm };

export const aiCopilotPlugin: VttPlugin = {
  id: 'ai-copilot',
  name: 'Local Ollama Copilot & Rules Archivist',
  version: '1.0.0',
  description: 'Local Ollama AI copilot, tactical battlemat prompts, and 5e SRD rules archivist',
  enabledByDefault: true,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'AI Archivist & Copilot',
      icon: 'sparkles',
      mount(container: HTMLElement, _context: PluginContext) {
        const app = mount(DualChatPanel, {
          target: container,
          props: { initialMode: 'dual' } as Record<string, unknown>
        });
        return {
          destroy: () => {
            unmount(app);
          }
        };
      }
    }
  ],
  onInit(context: PluginContext) {
    context.on<any>('DAMAGE_APPLIED', (payload) => {
      const actorName =
        payload?.actorName || payload?.targetName || payload?.targetId || 'Combatant';
      const amount = payload?.damage ?? payload?.amount ?? 0;
      const dmgType = payload?.damageType || 'damage';
      ollamaBridge.addCombatLog(`${actorName} took ${amount} ${dmgType}.`);
    });

    context.on<any>('COMBAT_TURN_CHANGED', (payload) => {
      const round = payload?.round ?? '?';
      const actorName =
        payload?.actorName || payload?.currentActor || payload?.actorId || 'Combatant';
      ollamaBridge.addCombatLog(`Round ${round}: ${actorName}'s turn began.`);
    });
  }
};
