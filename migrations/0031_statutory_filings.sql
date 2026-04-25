-- Statutory filings tracking table
CREATE TABLE IF NOT EXISTS statutory_filings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  filing_type TEXT NOT NULL, -- 'ECR', 'TDS', 'PT', etc.
  period TEXT NOT NULL,      -- e.g. '2026-04' or '2025-26'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'filed', 'failed'
  file_path TEXT,            -- path to uploaded/confirmed file
  filed_by TEXT,             -- user id
  filed_at TEXT,             -- ISO timestamp
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, filing_type, period)
);