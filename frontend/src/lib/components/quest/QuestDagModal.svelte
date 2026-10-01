<!-- src/lib/components/quest/QuestDagModal.svelte -->
<!-- Interactive Visual Quest DAG — prerequisite graph, objectives, branching outcomes -->

<script lang="ts">
  import {
    STARTER_CAMPAIGN_QUESTS,
    type QuestStatusChangeEvent,
  } from '$lib/services/questEngine';
  import type { QuestNode, QuestNodeStatus } from '$lib/types/campaign';
  import { compendiumDb } from '$lib/db/compendiumDb';
  import { onMount } from 'svelte';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let nodes = $state<QuestNode[]>([]);
  let selectedNode = $state<QuestNode | null>(null);
  let isLoading = $state(true);
  let filterStatus = $state<QuestNodeStatus | 'all'>('all');

  const STATUS_CONFIG: Record<QuestNodeStatus, { label: string; color: string; bg: string; icon: string }> = {
    active:    { label: 'Active',    color: 'text-sky-300',     bg: 'bg-sky-950 border-sky-700',     icon: '⚔️'  },
    complete:  { label: 'Complete',  color: 'text-emerald-300', bg: 'bg-emerald-950 border-emerald-700', icon: '✓'   },
    failed:    { label: 'Failed',    color: 'text-rose-300',    bg: 'bg-rose-950 border-rose-700',   icon: '✗'   },
    locked:    { label: 'Locked',    color: 'text-slate-500',   bg: 'bg-slate-900 border-slate-700', icon: '🔒'  },
  };

  onMount(async () => {
    try {
      // Try loading from Dexie if a quests table exists, else use defaults
      const db = compendiumDb as any;
      const stored = db.quests ? await db.quests.toArray() : [];
      if (stored.length > 0) {
        nodes = stored as QuestNode[];
      } else {
        nodes = Object.values(STARTER_CAMPAIGN_QUESTS);
      }
    } catch {
      nodes = Object.values(STARTER_CAMPAIGN_QUESTS);
    } finally {
      isLoading = false;
    }
  });

  let displayNodes = $derived(
    filterStatus === 'all'
      ? nodes
      : nodes.filter((n) => n.status === filterStatus)
  );

  function getPrereqStatus(node: QuestNode): boolean {
    if (!node.prerequisites.length) return true;
    return node.prerequisites.every((prereqId) => {
      const prereq = nodes.find((n) => n.id === prereqId);
      return prereq?.status === 'complete';
    });
  }

  async function setStatus(node: QuestNode, newStatus: QuestNodeStatus) {
    const prevStatus = node.status;
    node.status = newStatus;
    nodes = nodes.map((n) => (n.id === node.id ? { ...n, status: newStatus } : n));

    // Unlock children if completing
    if (newStatus === 'complete') {
      nodes = nodes.map((n) => {
        if (n.status === 'locked' && n.prerequisites.every((pid) => {
          const dep = nodes.find((x) => x.id === pid);
          return dep?.status === 'complete';
        })) {
          return { ...n, status: 'active' };
        }
        return n;
      });
    }

    // If this node has mutually exclusive siblings, fail them
    if (newStatus === 'complete' && node.mutuallyExclusiveWith?.length) {
      nodes = nodes.map((n) =>
        node.mutuallyExclusiveWith!.includes(n.id) && n.status !== 'complete'
          ? { ...n, status: 'failed' }
          : n
      );
    }

    if (selectedNode?.id === node.id) {
      selectedNode = { ...node, status: newStatus };
    }

    // Persist
    try {
      const db = compendiumDb as any;
      if (db.quests) await db.quests.put({ ...node, status: newStatus });
    } catch { /* quests table may not exist yet */ }

    if (typeof window !== 'undefined') {
      const evt: QuestStatusChangeEvent = {
        nodeId: node.id,
        previousStatus: prevStatus,
        newStatus,
        unlockedNodeIds: nodes.filter((n) => n.status === 'active' && n.prerequisites.includes(node.id)).map((n) => n.id),
        failedNodeIds: node.mutuallyExclusiveWith ?? [],
      };
      window.dispatchEvent(new CustomEvent('vtt:quest-status-changed', { detail: evt }));
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-12 px-4 select-none animate-in fade-in"
    role="presentation"
    onclick={() => (isOpen = false)}
  >
    <div
      class="w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style="height: 80vh;"
      role="dialog"
      aria-modal="true"
      aria-label="Quest DAG Tracker"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">📜</span>
          <h2 class="text-sm font-black text-slate-100 uppercase tracking-wider">Campaign Quest DAG</h2>
        </div>
        <div class="flex items-center gap-2">
          <!-- Status filter -->
          <select
            bind:value={filterStatus}
            class="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none"
          >
            <option value="all">All Quests</option>
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="locked">Locked</option>
            <option value="failed">Failed</option>
          </select>
          <button type="button" onclick={() => (isOpen = false)}
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition-colors">✕</button>
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <!-- DAG Node List (left panel) -->
        <div class="w-64 border-r border-slate-800 flex flex-col shrink-0">
          <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 pt-3 pb-1">
            Questlines ({displayNodes.length})
          </div>
          <div class="flex-1 overflow-y-auto px-2 py-1 space-y-1.5">
            {#if isLoading}
              <div class="text-xs text-slate-500 text-center py-4">Loading…</div>
            {:else if displayNodes.length === 0}
              <div class="text-xs text-slate-500 text-center py-4">No quests match filter.</div>
            {:else}
              {#each displayNodes as node}
                {@const cfg = STATUS_CONFIG[node.status]}
                {@const prereqMet = getPrereqStatus(node)}
                <button
                  type="button"
                  onclick={() => (selectedNode = node)}
                  class="w-full text-left px-2.5 py-2 rounded-xl border transition-all text-[11px] {selectedNode?.id === node.id ? 'bg-indigo-950/60 border-indigo-600/60' : cfg.bg + ' hover:border-slate-600'}"
                >
                  <div class="flex items-center gap-1.5">
                    <span class="shrink-0">{cfg.icon}</span>
                    <span class="font-semibold {cfg.color} truncate">{node.title}</span>
                  </div>
                  <div class="text-slate-500 text-[9px] mt-0.5 truncate">
                    {node.category}
                    {#if node.prerequisites.length > 0}
                      · {prereqMet ? '✓ Prereqs met' : `⏳ ${node.prerequisites.length} prereq${node.prerequisites.length > 1 ? 's' : ''}`}
                    {/if}
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Detail panel -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {#if selectedNode}
            {@const cfg = STATUS_CONFIG[selectedNode.status]}
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xl">{cfg.icon}</span>
                <h3 class="text-base font-black text-slate-100">{selectedNode.title}</h3>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-lg border {cfg.bg} {cfg.color}">{cfg.label}</span>
              </div>
              <p class="text-slate-400 leading-relaxed">{selectedNode.description}</p>
            </div>

            <!-- Metadata grid -->
            <div class="grid grid-cols-2 gap-2">
              {#if selectedNode.location}
                <div class="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/60">
                  <div class="text-[10px] text-slate-500 font-semibold uppercase">Location</div>
                  <div class="text-slate-200 mt-0.5">{selectedNode.location}</div>
                </div>
              {/if}
              {#if selectedNode.giver}
                <div class="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/60">
                  <div class="text-[10px] text-slate-500 font-semibold uppercase">Quest Giver</div>
                  <div class="text-slate-200 mt-0.5">{selectedNode.giver}</div>
                </div>
              {/if}
            </div>

            <!-- Prerequisites DAG visualization -->
            {#if selectedNode.prerequisites.length > 0}
              <div>
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Prerequisites</div>
                <div class="flex flex-wrap gap-2">
                  {#each selectedNode.prerequisites as prereqId}
                    {@const prereq = nodes.find((n) => n.id === prereqId)}
                    {#if prereq}
                      {@const pCfg = STATUS_CONFIG[prereq.status]}
                      <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border {pCfg.bg} text-[10px]">
                        <span>{pCfg.icon}</span>
                        <span class="{pCfg.color} font-semibold">{prereq.title}</span>
                      </div>
                    {:else}
                      <div class="px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-500 text-[10px] font-mono">{prereqId}</div>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Mutual exclusions -->
            {#if selectedNode.mutuallyExclusiveWith?.length}
              <div>
                <div class="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-2">Mutually Exclusive With</div>
                <div class="flex flex-wrap gap-2">
                  {#each selectedNode.mutuallyExclusiveWith as exId}
                    {@const exNode = nodes.find((n) => n.id === exId)}
                    <div class="px-2.5 py-1.5 rounded-lg border border-rose-800/60 bg-rose-950/40 text-rose-400 text-[10px] font-semibold">
                      ✗ {exNode?.title ?? exId}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Rewards -->
            {#if selectedNode.rewards}
              <div class="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3">
                <div class="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">Rewards</div>
                <div class="flex items-center gap-4 text-[11px]">
                  {#if selectedNode.rewards.xp}
                    <span class="text-slate-300">✨ {selectedNode.rewards.xp.toLocaleString()} XP</span>
                  {/if}
                  {#if selectedNode.rewards.gp}
                    <span class="text-amber-300">💰 {selectedNode.rewards.gp.toLocaleString()} gp</span>
                  {/if}
                </div>
                {#if selectedNode.rewards.items?.length}
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    {#each selectedNode.rewards.items as item}
                      <span class="px-1.5 py-0.5 bg-indigo-950 border border-indigo-800/40 text-indigo-300 rounded text-[9px] font-semibold">🛡️ {item}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Status action buttons -->
            <div class="pt-2 border-t border-slate-800">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Update Status</div>
              <div class="flex gap-2 flex-wrap">
                {#each (['active', 'complete', 'failed', 'locked'] as const) as status}
                  {#if status !== selectedNode.status}
                    {@const sCfg = STATUS_CONFIG[status]}
                    <button
                      type="button"
                      onclick={() => setStatus(selectedNode!, status)}
                      class="px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors {sCfg.bg} {sCfg.color} hover:opacity-80"
                    >
                      {sCfg.icon} Mark {sCfg.label}
                    </button>
                  {/if}
                {/each}
              </div>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
              <span class="text-4xl">📜</span>
              <p class="text-sm">Select a quest to view details and manage status.</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
