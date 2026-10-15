import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import {
  lightingBridge,
  BUILTIN_PRESETS,
  triggerRoomState,
  triggerTransientFlash,
  type LightingPreset
} from './services/lightingBridge.svelte';

export {
  lightingBridge,
  BUILTIN_PRESETS,
  triggerRoomState,
  triggerTransientFlash
};
export type { LightingPreset };

export const smartLightingPlugin: VttPlugin = {
  id: 'smart-lighting',
  name: 'Smart Room Lighting (Hue / Home Assistant)',
  version: '1.0.0',
  description: 'Synchronizes physical smart room lighting with in-game scenes and combat events',
  enabledByDefault: false,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Room Lighting',
      icon: 'lightbulb',
      mount(container: HTMLElement, context: PluginContext) {
        const root = document.createElement('div');
        root.className = 'p-4 flex flex-col gap-4 text-slate-200 text-xs overflow-y-auto h-full select-none';

        root.innerHTML = `
          <div class="border-b border-slate-800 pb-3">
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <span>💡 Smart Room Lighting</span>
            </h2>
            <p class="text-[11px] text-slate-400 mt-1">
              Synchronize Philips Hue & Home Assistant room lights with in-game atmospheric presets and combat flashes.
            </p>
          </div>

          <!-- Webhook Endpoint Configuration -->
          <div class="flex flex-col gap-1.5">
            <label class="font-semibold text-slate-300">Home Assistant / Bridge Webhook URL</label>
            <input
              id="webhook-url-input"
              type="text"
              placeholder="http://homeassistant.local:8123/api/webhook/vtt_lights"
              value="${lightingBridge.webhookUrl}"
              class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-500 font-mono text-[11px] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <!-- Auto Combat Reactivity Toggle -->
          <div class="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
            <div class="flex flex-col">
              <span class="font-semibold text-slate-200">Auto-React to Combat</span>
              <span class="text-[10px] text-slate-400">Flashes red on Crits & Downed Characters</span>
            </div>
            <input
              id="auto-react-toggle"
              type="checkbox"
              ${lightingBridge.autoReactToCombat ? 'checked' : ''}
              class="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
            />
          </div>

          <!-- Atmospheric Lighting Presets -->
          <div class="flex flex-col gap-2">
            <label class="font-semibold text-slate-300">Atmospheric Presets</label>
            <div class="grid grid-cols-2 gap-2" id="preset-buttons-container">
              ${BUILTIN_PRESETS.map(
                (p) => `
                <button
                  class="preset-btn px-3 py-2 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900 text-left flex items-center gap-2.5 transition cursor-pointer shadow-sm"
                  data-id="${p.id}"
                >
                  <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style="background-color: ${p.hexColor};"></span>
                  <div class="flex flex-col truncate">
                    <span class="font-bold text-slate-200 truncate">${p.name.split('(')[0]}</span>
                    <span class="text-[10px] text-slate-400">${p.brightnessPct}% Brightness</span>
                  </div>
                </button>
              `
              ).join('')}
            </div>
          </div>

          <!-- Custom Color & Brightness Controller -->
          <div class="flex flex-col gap-2 p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <label class="font-semibold text-slate-300">Custom Lighting Control</label>
            <div class="flex items-center gap-3">
              <input
                id="custom-color-picker"
                type="color"
                value="#ff9329"
                class="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
              />
              <div class="flex-1 flex flex-col gap-1">
                <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Brightness</span>
                  <span id="brightness-val-label">80%</span>
                </div>
                <input
                  id="custom-brightness-slider"
                  type="range"
                  min="0"
                  max="100"
                  value="80"
                  class="w-full accent-indigo-500"
                />
              </div>
            </div>
            <button
              id="apply-custom-btn"
              class="w-full mt-1 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition cursor-pointer text-xs"
            >
              Apply Custom Light State
            </button>
          </div>

          <!-- Quick Test Triggers -->
          <div class="pt-2 border-t border-slate-800 flex gap-2">
            <button
              id="test-crit-flash-btn"
              class="flex-1 py-1.5 rounded bg-red-950/70 border border-red-800/80 hover:bg-red-900 text-red-200 font-semibold transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
            >
              <span>⚡ Test Crit Flash</span>
            </button>
          </div>
        `;

        container.appendChild(root);

        const urlInput = root.querySelector('#webhook-url-input') as HTMLInputElement;
        const autoReactToggle = root.querySelector('#auto-react-toggle') as HTMLInputElement;
        const colorPicker = root.querySelector('#custom-color-picker') as HTMLInputElement;
        const brightnessSlider = root.querySelector('#custom-brightness-slider') as HTMLInputElement;
        const brightnessLabel = root.querySelector('#brightness-val-label') as HTMLSpanElement;
        const applyCustomBtn = root.querySelector('#apply-custom-btn') as HTMLButtonElement;
        const testCritBtn = root.querySelector('#test-crit-flash-btn') as HTMLButtonElement;

        urlInput.onchange = () => {
          lightingBridge.setWebhookUrl(urlInput.value.trim());
          context.emit('NOTIFICATION', {
            type: 'success',
            title: 'Webhook Saved',
            message: 'Lighting webhook endpoint URL saved.'
          });
        };

        autoReactToggle.onchange = () => {
          lightingBridge.setAutoReactToCombat(autoReactToggle.checked);
        };

        brightnessSlider.oninput = () => {
          brightnessLabel.textContent = `${brightnessSlider.value}%`;
        };

        // Preset buttons
        root.querySelectorAll('.preset-btn').forEach((btn) => {
          (btn as HTMLButtonElement).onclick = () => {
            const id = btn.getAttribute('data-id');
            const preset = BUILTIN_PRESETS.find((p) => p.id === id);
            if (preset) {
              triggerRoomState(preset);
              context.emit('NOTIFICATION', {
                type: 'info',
                title: 'Lighting Triggered',
                message: `Activated ${preset.name} preset.`
              });
            }
          };
        });

        applyCustomBtn.onclick = () => {
          const customPreset: LightingPreset = {
            id: `custom_${Date.now()}`,
            name: 'Custom User Color',
            hexColor: colorPicker.value,
            brightnessPct: parseInt(brightnessSlider.value, 10),
            transitionMs: 800
          };
          triggerRoomState(customPreset);
        };

        testCritBtn.onclick = () => {
          triggerTransientFlash('#ff2a00', 1000);
        };

        return {
          destroy: () => {
            root.remove();
          }
        };
      }
    }
  ],
  onInit(context: PluginContext) {
    context.on('CRITICAL_HIT', () => {
      if (lightingBridge.autoReactToCombat) {
        triggerTransientFlash('#ff2a00', 1000);
      }
    });

    context.on<{ hpCurrent: number }>('ACTOR_ZERO_HP', () => {
      if (lightingBridge.autoReactToCombat) {
        triggerTransientFlash('#450a0a', 2500);
      }
    });
  }
};
