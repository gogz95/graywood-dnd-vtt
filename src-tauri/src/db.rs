use rusqlite::Connection;
use std::path::Path;

/// Initializes the SQLite connection, enforces foreign keys, and runs all schema migrations.
pub fn init_database(db_path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(db_path)?;
    configure_and_migrate(&mut conn)?;
    Ok(conn)
}

/// Initializes an in-memory SQLite database for testing and embedded server execution.
pub fn init_in_memory_db() -> rusqlite::Result<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure_and_migrate(&mut conn)?;
    Ok(conn)
}

/// Configures PRAGMA settings and executes all schema migrations sequentially.
pub fn configure_and_migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    crate::migrations::run_versioned_migrations(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::*;

    #[test]
    fn test_character_pin_and_creation() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        assert!(Character::validate_pin("1234"));
        assert!(!Character::validate_pin("123"));
        assert!(!Character::validate_pin("123a"));
        assert!(!Character::validate_pin("12345"));

        let char1 = Character {
            id: "char-uuid-1".to_string(),
            name: "Lyra Moonshadow".to_string(),
            pin: "4321".to_string(),
            current_hp: 28,
            max_hp: 28,
            temp_hp: 5,
            hit_dice_current: 4,
            hit_dice_max: 4,
            base_ac: 15,
            speed: 30,
            passive_perception: 14,
            spell_slots_json: r#"{"level_1":{"max":4,"used":1},"level_2":{"max":3,"used":0},"level_3":{"max":0,"used":0},"level_4":{"max":0,"used":0},"level_5":{"max":0,"used":0},"level_6":{"max":0,"used":0},"level_7":{"max":0,"used":0},"level_8":{"max":0,"used":0},"level_9":{"max":0,"used":0}}"#.to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: false,
            resurrection_sickness_penalty: 0,
        };

        char1.insert(&conn).expect("Failed to insert character");

        let fetched = Character::find_by_id(&conn, "char-uuid-1")
            .expect("Query failed")
            .expect("Character not found");

        assert_eq!(fetched.name, "Lyra Moonshadow");
        assert_eq!(fetched.pin, "4321");
        assert!(Character::verify_pin(&conn, "char-uuid-1", "4321").unwrap());
        assert!(!Character::verify_pin(&conn, "char-uuid-1", "0000").unwrap());

        let slots = fetched.parse_spell_slots().expect("Failed to parse slots");
        assert_eq!(slots.level_1.max, 4);
        assert_eq!(slots.level_1.used, 1);
    }

    #[test]
    fn test_compendium_queries() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let classes = CompendiumClass::list_all(&conn).expect("Failed to list classes");
        assert_eq!(classes.len(), 12);
        assert!(classes.iter().any(|c| c.name == "Wizard"));
        assert!(classes.iter().any(|c| c.name == "Paladin"));

        let cantrips = CompendiumSpell::query_spells(&conn, Some(0), None).expect("Query failed");
        assert!(cantrips.len() >= 3);
        assert!(cantrips.iter().any(|s| s.name == "Fire Bolt"));

        let wizard_spells = CompendiumSpell::query_spells(&conn, None, Some("Wizard")).expect("Query failed");
        assert!(wizard_spells.iter().any(|s| s.name == "Fireball"));
        assert!(wizard_spells.iter().any(|s| s.name == "Wish"));

        let lvl3_wizards = CompendiumSpell::query_spells(&conn, Some(3), Some("Wizard")).expect("Query failed");
        assert!(lvl3_wizards.iter().any(|s| s.name == "Fireball"));
        assert!(lvl3_wizards.iter().any(|s| s.name == "Counterspell"));
        assert!(!lvl3_wizards.iter().any(|s| s.name == "Revivify")); // Revivify is Cleric/Paladin/Artificer
    }

    #[test]
    fn test_public_roster_excludes_pin() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let char1 = Character {
            id: "roster-test-1".to_string(),
            name: "Secret Hero".to_string(),
            pin: "7777".to_string(),
            current_hp: 50,
            max_hp: 50,
            temp_hp: 0,
            hit_dice_current: 5,
            hit_dice_max: 5,
            base_ac: 16,
            speed: 30,
            passive_perception: 13,
            spell_slots_json: "{}".to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: true,
            resurrection_sickness_penalty: 0,
        };
        char1.insert(&conn).unwrap();

        let roster = PublicCharacterRoster::list_public_roster(&conn).unwrap();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].id, "roster-test-1");
        assert_eq!(roster[0].name, "Secret Hero");
        assert!(roster[0].is_orb_sealed);
    }

    #[test]
    fn test_inventory_spoilage_batch_query() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let char1 = Character {
            id: "char-uuid-2".to_string(),
            name: "Theron Ironheart".to_string(),
            pin: "9988".to_string(),
            current_hp: 45,
            max_hp: 45,
            temp_hp: 0,
            hit_dice_current: 5,
            hit_dice_max: 5,
            base_ac: 18,
            speed: 25,
            passive_perception: 11,
            spell_slots_json: "{}".to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: false,
            resurrection_sickness_penalty: 0,
        };
        char1.insert(&conn).unwrap();

        let current_time = 1_700_000_000_i64;
        let fresh_harvest_time = current_time - 3600; // 1 hour ago
        let expired_harvest_time = current_time - 100_000; // > 86400 seconds ago

        let fresh_item = InventoryItem {
            id: "item-fresh-1".to_string(),
            character_id: "char-uuid-2".to_string(),
            name: "Moonflower Petals".to_string(),
            quantity: 5,
            weight_lbs: 0.5,
            current_rp: 10,
            max_rp: 10,
            is_preserved: false,
            harvest_timestamp: Some(fresh_harvest_time),
            base_value_cp: 1000,
            is_spoiled: false,
        };
        fresh_item.insert(&conn).unwrap();

        let expired_unpreserved = InventoryItem {
            id: "item-expired-1".to_string(),
            character_id: "char-uuid-2".to_string(),
            name: "Shadow Drake Venom Gland".to_string(),
            quantity: 1,
            weight_lbs: 1.2,
            current_rp: 50,
            max_rp: 50,
            is_preserved: false,
            harvest_timestamp: Some(expired_harvest_time),
            base_value_cp: 5000,
            is_spoiled: false,
        };
        expired_unpreserved.insert(&conn).unwrap();

        let expired_preserved = InventoryItem {
            id: "item-preserved-1".to_string(),
            character_id: "char-uuid-2".to_string(),
            name: "Preserved Wyrm Scales".to_string(),
            quantity: 2,
            weight_lbs: 3.0,
            current_rp: 100,
            max_rp: 100,
            is_preserved: true,
            harvest_timestamp: Some(expired_harvest_time),
            base_value_cp: 8000,
            is_spoiled: false,
        };
        expired_preserved.insert(&conn).unwrap();

        let updated_count = InventoryItem::apply_spoilage_batch(&conn, current_time).unwrap();
        assert_eq!(updated_count, 1);

        let fresh_check = InventoryItem::find_by_id(&conn, "item-fresh-1").unwrap().unwrap();
        assert!(!fresh_check.is_spoiled);
        assert_eq!(fresh_check.base_value_cp, 1000);

        let spoiled_check = InventoryItem::find_by_id(&conn, "item-expired-1").unwrap().unwrap();
        assert!(spoiled_check.is_spoiled);
        assert_eq!(spoiled_check.base_value_cp, 2500); // halved from 5000

        let preserved_check = InventoryItem::find_by_id(&conn, "item-preserved-1").unwrap().unwrap();
        assert!(!preserved_check.is_spoiled);
        assert_eq!(preserved_check.base_value_cp, 8000);
    }

    #[test]
    fn test_currency_conversion_and_assay_ledger() {
        let mut conn = init_in_memory_db().expect("Failed to initialize test DB");

        let char1 = Character {
            id: "char-uuid-3".to_string(),
            name: "Vesper Vance".to_string(),
            pin: "1122".to_string(),
            current_hp: 20,
            max_hp: 20,
            temp_hp: 0,
            hit_dice_current: 3,
            hit_dice_max: 3,
            base_ac: 13,
            speed: 30,
            passive_perception: 12,
            spell_slots_json: "{}".to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: false,
            resurrection_sickness_penalty: 0,
        };
        char1.insert(&conn).unwrap();

        let pouch = CurrencyPouch {
            character_id: "char-uuid-3".to_string(),
            concord_sovereigns: 50,
            ay_modlahd_sun_disks: 100,
            rucean_rings: 10,
            trade_bars: 2,
            updated_at: 1_700_000_000,
        };
        pouch.insert_or_replace(&conn).unwrap();

        let result = CurrencyPouch::convert_sun_disks_to_sovereigns(
            &mut conn,
            "char-uuid-3",
            100,
            1_700_001_000,
            "assay-tx-001",
            Some("Official Assay Minting".to_string()),
        )
        .expect("Conversion failed");

        assert_eq!(result.sovereigns_minted, 90);
        assert_eq!(result.assay_fee_retained, 10);
        assert_eq!(result.updated_pouch.concord_sovereigns, 140);
        assert_eq!(result.updated_pouch.ay_modlahd_sun_disks, 0);

        let entries = AssayLedgerEntry::find_by_character_id(&conn, "char-uuid-3").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].sun_disks_submitted, 100);
        assert_eq!(entries[0].sovereigns_minted, 90);
        assert_eq!(entries[0].assay_fee_retained, 10);

        let (minted, fee) = calculate_sun_disk_assay(15).unwrap();
        assert_eq!(minted, 13);
        assert_eq!(fee, 2);
    }

    #[test]
    fn test_bastion_facilities_wage_calculation() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        let smithy = BastionFacility {
            id: "bastion-fac-1".to_string(),
            name: "Grand Armory Smithy".to_string(),
            room_points: 3,
            structural_hp: 150,
            max_hp: 150,
            skilled_hirelings: 3,
            unskilled_hirelings: 5,
            facility_type: "Smithy".to_string(),
            monthly_tax_gp: 10,
        };

        assert_eq!(smithy.daily_hireling_wage_cp(), 700);
        assert_eq!(smithy.tenday_hireling_wage_cp(), 7000);
        assert_eq!(smithy.monthly_hireling_wage_cp(30), 21_000);
        assert_eq!(smithy.monthly_tax_cp(), 1000);
        assert_eq!(smithy.monthly_total_maintenance_cp(30), 22_000);

        smithy.insert(&conn).expect("Failed to insert bastion facility");

        let fetched = BastionFacility::find_by_id(&conn, "bastion-fac-1")
            .unwrap()
            .unwrap();
        assert_eq!(fetched.name, "Grand Armory Smithy");
        assert_eq!(fetched.room_points, 3);

        let total_daily = BastionFacility::query_total_daily_wages_all(&conn).unwrap();
        assert_eq!(total_daily, 700);
    }
}
