<script module lang="ts">
  export interface PartyMember {
    id: string;
    name: string;
    playerName: string;
    class: string;
    level: number;
    hpCurrent: number;
    hpMax: number;
    ac: number;
    passivePerception: number;
    pin: string;
    isOnline: boolean;
    isNpc: boolean;
  }
</script>

<script lang="ts">
  // PartyManager.svelte — DM-side party roster with full CRUD + PIN management

  const STORAGE_KEY = 'vtt_party_roster';
  const LAN_IP_KEY  = 'vtt_lan_ip';

  function genPin(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return (1000 + (array[0] % 9000)).toString();
    }
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  function loadRoster(): PartyMember[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PartyMember[];
        const sanitized = parsed.map(m => {
          if (!m.pin || m.pin === '1234' || m.pin === '2345' || m.pin === '3456' || m.pin === '4567' || m.pin === '0000') {
            return { ...m, pin: genPin() };
          }
          return m;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        return sanitized;
      }
    } catch { /* corrupt storage — reset */ }
    const freshRoster: PartyMember[] = [
      { id: 'pc-1', name: 'Valen Shadowborn',  playerName: 'Player 1', class: 'Rogue',   level: 5, hpCurrent: 38, hpMax: 38, ac: 16, passivePerception: 14, pin: genPin(), isOnline: false, isNpc: false },
      { id: 'pc-2', name: 'Eldrin Starfall',   playerName: 'Player 2', class: 'Wizard',  level: 5, hpCurrent: 28, hpMax: 28, ac: 13, passivePerception: 12, pin: genPin(), isOnline: false, isNpc: false },
      { id: 'pc-3', name: 'Kareth Stonefist',  playerName: 'Player 3', class: 'Fighter', level: 5, hpCurrent: 52, hpMax: 52, ac: 18, passivePerception: 11, pin: genPin(), isOnline: false, isNpc: false },
      { id: 'pc-4', name: 'Althea Dawnseeker', playerName: 'Player 4', class: 'Cleric',  level: 5, hpCurrent: 42, hpMax: 42, ac: 17, passivePerception: 13, pin: genPin(), isOnline: false, isNpc: false },
    ];
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(freshRoster));
    }
    return freshRoster;
  }

  function saveRoster(r: PartyMember[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  }

  function genId() { return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

  let roster   = $state<PartyMember[]>(loadRoster());
  let lanIp    = $state(localStorage.getItem(LAN_IP_KEY) ?? '192.168.1.100');
  let lanPort  = $state(8080);
  let editingId = $state<string | null>(null);
  let showAddForm = $state(false);
  let copiedPin   = $state<string | null>(null);
  let deleteConfirmId = $state<string | null>(null);

  // Form state for add/edit
  let form = $state({
    name: '', playerName: '', class: 'Fighter', level: 1,
    hpMax: 10, ac: 10, passivePerception: 10, pin: '', isNpc: false,
  });

  const DND_CLASSES = ['Artificer','Barbarian','Bard','Cleric','Druid','Fighter',
    'Monk','Paladin','Ranger','Rogue','Sorcerer','Warlock','Wizard','NPC'];

  $effect(() => { saveRoster(roster); });
  $effect(() => { localStorage.setItem(LAN_IP_KEY, lanIp); });

  function openAddForm() {
    form = { name: '', playerName: '', class: 'Fighter', level: 1, hpMax: 10, ac: 10, passivePerception: 10, pin: genPin(), isNpc: false };
    editingId = null;
    showAddForm = true;
  }

  function openEditForm(m: PartyMember) {
    form = { name: m.name, playerName: m.playerName, class: m.class, level: m.level, hpMax: m.hpMax, ac: m.ac, passivePerception: m.passivePerception, pin: m.pin, isNpc: m.isNpc };
    editingId = m.id;
    showAddForm = true;
  }

  function submitForm() {
    const pin = form.pin.trim().padStart(4, '0').slice(-4) || genPin();
    if (editingId) {
      roster = roster.map(m => m.id === editingId
        ? { ...m, name: form.name, playerName: form.playerName, class: form.class, level: form.level, hpMax: form.hpMax, hpCurrent: form.hpMax, ac: form.ac, passivePerception: form.passivePerception, pin, isNpc: form.isNpc }
        : m
      );
    } else {
      const nm: PartyMember = {
        id: genId(), name: form.name, playerName: form.playerName, class: form.class,
        level: form.level, hpCurrent: form.hpMax, hpMax: form.hpMax, ac: form.ac,
        passivePerception: form.passivePerception, pin, isOnline: false, isNpc: form.isNpc,
      };
      roster = [...roster, nm];
    }
    showAddForm = false;
    editingId = null;
  }

  function deleteCharacter(id: string) {
    roster = roster.filter(m => m.id !== id);
    deleteConfirmId = null;
  }

  function reassignPin(id: string) {
    const pin = genPin();
    roster = roster.map(m => m.id === id ? { ...m, pin } : m);
  }

  function copyLink(pin: string) {
    const url = `http://${lanIp}:${lanPort}?pin=${pin}`;
    navigator.clipboard.writeText(url).catch(() => {});
    copiedPin = pin;
    setTimeout(() => { copiedPin = null; }, 2000);
  }

  function adjustHp(id: string, delta: number) {
    roster = roster.map(m => m.id === id
      ? { ...m, hpCurrent: Math.max(0, Math.min(m.hpMax, m.hpCurrent + delta)) }
      : m
    );
  }

  function hpColor(m: PartyMember) {
    const pct = m.hpCurrent / m.hpMax;
    if (pct <= 0) return 'text-red-500';
    if (pct < 0.25) return 'text-rose-400';
    if (pct < 0.5) return 'text-amber-400';
    return 'text-emerald-400';
  }

  function hpBarColor(m: PartyMember) {
    const pct = m.hpCurrent / m.hpMax;
    if (pct <= 0) return 'bg-red-600';
    if (pct < 0.25) return 'bg-rose-500';
    if (pct < 0.5) return 'bg-amber-500';
    return 'bg-emerald-500';
  }
</script>

<div class="h-full flex flex-col overflow-hidden bg-slate-950">
  <!-- Header toolbar -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-900">
    <div>
      <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wide">Active Party &amp; Roster</h2>
      <p class="text-[10px] text-slate-500">{roster.length} characters — {roster.filter(m => m.isOnline).length} online</p>
    </div>
    <button
      onclick={openAddForm}
      class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shadow"
    >
      + Add Character
    </button>
  </div>

  <!-- LAN IP Config -->
  <div class="px-4 py-2 border-b border-slate-800/60 bg-slate-900/50 shrink-0 flex items-center gap-3">
    <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">LAN Host</span>
    <input type="text" bind:value={lanIp} class="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500" placeholder="192.168.1.100" />
    <input type="number" bind:value={lanPort} class="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500" />
  </div>

  <!-- Roster List -->
  <div class="flex-1 overflow-y-auto p-3 space-y-2">
    {#each roster as member (member.id)}
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <!-- Member header row -->
        <div class="flex items-center gap-3 px-3 py-2.5">
          <!-- Online indicator -->
          <div class="w-2 h-2 rounded-full shrink-0 {member.isOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400/60 animate-pulse' : 'bg-slate-700'}"></div>

          <!-- Name + class -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-sm font-bold text-slate-200 truncate">{member.name}</span>
              {#if member.isNpc}
                <span class="px-1.5 py-0.5 bg-amber-950/60 text-amber-400 text-[9px] font-bold rounded uppercase border border-amber-800/30">NPC</span>
              {/if}
            </div>
            <p class="text-[10px] text-slate-500">Lvl {member.level} {member.class} · {member.playerName}</p>
          </div>

          <!-- Stats pills -->
          <div class="flex items-center gap-2 shrink-0">
            <div class="text-right">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">HP</div>
              <div class="text-xs font-mono font-bold {hpColor(member)}">{member.hpCurrent}<span class="text-slate-600">/{member.hpMax}</span></div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">AC</div>
              <div class="text-xs font-mono font-bold text-slate-300">{member.ac}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-slate-500 uppercase tracking-wider">PP</div>
              <div class="text-xs font-mono font-bold text-slate-300">{member.passivePerception}</div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-1 shrink-0">
            <button onclick={() => openEditForm(member)} class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors text-xs" title="Edit">✏️</button>
            <button onclick={() => deleteConfirmId = member.id} class="p-1.5 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition-colors text-xs" title="Delete">🗑</button>
          </div>
        </div>

        <!-- HP bar -->
        <div class="h-0.5 bg-slate-800 mx-3 mb-2 rounded-full overflow-hidden">
          <div class="h-full {hpBarColor(member)} rounded-full transition-all duration-300" style="width:{Math.max(0,Math.min(100,(member.hpCurrent/member.hpMax)*100))}%"></div>
        </div>

        <!-- HP adjust + PIN row -->
        <div class="flex items-center gap-2 px-3 pb-2.5">
          <!-- Quick HP -->
          <div class="flex items-center gap-1">
            <button onclick={() => adjustHp(member.id, -1)} class="w-6 h-6 rounded bg-rose-950/50 hover:bg-rose-900/60 text-rose-400 text-xs font-bold flex items-center justify-center transition-colors border border-rose-900/30">−</button>
            <button onclick={() => adjustHp(member.id, 1)} class="w-6 h-6 rounded bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 text-xs font-bold flex items-center justify-center transition-colors border border-emerald-900/30">+</button>
          </div>

          <div class="flex-1"></div>

          <!-- PIN -->
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500 uppercase tracking-wider">PIN</span>
            <span class="font-mono text-xs font-bold text-indigo-300 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-800/30">{member.pin}</span>
            <button onclick={() => reassignPin(member.id)} class="p-1 rounded text-slate-500 hover:text-slate-300 text-[10px] transition-colors" title="Regenerate PIN">🔄</button>
            <button
              onclick={() => copyLink(member.pin)}
              class="px-2 py-0.5 rounded text-[10px] font-semibold transition-colors {copiedPin === member.pin ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200'}"
              title="Copy player login link"
            >{copiedPin === member.pin ? '✓ Copied' : '🔗 Link'}</button>
          </div>
        </div>

        <!-- Delete confirm -->
        {#if deleteConfirmId === member.id}
          <div class="px-3 pb-3 flex items-center gap-2 bg-rose-950/20 border-t border-rose-900/20">
            <span class="text-xs text-rose-300 flex-1">Delete {member.name}?</span>
            <button onclick={() => deleteCharacter(member.id)} class="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded transition-colors">Delete</button>
            <button onclick={() => deleteConfirmId = null} class="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        {/if}
      </div>
    {/each}

    {#if roster.length === 0}
      <div class="text-center py-12 text-slate-600 text-sm">No characters. Click "Add Character" to begin.</div>
    {/if}
  </div>
</div>

<!-- Add / Edit Modal -->
{#if showAddForm}
  <div role="presentation" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => { if (e.target === e.currentTarget) showAddForm = false; }}>
    <div class="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
      <h3 class="text-base font-bold text-slate-100">{editingId ? 'Edit Character' : 'Add Character / NPC'}</h3>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <label class="col-span-2 block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Character Name</span>
          <input type="text" bind:value={form.name} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="e.g. Valen Shadowborn" />
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Player Name</span>
          <input type="text" bind:value={form.playerName} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="e.g. Alex" />
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Class</span>
          <select bind:value={form.class} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500">
            {#each DND_CLASSES as cls}<option value={cls}>{cls}</option>{/each}
          </select>
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Level</span>
          <input type="number" min="1" max="20" bind:value={form.level} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Max HP</span>
          <input type="number" min="1" bind:value={form.hpMax} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">AC</span>
          <input type="number" min="1" max="30" bind:value={form.ac} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
        </label>
        <label class="block space-y-1">
          <span class="font-semibold text-slate-400 uppercase tracking-wider block">Passive Perception</span>
          <input type="number" min="1" max="30" bind:value={form.passivePerception} class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500" />
        </label>
        <div class="space-y-1">
          <label for="form-pin-input" class="font-semibold text-slate-400 uppercase tracking-wider block">4-Digit PIN</label>
          <div class="flex gap-1.5">
            <input id="form-pin-input" type="text" maxlength="4" bind:value={form.pin} class="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-indigo-500" placeholder="####" />
            <button type="button" onclick={() => form.pin = genPin()} class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors">🎲</button>
          </div>
        </div>
        <div class="col-span-2 flex items-center gap-2 pt-1">
          <input type="checkbox" id="is-npc" bind:checked={form.isNpc} class="rounded" />
          <label for="is-npc" class="text-slate-400 cursor-pointer">Mark as NPC / Companion</label>
        </div>
      </div>

      <div class="flex gap-3 pt-2">
        <button
          onclick={submitForm}
          disabled={!form.name.trim()}
          class="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow"
        >{editingId ? 'Save Changes' : 'Add to Roster'}</button>
        <button onclick={() => showAddForm = false} class="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors">Cancel</button>
      </div>
    </div>
  </div>
{/if}
