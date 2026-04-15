-- Extend company_id standardization to additional HRMS tables while preserving org_id compatibility

-- job_openings
ALTER TABLE job_openings ADD COLUMN company_id TEXT;
UPDATE job_openings
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_job_openings_company_id ON job_openings(company_id);

-- onboarding_joiners
ALTER TABLE onboarding_joiners ADD COLUMN company_id TEXT;
UPDATE onboarding_joiners
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_onboarding_joiners_company_id ON onboarding_joiners(company_id);

-- exit_processes
ALTER TABLE exit_processes ADD COLUMN company_id TEXT;
UPDATE exit_processes
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_exit_processes_company_id ON exit_processes(company_id);

-- payroll_runs
ALTER TABLE payroll_runs ADD COLUMN company_id TEXT;
UPDATE payroll_runs
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_month ON payroll_runs(company_id, month_key);

-- payroll_items
ALTER TABLE payroll_items ADD COLUMN company_id TEXT;
UPDATE payroll_items
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payroll_items_company_month ON payroll_items(company_id, month_key);

-- assets
ALTER TABLE assets ADD COLUMN company_id TEXT;
UPDATE assets
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_company_status ON assets(company_id, status);

-- asset_assignments
ALTER TABLE asset_assignments ADD COLUMN company_id TEXT;
UPDATE asset_assignments
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_assignments_company_asset_status ON asset_assignments(company_id, asset_id, status);

-- notification_webhooks
ALTER TABLE notification_webhooks ADD COLUMN company_id TEXT;
UPDATE notification_webhooks
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_webhooks_company_active ON notification_webhooks(company_id, is_active);
