CREATE TABLE IF NOT EXISTS employee_salaries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  company_id TEXT,
  user_id TEXT NOT NULL,
  annual_ctc INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_sal_org ON employee_salaries(org_id);
