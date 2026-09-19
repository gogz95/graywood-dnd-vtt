<script lang="ts">
  import { characterStore, mutateHp, disconnectCharacter } from '../stores/characterStore';
  import Icons from './Icons.svelte';

  let character = $derived($characterStore);

  let hpPercent = $derived(
    character && character.max_hp > 0
      ? Math.max(0, Math.min(100, Math.round((character.current_hp / character.max_hp) * 100)))
      : 0
  );

  function adjustHp(amount: number) {
    if (!character) return;
    mutateHp(character.current_hp + amount);
  }

  function adjustTempHp(amount: number) {
    if (!character) return;
    const newTemp = Math.max(0, character.temp_hp + amount);
    mutateHp(character.current_hp, newTemp);
  }
</script>

{#if character}
  <header class="bg-dark-900 border-b border-dark-700/80 sticky top-0 z-30 backdrop-blur-md bg-dark-900/90 px-4 py-3 shadow-xl">
    <div class="max-w-4xl mx-auto">
      <!-- Top Row: Name, PIN Lock Status & Disconnect -->
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm">
            {character.name.charAt(0)}
          </div>
          <div>
            <h1 class="text-base font-black text-slate-100 tracking-tight leading-none">
              {character.name}
            </h1>
            <span class="text-[11px] text-slate-400 font-mono">Speed: {character.speed}ft &bull; HD: {character.hit_dice_current}/{character.hit_dice_max}</span>
          </div>
        </div>

        <!-- 4-Digit PIN Lock Status & Session Controls -->
        <div class="flex items-center gap-2">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-semibold">
            <Icons name="lock" size={12} />
            <span class="tracking-widest text-[10px]">PIN CLAIMED</span>
          </div>
          <button
            onclick={disconnectCharacter}
            class="px-2 py-1 bg-dark-800 hover:bg-dark-700 text-slate-400 hover:text-slate-200 border border-dark-700 rounded-lg text-xs transition-colors"
            title="Disconnect session"
          >
            Switch
          </button>
        </div>
      </div>

      <!-- Main HUD Row: AC, Perception, and HP Management -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        <!-- Vitals Chips: Armor Class & Passive Perception -->
        <div class="flex items-center gap-2 md:col-span-4">
          <!-- AC Badge -->
          <div class="flex-1 bg-dark-800/80 border border-dark-700 rounded-xl p-2 flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <Icons name="shield" size={18} />
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Armor Class</div>
              <div class="text-lg font-black text-slate-100 leading-none">{character.base_ac}</div>
            </div>
          </div>

          <!-- Passive Perception Badge -->
          <div class="flex-1 bg-dark-800/80 border border-dark-700 rounded-xl p-2 flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Icons name="eye" size={18} />
            </div>
            <div>
              <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Perception</div>
              <div class="text-lg font-black text-slate-100 leading-none">{character.passive_perception}</div>
            </div>
          </div>
        </div>

        <!-- Health Points HUD: Instant Increment/Decrement Buttons & Progress -->
        <div class="bg-dark-800/80 border border-dark-700 rounded-xl p-2.5 md:col-span-8 flex flex-col justify-between">
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                <Icons name="heart" size={14} class="text-red-500" /> Hit Points
              </span>
              {#if character.temp_hp > 0}
                <span class="px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-500/40 text-blue-300 text-[10px] font-bold">
                  +{character.temp_hp} Temp
                </span>
              {/if}
            </div>

            <div class="font-mono text-sm font-black text-slate-100">
              <span class={character.current_hp === 0 ? 'text-red-500 animate-pulse' : ''}>{character.current_hp}</span>
              <span class="text-slate-500"> / </span>
              <span>{character.max_hp}</span>
            </div>
          </div>

          <!-- HP Progress Bar -->
          <div class="w-full h-2 rounded-full bg-dark-950 overflow-hidden mb-2 border border-dark-700">
            <div
              class="h-full transition-all duration-300 rounded-full {
                hpPercent > 50
                  ? 'bg-emerald-500'
                  : hpPercent > 25
                  ? 'bg-amber-500'
                  : 'bg-red-600 animate-pulse'
              }"
              style="width: {hpPercent}%"
            ></div>
          </div>

          <!-- Instant HP Quick Adjust Buttons -->
          <div class="flex items-center justify-between gap-1 text-xs">
            <div class="flex items-center gap-1">
              <button
                onclick={() => adjustHp(-5)}
                class="px-2 py-1 bg-red-950/50 hover:bg-red-900/60 active:bg-red-800 border border-red-800/50 rounded text-red-300 font-bold transition-colors"
                title="Deduct 5 HP"
              >
                -5
              </button>
              <button
                onclick={() => adjustHp(-1)}
                class="px-2 py-1 bg-red-950/50 hover:bg-red-900/60 active:bg-red-800 border border-red-800/50 rounded text-red-300 font-bold transition-colors"
                title="Deduct 1 HP"
              >
                -1
              </button>
            </div>

            <!-- Temp HP Controls -->
            <div class="flex items-center gap-1 bg-dark-900/80 px-2 py-0.5 rounded border border-dark-700">
              <span class="text-[10px] text-slate-400 font-semibold">THP:</span>
              <button
                onclick={() => adjustTempHp(-1)}
                class="text-slate-400 hover:text-slate-200 px-1 font-bold"
                title="Decrease Temp HP"
              >-</button>
              <span class="font-mono text-xs text-blue-400 font-bold">{character.temp_hp}</span>
              <button
                onclick={() => adjustTempHp(1)}
                class="text-slate-400 hover:text-slate-200 px-1 font-bold"
                title="Increase Temp HP"
              >+</button>
            </div>

            <div class="flex items-center gap-1">
              <button
                onclick={() => adjustHp(1)}
                class="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 active:bg-emerald-800 border border-emerald-800/50 rounded text-emerald-300 font-bold transition-colors"
                title="Heal 1 HP"
              >
                +1
              </button>
              <button
                onclick={() => adjustHp(5)}
                class="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 active:bg-emerald-800 border border-emerald-800/50 rounded text-emerald-300 font-bold transition-colors"
                title="Heal 5 HP"
              >
                +5
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
{/if}
