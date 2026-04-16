-- Expense claims management

CREATE TABLE IF NOT EXISTS expense_claims (
  id         TEXT PRIMARY KEY,
  company_id TEXT,
  org_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  category   TEXT NOT NULL,
  description TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  claim_date TEXT NOT NULL,
  receipt_url TEXT,
  has_receipt INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_claims_company_status ON expense_claims(company_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_claims_company_user  ON expense_claims(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_org_status    ON expense_claims(org_id, status);
