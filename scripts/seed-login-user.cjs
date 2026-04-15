const { execSync } = require("child_process");
const bcrypt = require("bcryptjs");

const email = "jjk.mratunjay@gmail.com";
const password = "Mks9696@";
const hash = bcrypt.hashSync(password, 10);

// Escape single quotes for SQL literal safety.
const esc = (s) => String(s).replace(/'/g, "''");

const sql = `
INSERT OR IGNORE INTO organizations (id,name,domain,invite_limit,created_at,updated_at)
VALUES ('ORGTEST01','JWithKP','gmail:${esc(email)}',5,datetime('now'),datetime('now'));

INSERT OR REPLACE INTO users (id,name,email,role,department,status,joined_on,created_at,updated_at)
VALUES ('USRTEST01','Mratunjay','${esc(email)}','HR Admin','General','Active',datetime('now'),datetime('now'),datetime('now'));

INSERT OR REPLACE INTO auth_users (name,email,password,is_verified,created_at)
VALUES ('Mratunjay','${esc(email)}','${esc(hash)}',1,datetime('now'));

INSERT OR REPLACE INTO companies (id,owner_id,company_name,plan,employee_limit,subscription_status,created_at,updated_at)
VALUES ('COMPTEST01','${esc(email)}','JWithKP','free',5,'active',datetime('now'),datetime('now'));

SELECT lower(email) AS email, length(password) AS pass_len, is_verified
FROM auth_users WHERE lower(email)=lower('${esc(email)}');
`.trim();

const cmd = `npx wrangler d1 execute email --local --command "${sql.replace(/\n/g, " ")}"`;
console.log(execSync(cmd, { stdio: "pipe", encoding: "utf-8" }));
