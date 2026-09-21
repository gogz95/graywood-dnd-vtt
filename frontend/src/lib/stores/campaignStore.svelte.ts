// src/lib/stores/campaignStore.svelte.ts
// Svelte 5 Rune-based Campaign Identity & Wizard Persistence Store

import { compendiumDb } from '../db/compendiumDb';

export interface CampaignIdentity {
  campaignName: string;
  dmAlias: string;
  masterPin: string;
}

export class CampaignStore {
  campaignName = $state<string>('Default Campaign');
  dmAlias = $state<string>('Dungeon Master');
  masterPin = $state<string>('1337');
  hasCompletedWizard = $state<boolean>(false);
  isLoaded = $state<boolean>(false);
  initPromise: Promise<void>;

  constructor() {
    this.hydrateFromLocalStorage();
    this.initPromise = this.initFromDexie();
  }

  private hydrateFromLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const storedName = localStorage.getItem('vtt_campaign_name');
      if (storedName) this.campaignName = storedName;

      const storedDm = localStorage.getItem('vtt_dm_name');
      if (storedDm) this.dmAlias = storedDm;

      const storedPin = localStorage.getItem('vtt_active_pin');
      if (storedPin) this.masterPin = storedPin;

      const completed =
        localStorage.getItem('graywood_wizard_completed') === 'true' ||
        localStorage.getItem('vtt_setup_completed') === 'true' ||
        localStorage.getItem('vtt_setup_complete') === 'true' ||
        localStorage.getItem('hasCompletedWizard') === 'true';
      this.hasCompletedWizard = completed;
    } catch {
      // ignore
    }
  }

  private async initFromDexie(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        if (compendiumDb.campaignFlags) {
          const nameFlag = await compendiumDb.campaignFlags.get('campaignName');
          if (nameFlag && typeof nameFlag.value === 'string' && nameFlag.value.trim() !== '') {
            this.campaignName = nameFlag.value;
          }

          const dmFlag = await compendiumDb.campaignFlags.get('dmAlias');
          if (dmFlag && typeof dmFlag.value === 'string' && dmFlag.value.trim() !== '') {
            this.dmAlias = dmFlag.value;
          }

          const pinFlag = await compendiumDb.campaignFlags.get('masterPin');
          if (pinFlag && typeof pinFlag.value === 'string' && pinFlag.value.trim() !== '') {
            this.masterPin = pinFlag.value;
          }

          const wizardFlag = await compendiumDb.campaignFlags.get('hasCompletedWizard');
          if (wizardFlag && typeof wizardFlag.value === 'boolean') {
            this.hasCompletedWizard = wizardFlag.value;
          }
        }
      } catch (err) {
        console.warn('Failed to hydrate campaign flags from Dexie:', err);
      }
    }
    this.isLoaded = true;
  }

  async persistFlags(): Promise<void> {
    if (typeof window !== 'undefined' && compendiumDb.campaignFlags) {
      try {
        await compendiumDb.campaignFlags.bulkPut([
          { key: 'campaignName', value: this.campaignName },
          { key: 'dmAlias', value: this.dmAlias },
          { key: 'masterPin', value: this.masterPin },
          { key: 'hasCompletedWizard', value: this.hasCompletedWizard }
        ]);
      } catch (err) {
        console.warn('Failed to persist campaign flags to Dexie:', err);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('vtt_campaign_name', this.campaignName);
        localStorage.setItem('vtt_dm_name', this.dmAlias);
        localStorage.setItem('vtt_active_pin', this.masterPin);
        if (this.hasCompletedWizard) {
          localStorage.setItem('graywood_wizard_completed', 'true');
          localStorage.setItem('vtt_setup_completed', 'true');
          localStorage.setItem('vtt_setup_complete', 'true');
          localStorage.setItem('hasCompletedWizard', 'true');
        }
      } catch {
        // ignore
      }
    }
  }

  async setIdentity(identity: Partial<CampaignIdentity>): Promise<void> {
    if (identity.campaignName !== undefined) this.campaignName = identity.campaignName;
    if (identity.dmAlias !== undefined) this.dmAlias = identity.dmAlias;
    if (identity.masterPin !== undefined) this.masterPin = identity.masterPin;
    await this.persistFlags();
  }

  async completeWizard(): Promise<void> {
    this.hasCompletedWizard = true;
    await this.persistFlags();
  }

  async resetWizard(): Promise<void> {
    this.hasCompletedWizard = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('graywood_wizard_completed');
      localStorage.removeItem('vtt_setup_completed');
      localStorage.removeItem('vtt_setup_complete');
      localStorage.removeItem('hasCompletedWizard');
    }
    if (typeof window !== 'undefined' && compendiumDb.campaignFlags) {
      try {
        await compendiumDb.campaignFlags.put({ key: 'hasCompletedWizard', value: false });
      } catch {
        // ignore
      }
    }
  }
}

export const campaignStore = new CampaignStore();
