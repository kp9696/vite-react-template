-- Phase 2: Document Management

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
