// src/lib/db/journalDb.ts
// Persistent Handout & Campaign Lore Journal Database powered by Dexie.js

import Dexie, { type Table } from 'dexie';
import type { JournalEntry } from '../types/journal';

export class JournalDatabase extends Dexie {
  journals!: Table<JournalEntry, string>;

  constructor() {
    super('VttJournalDatabase');

    this.version(1).stores({
      journals: 'id, title, folder, isSharedWithPlayers, isSharedOnProjector, createdAt',
    });
  }
}

export const journalDb = new JournalDatabase();
