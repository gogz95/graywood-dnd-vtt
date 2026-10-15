import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import LoreWikiView from '$lib/components/lore/LoreWikiView.svelte';
import PlayerHandoutModal from '$lib/components/handouts/PlayerHandoutModal.svelte';
import { activePlayerHandoutStore } from '$lib/network/broadcastBridge';
import { loreEngine, extractWikiLinks, castHandout } from './services/loreEngine.svelte';

export { loreEngine, extractWikiLinks, castHandout };

export const loreWikiPlugin: VttPlugin = {
  id: 'lore-wiki',
  name: 'Lore Wiki & Theatrical Handouts',
  version: '1.0.0',
  description: 'Bidirectional Markdown Lore Wiki, [[wikilink]] graph, and theatrical handout caster',
  enabledByDefault: true,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Lore & Handouts',
      icon: 'book-open',
      mount(container: HTMLElement, context: PluginContext) {
        const app = mount(LoreWikiView, {
          target: container,
          props: { context } as Record<string, unknown>
        });
        return {
          destroy: () => {
            unmount(app);
          }
        };
      }
    },
    {
      slot: 'canvas_overlay',
      title: 'Handout Presentation Layer',
      icon: 'scroll',
      mount(container: HTMLElement, context: PluginContext) {
        const unsubscribe = context.on<{
          title: string;
          contentMd: string;
          imageUrl?: string;
          targetPlayerId?: string;
        }>('HANDOUT_CAST', (payload) => {
          activePlayerHandoutStore.set({
            handout_id: `lore_cast_${Date.now()}`,
            title: payload.title,
            content_markdown: payload.contentMd,
            theme: 'classic',
            seal_type: 'wax_red',
            seal_text: 'SEALED & DELIVERED',
            timestamp: Date.now()
          });
        });

        const app = mount(PlayerHandoutModal, {
          target: container
        });

        return {
          destroy: () => {
            unsubscribe();
            unmount(app);
          }
        };
      }
    }
  ]
};
