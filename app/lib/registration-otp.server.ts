interface PendingRegistration {
  organizationName: string;
  adminName: string;
  email: string;
  department: string;
}

let registrationOtpSchemaReady = false;

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureRegistrationOtpSchema(db: D1Database) {
  if (registrationOtpSchemaReady) {
    return;
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS registration_otps (
        email TEXT PRIMARY KEY,
        otp_code TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_registration_otps_expires_at
       ON registration_otps(expires_at)`,
    ),
  ]);

  registrationOtpSchemaReady = true;
}

export async function createRegistrationOtp(
  db: D1Database,
  payload: PendingRegistration,
): Promise<string> {
  await ensureRegistrationOtpSchema(db);

  const code = generateOtpCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  await db
    .prepare(
      `INSERT INTO registration_otps (email, otp_code, payload_json, expires_at, verified_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         otp_code = excluded.otp_code,
         payload_json = excluded.payload_json,
         expires_at = excluded.expires_at,
         verified_at = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(
      payload.email.trim().toLowerCase(),
      code,
      JSON.stringify(payload),
      expiresAt,
      createdAt,
      createdAt,
    )
    .run();

  return code;
}

export async function verifyRegistrationOtp(
  db: D1Database,
  email: string,
  otpCode: string,
): Promise<PendingRegistration> {
  await ensureRegistrationOtpSchema(db);

  const row = await db
    .prepare(
      `SELECT email, otp_code, payload_json, expires_at
       FROM registration_otps
       WHERE lower(email) = lower(?)
       LIMIT 1`,
    )
    .bind(email.trim().toLowerCase())
    .first<{ email: string; otp_code: string; payload_json: string; expires_at: string }>();

  if (!row) {
    throw new Error("No OTP request was found for this email. Please request a new code.");
  }

  if (row.otp_code !== otpCode.trim()) {
    throw new Error("Invalid OTP code.");
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("This OTP has expired. Please request a new code.");
  }

  await db
    .prepare(`DELETE FROM registration_otps WHERE lower(email) = lower(?)`)
    .bind(email.trim().toLowerCase())
    .run();

  return JSON.parse(row.payload_json) as PendingRegistration;
}
