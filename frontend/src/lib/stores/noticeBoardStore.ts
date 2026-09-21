// src/lib/stores/noticeBoardStore.ts
// Adventurers' Guild Notice Board Store — Strict Zero-Mock 5e SRD Baseline

export type NoticeContractType = 'Exploration' | 'Hunt' | 'Protection' | 'Resource Gathering' | 'Find';
export type NoticeGuildRank = 'Apprentice' | 'Journeyman' | 'Adept' | 'Master' | 'Grandmaster';

export interface NoticeContract {
  id: string;
  title: string;
  type: NoticeContractType;
  client: string;
  destination: string;
  rewardGp: number;
  deadlineDays: number;
  minRank: NoticeGuildRank;
  description: string;
  objectives: string[];
  isAccepted: boolean;
  isCompleted: boolean;
  acceptedByCharacterName?: string;
  issuedEpochDay?: number;
}

const STORAGE_NOTICES_KEY = 'vtt_guild_notice_board_contracts';

const PURGED_FIXTURE_PATTERNS = [
  'Bloodhorn Chimera',
  'Subterranean Sunken Amphitheater',
  'Alchemical Reagents Caravan',
  'Pyric Sulfur Crystals',
  'Ancient Signet Ring of House Vane',
  'House Vane',
  'Temple Scribes of the Dawn',
  'Master Apothecary Corvus',
  'Merchants & Traders Guild'
];

function sanitizeNotices(notices: NoticeContract[]): NoticeContract[] {
  return notices.filter(n => {
    if (!n || !n.title) return false;
    const title = n.title.toLowerCase();
    const client = (n.client || '').toLowerCase();
    for (const pattern of PURGED_FIXTURE_PATTERNS) {
      const p = pattern.toLowerCase();
      if (title.includes(p) || client.includes(p)) {
        return false;
      }
    }
    return true;
  });
}

function loadInitialNotices(): NoticeContract[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NoticeContract[];
    const sanitized = sanitizeNotices(parsed);
    localStorage.setItem(STORAGE_NOTICES_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return [];
  }
}

class NoticeBoardStore {
  public notices: NoticeContract[] = loadInitialNotices();

  public getNotices(): NoticeContract[] {
    return this.notices;
  }

  public setNotices(items: NoticeContract[]): void {
    this.notices = sanitizeNotices(items);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_NOTICES_KEY, JSON.stringify(this.notices));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vtt:notices-updated', { detail: this.notices }));
    }
  }

  public addNotice(notice: NoticeContract): void {
    this.setNotices([...this.notices, notice]);
  }

  public removeNotice(id: string): void {
    this.setNotices(this.notices.filter(n => n.id !== id));
  }

  public acceptNotice(id: string, characterName?: string): void {
    this.setNotices(
      this.notices.map(n =>
        n.id === id ? { ...n, isAccepted: true, acceptedByCharacterName: characterName } : n
      )
    );
  }

  public completeNotice(id: string): void {
    this.setNotices(
      this.notices.map(n => (n.id === id ? { ...n, isCompleted: true } : n))
    );
  }

  public clearAll(): void {
    this.setNotices([]);
  }
}

export const noticeBoardStore = new NoticeBoardStore();
