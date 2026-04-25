-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0040 — Leave Accrual Engine
-- Adds audit tables for accrual runs and year-end carry-forward, plus an
-- idempotency column on leave_balances so the same month is never accrued twice.
-- ─────────────────────────────────────────────────────────────────────────────

-- Track the last month that was accrued per balance row (for idempotency)
ALTER TABLE leave_balances ADD COLUMN last_accrual_month TEXT;
ALTER TABLE leave_balances ADD COLUMN created_at TEXT;

-- Audit log for every accrual run (monthly or yearly)
CREATE TABLE IF NOT EXISTS leave_accrual_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  run_month TEXT NOT NULL,                          -- YYYY-MM (monthly) or YYYY (yearly)
  leave_type TEXT NOT NULL,
  accrual_type TEXT NOT NULL,                       -- monthly | yearly | on-joining
  employees_credited INTEGER NOT NULL DEFAULT 0,
  employees_skipped_probation INTEGER NOT NULL DEFAULT 0,
  employees_skipped_duplicate INTEGER NOT NULL DEFAULT 0,
  total_days_credited REAL NOT NULL DEFAULT 0,
  dry_run INTEGER NOT NULL DEFAULT 0,
  run_by TEXT NOT NULL,
  run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accrual_log_company_month
  ON leave_accrual_log(company_id, run_month);

-- Audit log for year-end carry-forward per employee × leave type
CREATE TABLE IF NOT EXISTS leave_carry_forward_log (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  from_year INTEGER NOT NULL,
  to_year INTEGER NOT NULL,
  leave_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  unused_days REAL NOT NULL DEFAULT 0,
  carried_forward REAL NOT NULL DEFAULT 0,
  forfeited REAL NOT NULL DEFAULT 0,
  run_by TEXT NOT NULL,
  run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carry_fwd_log_company_year
  ON leave_carry_forward_log(company_id, from_year, leave_type);
