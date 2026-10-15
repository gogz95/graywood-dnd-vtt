// frontend/src/plugins/tabletop-hardware/services/hardwareBridge.svelte.ts
// Physical Miniature Under-Glow Halo Mode & Web Bluetooth Smart Dice Ingestion Bridge

import type { PluginContext } from '$lib/types/plugin';

export interface SmartDieDevice {
  id: string;
  name: string;
  battery?: number;
  lastRoll?: number;
}

const PIXELS_BLE_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

export class HardwareBridge {
  isPhysicalMiniMode = $state<boolean>(false);
  connectedDice = $state<SmartDieDevice[]>([]);
  activeModifierBonus = $state<number>(0);

  /**
   * Toggles Under-Glow Halo mode for TV glass play.
   * Tells display clients to hide digital portraits and render under-base light/aura halos.
   */
  togglePhysicalMiniMode(enabled: boolean, context: PluginContext): void {
    this.isPhysicalMiniMode = enabled;
    context.emit('HARDWARE_MINI_HALO_MODE', { enabled }, true);
    context.emit('NOTIFICATION', {
      type: 'info',
      title: 'Physical Miniature Mode',
      message: enabled
        ? 'Physical Mini Halo Mode active. Digital tokens hidden on TV display; light & aura rings retained.'
        : 'Physical Mini Halo Mode disabled. Standard digital tokens restored.'
    });
  }

  /**
   * Connects to a Web Bluetooth Smart Die (Pixels / GoDice) via GATT notifications.
   */
  async connectBluetoothDie(context: PluginContext): Promise<void> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      context.emit('NOTIFICATION', {
        type: 'warning',
        title: 'Bluetooth Unsupported',
        message: 'Web Bluetooth API is not available in this browser or system environment.'
      });
      return;
    }

    try {
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Pixel' },
          { namePrefix: 'GoDice' },
          { services: [PIXELS_BLE_SERVICE] }
        ],
        optionalServices: [PIXELS_BLE_SERVICE]
      });

      if (!device?.gatt) {
        throw new Error('GATT server unavailable on selected device.');
      }

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(PIXELS_BLE_SERVICE);
      const characteristics = await service.getCharacteristics();
      const notifyChar =
        characteristics.find((c: any) => c.properties.notify || c.properties.indicate) ||
        characteristics[0];

      if (notifyChar) {
        await notifyChar.startNotifications();

        notifyChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const value = event.target.value as DataView;
          let faceValue = 0;

          // Parse Pixels / GoDice BLE packet
          if (value.byteLength >= 2) {
            faceValue = (value.getUint8(1) % 20) + 1;
          } else if (value.byteLength >= 1) {
            faceValue = (value.getUint8(0) % 20) + 1;
          }

          if (faceValue >= 1 && faceValue <= 20) {
            const dieRecord = this.connectedDice.find((d) => d.id === device.id);
            if (dieRecord) {
              dieRecord.lastRoll = faceValue;
            }

            const formula = `1d20[Physical: ${faceValue}] + ${this.activeModifierBonus}`;
            context.rollDice(formula, 'Smart Die Roll');

            context.emit(
              'DICE_ROLL_3D',
              {
                formula,
                dice: [{ type: 'd20', value: faceValue }],
                total: faceValue + this.activeModifierBonus,
                label: `${device.name || 'Smart Die'}: ${faceValue}`
              },
              true
            );

            context.emit('NOTIFICATION', {
              type: 'info',
              title: 'Smart Die Rolled',
              message: `${device.name || 'Die'}: Rolled ${faceValue} (${formula})`
            });
          }
        });

        const newDie: SmartDieDevice = {
          id: device.id,
          name: device.name || 'Pixels Die',
          battery: 100,
          lastRoll: undefined
        };

        this.connectedDice.push(newDie);

        context.emit('NOTIFICATION', {
          type: 'success',
          title: 'Smart Die Connected',
          message: `Connected to ${device.name || 'Bluetooth Die'}.`
        });
      }
    } catch (err) {
      if ((err as Error)?.name === 'NotFoundError') {
        // User cancelled device picker
        return;
      }
      console.error('[hardwareBridge] Bluetooth error:', err);
      context.emit('NOTIFICATION', {
        type: 'error',
        title: 'Bluetooth Connection Failed',
        message: err instanceof Error ? err.message : 'Failed to connect smart die.'
      });
    }
  }
}

export const hardwareBridge = new HardwareBridge();
