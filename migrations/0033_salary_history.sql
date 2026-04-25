-- Salary revision history: one row per CTC change, with effective date and reason
CREATE TABLE IF NOT EXISTS salary_history (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  annual_ctc  INTEGER NOT NULL,
  effective_from TEXT NOT NULL,          -- YYYY-MM-DD
  reason      TEXT,                      -- 'Annual Appraisal', 'Promotion', 'Market Correction', etc.
  changed_by  TEXT,                      -- user_id of HR who made the change
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sal_hist_company_user ON salary_history(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sal_hist_effective    ON salary_history(company_id, effective_from);
