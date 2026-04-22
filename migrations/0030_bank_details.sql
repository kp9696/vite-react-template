-- Bank details on employee profiles
ALTER TABLE users ADD COLUMN bank_name TEXT;
ALTER TABLE users ADD COLUMN bank_account TEXT;
ALTER TABLE users ADD COLUMN bank_ifsc TEXT;
ALTER TABLE users ADD COLUMN bank_account_type TEXT DEFAULT 'Savings';
ALTER TABLE users ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE users ADD COLUMN emergency_contact_relation TEXT;
