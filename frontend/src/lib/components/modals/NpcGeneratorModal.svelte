<!-- frontend/src/lib/components/modals/NpcGeneratorModal.svelte -->
<!-- Procedural 5e NPC Generator & Statblock Drawer Modal -->

<script lang="ts">
  import type { ActorSchema, NpcCulture, NpcArchetype } from '../../types/actor';
  import {
    generateNpc,
    persistNpcToCompendium,
    spawnNpcTokenOnCanvas
  } from '../../services/generators/npcGenerator';

  let { isOpen = $bindable(false) }: { isOpen?: boolean } = $props();

  let culture = $state<NpcCulture>('common');
  let cr = $state<number>(1);
  let archetype = $state<NpcArchetype>('Guard');

  let currentNpc = $state<ActorSchema>(
    generateNpc({ culture: 'common', cr: 1, archetype: 'Guard' })
  );

  let statusMessage = $state<string | null>(null);
  let isSaving = $state<boolean>(false);

  export function open() {
    isOpen = true;
  }

  export function close() {
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function reroll() {
    currentNpc = generateNpc({ culture, cr: Number(cr), archetype });
    statusMessage = null;
  }

  async function handleAddToCompendium() {
    isSaving = true;
    try {
      await persistNpcToCompendium(currentNpc);
      statusMessage = `Added "${currentNpc.name}" to Compendium & Roster!`;
      setTimeout(() => {
        statusMessage = null;
      }, 3500);
    } catch (err) {
      statusMessage = 'Failed to persist NPC to database.';
    } finally {
      isSaving = false;
    }
  }

  function handleSpawnToken() {
    const token = spawnNpcTokenOnCanvas(currentNpc);
    statusMessage = `Spawned token "${token.name}" at (${token.x}, ${token.y})`;
    setTimeout(() => {
      statusMessage = null;
    }, 3500);
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if isOpen}
  <div class="npc-modal-backdrop" onclick={close} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="npc-modal-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Procedural NPC Generator"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="npc-modal-header">
        <div class="header-titles">
          <div class="header-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <h2>Procedural NPC Generator</h2>
            <span class="subtitle">5e SRD Statblock & Markov Persona Engine</span>
          </div>
        </div>
        <button class="close-btn" onclick={close} title="Close (Esc)">×</button>
      </div>

      <!-- Controls Bar -->
      <div class="controls-toolbar">
        <div class="control-group">
          <label for="npc-culture">Culture</label>
          <select id="npc-culture" bind:value={culture} onchange={reroll}>
            <option value="common">Common / Human</option>
            <option value="elven">Elven</option>
            <option value="dwarven">Dwarven</option>
            <option value="draconic">Draconic</option>
            <option value="orcish">Orcish</option>
          </select>
        </div>

        <div class="control-group">
          <label for="npc-cr">Challenge Rating (CR)</label>
          <select id="npc-cr" bind:value={cr} onchange={reroll}>
            <option value={0}>CR 0 (Civilian)</option>
            <option value={0.125}>CR 1/8 (Apprentice / Watch)</option>
            <option value={0.25}>CR 1/4 (Acolyte / Sentry)</option>
            <option value={0.5}>CR 1/2 (Scout / Thug)</option>
            <option value={1}>CR 1 (Veteran Guard)</option>
            <option value={2}>CR 2 (Bandit Captain)</option>
            <option value={3}>CR 3 (Knight / Wizard)</option>
            <option value={4}>CR 4 (Master Arcanist)</option>
            <option value={5}>CR 5 (Gladiator / High Priest)</option>
          </select>
        </div>

        <div class="control-group">
          <label for="npc-archetype">Occupation Archetype</label>
          <select id="npc-archetype" bind:value={archetype} onchange={reroll}>
            <option value="Guard">Guard / Sentry</option>
            <option value="Mage">Mage / Arcanist</option>
            <option value="Priest">Priest / Cleric</option>
            <option value="Bandit">Bandit / Rogue</option>
            <option value="Noble">Noble / Aristocrat</option>
          </select>
        </div>

        <button class="reroll-btn" onclick={reroll} title="Generate new NPC with current settings">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Quick Reroll
        </button>
      </div>

      <!-- Notification Banner -->
      {#if statusMessage}
        <div class="status-banner">
          <span>{statusMessage}</span>
        </div>
      {/if}

      <!-- NPC Preview Body -->
      <div class="npc-body-scroll">
        <!-- Identity & Vitals Card -->
        <div class="statblock-card">
          <div class="identity-header">
            <div
              class="token-badge"
              style="background-color: {currentNpc.token.color}"
              title="Token Preview ({currentNpc.token.initials})"
            >
              {currentNpc.token.initials}
            </div>
            <div class="identity-meta">
              <h3 class="npc-name">{currentNpc.name}</h3>
              <p class="npc-subtext">
                {currentNpc.size} {currentNpc.type}, {currentNpc.alignment} • {currentNpc.occupation} (CR {currentNpc.cr})
              </p>
            </div>
          </div>

          <div class="vitals-row">
            <div class="vital-item">
              <span class="vital-label">Armor Class</span>
              <span class="vital-value">{currentNpc.ac}</span>
            </div>
            <div class="vital-item">
              <span class="vital-label">Hit Points</span>
              <span class="vital-value">{currentNpc.hp} <small>({currentNpc.maxHp})</small></span>
            </div>
            <div class="vital-item">
              <span class="vital-label">Speed</span>
              <span class="vital-value">{currentNpc.speed} ft.</span>
            </div>
            <div class="vital-item">
              <span class="vital-label">Initiative</span>
              <span class="vital-value">{currentNpc.initiative >= 0 ? `+${currentNpc.initiative}` : currentNpc.initiative}</span>
            </div>
            <div class="vital-item">
              <span class="vital-label">Prof. Bonus</span>
              <span class="vital-value">+{currentNpc.proficiencyBonus}</span>
            </div>
          </div>

          <!-- Attributes Grid -->
          <div class="abilities-grid">
            {#each ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const as ability}
              <div class="ability-cell">
                <span class="ability-name">{ability.toUpperCase()}</span>
                <span class="ability-score">{currentNpc.attributes[ability].score}</span>
                <span class="ability-mod">
                  {currentNpc.attributes[ability].modifier >= 0
                    ? `+${currentNpc.attributes[ability].modifier}`
                    : currentNpc.attributes[ability].modifier}
                </span>
              </div>
            {/each}
          </div>

          <!-- Physical Description -->
          <div class="persona-section">
            <div class="section-title">Physical Appearance</div>
            <p class="description-text">{currentNpc.appearance}</p>
          </div>

          <!-- Persona Details -->
          <div class="persona-grid">
            <div class="persona-item">
              <span class="persona-label">Personality Trait</span>
              <p>{currentNpc.personality.trait}</p>
            </div>
            <div class="persona-item">
              <span class="persona-label">Ideal</span>
              <p>{currentNpc.personality.ideal}</p>
            </div>
            <div class="persona-item">
              <span class="persona-label">Bond</span>
              <p>{currentNpc.personality.bond}</p>
            </div>
            <div class="persona-item">
              <span class="persona-label">Flaw</span>
              <p>{currentNpc.personality.flaw}</p>
            </div>
          </div>

          <!-- Actions & Traits -->
          <div class="actions-section">
            <div class="section-title">Actions & Features</div>
            {#each currentNpc.traits as trait}
              <div class="action-row">
                <span class="action-name">{trait.name}.</span>
                <span class="action-desc">{trait.description}</span>
              </div>
            {/each}
            {#each currentNpc.actions as action}
              <div class="action-row">
                <span class="action-name">{action.name}.</span>
                <span class="action-desc">{action.description}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="npc-modal-footer">
        <button class="footer-btn secondary" onclick={close}>Close</button>
        <div class="action-buttons">
          <button
            class="footer-btn spawn-btn"
            onclick={handleSpawnToken}
            title="Drop NPC token onto center of tactical canvas"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Spawn Token
          </button>
          <button
            class="footer-btn primary"
            onclick={handleAddToCompendium}
            disabled={isSaving}
            title="Save NPC to local compendium and load into character roster"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {isSaving ? 'Saving...' : 'Add to Combat / Compendium'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .npc-modal-backdrop {
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

  .npc-modal-window {
    width: 100%;
    max-width: 820px;
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

  .npc-modal-header {
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
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-titles h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: #f8fafc;
  }

  .subtitle {
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  .controls-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.85rem;
    padding: 0.85rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1;
    min-width: 140px;
  }

  .control-group label {
    font-size: 0.72rem;
    text-transform: uppercase;
    font-weight: 600;
    color: #94a3b8;
    letter-spacing: 0.04em;
  }

  .control-group select {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #f1f5f9;
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
    outline: none;
    cursor: pointer;
  }

  .control-group select:focus {
    border-color: #6366f1;
  }

  .reroll-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #334155;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 0.45rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    height: 34px;
  }

  .reroll-btn:hover {
    background: #475569;
  }

  .status-banner {
    background: rgba(34, 197, 94, 0.15);
    border-bottom: 1px solid rgba(34, 197, 94, 0.3);
    color: #4ade80;
    padding: 0.5rem 1.25rem;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .npc-body-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
  }

  .statblock-card {
    background: #1a1e29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1.25rem;
  }

  .identity-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .token-badge {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    color: #ffffff;
    font-weight: 700;
    font-size: 1.15rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
    border: 2px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .identity-meta {
    flex: 1;
  }

  .npc-name {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 700;
    color: #f1f5f9;
  }

  .npc-subtext {
    margin: 0.2rem 0 0 0;
    font-size: 0.82rem;
    color: #94a3b8;
    font-style: italic;
  }

  .vitals-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 0.6rem;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    margin-bottom: 1rem;
  }

  .vital-item {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .vital-label {
    font-size: 0.68rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .vital-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .vital-value small {
    font-size: 0.75rem;
    color: #64748b;
    font-weight: 400;
  }

  .abilities-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .ability-cell {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 0.45rem 0.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .ability-name {
    font-size: 0.65rem;
    font-weight: 700;
    color: #94a3b8;
  }

  .ability-score {
    font-size: 1.1rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .ability-mod {
    font-size: 0.75rem;
    font-weight: 600;
    color: #818cf8;
  }

  .persona-section {
    margin-bottom: 1rem;
  }

  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #e2e8f0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.3rem;
    margin-bottom: 0.5rem;
  }

  .description-text {
    font-size: 0.85rem;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.4;
  }

  .persona-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .persona-item {
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
  }

  .persona-label {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #a5b4fc;
    margin-bottom: 0.2rem;
  }

  .persona-item p {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.35;
    color: #cbd5e1;
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .action-row {
    font-size: 0.83rem;
    line-height: 1.4;
  }

  .action-name {
    font-weight: 700;
    color: #f1f5f9;
  }

  .action-desc {
    color: #94a3b8;
  }

  .npc-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    background: rgba(255, 255, 255, 0.02);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }

  .footer-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .footer-btn.secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #94a3b8;
  }

  .footer-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #f8fafc;
  }

  .footer-btn.spawn-btn {
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #60a5fa;
  }

  .footer-btn.spawn-btn:hover {
    background: rgba(59, 130, 246, 0.35);
  }

  .footer-btn.primary {
    background: #6366f1;
    border: 1px solid #4f46e5;
    color: #ffffff;
  }

  .footer-btn.primary:hover:not(:disabled) {
    background: #4f46e5;
  }

  .footer-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
