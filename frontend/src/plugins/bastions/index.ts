import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import BastionDrawer from '$lib/components/bastion/BastionManagerView.svelte';
import { bastionStore } from './stores/bastionStore.svelte';

export { bastionStore };

export const bastionsPlugin: VttPlugin = {
  id: 'bastions',
  name: 'Bastions & Strongholds',
  version: '1.0.0',
  description: 'Bastions, Stronghold facilities, and downtime production tracking',
  enabledByDefault: false,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Bastions & Holdings',
      icon: 'castle',
      mount(container: HTMLElement, context: PluginContext) {
        const app = mount(BastionDrawer, {
          target: container,
          props: { context } as Record<string, unknown>
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
    bastionStore.setContext(context);

    let accumulatedHours = 0;
    context.on<{ hours: number }>('TIME_ADVANCED', ({ hours }) => {
      if (!hours || hours <= 0) return;
      accumulatedHours += hours;
      if (accumulatedHours >= 24) {
        const days = Math.floor(accumulatedHours / 24);
        accumulatedHours %= 24;
        bastionStore.advanceDowntimeDays(days);
      }
    });
  }
};
