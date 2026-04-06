CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Invited' CHECK (status IN ('Active', 'Invited', 'Pending')),
  joined_on TEXT NOT NULL,
  invite_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

INSERT OR IGNORE INTO users (id, name, email, role, department, status, joined_on, invite_sent_at, created_at, updated_at) VALUES
  ('USR001', 'Deepa Krishnan', 'deepa@jwithkp.in', 'HR Admin', 'Engineering', 'Active', '2025-01-10T09:00:00.000Z', '2025-01-10T09:05:00.000Z', '2025-01-10T09:00:00.000Z', '2025-01-10T09:05:00.000Z'),
  ('USR002', 'Aarav Shah', 'aarav@jwithkp.in', 'Employee', 'Engineering', 'Active', '2025-04-02T09:00:00.000Z', '2025-04-02T09:05:00.000Z', '2025-04-02T09:00:00.000Z', '2025-04-02T09:05:00.000Z'),
  ('USR003', 'Priya Nair', 'priya@jwithkp.in', 'Manager', 'Design', 'Active', '2025-03-18T09:00:00.000Z', '2025-03-18T09:05:00.000Z', '2025-03-18T09:00:00.000Z', '2025-03-18T09:05:00.000Z'),
  ('USR004', 'Rohan Mehta', 'rohan@jwithkp.in', 'Employee', 'Analytics', 'Invited', '2025-03-28T09:00:00.000Z', '2025-03-28T09:05:00.000Z', '2025-03-28T09:00:00.000Z', '2025-03-28T09:05:00.000Z'),
  ('USR005', 'Sneha Pillai', 'sneha@jwithkp.in', 'HR Manager', 'People Ops', 'Active', '2025-02-12T09:00:00.000Z', '2025-02-12T09:05:00.000Z', '2025-02-12T09:00:00.000Z', '2025-02-12T09:05:00.000Z');
