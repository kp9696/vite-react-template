-- Multi-tenant standardization: introduce company_id while preserving org_id compatibility

-- users
ALTER TABLE users ADD COLUMN company_id TEXT;
UPDATE users
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- employees
ALTER TABLE employees ADD COLUMN company_id TEXT;
UPDATE employees
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON employees(company_id);

-- attendance
ALTER TABLE attendance ADD COLUMN company_id TEXT;
UPDATE attendance
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_company_date ON attendance(company_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_company_user_date ON attendance(company_id, user_id, attendance_date);

-- leaves
ALTER TABLE leaves ADD COLUMN company_id TEXT;
UPDATE leaves
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leaves_company_status ON leaves(company_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_company_user ON leaves(company_id, user_id);

-- leave_balances (required by leave APIs)
ALTER TABLE leave_balances ADD COLUMN company_id TEXT;
UPDATE leave_balances
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leave_balances_company_user_year ON leave_balances(company_id, user_id, year);

-- invites table in this project is `invitations`
ALTER TABLE invitations ADD COLUMN company_id TEXT;
UPDATE invitations
SET company_id = COALESCE(company_id, org_id)
WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_company_status ON invitations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_company_email_status ON invitations(company_id, email, status);
