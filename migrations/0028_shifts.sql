-- Phase 2: Shift & Roster

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  shift_name TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
