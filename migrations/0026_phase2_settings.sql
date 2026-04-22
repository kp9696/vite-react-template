-- Phase 2: Tenant settings and departments

CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  org_id TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  currency TEXT NOT NULL DEFAULT 'INR',
  office_lat REAL,
  office_lng REAL,
  geo_fence_radius INTEGER DEFAULT 200,
  office_checkin_required INTEGER DEFAULT 0,
  wfh_enabled INTEGER DEFAULT 1,
  payroll_day INTEGER DEFAULT 1,
  company_logo_url TEXT,
  setup_completed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  head_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
