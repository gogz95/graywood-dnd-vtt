// src/lib/stores/floatingWindowsStore.svelte.ts
// Global Floating Window Manager with dynamic zIndex, position, size, and minimization

export type WindowId = 'audio' | 'copilot' | 'archivist' | 'sources';

export interface FloatingWindowState {
  id: WindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

class FloatingWindowsManager {
  private highestZ = 100;

  windows = $state<Record<WindowId, FloatingWindowState>>({
    audio: {
      id: 'audio',
      title: 'Soundboard & Atmospheric Audio',
      isOpen: false,
      isMinimized: false,
      zIndex: 100,
      x: 60,
      y: 80,
      width: 480,
      height: 520
    },
    copilot: {
      id: 'copilot',
      title: 'AI DM Co-Pilot',
      isOpen: false,
      isMinimized: false,
      zIndex: 101,
      x: 120,
      y: 90,
      width: 420,
      height: 580
    },
    archivist: {
      id: 'archivist',
      title: 'Archivist Document Lore',
      isOpen: false,
      isMinimized: false,
      zIndex: 102,
      x: 180,
      y: 100,
      width: 600,
      height: 600
    },
    sources: {
      id: 'sources',
      title: 'Local Sources & Rulebook Explorer',
      isOpen: false,
      isMinimized: false,
      zIndex: 103,
      x: 100,
      y: 70,
      width: 860,
      height: 620
    }
  });

  bringToFront(id: WindowId) {
    this.highestZ += 1;
    if (this.windows[id]) {
      this.windows[id].zIndex = this.highestZ;
    }
  }

  openWindow(id: WindowId) {
    if (this.windows[id]) {
      this.windows[id].isOpen = true;
      this.windows[id].isMinimized = false;
      this.bringToFront(id);
    }
  }

  open(id: WindowId) {
    this.openWindow(id);
  }

  close(id: WindowId) {
    this.closeWindow(id);
  }

  closeWindow(id: WindowId) {
    if (this.windows[id]) {
      this.windows[id].isOpen = false;
    }
  }

  toggleWindow(id: WindowId) {
    if (this.windows[id]) {
      if (this.windows[id].isOpen) {
        this.closeWindow(id);
      } else {
        this.openWindow(id);
      }
    }
  }

  toggleMinimize(id: WindowId) {
    if (this.windows[id]) {
      this.windows[id].isMinimized = !this.windows[id].isMinimized;
      if (!this.windows[id].isMinimized) {
        this.bringToFront(id);
      }
    }
  }

  updatePosition(id: WindowId, x: number, y: number) {
    if (this.windows[id]) {
      this.windows[id].x = Math.max(0, x);
      this.windows[id].y = Math.max(0, y);
    }
  }

  updateSize(id: WindowId, width: number, height: number) {
    if (this.windows[id]) {
      this.windows[id].width = Math.max(280, width);
      this.windows[id].height = Math.max(200, height);
    }
  }
}

export const floatingWindowsStore = new FloatingWindowsManager();
