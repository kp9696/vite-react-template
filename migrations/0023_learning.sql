-- Migration 0023: Learning & Development (Courses + Enrollments)
CREATE TABLE IF NOT EXISTS courses (
  id            TEXT PRIMARY KEY,
  company_id    TEXT,
  org_id        TEXT NOT NULL,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Technical',
  level         TEXT NOT NULL DEFAULT 'All',
  -- All | Beginner | Intermediate | Advanced
  duration      TEXT,     -- e.g. "2h 30m"
  provider      TEXT,
  description   TEXT,
  is_mandatory  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id            TEXT PRIMARY KEY,
  company_id    TEXT,
  org_id        TEXT NOT NULL,
  course_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'enrolled',
  -- enrolled | in_progress | completed
  progress      INTEGER NOT NULL DEFAULT 0,   -- 0-100
  enrolled_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at  TEXT,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_org         ON courses(org_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_org     ON course_enrollments(org_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user    ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course  ON course_enrollments(course_id);
