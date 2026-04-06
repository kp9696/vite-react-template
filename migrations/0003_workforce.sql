CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL,
  joined_on TEXT NOT NULL,
  salary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_openings (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  location TEXT NOT NULL,
  priority TEXT NOT NULL,
  applicant_count INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'Applied',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_joiners (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  start_date TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  avatar TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id TEXT PRIMARY KEY,
  joiner_id TEXT NOT NULL REFERENCES onboarding_joiners(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_org_id ON employees(org_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_org_id ON job_openings(org_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_joiners_org_id ON onboarding_joiners(org_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_joiner_id ON onboarding_tasks(joiner_id);

INSERT OR IGNORE INTO employees (id, org_id, name, role, department, location, status, joined_on, salary, created_at, updated_at) VALUES
  ('EMP001', 'ORGDEMO01', 'Aarav Shah', 'Senior Engineer', 'Engineering', 'Bengaluru', 'Active', '2025-04-02', 'INR 28L', '2025-04-02T09:00:00.000Z', '2025-04-02T09:00:00.000Z'),
  ('EMP002', 'ORGDEMO01', 'Priya Nair', 'Product Designer', 'Design', 'Mumbai', 'Active', '2025-03-18', 'INR 22L', '2025-03-18T09:00:00.000Z', '2025-03-18T09:00:00.000Z'),
  ('EMP003', 'ORGDEMO01', 'Rohan Mehta', 'Data Analyst', 'Analytics', 'Pune', 'Onboarding', '2025-03-28', 'INR 18L', '2025-03-28T09:00:00.000Z', '2025-03-28T09:00:00.000Z');

INSERT OR IGNORE INTO job_openings (id, org_id, title, department, location, priority, applicant_count, stage, created_at, updated_at) VALUES
  ('JOB001', 'ORGDEMO01', 'Senior Frontend Engineer', 'Engineering', 'Bengaluru', 'Urgent', 28, 'Applied', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('JOB002', 'ORGDEMO01', 'Product Manager', 'Product', 'Remote', 'Normal', 12, 'Screening', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('JOB003', 'ORGDEMO01', 'Data Scientist', 'Analytics', 'Hyderabad', 'Urgent', 6, 'Interview', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z');

INSERT OR IGNORE INTO onboarding_joiners (id, org_id, name, role, department, start_date, progress, avatar, created_at, updated_at) VALUES
  ('ONB001', 'ORGDEMO01', 'Ishaan Verma', 'ML Engineer', 'Engineering', '2026-04-14', 33, 'IV', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('ONB002', 'ORGDEMO01', 'Pooja Hegde', 'UX Researcher', 'Design', '2026-04-07', 67, 'PH', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z');

INSERT OR IGNORE INTO onboarding_tasks (id, joiner_id, section, label, done, sort_order, created_at, updated_at) VALUES
  ('TSK001', 'ONB001', 'Pre-joining', 'Offer Letter Signed', 1, 1, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK002', 'ONB001', 'Pre-joining', 'Background Verification', 1, 2, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK003', 'ONB001', 'Day 1 Setup', 'Laptop Assigned', 1, 3, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK004', 'ONB001', 'Day 1 Setup', 'Email and Slack Access', 0, 4, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK005', 'ONB001', 'Week 1', 'HR Induction Session', 0, 5, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK006', 'ONB001', '30-Day Goals', 'First Project Kickoff', 0, 6, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK007', 'ONB002', 'Pre-joining', 'Offer Letter Signed', 1, 1, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK008', 'ONB002', 'Pre-joining', 'Background Verification', 1, 2, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK009', 'ONB002', 'Day 1 Setup', 'Laptop Assigned', 1, 3, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK010', 'ONB002', 'Day 1 Setup', 'Email and Slack Access', 1, 4, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK011', 'ONB002', 'Week 1', 'HR Induction Session', 1, 5, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('TSK012', 'ONB002', '30-Day Goals', 'First Project Kickoff', 0, 6, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z');
