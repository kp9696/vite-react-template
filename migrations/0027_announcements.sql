-- Phase 2: Announcements / Noticeboard

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  pinned INTEGER NOT NULL DEFAULT 0,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(announcement_id, user_id)
);
