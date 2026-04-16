-- Remove all demo users and data, keeping only the HR Admin (Mratunjay / USRTEST01)

-- 1. Remove demo users from users table
DELETE FROM users WHERE id != 'USRTEST01';

-- 2. Remove demo auth accounts (keep only the real admin)
DELETE FROM auth_users WHERE lower(email) != 'jjk.mratunjay@gmail.com';

-- 3. Revoke all refresh tokens for demo users
DELETE FROM refresh_tokens WHERE user_id != 'USRTEST01';

-- 4. Remove all demo employees
DELETE FROM employees;

-- 5. Remove all invitations
DELETE FROM invitations;

-- 6. Remove all invite tokens
DELETE FROM invite_tokens;

-- 7. Remove all leaves and balances
DELETE FROM leaves;
DELETE FROM leave_balances;

-- 8. Remove attendance records
DELETE FROM attendance;

-- 9. Remove payroll data
DELETE FROM payroll_items;
DELETE FROM payroll_runs;
DELETE FROM payroll;

-- 10. Remove onboarding data
DELETE FROM onboarding_tasks;
DELETE FROM onboarding_joiners;

-- 11. Remove exit management data
DELETE FROM exit_tasks;
DELETE FROM exit_processes;

-- 12. Remove assets
DELETE FROM asset_assignments;
DELETE FROM assets;

-- 13. Remove job openings
DELETE FROM job_openings;

-- 14. Remove audit logs
DELETE FROM audit_logs;
DELETE FROM auth_audit_logs;
