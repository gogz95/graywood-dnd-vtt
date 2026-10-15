-- 003_calendar_and_contracts.sql
-- Campaign state and notice-board bounty contracts for Aleamos DM Desktop

-- Campaign Global Timekeeper State
CREATE TABLE IF NOT EXISTS campaign_state (
    id TEXT PRIMARY KEY NOT NULL,
    epoch_days BIGINT NOT NULL DEFAULT 0,
    current_epoch_seconds BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

-- Seed initial global campaign state if not present (starts at Day 1, Year 1420 Chancellery Standard)
INSERT OR IGNORE INTO campaign_state (id, epoch_days, current_epoch_seconds, updated_at)
VALUES ('global', 0, 1700000000, 1700000000);

-- Notice-Board Bounty Contracts
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    bounty_cp BIGINT NOT NULL CHECK (bounty_cp >= 0),
    posted_epoch_days BIGINT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 10 CHECK (duration_days > 0),
    is_expired BOOLEAN NOT NULL DEFAULT 0 CHECK (is_expired IN (0, 1)),
    is_completed BOOLEAN NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contracts_posted ON contracts(posted_epoch_days, duration_days, is_expired);

-- Seed representative notice-board bounty contracts
INSERT OR IGNORE INTO contracts (id, title, description, bounty_cp, posted_epoch_days, duration_days, is_expired, is_completed, created_at) VALUES
('contract-001', 'Cull the Carrion Crows', 'Eliminate the flock of shadow-touched crows nesting near the North Gate.', 2500, 0, 10, 0, 0, 1700000000),
('contract-002', 'Escort Salt Caravans', 'Provide armed escort for the merchant guild convoy traveling through the Salt Marsh.', 15000, 0, 10, 0, 0, 1700000000),
('contract-003', 'Recover Sunken Relic', 'Retrieve the submerged reliquary of Saint Valerius from the coastal reef ruins.', 50000, 0, 10, 0, 0, 1700000000);
