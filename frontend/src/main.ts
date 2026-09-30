import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initGlobalCrashGuard } from './lib/services/errorBoundary';

initGlobalCrashGuard();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
