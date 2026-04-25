-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0034 — Sprint 1 Compliance Gaps
-- 1. Holiday Calendar
-- 2. Salary Structure Components per employee
-- 3. Payroll Lock / Finalize / Disburse columns
-- 4. Resignation self-service workflow
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Holiday Calendar ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holidays (
  id           TEXT    PRIMARY KEY,
  company_id   TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  date         TEXT    NOT NULL,  -- YYYY-MM-DD
  type         TEXT    NOT NULL DEFAULT 'national', -- national | restricted | optional
  description  TEXT,
  created_by   TEXT,
  created_at   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, date, name)
);

-- ── 2. Salary Structure Components per Employee ──────────────────────────────
CREATE TABLE IF NOT EXISTS salary_structures (
  id                    TEXT    PRIMARY KEY,
  company_id            TEXT    NOT NULL,
  user_id               TEXT    NOT NULL,
  basic_pct             REAL    NOT NULL DEFAULT 50.0,  -- % of monthly CTC
  hra_pct               REAL    NOT NULL DEFAULT 20.0,  -- % of monthly CTC
  conveyance            INTEGER NOT NULL DEFAULT 1600,  -- fixed monthly INR
  lta                   INTEGER NOT NULL DEFAULT 0,     -- fixed monthly INR
  medical_allowance     INTEGER NOT NULL DEFAULT 0,     -- fixed monthly INR
  special_allowance_pct REAL    NOT NULL DEFAULT 0.0,   -- % of CTC; 0 = auto-fill remainder
  effective_from        TEXT    NOT NULL,               -- YYYY-MM-DD
  created_by            TEXT,
  created_at            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id)
);

-- ── 3. Payroll Run: Lock / Finalize / Disburse ───────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN locked       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN locked_by    TEXT;
ALTER TABLE payroll_runs ADD COLUMN locked_at    TEXT;
ALTER TABLE payroll_runs ADD COLUMN finalized    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN finalized_by TEXT;
ALTER TABLE payroll_runs ADD COLUMN finalized_at TEXT;
ALTER TABLE payroll_runs ADD COLUMN disbursed    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN disbursed_by TEXT;
ALTER TABLE payroll_runs ADD COLUMN disbursed_at TEXT;

-- ── 4. Resignation Self-Service ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resignations (
  id                  TEXT    PRIMARY KEY,
  company_id          TEXT    NOT NULL,
  user_id             TEXT    NOT NULL,
  user_name           TEXT    NOT NULL,
  department          TEXT,
  role                TEXT,
  last_working_day    TEXT    NOT NULL,  -- YYYY-MM-DD (proposed)
  notice_period_days  INTEGER NOT NULL DEFAULT 30,
  reason              TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending', -- pending | accepted | withdrawn | rejected
  manager_note        TEXT,
  decided_by          TEXT,
  decided_at          TEXT,
  withdrawal_reason   TEXT,
  withdrawn_at        TEXT,
  created_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
