-- IT Investment Declaration table for 80C/80D/HRA/24(b) per employee per financial year
CREATE TABLE IF NOT EXISTS it_declarations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  financial_year TEXT NOT NULL,       -- e.g. '2025-26'
  tax_regime TEXT NOT NULL DEFAULT 'new', -- 'new' or 'old'

  -- Section 80C (max ₹1,50,000 aggregate)
  ppf INTEGER NOT NULL DEFAULT 0,
  elss INTEGER NOT NULL DEFAULT 0,
  lic INTEGER NOT NULL DEFAULT 0,
  nsc INTEGER NOT NULL DEFAULT 0,
  ulip INTEGER NOT NULL DEFAULT 0,
  home_loan_principal INTEGER NOT NULL DEFAULT 0,
  tuition_fees INTEGER NOT NULL DEFAULT 0,
  other_80c INTEGER NOT NULL DEFAULT 0,

  -- Section 80D: health insurance premiums
  medical_self INTEGER NOT NULL DEFAULT 0,     -- max ₹25,000
  medical_parents INTEGER NOT NULL DEFAULT 0,  -- max ₹25,000

  -- HRA exemption inputs
  monthly_rent INTEGER NOT NULL DEFAULT 0,
  is_metro INTEGER NOT NULL DEFAULT 0,         -- 1 = metro city (50%), 0 = non-metro (40%)

  -- Section 24(b): home loan interest (max ₹2,00,000)
  home_loan_interest INTEGER NOT NULL DEFAULT 0,

  -- Section 80CCD(1B): additional NPS contribution (max ₹50,000)
  nps_80ccd1b INTEGER NOT NULL DEFAULT 0,

  -- Any other declared deductions
  other_deductions INTEGER NOT NULL DEFAULT 0,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft', 'submitted', 'approved'
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, user_id, financial_year)
);
