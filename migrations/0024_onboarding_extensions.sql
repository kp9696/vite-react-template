-- Migration 0024: Onboarding Extensions
-- Adds email/phone to joiners, pre-boarding status cols, tech allocations table

ALTER TABLE onboarding_joiners ADD COLUMN email TEXT;
ALTER TABLE onboarding_joiners ADD COLUMN phone TEXT;
ALTER TABLE onboarding_joiners ADD COLUMN offer_signed   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE onboarding_joiners ADD COLUMN bg_check       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE onboarding_joiners ADD COLUMN docs_collected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE onboarding_joiners ADD COLUMN welcome_sent   INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS onboarding_tech_allocations (
  id          TEXT PRIMARY KEY,
  company_id  TEXT,
  org_id      TEXT NOT NULL,
  joiner_id   TEXT NOT NULL REFERENCES onboarding_joiners(id) ON DELETE CASCADE,
  asset_type  TEXT NOT NULL,   -- Laptop | Phone | Access Card | Monitor | Keyboard | Other
  asset_tag   TEXT,
  serial_no   TEXT,
  notes       TEXT,
  allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_onb_tech_joiner ON onboarding_tech_allocations(joiner_id);
CREATE INDEX IF NOT EXISTS idx_onb_tech_org    ON onboarding_tech_allocations(org_id);
