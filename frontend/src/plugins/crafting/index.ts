import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import AlchemyWorkbench from '$lib/components/crafting/AlchemyWorkbench.svelte';
import { craftingStore } from './stores/craftingStore.svelte';

export { craftingStore };

export const craftingPlugin: VttPlugin = {
  id: 'crafting',
  name: 'Alchemy & Downtime Crafting',
  version: '1.0.0',
  description: 'Alchemical crafting workbench, essence matrices, and item durability tracking',
  enabledByDefault: false,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Crafting & Alchemy',
      icon: 'flask-conical',
      mount(container: HTMLElement, _context: PluginContext) {
        const app = mount(AlchemyWorkbench, {
          target: container,
          props: {}
        });
        return {
          destroy: () => {
            unmount(app);
          }
        };
      }
    }
  ]
};
