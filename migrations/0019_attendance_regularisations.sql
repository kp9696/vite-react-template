CREATE TABLE IF NOT EXISTS attendance_regularisations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  company_id TEXT,
  user_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  requested_check_in TEXT,
  requested_check_out TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_att_reg_org_user ON attendance_regularisations(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_att_reg_status ON attendance_regularisations(org_id, status);
