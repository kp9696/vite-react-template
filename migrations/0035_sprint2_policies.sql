-- Sprint 2: Leave Policy Engine + WFH Requests + Expense Reimbursement

-- 1. Leave Policies (per-type configuration per company)
CREATE TABLE IF NOT EXISTS leave_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,           -- Annual Leave / Sick Leave / etc.
  accrual_type TEXT NOT NULL DEFAULT 'yearly',  -- yearly | monthly | on-joining
  accrual_days REAL NOT NULL DEFAULT 18,         -- days credited per accrual cycle
  max_balance REAL NOT NULL DEFAULT 45,          -- max balance allowed (0 = unlimited)
  carry_forward_max REAL NOT NULL DEFAULT 15,    -- max days to carry forward at year-end (0 = no carry-forward)
  encashment_eligible INTEGER NOT NULL DEFAULT 0, -- can unused days be encashed?
  probation_lock_months INTEGER NOT NULL DEFAULT 0, -- cannot take this leave during probation
  requires_approval INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, leave_type)
);

-- 2. WFH Requests
CREATE TABLE IF NOT EXISTS wfh_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  wfh_date TEXT NOT NULL,             -- YYYY-MM-DD
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id, wfh_date)
);

-- 3. Expense Policies (per-category limits)
CREATE TABLE IF NOT EXISTS expense_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category TEXT NOT NULL,
  max_amount INTEGER NOT NULL DEFAULT 0,           -- 0 = no limit
  requires_receipt_above INTEGER NOT NULL DEFAULT 500, -- enforce receipt above this amount
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, category)
);
