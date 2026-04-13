CREATE TABLE IF NOT EXISTS exit_processes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  exit_type TEXT NOT NULL,
  notice_period TEXT NOT NULL,
  last_day TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '-',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exit_tasks (
  id TEXT PRIMARY KEY,
  exit_id TEXT NOT NULL REFERENCES exit_processes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exit_processes_org_id ON exit_processes(org_id);
CREATE INDEX IF NOT EXISTS idx_exit_tasks_exit_id ON exit_tasks(exit_id);

INSERT OR IGNORE INTO exit_processes (id, org_id, name, employee_code, role, department, exit_type, notice_period, last_day, progress, reason, created_at, updated_at) VALUES
  ('EXT001', 'ORGDEMO01', 'Rajesh Kumar', 'EMP088', 'Backend Engineer', 'Engineering', 'Resignation', '60 days', '2026-05-31', 38, 'Better opportunity', '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('EXT002', 'ORGDEMO01', 'Aditi Sharma', 'EMP124', 'Marketing Analyst', 'Marketing', 'Resignation', '30 days', '2026-04-30', 75, 'Higher studies', '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z');

INSERT OR IGNORE INTO exit_tasks (id, exit_id, label, done, sort_order, created_at, updated_at) VALUES
  ('XTK001', 'EXT001', 'Resignation Accepted', 1, 1, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK002', 'EXT001', 'Notice Period Confirmed', 1, 2, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK003', 'EXT001', 'Knowledge Transfer Plan', 1, 3, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK004', 'EXT001', 'Asset Retrieval', 0, 4, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK005', 'EXT001', 'Access Revocation', 0, 5, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK006', 'EXT001', 'Exit Interview', 0, 6, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK007', 'EXT001', 'Full & Final Settlement', 0, 7, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK008', 'EXT001', 'Experience Letter', 0, 8, '2026-04-01T09:00:00.000Z', '2026-04-01T09:00:00.000Z'),
  ('XTK009', 'EXT002', 'Resignation Accepted', 1, 1, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK010', 'EXT002', 'Notice Period Confirmed', 1, 2, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK011', 'EXT002', 'Knowledge Transfer Plan', 1, 3, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK012', 'EXT002', 'Asset Retrieval', 1, 4, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK013', 'EXT002', 'Access Revocation', 1, 5, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK014', 'EXT002', 'Exit Interview', 1, 6, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK015', 'EXT002', 'Full & Final Settlement', 0, 7, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z'),
  ('XTK016', 'EXT002', 'Experience Letter', 0, 8, '2026-04-02T09:00:00.000Z', '2026-04-02T09:00:00.000Z');
