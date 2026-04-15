-- Add subscription_status to companies (plan + employee_limit already exist in 0008)
ALTER TABLE companies ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status
  ON companies(subscription_status);
