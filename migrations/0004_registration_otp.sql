CREATE TABLE IF NOT EXISTS registration_otps (
  email TEXT PRIMARY KEY,
  otp_code TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_otps_expires_at ON registration_otps(expires_at);
