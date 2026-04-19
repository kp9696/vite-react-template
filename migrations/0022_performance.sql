-- Migration 0022: Performance Reviews, OKRs
CREATE TABLE IF NOT EXISTS review_cycles (
  id           TEXT PRIMARY KEY,
  company_id   TEXT,
  org_id       TEXT NOT NULL,
  name         TEXT NOT NULL,
  review_type  TEXT NOT NULL DEFAULT '360',
  -- '360' | 'manager' | 'self'
  start_date   TEXT,
  end_date     TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  -- draft | active | completed
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_reviews (
  id             TEXT PRIMARY KEY,
  company_id     TEXT,
  org_id         TEXT NOT NULL,
  cycle_id       TEXT NOT NULL,
  reviewee_id    TEXT NOT NULL,
  reviewer_id    TEXT NOT NULL,
  reviewer_type  TEXT NOT NULL DEFAULT 'manager',
  -- 'self' | 'manager' | 'peer'
  rating         INTEGER,   -- 1 (Poor) to 5 (Exceptional)
  comments       TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  -- pending | submitted
  submitted_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, cycle_id, reviewee_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS okrs (
  id           TEXT PRIMARY KEY,
  company_id   TEXT,
  org_id       TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  cycle_id     TEXT,
  objective    TEXT NOT NULL,
  key_results  TEXT NOT NULL DEFAULT '[]',
  -- JSON: [{title, target, current, unit}]
  progress     INTEGER NOT NULL DEFAULT 0,  -- 0-100
  status       TEXT NOT NULL DEFAULT 'active',
  -- active | completed | cancelled
  due_date     TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_cycles_org    ON review_cycles(org_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_org     ON performance_reviews(org_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_cycle   ON performance_reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_ee      ON performance_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_okrs_org             ON okrs(org_id);
CREATE INDEX IF NOT EXISTS idx_okrs_user            ON okrs(user_id);
