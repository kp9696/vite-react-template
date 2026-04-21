-- Migration 0025: Notifications
-- Real-time alerts for leave, payroll, onboarding events

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  company_id  TEXT,
  org_id      TEXT,
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,   -- 'leave_approved' | 'leave_rejected' | 'payroll_processed' | 'onboarding_task' | 'general'
  title       TEXT NOT NULL,
  body        TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  link        TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_user_read   ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notif_company     ON notifications(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_org         ON notifications(org_id, created_at);
