import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import {
  calculateCover,
  segmentsIntersect,
  type CoverLevel,
  type CoverResult
} from './services/coverGeometry';

export { calculateCover, segmentsIntersect };
export type { CoverLevel, CoverResult };

export const coverCalculatorPlugin: VttPlugin = {
  id: 'cover-calculator',
  name: '5e Geometric Cover Calculator',
  version: '1.0.0',
  description: 'Automated 2D 4-corner raycast cover detection for D&D 5e combat',
  enabledByDefault: true,
  slots: [
    {
      slot: 'hud_dock',
      title: 'Cover Inspector',
      icon: 'shield-half',
      mount(container: HTMLElement, context: PluginContext) {
        let currentCover: CoverLevel = 'none';
        let currentAcBonus = 0;
        let isApplied = false;

        const pill = document.createElement('div');
        pill.className =
          'flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-lg text-xs font-medium select-none transition-all';

        function renderPill() {
          const badgeColor =
            currentCover === 'three_quarters'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : currentCover === 'half'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : currentCover === 'total'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700';

          const label =
            currentCover === 'three_quarters'
              ? '3/4 Cover (+5 AC)'
              : currentCover === 'half'
                ? 'Half Cover (+2 AC)'
                : currentCover === 'total'
                  ? 'Total Cover (Blocked)'
                  : 'Open (No Cover)';

          pill.innerHTML = `
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full ${
                currentCover === 'none'
                  ? 'bg-slate-500'
                  : currentCover === 'half'
                    ? 'bg-blue-400'
                    : currentCover === 'three_quarters'
                      ? 'bg-amber-400'
                      : 'bg-red-500'
              }"></span>
              <span class="text-slate-300 font-semibold">Cover:</span>
              <span class="px-2 py-0.5 rounded text-[11px] font-mono border ${badgeColor}">
                ${label}
              </span>
            </div>
            ${
              currentAcBonus > 0
                ? `<button
                    id="toggle-cover-btn"
                    class="ml-1 px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer ${
                      isApplied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }"
                  >
                    ${isApplied ? '✓ Applied' : `Apply +${currentAcBonus} AC`}
                  </button>`
                : ''
            }
          `;

          const btn = pill.querySelector('#toggle-cover-btn') as HTMLButtonElement | null;
          if (btn) {
            btn.onclick = () => {
              isApplied = !isApplied;
              context.emit('COVER_APPLIED', {
                level: currentCover,
                acBonus: isApplied ? currentAcBonus : 0
              });
              context.emit('NOTIFICATION', {
                type: 'info',
                title: isApplied ? 'Cover Applied' : 'Cover Removed',
                message: isApplied
                  ? `${label} applied to targeted defender.`
                  : 'Cover AC bonus dismissed.'
              });
              renderPill();
            };
          }
        }

        renderPill();
        container.appendChild(pill);

        // Listen for cover updates broadcasted or targeted
        const unsubs = [
          context.on<{ level: CoverLevel; acBonus: number }>(
            'COVER_EVALUATED',
            (payload) => {
              if (payload) {
                currentCover = payload.level;
                currentAcBonus = payload.acBonus;
                isApplied = false;
                renderPill();
              }
            }
          ),
          context.on('TOKEN_SELECTED', () => {
            isApplied = false;
            renderPill();
          })
        ];

        return {
          destroy: () => {
            unsubs.forEach((u) => u());
            pill.remove();
          }
        };
      }
    }
  ]
};
