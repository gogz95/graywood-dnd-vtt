// src/lib/types/journal.ts
// Handout & Split DM/Player Campaign Journal Data Schema

export interface JournalEntry {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  folder?: string;
  tags: string[];
  gmNotes: string; // Strictly visible to DM
  playerContent: string; // Visible to players when revealed
  imageBlob?: Blob;
  imageMime?: string;
  imageUrl?: string;
  isSharedWithPlayers: boolean;
  isSharedOnProjector: boolean;
}
