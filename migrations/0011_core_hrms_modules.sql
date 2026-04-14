CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  check_in_ip TEXT,
  check_out_ip TEXT,
  check_in_geo TEXT,
  check_out_geo TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, user_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approver_user_id TEXT,
  decision_note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, user_id, leave_type, year)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  asset_tag TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  serial_no TEXT,
  purchase_date TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  condition TEXT NOT NULL DEFAULT 'Good',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, asset_tag),
  UNIQUE(org_id, serial_no)
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  revoked_at TEXT,
  revoke_reason TEXT,
  status TEXT NOT NULL DEFAULT 'assigned'
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, email, status)
);

CREATE TABLE IF NOT EXISTS notification_webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_org_date ON attendance(org_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_leaves_org_status ON leaves(org_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_org_user_year ON leave_balances(org_id, user_id, year);
CREATE INDEX IF NOT EXISTS idx_assets_org_status ON assets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_asset_assignments_asset_status ON asset_assignments(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_org_status ON invitations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_webhooks_org_active ON notification_webhooks(org_id, is_active);
