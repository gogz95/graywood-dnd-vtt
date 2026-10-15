import { mount, unmount } from 'svelte';
import type { ViewportProvider } from '$lib/types/viewport';
import Scene3D from './components/Scene3D.svelte';

export const tactical3dProvider: ViewportProvider = {
  id: 'viewport-threlte-3d',
  name: '3D Spectator Display',
  supportedSceneTypes: ['tactical_3d', 'tactical_2d'],
  mount: (container, props) => {
    let currentProps = $state({
      scene: props.scene,
      tokens: props.tokens ?? [],
      isDmView: props.isDmView ?? false
    });

    const app = mount(Scene3D, {
      target: container,
      props: currentProps
    });

    return {
      destroy: () => {
        unmount(app);
      },
      update: (newProps: any) => {
        if (!newProps) return;
        if (newProps.scene) currentProps.scene = newProps.scene;
        if (newProps.tokens) currentProps.tokens = newProps.tokens;
        if (newProps.isDmView !== undefined) currentProps.isDmView = newProps.isDmView;
      }
    };
  }
};
