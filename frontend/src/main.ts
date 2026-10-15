import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initGlobalCrashGuard } from './lib/services/errorBoundary';
import { pluginHost } from './lib/services/pluginHost.svelte';
import { calendarPlugin } from './plugins/calendar';
import { soundboardPlugin } from './plugins/soundboard';
import { craftingPlugin } from './plugins/crafting';
import { bastionsPlugin } from './plugins/bastions';
import { loreWikiPlugin } from './plugins/lore-wiki';
import { mapImportersPlugin } from './plugins/map-importers';
import { dndBeyondPlugin } from './plugins/dnd-beyond';
import { aiCopilotPlugin } from './plugins/ai-copilot';
import { coverCalculatorPlugin } from './plugins/cover-calculator';
import { combatAutomationPlugin } from './plugins/combat-automation';
import { tabletopHardwarePlugin } from './plugins/tabletop-hardware';
import { smartLightingPlugin } from './plugins/smart-lighting';

initGlobalCrashGuard();

pluginHost.register(calendarPlugin);
pluginHost.register(soundboardPlugin);
pluginHost.register(craftingPlugin);
pluginHost.register(bastionsPlugin);
pluginHost.register(loreWikiPlugin);
pluginHost.register(mapImportersPlugin);
pluginHost.register(dndBeyondPlugin);
pluginHost.register(aiCopilotPlugin);
pluginHost.register(coverCalculatorPlugin);
pluginHost.register(combatAutomationPlugin);
pluginHost.register(tabletopHardwarePlugin);
pluginHost.register(smartLightingPlugin);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
