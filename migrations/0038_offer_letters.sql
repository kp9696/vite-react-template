-- Offer Letter Generator
CREATE TABLE IF NOT EXISTS offer_letters (
  id                TEXT    PRIMARY KEY,
  company_id        TEXT    NOT NULL,
  candidate_name    TEXT    NOT NULL,
  candidate_email   TEXT    NOT NULL,
  position          TEXT    NOT NULL,
  department        TEXT,
  start_date        TEXT,
  annual_ctc        REAL,
  reporting_manager TEXT,
  probation_days    INTEGER NOT NULL DEFAULT 90,
  work_location     TEXT,
  expires_at        TEXT,
  status            TEXT    NOT NULL DEFAULT 'draft',  -- draft | sent | accepted | rejected | withdrawn
  letter_body       TEXT    NOT NULL DEFAULT '',
  sent_at           TEXT,
  accepted_at       TEXT,
  rejected_at       TEXT,
  created_by_id     TEXT,
  created_by_name   TEXT,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offer_letters_company ON offer_letters (company_id);
CREATE INDEX IF NOT EXISTS idx_offer_letters_email   ON offer_letters (candidate_email);
CREATE INDEX IF NOT EXISTS idx_offer_letters_status  ON offer_letters (company_id, status);
