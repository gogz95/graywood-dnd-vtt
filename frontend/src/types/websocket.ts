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
    }
  | {
      type: 'BLACK_ORB_TOGGLE';
      character_id: string;
      is_orb_sealed: boolean;
    }
  | {
      type: 'DICE_ROLL';
      character_id: string;
      formula: string;
      result: number;
      is_critical: boolean;
    }
  | {
      type: 'SYSTEM_MESSAGE';
      message: string;
      timestamp: number;
    }
  | {
      type: 'DATE_ADVANCED';
      epoch_days: number;
      days_advanced: number;
      date_formatted: string;
    };
