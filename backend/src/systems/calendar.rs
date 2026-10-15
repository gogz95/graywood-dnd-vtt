use crate::server::routes::ws::WsEvent;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::broadcast;

pub const CHANCELLERY_DAYS_PER_YEAR: u64 = 364;
pub const CHANCELLERY_BASE_YEAR: u64 = 1420;

pub const AY_MODLAHD_DAYS_PER_YEAR: u64 = 365;
pub const AY_MODLAHD_BASE_SOLAR_YEAR: u64 = 680;
pub const AY_MODLAHD_ACCESSION_YEAR: u64 = 668; // Emperor Kaelen VI accession

pub const RUCEAN_DAYS_PER_CYCLE: u64 = 28;
pub const RUCEAN_CYCLES_PER_YEAR: u64 = 13;
pub const RUCEAN_DAYS_PER_YEAR: u64 = RUCEAN_DAYS_PER_CYCLE * RUCEAN_CYCLES_PER_YEAR; // 364
pub const RUCEAN_BASE_YEAR: u64 = 910;

#[derive(Debug, Error)]
pub enum CalendarError {
    #[error("Database error in campaign timekeeper: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Invalid advancement duration: {0}")]
    InvalidDuration(String),

    #[error("Campaign state table is uninitialized")]
    StateUninitialized,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChancelleryDate {
    pub year: u64,
    pub day_of_year: u32,
    pub month: Option<u32>,
    pub month_name: Option<String>,
    pub decade: Option<u32>,
    pub day_of_decade: Option<u32>,
    pub intercalary_festival: Option<String>,
    pub formatted: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AyModlahdDate {
    pub solar_year: u64,
    pub regnal_year: u64,
    pub emperor_name: String,
    pub day_of_solar_year: u32,
    pub solar_mansion: Option<u32>,
    pub mansion_name: Option<String>,
    pub day_of_mansion: Option<u32>,
    pub epagomenal_sun_festival: Option<String>,
    pub formatted: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuceanTideDate {
    pub year: u64,
    pub cycle: u32,
    pub cycle_name: String,
    pub day_of_cycle: u32,
    pub lunar_phase: String,
    pub formatted: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MultiCalendarDate {
    pub epoch_days: u64,
    pub chancellery: ChancelleryDate,
    pub ay_modlahd: AyModlahdDate,
    pub rucean_tide: RuceanTideDate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CampaignAdvanceResult {
    pub previous_epoch_days: u64,
    pub new_epoch_days: u64,
    pub days_advanced: u32,
    pub current_epoch_seconds: i64,
    pub spoiled_items_count: usize,
    pub expired_contracts_count: usize,
    pub calendars: MultiCalendarDate,
}

const CHANCELLERY_MONTHS: [&str; 12] = [
    "Deepfrost",   // Month 1
    "Winterwane",  // Month 2
    "Verdan",      // Month 3
    "Bloomtide",   // Month 4
    "Goldensun",   // Month 5
    "Midyear",     // Month 6
    "Harvestrise", // Month 7
    "Amberfall",   // Month 8
    "Rustleaf",    // Month 9
    "Chillwind",   // Month 10
    "Shadowfrost", // Month 11
    "Yearsend",    // Month 12
];

const AY_MODLAHD_MANSIONS: [&str; 12] = [
    "Mansion of the Golden Scarab",
    "Mansion of the Amber Dune",
    "Mansion of the Solar Serpent",
    "Mansion of the Sun Disc",
    "Mansion of the Radiant Lotus",
    "Mansion of the Scorching Lion",
    "Mansion of the Oasis Well",
    "Mansion of the Saffron Hawk",
    "Mansion of the Copper Pyre",
    "Mansion of the Cinnabar Horizon",
    "Mansion of the Starforge",
    "Mansion of the Twilight Jackal",
];

const AY_MODLAHD_EPAGOMENA: [&str; 5] = [
    "Feast of the Golden Dawn",
    "Feast of the Solar Zenith",
    "Feast of the Radiant Eclipse",
    "Feast of the Crimson Dusk",
    "Solemnity of Sol Invictus",
];

const RUCEAN_TIDE_CYCLES: [&str; 13] = [
    "Tide of the Pale Siren",
    "Tide of the Silver Sturgeon",
    "Tide of the Roaring Abyssal",
    "Tide of the Pearl Shell",
    "Tide of the Coral Blossom",
    "Tide of the Sapphire Trench",
    "Tide of the Drowned Star",
    "Tide of the Black Kelp",
    "Tide of the Salt Leviathan",
    "Tide of the Fog Serpent",
    "Tide of the Ghost Galleon",
    "Tide of the Frozen Shallows",
    "Tide of the Kraken's Eye",
];

/// Converts total in-game days elapsed (`epoch_days`) into structured date representations
/// and full formatted strings for all three canonical calendar systems:
/// 1. Chancellery Standard (364 days: 36 Decades + 4 Intercalary Solstice/Equinox festivals).
/// 2. Ay Modlahd Solar Regnal (365 days: 12 Mansions of 30 days + 5 Epagomenal Sun Festivals, Emperor Kaelen VI).
/// 3. Rucean Tide Cycle (13 lunar cycles of exactly 28 days each).
pub fn convert_epoch_to_calendars(epoch_days: u64) -> MultiCalendarDate {
    // -------------------------------------------------------------
    // Calendar 1: Chancellery Standard (364 days/year)
    // -------------------------------------------------------------
    let chancellery_year = CHANCELLERY_BASE_YEAR + (epoch_days / CHANCELLERY_DAYS_PER_YEAR);
    let chancellery_day_of_year = ((epoch_days % CHANCELLERY_DAYS_PER_YEAR) + 1) as u32;

    let chancellery = match chancellery_day_of_year {
        // Vernal Equinox Festival (Day 91)
        91 => ChancelleryDate {
            year: chancellery_year,
            day_of_year: 91,
            month: None,
            month_name: None,
            decade: None,
            day_of_decade: None,
            intercalary_festival: Some("High Springtide (Vernal Equinox Festival)".to_string()),
            formatted: format!(
                "Year {} CS, High Springtide (Vernal Equinox Festival), Day 91 of 364",
                chancellery_year
            ),
        },
        // Summer Solstice Festival (Day 182)
        182 => ChancelleryDate {
            year: chancellery_year,
            day_of_year: 182,
            month: None,
            month_name: None,
            decade: None,
            day_of_decade: None,
            intercalary_festival: Some("Suncrest Zenith (Summer Solstice Festival)".to_string()),
            formatted: format!(
                "Year {} CS, Suncrest Zenith (Summer Solstice Festival), Day 182 of 364",
                chancellery_year
            ),
        },
        // Autumnal Equinox Festival (Day 273)
        273 => ChancelleryDate {
            year: chancellery_year,
            day_of_year: 273,
            month: None,
            month_name: None,
            decade: None,
            day_of_decade: None,
            intercalary_festival: Some("Harvest Feast (Autumnal Equinox Festival)".to_string()),
            formatted: format!(
                "Year {} CS, Harvest Feast (Autumnal Equinox Festival), Day 273 of 364",
                chancellery_year
            ),
        },
        // Winter Solstice Festival (Day 364)
        364 => ChancelleryDate {
            year: chancellery_year,
            day_of_year: 364,
            month: None,
            month_name: None,
            decade: None,
            day_of_decade: None,
            intercalary_festival: Some(
                "Night of the Long Vigil (Winter Solstice Festival)".to_string(),
            ),
            formatted: format!(
                "Year {} CS, Night of the Long Vigil (Winter Solstice Festival), Day 364 of 364",
                chancellery_year
            ),
        },
        // Standard Decade & Month days (36 Decades of 10 days each)
        d => {
            // Adjust day offset by counting preceding intercalary festival days
            let preceding_festivals = if d > 273 {
                3
            } else if d > 182 {
                2
            } else if d > 91 {
                1
            } else {
                0
            };
            let standard_day = d - preceding_festivals; // 1 to 360
            let zero_indexed_day = standard_day - 1;

            let month_index = zero_indexed_day / 30; // 0 to 11
            let month_num = month_index + 1;
            let month_name = CHANCELLERY_MONTHS[month_index as usize].to_string();

            let decade_num = (zero_indexed_day / 10) + 1; // 1 to 36
            let day_of_decade = (zero_indexed_day % 10) + 1; // 1 to 10

            ChancelleryDate {
                year: chancellery_year,
                day_of_year: d,
                month: Some(month_num),
                month_name: Some(month_name.clone()),
                decade: Some(decade_num),
                day_of_decade: Some(day_of_decade),
                intercalary_festival: None,
                formatted: format!(
                    "Year {} CS, Month {} ({}), Decade {}, Day {} (Day {} of 364)",
                    chancellery_year, month_num, month_name, decade_num, day_of_decade, d
                ),
            }
        }
    };

    // -------------------------------------------------------------
    // Calendar 2: Ay Modlahd Solar Regnal (365 days/year)
    // -------------------------------------------------------------
    let solar_year = AY_MODLAHD_BASE_SOLAR_YEAR + (epoch_days / AY_MODLAHD_DAYS_PER_YEAR);
    let regnal_year = (solar_year - AY_MODLAHD_ACCESSION_YEAR) + 1;
    let day_of_solar_year = ((epoch_days % AY_MODLAHD_DAYS_PER_YEAR) + 1) as u32;

    let ay_modlahd = if day_of_solar_year <= 360 {
        let zero_idx = day_of_solar_year - 1;
        let mansion_idx = zero_idx / 30;
        let mansion_num = mansion_idx + 1;
        let day_of_mansion = (zero_idx % 30) + 1;
        let mansion_name = AY_MODLAHD_MANSIONS[mansion_idx as usize].to_string();

        AyModlahdDate {
            solar_year,
            regnal_year,
            emperor_name: "Emperor Kaelen VI".to_string(),
            day_of_solar_year,
            solar_mansion: Some(mansion_num),
            mansion_name: Some(mansion_name.clone()),
            day_of_mansion: Some(day_of_mansion),
            epagomenal_sun_festival: None,
            formatted: format!(
                "Regnal Year {} of Emperor Kaelen VI, Mansion {} ({}), Day {} (Day {} of 365)",
                regnal_year, mansion_num, mansion_name, day_of_mansion, day_of_solar_year
            ),
        }
    } else {
        // Epagomenal Sun Festival Days (361 to 365)
        let epagomena_idx = (day_of_solar_year - 361) as usize;
        let festival_name = AY_MODLAHD_EPAGOMENA[epagomena_idx].to_string();

        AyModlahdDate {
            solar_year,
            regnal_year,
            emperor_name: "Emperor Kaelen VI".to_string(),
            day_of_solar_year,
            solar_mansion: None,
            mansion_name: None,
            day_of_mansion: None,
            epagomenal_sun_festival: Some(festival_name.clone()),
            formatted: format!(
                "Regnal Year {} of Emperor Kaelen VI, Epagomena {}: {}, Day {} of 365",
                regnal_year,
                epagomena_idx + 1,
                festival_name,
                day_of_solar_year
            ),
        }
    };

    // -------------------------------------------------------------
    // Calendar 3: Rucean Tide Cycle (13 cycles of 28 days = 364 days)
    // -------------------------------------------------------------
    let rucean_year = RUCEAN_BASE_YEAR + (epoch_days / RUCEAN_DAYS_PER_YEAR);
    let day_in_rucean_year = epoch_days % RUCEAN_DAYS_PER_YEAR;

    let cycle_idx = (day_in_rucean_year / RUCEAN_DAYS_PER_CYCLE) as usize; // 0 to 12
    let cycle_num = (cycle_idx + 1) as u32;
    let cycle_name = RUCEAN_TIDE_CYCLES[cycle_idx].to_string();
    let day_of_cycle = ((day_in_rucean_year % RUCEAN_DAYS_PER_CYCLE) + 1) as u32; // 1 to 28

    let lunar_phase = match day_of_cycle {
        1..=7 => "Waxing Crescent Tide",
        8..=14 => "First Quarter Spring Tide",
        15..=21 => "Full Moon Apex Tide",
        _ => "Waning Neap Tide",
    }
    .to_string();

    let rucean_tide = RuceanTideDate {
        year: rucean_year,
        cycle: cycle_num,
        cycle_name: cycle_name.clone(),
        day_of_cycle,
        lunar_phase: lunar_phase.clone(),
        formatted: format!(
            "Year {} RT, Cycle {} ({}), Day {}, {}",
            rucean_year, cycle_num, cycle_name, day_of_cycle, lunar_phase
        ),
    };

    MultiCalendarDate {
        epoch_days,
        chancellery,
        ay_modlahd,
        rucean_tide,
    }
}

/// Daily Advancement Hook:
/// 1. Increments global `epoch_days` and `current_epoch_seconds` in SQLite.
/// 2. Queries `inventory_items` for unpreserved harvested reagents where elapsed > 24 hours (86400s),
///    setting `is_spoiled = 1` and halving `base_value_cp`.
/// 3. Queries `contracts` table and marks notice-board bounties as expired after 10 elapsed days.
/// 4. Dispatches a `DATE_ADVANCED` WebSocket event to all connected peers.
pub fn advance_campaign_days(
    conn: &Connection,
    ws_sender: Option<&broadcast::Sender<WsEvent>>,
    days: u32,
) -> Result<CampaignAdvanceResult, CalendarError> {
    if days == 0 {
        return Err(CalendarError::InvalidDuration(
            "Days to advance must be strictly greater than 0".to_string(),
        ));
    }

    // 1. Fetch current global campaign state
    let state_row: Option<(u64, i64)> = conn
        .query_row(
            "SELECT epoch_days, current_epoch_seconds FROM campaign_state WHERE id = 'global'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let (prev_epoch_days, prev_epoch_seconds) =
        state_row.ok_or(CalendarError::StateUninitialized)?;

    let new_epoch_days = prev_epoch_days + (days as u64);
    let seconds_advanced = (days as i64) * 86400;
    let new_epoch_seconds = prev_epoch_seconds + seconds_advanced;

    // Update global campaign state
    conn.execute(
        "UPDATE campaign_state
         SET epoch_days = ?1,
             current_epoch_seconds = ?2,
             updated_at = ?3
         WHERE id = 'global'",
        params![new_epoch_days, new_epoch_seconds, new_epoch_seconds],
    )?;

    // 2. Query and update unpreserved inventory items past the 24-hour harvest window
    let spoiled_items_count = conn.execute(
        "UPDATE inventory_items
         SET is_spoiled = 1,
             base_value_cp = base_value_cp / 2
         WHERE is_preserved = 0
           AND is_spoiled = 0
           AND harvest_timestamp IS NOT NULL
           AND (?1 - harvest_timestamp) > 86400",
        params![new_epoch_seconds],
    )?;

    // 3. Query contracts table and flag expired notice-board bounties (duration_days default 10)
    let expired_contracts_count = conn.execute(
        "UPDATE contracts
         SET is_expired = 1
         WHERE is_expired = 0
           AND is_completed = 0
           AND (?1 - posted_epoch_days) >= duration_days",
        params![new_epoch_days],
    )?;

    // 4. Compute updated multi-calendar dates
    let calendars = convert_epoch_to_calendars(new_epoch_days);

    // 5. Broadcast DATE_ADVANCED event over WebSocket hub
    if let Some(sender) = ws_sender {
        let _ = sender.send(WsEvent::DateAdvanced {
            epoch_days: new_epoch_days,
            days_advanced: days,
            date_formatted: calendars.chancellery.formatted.clone(),
        });
    }

    Ok(CampaignAdvanceResult {
        previous_epoch_days: prev_epoch_days,
        new_epoch_days,
        days_advanced: days,
        current_epoch_seconds: new_epoch_seconds,
        spoiled_items_count,
        expired_contracts_count,
        calendars,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_in_memory_db;
    use crate::models::{Character, InventoryItem};

    #[test]
    fn test_chancellery_calendar_and_festivals() {
        // Day 0: First day of Year 1420 CS, Month 1 (Deepfrost), Decade 1, Day 1
        let day0 = convert_epoch_to_calendars(0);
        assert_eq!(day0.chancellery.year, 1420);
        assert_eq!(day0.chancellery.month, Some(1));
        assert_eq!(day0.chancellery.month_name.as_deref(), Some("Deepfrost"));
        assert_eq!(day0.chancellery.decade, Some(1));
        assert_eq!(day0.chancellery.day_of_decade, Some(1));
        assert_eq!(day0.chancellery.intercalary_festival, None);

        // Day 90: Vernal Equinox Festival (Day 91 of year)
        let equinox1 = convert_epoch_to_calendars(90);
        assert_eq!(equinox1.chancellery.day_of_year, 91);
        assert!(equinox1.chancellery.intercalary_festival.is_some());
        assert!(equinox1
            .chancellery
            .intercalary_festival
            .unwrap()
            .contains("High Springtide"));
        assert_eq!(equinox1.chancellery.month, None);

        // Day 91: First day after Spring Equinox -> Month 4 (Bloomtide), Decade 10, Day 1
        let day92_cal = convert_epoch_to_calendars(91);
        assert_eq!(day92_cal.chancellery.day_of_year, 92);
        assert_eq!(day92_cal.chancellery.month, Some(4));
        assert_eq!(
            day92_cal.chancellery.month_name.as_deref(),
            Some("Bloomtide")
        );
        assert_eq!(day92_cal.chancellery.decade, Some(10));
        assert_eq!(day92_cal.chancellery.day_of_decade, Some(1));

        // Day 181: Summer Solstice Festival (Day 182 of year)
        let solstice1 = convert_epoch_to_calendars(181);
        assert_eq!(solstice1.chancellery.day_of_year, 182);
        assert!(solstice1
            .chancellery
            .intercalary_festival
            .unwrap()
            .contains("Suncrest Zenith"));

        // Day 272: Autumnal Equinox Festival (Day 273 of year)
        let equinox2 = convert_epoch_to_calendars(272);
        assert_eq!(equinox2.chancellery.day_of_year, 273);
        assert!(equinox2
            .chancellery
            .intercalary_festival
            .unwrap()
            .contains("Harvest Feast"));

        // Day 363: Winter Solstice Festival (Day 364 of year)
        let solstice2 = convert_epoch_to_calendars(363);
        assert_eq!(solstice2.chancellery.day_of_year, 364);
        assert!(solstice2
            .chancellery
            .intercalary_festival
            .unwrap()
            .contains("Night of the Long Vigil"));

        // Day 364: Start of Year 1421 CS
        let year2 = convert_epoch_to_calendars(364);
        assert_eq!(year2.chancellery.year, 1421);
        assert_eq!(year2.chancellery.day_of_year, 1);
        assert_eq!(year2.chancellery.month, Some(1));
    }

    #[test]
    fn test_ay_modlahd_solar_calendar() {
        let day0 = convert_epoch_to_calendars(0);
        assert_eq!(day0.ay_modlahd.solar_year, 680);
        assert_eq!(day0.ay_modlahd.regnal_year, 13); // 680 - 668 + 1 = 13
        assert_eq!(day0.ay_modlahd.solar_mansion, Some(1));
        assert_eq!(
            day0.ay_modlahd.mansion_name.as_deref(),
            Some("Mansion of the Golden Scarab")
        );

        // Day 360 (Day 361 of solar year): Epagomena 1
        let epag1 = convert_epoch_to_calendars(360);
        assert_eq!(epag1.ay_modlahd.day_of_solar_year, 361);
        assert_eq!(
            epag1.ay_modlahd.epagomenal_sun_festival.as_deref(),
            Some("Feast of the Golden Dawn")
        );

        // Day 364 (Day 365 of solar year): Solemnity of Sol Invictus
        let epag5 = convert_epoch_to_calendars(364);
        assert_eq!(epag5.ay_modlahd.day_of_solar_year, 365);
        assert_eq!(
            epag5.ay_modlahd.epagomenal_sun_festival.as_deref(),
            Some("Solemnity of Sol Invictus")
        );

        // Day 365: Rollover to next Solar Regnal Year (14)
        let next_year = convert_epoch_to_calendars(365);
        assert_eq!(next_year.ay_modlahd.solar_year, 681);
        assert_eq!(next_year.ay_modlahd.regnal_year, 14);
        assert_eq!(next_year.ay_modlahd.day_of_solar_year, 1);
    }

    #[test]
    fn test_rucean_tide_cycle() {
        let day0 = convert_epoch_to_calendars(0);
        assert_eq!(day0.rucean_tide.year, 910);
        assert_eq!(day0.rucean_tide.cycle, 1);
        assert_eq!(day0.rucean_tide.cycle_name, "Tide of the Pale Siren");
        assert_eq!(day0.rucean_tide.day_of_cycle, 1);
        assert_eq!(day0.rucean_tide.lunar_phase, "Waxing Crescent Tide");

        // Day 14 (Day 15 of cycle): Full Moon Apex Tide
        let full_moon = convert_epoch_to_calendars(14);
        assert_eq!(full_moon.rucean_tide.day_of_cycle, 15);
        assert_eq!(full_moon.rucean_tide.lunar_phase, "Full Moon Apex Tide");

        // Day 28 (Day 1 of Cycle 2): Tide of the Silver Sturgeon
        let cycle2 = convert_epoch_to_calendars(28);
        assert_eq!(cycle2.rucean_tide.cycle, 2);
        assert_eq!(cycle2.rucean_tide.cycle_name, "Tide of the Silver Sturgeon");
        assert_eq!(cycle2.rucean_tide.day_of_cycle, 1);
    }

    #[test]
    fn test_advance_campaign_days_hook() {
        let conn = init_in_memory_db().expect("Failed to initialize test DB");

        // Create character and harvested items
        let test_char = Character {
            id: "char-cal-1".to_string(),
            name: "Rowan Silverleaf".to_string(),
            pin: "2468".to_string(),
            current_hp: 30,
            max_hp: 30,
            temp_hp: 0,
            hit_dice_current: 4,
            hit_dice_max: 4,
            base_ac: 15,
            speed: 30,
            passive_perception: 14,
            spell_slots_json: "{}".to_string(),
            inventory_json: "[]".to_string(),
            is_orb_sealed: false,
            resurrection_sickness_penalty: 0,
        };
        test_char.insert(&conn).unwrap();

        // Fresh unpreserved item harvested at epoch_seconds (1700000000)
        let fresh_item = InventoryItem {
            id: "inv-harvest-1".to_string(),
            character_id: "char-cal-1".to_string(),
            name: "Ghost Orchid Blossom".to_string(),
            quantity: 2,
            weight_lbs: 0.2,
            current_rp: 5,
            max_rp: 5,
            is_preserved: false,
            harvest_timestamp: Some(1700000000),
            base_value_cp: 2000,
            is_spoiled: false,
        };
        fresh_item.insert(&conn).unwrap();

        // Advance 1 day (86400 seconds) -> still within 24h window
        let advance1 = advance_campaign_days(&conn, None, 1).expect("Advance 1 failed");
        assert_eq!(advance1.new_epoch_days, 1);
        assert_eq!(advance1.spoiled_items_count, 0);

        // Advance another 2 days (total 3 days elapsed) -> > 24 hours, so item must spoil
        let advance2 = advance_campaign_days(&conn, None, 2).expect("Advance 2 failed");
        assert_eq!(advance2.new_epoch_days, 3);
        assert_eq!(advance2.spoiled_items_count, 1);

        let spoiled_item = InventoryItem::find_by_id(&conn, "inv-harvest-1")
            .unwrap()
            .unwrap();
        assert!(spoiled_item.is_spoiled);
        assert_eq!(spoiled_item.base_value_cp, 1000); // halved from 2000

        // Notice-board contracts test:
        // The default contracts in migration 003 have posted_epoch_days = 0, duration_days = 10.
        // At day 3, they are NOT expired yet.
        let expired_at_day_3: i64 = conn
            .query_row(
                "SELECT count(*) FROM contracts WHERE is_expired = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(expired_at_day_3, 0);

        // Advance another 8 days (total 11 days elapsed >= 10 duration)
        let advance3 = advance_campaign_days(&conn, None, 8).expect("Advance 3 failed");
        assert_eq!(advance3.new_epoch_days, 11);
        assert!(advance3.expired_contracts_count >= 3);

        let expired_at_day_11: i64 = conn
            .query_row(
                "SELECT count(*) FROM contracts WHERE is_expired = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(expired_at_day_11 >= 3);
    }
}
