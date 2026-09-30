// src/lib/services/questEngine.ts
// Directed Acyclic Graph (DAG) Quest Tracker & Branching Outcome Engine (QuestBase Pattern)

import type {
  QuestNode,
  QuestNodeStatus,
  QuestGraph,
  QuestReward,
  CampaignDateTime
} from '../types/campaign';
import { compendiumDb } from '../db/compendiumDb';

export interface QuestStatusChangeEvent {
  nodeId: string;
  previousStatus: QuestNodeStatus;
  newStatus: QuestNodeStatus;
  unlockedNodeIds: string[];
  failedNodeIds: string[];
}

// ── Built-in Preset Questlines ──────────────────────────────────────────────

export const STARTER_CAMPAIGN_QUESTS: Record<string, QuestNode> = {
  'q-intro-arrival': {
    id: 'q-intro-arrival',
    title: 'Arrival in Graywood',
    description: 'Report to Captain Vaelen at the town garrison and secure travel permits.',
    category: 'Main',
    status: 'active',
    prerequisites: [],
    rewards: { xp: 150, gp: 25 },
    location: 'Graywood Sentry Post',
    giver: 'Captain Vaelen'
  },
  'q-forest-investigation': {
    id: 'q-forest-investigation',
    title: 'Shadows in the Weald',
    description: 'Scout the abandoned lumber camp and discover the source of missing woodcutters.',
    category: 'Main',
    status: 'locked',
    prerequisites: ['q-intro-arrival'],
    rewards: { xp: 300, gp: 50, items: ['Warder’s Signal Whistle'] },
    location: 'Weeping Weald'
  },
  'q-path-infiltrate': {
    id: 'q-path-infiltrate',
    title: 'Midnight Infiltration',
    description: 'Scale the western cliffside and sabotage the bandit redoubt without sounding the alarm.',
    category: 'Main',
    status: 'locked',
    prerequisites: ['q-forest-investigation'],
    mutuallyExclusiveWith: ['q-path-parley'],
    rewards: { xp: 500, gp: 120, items: ['Shadowveil Dagger'] },
    location: 'Redoubt Palisade'
  },
  'q-path-parley': {
    id: 'q-path-parley',
    title: 'Diplomatic Envoy',
    description: 'Deliver the magistrate’s pardon charter to the outlaw chieftain to negotiate peace.',
    category: 'Main',
    status: 'locked',
    prerequisites: ['q-forest-investigation'],
    mutuallyExclusiveWith: ['q-path-infiltrate'],
    rewards: { xp: 500, gp: 100, reputation: { Outlaws: 15, TownGuard: -5 } },
    location: 'Outlaw Encampment'
  },
  'q-relic-cleansing': {
    id: 'q-relic-cleansing',
    title: 'The Aleamos Sanctum',
    description: 'Descend into the sunken crypt and break the temporal seal holding the ancient wyrm.',
    category: 'Main',
    status: 'locked',
    prerequisites: ['q-path-infiltrate', 'q-path-parley'], // Can be unlocked by either branch completion
    rewards: { xp: 1200, gp: 500, items: ['Aleamos Temporal Ring'] },
    location: 'Sunken Crypt'
  },
  'q-side-herbs': {
    id: 'q-side-herbs',
    title: 'Apothecary’s Commission',
    description: 'Gather 4 sprigs of Ghost-Cap mushrooms for the local alchemist.',
    category: 'Side',
    status: 'active',
    prerequisites: [],
    rewards: { xp: 100, gp: 30, items: ['Potion of Healing'] },
    location: 'Damp Caverns',
    giver: 'Alchemist Mira'
  }
};

export class QuestEngine {
  private nodes: Record<string, QuestNode> = {};
  private readonly STORAGE_KEY = 'vtt_campaign_quest_dag';

  constructor(initialNodes?: Record<string, QuestNode>) {
    this.nodes = initialNodes ? { ...initialNodes } : { ...STARTER_CAMPAIGN_QUESTS };

    if (typeof window !== 'undefined') {
      this.loadState();
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  public async saveState(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.nodes));

      // Persist in Dexie
      await compendiumDb.campaignFlags.put({
        key: 'campaign_quests',
        value: this.nodes,
        updatedAt: Date.now()
      });

      window.dispatchEvent(
        new CustomEvent('vtt:quest-updated', {
          detail: { nodes: { ...this.nodes } }
        })
      );
    } catch {
      // ignore
    }
  }

  public loadState(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          this.nodes = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  // ── Graph Queries ─────────────────────────────────────────────────────────

  public getAllNodes(): QuestNode[] {
    return Object.values(this.nodes);
  }

  public getNode(id: string): QuestNode | undefined {
    return this.nodes[id];
  }

  public getActiveNodes(): QuestNode[] {
    return Object.values(this.nodes).filter((n) => n.status === 'active');
  }

  public getCompletedNodes(): QuestNode[] {
    return Object.values(this.nodes).filter((n) => n.status === 'completed');
  }

  public getDownstreamNodes(nodeId: string): QuestNode[] {
    return Object.values(this.nodes).filter((n) => n.prerequisites.includes(nodeId));
  }

  // ── State Transitions & Branching Resolution ──────────────────────────────

  public updateQuestStatus(
    nodeId: string,
    newStatus: QuestNodeStatus,
    completionTime?: CampaignDateTime
  ): QuestStatusChangeEvent | null {
    const node = this.nodes[nodeId];
    if (!node) return null;

    const previousStatus = node.status;
    if (previousStatus === newStatus) return null;

    node.status = newStatus;
    if (newStatus === 'completed') {
      node.completedAt = completionTime || {
        year: 1492,
        month: 1,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0
      };
    }

    const failedNodeIds: string[] = [];
    const unlockedNodeIds: string[] = [];

    // 1. Branching Pathway Evaluation: Mutually Exclusive Nodes
    if (newStatus === 'completed' && node.mutuallyExclusiveWith) {
      for (const excId of node.mutuallyExclusiveWith) {
        const excNode = this.nodes[excId];
        if (excNode && excNode.status !== 'completed') {
          excNode.status = 'failed';
          failedNodeIds.push(excId);
        }
      }
    }

    // 2. Downstream Dependency Unlocking
    if (newStatus === 'completed') {
      for (const candidate of Object.values(this.nodes)) {
        if (candidate.status === 'locked') {
          // Check if candidate prerequisites are met
          // If candidate is downstream of branching paths, having ANY valid completed branch or ALL met
          const hasBranchingPrereqs = candidate.prerequisites.some((p) => {
            const prereqNode = this.nodes[p];
            return prereqNode?.mutuallyExclusiveWith && prereqNode.mutuallyExclusiveWith.length > 0;
          });

          let canUnlock = false;
          if (hasBranchingPrereqs) {
            // OR logic for mutually exclusive branches: at least one branch completed
            canUnlock = candidate.prerequisites.some((p) => this.nodes[p]?.status === 'completed');
          } else {
            // Standard AND logic: all prerequisites must be completed
            canUnlock = candidate.prerequisites.every((p) => this.nodes[p]?.status === 'completed');
          }

          if (canUnlock) {
            candidate.status = 'active';
            unlockedNodeIds.push(candidate.id);
          }
        }
      }
    }

    this.saveState();

    const event: QuestStatusChangeEvent = {
      nodeId,
      previousStatus,
      newStatus,
      unlockedNodeIds,
      failedNodeIds
    };

    if (typeof window !== 'undefined') {
      let toastMsg = `Quest Updated: "${node.title}" is now ${newStatus.toUpperCase()}`;
      if (unlockedNodeIds.length > 0) {
        toastMsg += ` (Unlocked ${unlockedNodeIds.length} quest(s))`;
      }
      window.dispatchEvent(new CustomEvent('vtt:toast', { detail: { message: toastMsg } }));
    }

    return event;
  }

  public addQuestNode(node: QuestNode): void {
    this.nodes[node.id] = { ...node };
    this.saveState();
  }

  public deleteQuestNode(id: string): void {
    delete this.nodes[id];
    // Remove references to this node in prerequisites
    for (const n of Object.values(this.nodes)) {
      n.prerequisites = n.prerequisites.filter((p) => p !== id);
      if (n.mutuallyExclusiveWith) {
        n.mutuallyExclusiveWith = n.mutuallyExclusiveWith.filter((m) => m !== id);
      }
    }
    this.saveState();
  }

  public resetToPresets(): void {
    this.nodes = { ...STARTER_CAMPAIGN_QUESTS };
    this.saveState();
  }
}

// Global Singleton
export const questEngine = new QuestEngine();
