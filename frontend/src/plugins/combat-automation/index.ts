import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import {
  concentrationAndRestEngine,
  handleDamageEvent,
  executeRest,
  computeConcentrationDc
} from './services/concentrationAndRest.svelte';

export {
  concentrationAndRestEngine,
  handleDamageEvent,
  executeRest,
  computeConcentrationDc
};

export const combatAutomationPlugin: VttPlugin = {
  id: 'combat-automation',
  name: 'Concentration Watchdog & Rest Engine',
  version: '1.0.0',
  description: 'Automated 5e Concentration DC calculation and Short/Long Rest party restoration',
  enabledByDefault: true,
  slots: [
    {
      slot: 'header_action',
      title: 'Short / Long Rest',
      icon: 'tent',
      mount(container: HTMLElement, context: PluginContext) {
        const root = document.createElement('div');
        root.className = 'relative flex items-center select-none';

        root.innerHTML = `
          <button
            id="rest-trigger-btn"
            class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            title="Party Short / Long Rest"
          >
            <span class="text-sm">⛺</span>
            <span>Rest</span>
          </button>

          <div
            id="rest-popover"
            class="hidden absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-50 flex flex-col text-xs"
          >
            <button
              id="short-rest-btn"
              class="px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex flex-col gap-0.5 transition cursor-pointer"
            >
              <span class="font-bold text-amber-300">Short Rest (1 Hour)</span>
              <span class="text-[10px] text-slate-400">Spend Hit Dice + advance calendar</span>
            </button>
            <div class="h-px bg-slate-800"></div>
            <button
              id="long-rest-btn"
              class="px-3 py-2 text-left hover:bg-slate-800 text-slate-200 flex flex-col gap-0.5 transition cursor-pointer"
            >
              <span class="font-bold text-emerald-400">Long Rest (8 Hours)</span>
              <span class="text-[10px] text-slate-400">Full HP, spell slots & half Hit Dice</span>
            </button>
          </div>

          <div
            id="concentration-toast-container"
            class="fixed top-16 right-6 z-50 flex flex-col gap-2 pointer-events-auto"
          ></div>
        `;

        container.appendChild(root);

        const restTriggerBtn = root.querySelector('#rest-trigger-btn') as HTMLButtonElement;
        const restPopover = root.querySelector('#rest-popover') as HTMLDivElement;
        const shortRestBtn = root.querySelector('#short-rest-btn') as HTMLButtonElement;
        const longRestBtn = root.querySelector('#long-rest-btn') as HTMLButtonElement;
        const toastContainer = root.querySelector('#concentration-toast-container') as HTMLDivElement;

        let isPopoverOpen = false;

        function togglePopover(show?: boolean) {
          isPopoverOpen = show ?? !isPopoverOpen;
          if (isPopoverOpen) {
            restPopover.classList.remove('hidden');
          } else {
            restPopover.classList.add('hidden');
          }
        }

        restTriggerBtn.onclick = (e) => {
          e.stopPropagation();
          togglePopover();
        };

        const handleDocClick = (e: MouseEvent) => {
          if (!root.contains(e.target as Node)) {
            togglePopover(false);
          }
        };
        document.addEventListener('click', handleDocClick);

        shortRestBtn.onclick = () => {
          togglePopover(false);
          executeRest('short', [], context);
        };

        longRestBtn.onclick = () => {
          togglePopover(false);
          executeRest('long', [], context);
        };

        // Render live floating Concentration toasts
        function updateConcentrationToasts() {
          const prompts = concentrationAndRestEngine.pendingPrompts;
          if (prompts.length === 0) {
            toastContainer.innerHTML = '';
            return;
          }

          toastContainer.innerHTML = prompts
            .map(
              (p) => `
              <div
                class="px-3.5 py-2.5 rounded-lg bg-slate-900 border border-amber-500/80 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 animate-bounce-once text-xs min-w-[260px]"
                data-prompt-id="${p.id}"
              >
                <div class="flex items-center justify-between font-bold text-amber-300">
                  <span class="flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    <span>Concentration Check</span>
                  </span>
                  <span class="font-mono text-white text-[11px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700">DC ${p.dc}</span>
                </div>
                <p class="text-[11px] text-slate-300">
                  <span class="font-semibold text-white">${p.actorName}</span> took <span class="text-red-400 font-bold">${p.damageTaken}</span> damage while concentrating on <span class="italic text-slate-200">${p.spellName || 'spell'}</span>.
                </p>
                <div class="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <button
                    class="btn-roll-save flex-1 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] transition cursor-pointer"
                    data-id="${p.id}"
                    data-dc="${p.dc}"
                  >
                    Roll CON Save
                  </button>
                  <button
                    class="btn-drop flex-1 py-1 rounded bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-white font-semibold text-[11px] transition border border-slate-700 cursor-pointer"
                    data-id="${p.id}"
                  >
                    Drop Spell
                  </button>
                </div>
              </div>
            `
            )
            .join('');

          // Wire action buttons
          toastContainer.querySelectorAll('.btn-roll-save').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const id = btn.getAttribute('data-id');
              const dc = btn.getAttribute('data-dc');
              if (id) {
                context.rollDice('1d20', `CON Save vs DC ${dc}`);
                concentrationAndRestEngine.resolvePrompt(id, true, context);
                updateConcentrationToasts();
              }
            };
          });

          toastContainer.querySelectorAll('.btn-drop').forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
              const id = btn.getAttribute('data-id');
              if (id) {
                concentrationAndRestEngine.resolvePrompt(id, false, context);
                updateConcentrationToasts();
              }
            };
          });
        }

        const pollTimer = setInterval(updateConcentrationToasts, 400);
        updateConcentrationToasts();

        return {
          destroy: () => {
            clearInterval(pollTimer);
            document.removeEventListener('click', handleDocClick);
            root.remove();
          }
        };
      }
    }
  ],
  onInit(context: PluginContext) {
    context.on<any>('DAMAGE_APPLIED', (payload) => {
      handleDamageEvent(payload, context);
    });
  }
};
