CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  invite_limit INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN org_id TEXT REFERENCES organizations(id);

INSERT OR IGNORE INTO organizations (id, name, domain, invite_limit, created_at, updated_at)
VALUES ('ORGDEMO01', 'JWithKP Demo', 'jwithkp.in', 5, '2025-01-10T09:00:00.000Z', '2025-01-10T09:00:00.000Z');

UPDATE users
SET org_id = 'ORGDEMO01'
WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
