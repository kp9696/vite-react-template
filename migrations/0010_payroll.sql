CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  month_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  processed_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, month_key)
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  month_key TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department TEXT NOT NULL,
  basic INTEGER NOT NULL,
  hra INTEGER NOT NULL,
  conveyance INTEGER NOT NULL,
  pf INTEGER NOT NULL,
  tds INTEGER NOT NULL,
  pt INTEGER NOT NULL,
  gross INTEGER NOT NULL,
  deductions INTEGER NOT NULL,
  net INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, month_key, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org_month ON payroll_runs(org_id, month_key);
CREATE INDEX IF NOT EXISTS idx_payroll_items_org_month ON payroll_items(org_id, month_key);
CREATE INDEX IF NOT EXISTS idx_payroll_items_run_id ON payroll_items(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id ON payroll_items(employee_id);
