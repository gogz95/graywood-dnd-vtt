<!-- frontend/src/lib/components/modals/QuestTrackerModal.svelte -->
<!-- Directed Acyclic Graph (DAG) Quest Tracker & Branching Outcome Drawer -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { questEngine } from '../../services/questEngine';
  import type { QuestNode, QuestNodeStatus } from '../../types/campaign';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let quests = $state<QuestNode[]>(questEngine.getAllNodes());
  let selectedCategory = $state<string>('All');
  let selectedNode = $state<QuestNode | null>(null);

  // New Quest Form
  let isCreating = $state(false);
  let newTitle = $state('');
  let newDescription = $state('');
  let newCategory = $state<'Main' | 'Side' | 'Faction' | 'Personal'>('Main');
  let newLocation = $state('');
  let newXp = $state(200);
  let newGp = $state(50);

  export function open() {
    isOpen = true;
    syncQuests();
    if (quests.length > 0 && !selectedNode) {
      selectedNode = quests[0];
    }
  }

  export function close() {
    isOpen = false;
  }

  function syncQuests() {
    quests = questEngine.getAllNodes();
    if (selectedNode) {
      selectedNode = questEngine.getNode(selectedNode.id) || quests[0] || null;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function setStatus(nodeId: string, status: QuestNodeStatus) {
    questEngine.updateQuestStatus(nodeId, status);
    syncQuests();
  }

  function handleCreateQuest() {
    if (!newTitle) return;
    const id = `quest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const node: QuestNode = {
      id,
      title: newTitle,
      description: newDescription,
      category: newCategory,
      status: 'active',
      prerequisites: selectedNode ? [selectedNode.id] : [],
      location: newLocation,
      rewards: { xp: newXp, gp: newGp }
    };
    questEngine.addQuestNode(node);
    newTitle = '';
    newDescription = '';
    newLocation = '';
    isCreating = false;
    syncQuests();
    selectedNode = node;
  }

  onMount(() => {
    const handleUpdate = () => syncQuests();
    window.addEventListener('vtt:quest-updated', handleUpdate);
    return () => {
      window.removeEventListener('vtt:quest-updated', handleUpdate);
    };
  });

  let filteredQuests = $derived(
    quests.filter((q) => {
      if (selectedCategory === 'All') return true;
      return q.category === selectedCategory;
    })
  );
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div class="quest-backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="quest-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Quest Dependency Graph"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="modal-header">
        <div class="header-titles">
          <div class="header-icon">📜</div>
          <div>
            <h2>Campaign Quest Log & DAG Dependency Tree</h2>
            <span class="subtitle">Directed Acyclic Graph Progression & Branching Storylines</span>
          </div>
        </div>
        <button class="close-btn" onclick={close} title="Close (Esc)">×</button>
      </div>

      <!-- Category Filter Bar -->
      <div class="toolbar">
        <div class="filter-group">
          {#each ['All', 'Main', 'Side', 'Faction', 'Personal'] as cat}
            <button
              class="filter-pill {selectedCategory === cat ? 'active' : ''}"
              onclick={() => (selectedCategory = cat)}
            >
              {cat}
            </button>
          {/each}
        </div>
        <div class="actions-group">
          <button class="action-btn" onclick={() => (isCreating = !isCreating)}>
            {isCreating ? 'Cancel' : '+ New Quest Node'}
          </button>
          <button class="action-btn secondary" onclick={() => questEngine.resetToPresets()}>
            Reset to Starter
          </button>
        </div>
      </div>

      <!-- Create Form Drawer -->
      {#if isCreating}
        <div class="create-drawer">
          <h4>Create Linked Quest Node</h4>
          <div class="form-row">
            <input type="text" placeholder="Quest Title" bind:value={newTitle} />
            <select bind:value={newCategory}>
              <option value="Main">Main Campaign</option>
              <option value="Side">Side Objective</option>
              <option value="Faction">Faction Bounty</option>
              <option value="Personal">Character Arc</option>
            </select>
          </div>
          <textarea
            placeholder="Quest Objective & Description..."
            rows="2"
            bind:value={newDescription}
          ></textarea>
          <div class="form-row">
            <input type="text" placeholder="Location / Region" bind:value={newLocation} />
            <input type="number" placeholder="XP" bind:value={newXp} style="width: 100px" />
            <input type="number" placeholder="Gold (GP)" bind:value={newGp} style="width: 100px" />
            <button class="save-quest-btn" onclick={handleCreateQuest}>Save Node</button>
          </div>
        </div>
      {/if}

      <!-- Main Layout: DAG Node List + Node Detail Panel -->
      <div class="quest-content">
        <!-- Node List Column -->
        <div class="nodes-column">
          {#each filteredQuests as node}
            <div
              class="node-card {node.status} {selectedNode?.id === node.id ? 'selected' : ''}"
              onclick={() => (selectedNode = node)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && (selectedNode = node)}
            >
              <div class="node-status-bar">
                <span class="status-indicator {node.status}"></span>
                <span class="node-category">{node.category}</span>
                <span class="status-badge {node.status}">{node.status.toUpperCase()}</span>
              </div>
              <h4 class="node-title">{node.title}</h4>
              <p class="node-desc">{node.description}</p>
              {#if node.prerequisites.length > 0}
                <span class="prereq-tag">
                  ⛓️ Prereqs: {node.prerequisites.length} node(s)
                </span>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Detail Column -->
        <div class="detail-column">
          {#if selectedNode}
            <div class="detail-card">
              <div class="detail-header">
                <div>
                  <span class="detail-cat">{selectedNode.category} Quest</span>
                  <h3 class="detail-title">{selectedNode.title}</h3>
                </div>
                <span class="status-pill {selectedNode.status}">
                  {selectedNode.status.toUpperCase()}
                </span>
              </div>

              <p class="detail-desc">{selectedNode.description}</p>

              {#if selectedNode.location}
                <div class="meta-row">
                  <span class="meta-label">Location:</span>
                  <span class="meta-val">📍 {selectedNode.location}</span>
                </div>
              {/if}

              {#if selectedNode.giver}
                <div class="meta-row">
                  <span class="meta-label">Quest Giver:</span>
                  <span class="meta-val">👤 {selectedNode.giver}</span>
                </div>
              {/if}

              <!-- Prerequisites -->
              <div class="dependency-box">
                <span class="box-title">Prerequisites</span>
                {#if selectedNode.prerequisites.length === 0}
                  <span class="none-text">None (Starter Quest Node)</span>
                {:else}
                  <div class="prereq-list">
                    {#each selectedNode.prerequisites as pId}
                      {@const pNode = questEngine.getNode(pId)}
                      <div class="prereq-item {pNode?.status || 'locked'}">
                        <span>{pNode ? pNode.title : pId}</span>
                        <span class="mini-status">{pNode?.status || 'missing'}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              <!-- Mutually Exclusive Branches -->
              {#if selectedNode.mutuallyExclusiveWith && selectedNode.mutuallyExclusiveWith.length > 0}
                <div class="dependency-box branching">
                  <span class="box-title">⚠️ Mutually Exclusive Pathway</span>
                  <p class="branch-warn">
                    Completing this quest automatically FAILS the opposing branch:
                  </p>
                  {#each selectedNode.mutuallyExclusiveWith as excId}
                    {@const excNode = questEngine.getNode(excId)}
                    <div class="exc-item">
                      <span>⚡ {excNode ? excNode.title : excId}</span>
                      <span class="mini-status">{excNode?.status}</span>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Rewards -->
              {#if selectedNode.rewards}
                <div class="rewards-box">
                  <span class="box-title">Completion Rewards</span>
                  <div class="rewards-tags">
                    {#if selectedNode.rewards.xp}
                      <span class="reward-tag">+{selectedNode.rewards.xp} XP</span>
                    {/if}
                    {#if selectedNode.rewards.gp}
                      <span class="reward-tag gold">+{selectedNode.rewards.gp} GP</span>
                    {/if}
                    {#if selectedNode.rewards.items}
                      {#each selectedNode.rewards.items as item}
                        <span class="reward-tag item">🎁 {item}</span>
                      {/each}
                    {/if}
                  </div>
                </div>
              {/if}

              <!-- Status Action Buttons -->
              <div class="status-actions">
                <span class="actions-label">Change Node Status:</span>
                <div class="btn-group">
                  <button
                    class="state-btn complete"
                    onclick={() => setStatus(selectedNode.id, 'completed')}
                    disabled={selectedNode.status === 'completed'}
                  >
                    ✓ Complete
                  </button>
                  <button
                    class="state-btn active"
                    onclick={() => setStatus(selectedNode.id, 'active')}
                    disabled={selectedNode.status === 'active'}
                  >
                    ▶ Set Active
                  </button>
                  <button
                    class="state-btn fail"
                    onclick={() => setStatus(selectedNode.id, 'failed')}
                    disabled={selectedNode.status === 'failed'}
                  >
                    ✕ Mark Failed
                  </button>
                  <button
                    class="state-btn lock"
                    onclick={() => setStatus(selectedNode.id, 'locked')}
                    disabled={selectedNode.status === 'locked'}
                  >
                    🔒 Lock
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <div class="no-selection">
              <span>Select a quest node from the graph to inspect prerequisites and trigger transitions.</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .quest-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .quest-window {
    width: 100%;
    max-width: 950px;
    max-height: 90vh;
    background: #11141b;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
    font-family: inherit;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header-titles {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.5rem;
  }

  .header-titles h2 {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .subtitle {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .filter-group {
    display: flex;
    gap: 0.35rem;
  }

  .filter-pill {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 0.25rem 0.65rem;
    font-size: 0.78rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .filter-pill.active {
    background: #6366f1;
    border-color: #6366f1;
    color: #ffffff;
    font-weight: 600;
  }

  .actions-group {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .action-btn.secondary {
    background: transparent;
    color: #94a3b8;
  }

  .create-drawer {
    padding: 0.85rem 1.25rem;
    background: rgba(30, 41, 59, 0.7);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .create-drawer h4 {
    margin: 0;
    font-size: 0.85rem;
    color: #e2e8f0;
  }

  .form-row {
    display: flex;
    gap: 0.5rem;
  }

  .create-drawer input,
  .create-drawer select,
  .create-drawer textarea {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 0.4rem 0.65rem;
    color: #f1f5f9;
    font-size: 0.82rem;
    outline: none;
    flex: 1;
  }

  .save-quest-btn {
    background: #6366f1;
    border: none;
    color: #ffffff;
    font-weight: 600;
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    cursor: pointer;
  }

  .quest-content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    overflow: hidden;
  }

  .nodes-column {
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
  }

  .node-card {
    background: #1a1e29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .node-card:hover {
    background: #232938;
  }

  .node-card.selected {
    border-color: #6366f1;
    background: rgba(99, 102, 241, 0.12);
  }

  .node-status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-indicator.active { background: #38bdf8; box-shadow: 0 0 6px #38bdf8; }
  .status-indicator.completed { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
  .status-indicator.locked { background: #64748b; }
  .status-indicator.failed { background: #f87171; }

  .node-category {
    font-size: 0.68rem;
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 600;
    flex: 1;
  }

  .status-badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .status-badge.active { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
  .status-badge.completed { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
  .status-badge.locked { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
  .status-badge.failed { background: rgba(248, 113, 113, 0.2); color: #f87171; }

  .node-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .node-desc {
    margin: 0;
    font-size: 0.78rem;
    color: #cbd5e1;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .prereq-tag {
    display: inline-block;
    font-size: 0.68rem;
    color: #818cf8;
    margin-top: 0.4rem;
  }

  .detail-column {
    overflow-y: auto;
    padding: 1.25rem;
    background: rgba(15, 23, 42, 0.3);
  }

  .detail-card {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .detail-cat {
    font-size: 0.72rem;
    font-weight: 600;
    color: #818cf8;
    text-transform: uppercase;
  }

  .detail-title {
    margin: 0.2rem 0 0 0;
    font-size: 1.3rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .status-pill {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
  }

  .status-pill.active { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
  .status-pill.completed { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
  .status-pill.locked { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
  .status-pill.failed { background: rgba(248, 113, 113, 0.2); color: #f87171; }

  .detail-desc {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.45;
    color: #cbd5e1;
  }

  .meta-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.82rem;
  }

  .meta-label {
    color: #94a3b8;
    font-weight: 600;
  }

  .meta-val {
    color: #f1f5f9;
  }

  .dependency-box {
    background: #1a1e29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .dependency-box.branching {
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.05);
  }

  .box-title {
    display: block;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 0.35rem;
  }

  .branch-warn {
    margin: 0 0 0.4rem 0;
    font-size: 0.78rem;
    color: #fcd34d;
  }

  .none-text {
    font-size: 0.78rem;
    color: #64748b;
    font-style: italic;
  }

  .prereq-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .prereq-item, .exc-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
  }

  .mini-status {
    font-size: 0.68rem;
    text-transform: uppercase;
    font-weight: 600;
    color: #94a3b8;
  }

  .rewards-box {
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .rewards-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .reward-tag {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .reward-tag.gold {
    background: rgba(234, 179, 8, 0.2);
    color: #facc15;
  }

  .reward-tag.item {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }

  .status-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .actions-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .btn-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .state-btn {
    border: none;
    padding: 0.45rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .state-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .state-btn.complete { background: #16a34a; color: #fff; }
  .state-btn.active { background: #0284c7; color: #fff; }
  .state-btn.fail { background: #dc2626; color: #fff; }
  .state-btn.lock { background: #475569; color: #fff; }

  .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #64748b;
    font-style: italic;
    font-size: 0.88rem;
    text-align: center;
    padding: 2rem;
  }
</style>
