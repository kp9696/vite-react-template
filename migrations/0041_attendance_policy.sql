-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0041 — Attendance Policy Engine
-- Adds per-tenant attendance policy fields to tenant_settings, and computed
-- hours_worked / overtime_minutes columns to the attendance table.
-- All new columns are nullable / have defaults so existing rows are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Attendance policy configuration (stored in tenant_settings)
ALTER TABLE tenant_settings ADD COLUMN work_start_time    TEXT    NOT NULL DEFAULT '09:00';
ALTER TABLE tenant_settings ADD COLUMN work_end_time      TEXT    NOT NULL DEFAULT '18:00';
ALTER TABLE tenant_settings ADD COLUMN late_threshold_minutes   INTEGER NOT NULL DEFAULT 15;
ALTER TABLE tenant_settings ADD COLUMN half_day_threshold_hours REAL    NOT NULL DEFAULT 4;
ALTER TABLE tenant_settings ADD COLUMN min_hours_for_present    REAL    NOT NULL DEFAULT 2;
ALTER TABLE tenant_settings ADD COLUMN overtime_threshold_hours REAL    NOT NULL DEFAULT 9;
ALTER TABLE tenant_settings ADD COLUMN attendance_timezone TEXT  NOT NULL DEFAULT 'Asia/Kolkata';

-- Computed columns written on every checkout (and back-filled by /api/attendance/recompute)
ALTER TABLE attendance ADD COLUMN hours_worked     REAL;
ALTER TABLE attendance ADD COLUMN overtime_minutes INTEGER NOT NULL DEFAULT 0;
