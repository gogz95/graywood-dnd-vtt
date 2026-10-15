// frontend/src/plugins/bastions/stores/bastionStore.svelte.ts
// Bastion State Store with Svelte 5 Runes & Entity Blackboard API

import type { PluginContext } from '$lib/types/plugin';

export interface BastionFacility {
  id: string;
  name: string;
  type: 'cramped' | 'roomy' | 'vast';
  order: 'craft' | 'empower' | 'harvest' | 'maintain' | 'recruit' | 'research' | 'trade' | 'idle';
  hirelings: string[];
  daysRemaining: number;
}

export interface BastionState {
  name: string;
  level: number;
  defenders: number;
  treasuryGp: number;
  facilities: BastionFacility[];
}

export class BastionStore {
  bastions = $state<Record<string, BastionState>>({});
  private context: PluginContext | null = null;

  setContext(context: PluginContext): void {
    this.context = context;
  }

  getBastion(actorId: string): BastionState | undefined {
    if (!this.bastions[actorId] && this.context) {
      const persisted = this.context.getMeta<BastionState>('actor', actorId, 'bastions');
      if (persisted) {
        this.bastions[actorId] = persisted;
      }
    }
    return this.bastions[actorId];
  }

  setBastion(actorId: string, state: BastionState): void {
    this.bastions[actorId] = state;
    if (this.context) {
      this.context.setMeta<BastionState>('actor', actorId, 'bastions', state);
    }
  }

  loadFromBlackboard(actorId: string): BastionState | undefined {
    if (!this.context) return undefined;
    const meta = this.context.getMeta<BastionState>('actor', actorId, 'bastions');
    if (meta) {
      this.bastions[actorId] = meta;
    }
    return meta;
  }

  saveToBlackboard(actorId: string, state?: BastionState): void {
    const data = state ?? this.bastions[actorId];
    if (data && this.context) {
      this.bastions[actorId] = data;
      this.context.setMeta<BastionState>('actor', actorId, 'bastions', data);
    }
  }

  addFacility(actorId: string, facility: BastionFacility): void {
    const bastion = this.getBastion(actorId);
    if (!bastion) return;
    bastion.facilities.push(facility);
    this.setBastion(actorId, bastion);
  }

  setFacilityOrder(
    actorId: string,
    facilityId: string,
    order: BastionFacility['order'],
    days: number
  ): void {
    const bastion = this.getBastion(actorId);
    if (!bastion) return;
    const facility = bastion.facilities.find((f) => f.id === facilityId);
    if (facility) {
      facility.order = order;
      facility.daysRemaining = days;
      this.setBastion(actorId, bastion);
    }
  }

  advanceDowntimeDays(days: number): void {
    if (days <= 0) return;

    for (const [actorId, bastion] of Object.entries(this.bastions)) {
      let stateChanged = false;

      for (const facility of bastion.facilities) {
        if (facility.order !== 'idle' && facility.daysRemaining > 0) {
          const prevDays = facility.daysRemaining;
          facility.daysRemaining = Math.max(0, facility.daysRemaining - days);
          stateChanged = true;

          if (facility.daysRemaining === 0 && prevDays > 0) {
            if (this.context) {
              this.context.emit('BASTION_ORDER_COMPLETED', {
                actorId,
                bastionName: bastion.name,
                facilityId: facility.id,
                facilityName: facility.name,
                order: facility.order,
                message: `Order '${facility.order}' completed in ${facility.name} (${bastion.name}).`
              });
              this.context.emit('NOTIFICATION', {
                type: 'success',
                title: 'Bastion Order Completed',
                message: `${bastion.name}: ${facility.name} completed order '${facility.order}'.`
              });
            }
          }
        }
      }

      if (stateChanged && this.context) {
        this.context.setMeta<BastionState>('actor', actorId, 'bastions', bastion);
      }
    }
  }
}

export const bastionStore = new BastionStore();
