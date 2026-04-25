-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0039 — Payroll Engine: additional columns on payroll_items
-- Adds ESI, LWF, LOP and a full JSON breakdown for payslip generation.
-- All columns are nullable so existing rows are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Employee-side statutory deductions
ALTER TABLE payroll_items ADD COLUMN esi_employee    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN lwf_employee    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN lop_days        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN lop_deduction   INTEGER NOT NULL DEFAULT 0;

-- Employer-side contributions (for CTC / cost reporting)
ALTER TABLE payroll_items ADD COLUMN pf_employer     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN esi_employer    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN lwf_employer    INTEGER NOT NULL DEFAULT 0;

-- Meta
ALTER TABLE payroll_items ADD COLUMN pt_state        TEXT;
ALTER TABLE payroll_items ADD COLUMN tax_regime      TEXT NOT NULL DEFAULT 'new';

-- Full statutory breakdown JSON for payslip generation
-- Schema mirrors PayrollResult from hrms-payroll-engine.ts
ALTER TABLE payroll_items ADD COLUMN breakdown_json  TEXT;

-- payroll_runs: company_id already exists (added by 0015); just ensure the index
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_month ON payroll_runs(company_id, month_key);
