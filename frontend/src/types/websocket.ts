export type WsEvent =
  | {
      type: 'TOKEN_MOVE';
      id: string;
      x: number;
      y: number;
    }
  | {
      type: 'HP_UPDATE';
      character_id: string;
      current_hp: number;
      temp_hp: number;
      exhaustion_level?: number;
    }
  | {
      type: 'BLACK_ORB_TOGGLE';
      character_id: string;
      is_orb_sealed: boolean;
    }
  | {
      type: 'DICE_ROLL';
      character_id: string;
      character_name?: string;
      formula: string;
      result: number;
      is_critical: boolean;
      breakdown?: string;
      seed?: number;
      vectors?: Array<{ x: number; y: number; angle: number; velocity: number }>;
    }

  | {
      type: 'SYSTEM_MESSAGE';
      message: string;
      timestamp: number;
    }
  | {
      type: 'CHAT_MESSAGE';
      message: {
        id: string;
        sender_id: string;
        sender_name: string;
        content: string;
        recipient_id?: string | null;
        is_system: boolean;
        timestamp: number;
      };
    }

  | {
      type: 'DATE_ADVANCED';
      epoch_days: number;
      days_advanced: number;
      date_formatted: string;
    }
  | {
      type: 'TIME_UPDATE';
      epoch_days: number;
      current_epoch_seconds: number;
      seconds_advanced: number;
      formatted_time: string;
    }
  | {
      type: 'HANDOUT' | 'Handout';
      id: string;
      title: string;
      content: string;
      image_url?: string | null;
    }
  | {
      type: 'HANDOUT_BROADCAST';
      handout_id: string;
      title: string;
      subtitle?: string;
      content_markdown: string;
      theme: 'bounty' | 'proclamation' | 'journal' | 'contract' | 'classic';
      seal_type?: 'wax_red' | 'wax_gold' | 'imperial_black' | 'none';
      seal_text?: string;
      timestamp: number;
    }
  | {
      type: 'HANDOUT_DISMISS';
      handout_id?: string;
    }
  | {
      type: 'PING_POINT' | 'PingPoint';
      x: number;
      y: number;
      color: string;
      sender_name: string;
    }
  | {
      type: 'DM_WHISPER';
      id: string;
      target_character_id?: string;
      target_pin?: string;
      sender_name: string;
      message: string;
      timestamp: number;
    }
  | {
      type: 'COMBAT_INITIATIVE_UPDATE';
      encounter_id: string;
      round: number;
      current_turn_index: number;
      combatants: Array<{
        id: string;
        name: string;
        initiative: number;
        is_active: boolean;
        is_on_deck: boolean;
        is_hidden?: boolean;
        is_player?: boolean;
        hp_percent?: number;
      }>;
    }
  | {
      type: 'AUTH_REQUEST';
      pin: string;
    }
  | {
      type: 'AUTH_SUCCESS';
      character_id: string;
      character_name?: string;
    }
  | {
      type: 'AUTH_FAILURE';
      message: string;
    }
  | {
      type: 'TRADE_OFFER';
      trade_id: string;
      sender_id: string;
      sender_name: string;
      receiver_id: string;
      receiver_name: string;
      item: any;
      quantity: number;
      timestamp: number;
      notes?: string;
    }
  | {
      type: 'TRADE_ACCEPT';
      trade_id: string;
      sender_id: string;
      sender_name: string;
      receiver_id: string;
      receiver_name: string;
      item_id: string;
      item_name: string;
      quantity: number;
      timestamp: number;
    }
  | {
      type: 'TRADE_DECLINE';
      trade_id: string;
      sender_id: string;
      sender_name: string;
      receiver_id: string;
      receiver_name: string;
      item_id: string;
      item_name: string;
      timestamp: number;
      reason?: string;
    }
  | {
      type: 'TRADE_AUDIT_LOG';
      trade_id: string;
      sender_id: string;
      sender_name: string;
      receiver_id: string;
      receiver_name: string;
      item_id: string;
      item_name: string;
      quantity: number;
      status: 'OFFERED' | 'ACCEPTED' | 'DECLINED';
      timestamp: number;
      notes?: string;
    }
  | {
      type: 'BATTLEMAT_WS_EVENT';
      event: any;
    }
  | {
      type: 'DRAWING_UPDATE';
      action: 'upsert' | 'delete' | 'clear' | 'sync';
      drawing?: any;
      drawings?: any[];
      drawing_id?: string;
      layer?: 'dm' | 'shared';
    }
  | {
      type: 'PROP_UPDATE';
      action: 'upsert' | 'delete';
      prop?: import('../lib/types/prop').CanvasProp;
      prop_id?: string;
    }
  | {
      type:
        | 'TOKEN_SPAWNED'
        | 'TOKEN_UPDATED'
        | 'TOKEN_REMOVED'
        | 'STATE_SNAPSHOT'
        | 'TokenMoved'
        | 'TokenSpawned'
        | 'TokenUpdated'
        | 'TokenRemoved'
        | 'StateSnapshot'
        | 'STAGING_CURTAIN'
        | 'staging_curtain'
        | 'StagingCurtain';
      [key: string]: any;
    };


