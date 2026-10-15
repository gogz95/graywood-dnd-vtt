import { mount, unmount } from 'svelte';
import type { PluginContext, VttPlugin } from '$lib/types/plugin';
import CalendarWidget from '$lib/components/time/CalendarWidget.svelte';
import WorldClockPill from '$lib/components/navigation/WorldClockPill.svelte';

export const calendarPlugin: VttPlugin = {
  id: 'calendar',
  name: 'Harptos World Calendar',
  version: '1.0.0',
  description: 'Faerûn Harptos calendar tracking and universal campaign clock',
  enabledByDefault: true,
  slots: [
    {
      slot: 'sidebar_tab',
      title: 'Calendar & Time',
      icon: '📅',
      mount(container: HTMLElement, context: PluginContext) {
        const app = mount(CalendarWidget, {
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
      slot: 'header_action',
      title: 'World Clock',
      icon: '🕒',
      mount(container: HTMLElement, context: PluginContext) {
        const app = mount(WorldClockPill, {
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
  onInit(_context: PluginContext) {
    // Optional hook: CalendarWidget & WorldClockPill automatically sync state via timeStore / localStorage
  }
};
