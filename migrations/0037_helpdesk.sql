-- HR Help Desk: Tickets & Comments

CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  org_id TEXT,
  ticket_no TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  assigned_to_id TEXT,
  assigned_to_name TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, ticket_no)
);

CREATE TABLE IF NOT EXISTS helpdesk_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'employee',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_company ON helpdesk_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_created_by ON helpdesk_tickets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_helpdesk_comments_ticket ON helpdesk_comments(ticket_id);
