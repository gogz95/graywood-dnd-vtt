import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import { hardwareBridge } from './services/hardwareBridge.svelte';

export { hardwareBridge };

export const tabletopHardwarePlugin: VttPlugin = {
  id: 'tabletop-hardware',
  name: 'Physical Mini Halo & Bluetooth Dice',
  version: '1.0.0',
  description: 'Physical miniature under-glow halos for TV glass play and Web Bluetooth smart dice',
  enabledByDefault: false,
  slots: [
    {
      slot: 'header_action',
      title: 'Tabletop Hardware',
      icon: 'cpu',
      mount(container: HTMLElement, context: PluginContext) {
        const root = document.createElement('div');
        root.className = 'relative flex items-center select-none';

        root.innerHTML = `
          <button
            id="hardware-trigger-btn"
            class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Tabletop Hardware, Halo Mode & Smart Dice"
          >
            <span class="text-sm">🎲</span>
            <span>Hardware</span>
            <span id="hardware-active-dot" class="hidden w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          <div
            id="hardware-popover"
            class="hidden absolute top-full right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 flex flex-col gap-3 text-xs text-slate-200"
          >
            <div class="border-b border-slate-800 pb-2">
              <h3 class="font-bold text-slate-100 flex items-center gap-1.5">
                <span>Physical Tabletop Hardware</span>
              </h3>
              <p class="text-[10px] text-slate-400 mt-0.5">
                TV glass miniature display and Web Bluetooth dice integrations.
              </p>
            </div>

            <!-- Halo Mode Toggle -->
            <div class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
              <div class="flex flex-col">
                <span class="font-semibold text-slate-200">Mini Under-Glow Halo</span>
                <span class="text-[10px] text-slate-400">Hide digital portraits on TV</span>
              </div>
              <button
                id="halo-toggle-btn"
                class="w-10 h-5 rounded-full bg-slate-800 border border-slate-700 relative transition-colors cursor-pointer"
              >
                <div id="halo-toggle-thumb" class="w-4 h-4 rounded-full bg-slate-400 absolute top-0.5 left-0.5 transition-transform"></div>
              </button>
            </div>

            <!-- Bluetooth Smart Dice Connection -->
            <div class="flex flex-col gap-1.5">
              <button
                id="ble-pair-btn"
                class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow"
              >
                <span>Pair Bluetooth Smart Die</span>
              </button>
              <div id="dice-list" class="flex flex-col gap-1 text-[11px] text-slate-400">
                <span>No smart dice paired.</span>
              </div>
            </div>

            <!-- Foot Pedal / Stream Deck Hotkeys -->
            <div class="pt-2 border-t border-slate-800 flex flex-col gap-1 text-[10px] text-slate-400 font-mono">
              <span class="font-bold text-slate-300 font-sans">Pedal & Stream Deck Hotkeys:</span>
              <div class="flex justify-between">
                <span>[F9]</span>
                <span class="text-slate-300">Privacy Curtain Blackout</span>
              </div>
              <div class="flex justify-between">
                <span>[Space]</span>
                <span class="text-slate-300">Advance Next Combat Turn</span>
              </div>
            </div>
          </div>
        `;

        container.appendChild(root);

        const triggerBtn = root.querySelector('#hardware-trigger-btn') as HTMLButtonElement;
        const popover = root.querySelector('#hardware-popover') as HTMLDivElement;
        const haloBtn = root.querySelector('#halo-toggle-btn') as HTMLButtonElement;
        const haloThumb = root.querySelector('#halo-toggle-thumb') as HTMLDivElement;
        const activeDot = root.querySelector('#hardware-active-dot') as HTMLSpanElement;
        const blePairBtn = root.querySelector('#ble-pair-btn') as HTMLButtonElement;
        const diceList = root.querySelector('#dice-list') as HTMLDivElement;

        let isPopoverOpen = false;

        function togglePopover(show?: boolean) {
          isPopoverOpen = show ?? !isPopoverOpen;
          if (isPopoverOpen) {
            popover.classList.remove('hidden');
          } else {
            popover.classList.add('hidden');
          }
        }

        triggerBtn.onclick = (e) => {
          e.stopPropagation();
          togglePopover();
        };

        const handleDocClick = (e: MouseEvent) => {
          if (!root.contains(e.target as Node)) {
            togglePopover(false);
          }
        };
        document.addEventListener('click', handleDocClick);

        function updateHaloUi() {
          const enabled = hardwareBridge.isPhysicalMiniMode;
          if (enabled) {
            haloBtn.classList.add('bg-emerald-600', 'border-emerald-500');
            haloBtn.classList.remove('bg-slate-800', 'border-slate-700');
            haloThumb.classList.add('translate-x-5', 'bg-white');
            haloThumb.classList.remove('bg-slate-400');
            activeDot.classList.remove('hidden');
          } else {
            haloBtn.classList.remove('bg-emerald-600', 'border-emerald-500');
            haloBtn.classList.add('bg-slate-800', 'border-slate-700');
            haloThumb.classList.remove('translate-x-5', 'bg-white');
            haloThumb.classList.add('bg-slate-400');
            activeDot.classList.add('hidden');
          }
        }

        haloBtn.onclick = () => {
          const nextState = !hardwareBridge.isPhysicalMiniMode;
          hardwareBridge.togglePhysicalMiniMode(nextState, context);
          updateHaloUi();
        };

        blePairBtn.onclick = async () => {
          await hardwareBridge.connectBluetoothDie(context);
          renderDiceList();
        };

        function renderDiceList() {
          const dice = hardwareBridge.connectedDice;
          if (dice.length === 0) {
            diceList.innerHTML = '<span>No smart dice paired.</span>';
            return;
          }
          diceList.innerHTML = dice
            .map(
              (d) => `
              <div class="flex items-center justify-between p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200">
                <span class="font-semibold">${d.name}</span>
                <span class="font-mono text-amber-300">${d.lastRoll ? `Rolled: ${d.lastRoll}` : 'Ready'}</span>
              </div>
            `
            )
            .join('');
        }

        // Global foot-pedal / stream-deck keyboard listeners
        const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement | null;
          const isInput =
            target &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.isContentEditable);

          if (e.key === 'F9') {
            e.preventDefault();
            context.emit('TOGGLE_PRIVACY_CURTAIN', {}, true);
            context.emit('NOTIFICATION', {
              type: 'info',
              title: 'Privacy Curtain Toggled',
              message: 'F9 shortcut triggered projector blackout.'
            });
          } else if (e.code === 'Space' && !isInput) {
            // Spacebar trigger for pedal / stream deck
            context.emit('NEXT_COMBAT_TURN', {}, true);
          }
        };

        window.addEventListener('keydown', handleKeyDown);

        updateHaloUi();
        renderDiceList();

        return {
          destroy: () => {
            document.removeEventListener('click', handleDocClick);
            window.removeEventListener('keydown', handleKeyDown);
            root.remove();
          }
        };
      }
    }
  ]
};
