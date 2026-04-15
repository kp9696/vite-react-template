-- Migration: Employee Profile Extensions

CREATE TABLE IF NOT EXISTS employee_work_history (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  duration TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_custom_fields (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
