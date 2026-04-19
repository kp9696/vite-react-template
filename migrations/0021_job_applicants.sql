-- Migration 0021: Job Applicants (Recruitment ATS)
CREATE TABLE IF NOT EXISTS job_applicants (
  id          TEXT PRIMARY KEY,
  company_id  TEXT,
  org_id      TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  resume_url  TEXT,
  stage       TEXT NOT NULL DEFAULT 'Applied',
  -- Applied | Screening | Interview | Offer | Hired | Rejected
  notes       TEXT,
  applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_applicants_org    ON job_applicants(org_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_co     ON job_applicants(company_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_job    ON job_applicants(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applicants_stage  ON job_applicants(stage);
