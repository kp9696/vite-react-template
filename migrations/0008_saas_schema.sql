-- Multi-tenant SaaS schema: companies + saas_employees
-- companies: one per registered user (auto-created on OTP signup)
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  employee_limit INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_id);

-- saas_employees: company-scoped employee list (separate from legacy employees table)
CREATE TABLE IF NOT EXISTS saas_employees (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Employee',
  department TEXT NOT NULL DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  joined_on TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_saas_employees_company ON saas_employees(company_id);
