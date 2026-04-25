-- Sprint 3: Employee Loans & Advances + Full & Final (F&F) Settlement + Gratuity Tracking

-- ── 1. Employee Loans & Advances ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_loans (
  id               TEXT    PRIMARY KEY,
  company_id       TEXT    NOT NULL,
  user_id          TEXT    NOT NULL,
  user_name        TEXT    NOT NULL,
  loan_type        TEXT    NOT NULL DEFAULT 'salary_advance', -- salary_advance | personal_loan | vehicle_loan
  amount           INTEGER NOT NULL,
  emi_amount       INTEGER NOT NULL DEFAULT 0,   -- monthly EMI deduction
  emi_months       INTEGER NOT NULL DEFAULT 1,   -- total planned months
  emis_paid        INTEGER NOT NULL DEFAULT 0,   -- EMIs deducted so far
  outstanding      INTEGER NOT NULL DEFAULT 0,   -- remaining balance
  purpose          TEXT,
  status           TEXT    NOT NULL DEFAULT 'pending', -- pending | approved | rejected | active | closed
  approved_by      TEXT,
  approved_at      TEXT,
  rejection_note   TEXT,
  disburse_ref     TEXT,   -- payment / transfer reference
  disbursed_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loans_company_user   ON employee_loans(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_loans_company_status ON employee_loans(company_id, status);

-- ── 2. Loan EMI Ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_emis (
  id          TEXT    PRIMARY KEY,
  loan_id     TEXT    NOT NULL REFERENCES employee_loans(id) ON DELETE CASCADE,
  company_id  TEXT    NOT NULL,
  user_id     TEXT    NOT NULL,
  month_key   TEXT    NOT NULL,  -- YYYY-MM
  emi_amount  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'deducted',
  deducted_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(loan_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_loan_emis_loan_id      ON loan_emis(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_emis_company_month ON loan_emis(company_id, month_key);

-- ── 3. Full & Final Settlements ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fnf_settlements (
  id                 TEXT    PRIMARY KEY,
  company_id         TEXT    NOT NULL,
  user_id            TEXT    NOT NULL,
  user_name          TEXT    NOT NULL,
  exit_id            TEXT,   -- optional link to exit_processes.id
  last_working_day   TEXT    NOT NULL,  -- YYYY-MM-DD
  -- Earnings
  pending_salary     INTEGER NOT NULL DEFAULT 0,  -- pro-rated last month salary
  leave_encashment   INTEGER NOT NULL DEFAULT 0,  -- encashable leave balance × per-day rate
  gratuity           INTEGER NOT NULL DEFAULT 0,  -- statutory (5+ yrs: 15 × basic × yrs / 26)
  bonus              INTEGER NOT NULL DEFAULT 0,  -- ex-gratia / performance
  other_earnings     INTEGER NOT NULL DEFAULT 0,
  -- Deductions
  loan_recovery      INTEGER NOT NULL DEFAULT 0,  -- outstanding loan balance
  tds_recovery       INTEGER NOT NULL DEFAULT 0,  -- TDS on F&F
  other_deductions   INTEGER NOT NULL DEFAULT 0,
  -- Totals (computed)
  gross_payable      INTEGER NOT NULL DEFAULT 0,
  total_deductions   INTEGER NOT NULL DEFAULT 0,
  net_payable        INTEGER NOT NULL DEFAULT 0,
  -- Workflow
  status             TEXT    NOT NULL DEFAULT 'draft',  -- draft | approved | disbursed
  notes              TEXT,
  approved_by        TEXT,
  approved_at        TEXT,
  disbursed_by       TEXT,
  disbursed_at       TEXT,
  payment_ref        TEXT,
  created_by         TEXT,
  created_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fnf_company      ON fnf_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_fnf_company_user ON fnf_settlements(company_id, user_id);
