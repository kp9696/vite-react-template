export const OTP_TTL_SECONDS = 300;
const EMAIL_LOCKOUT_TTL_SECONDS = 900;
const EMAIL_MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export interface PendingOtpRecord {
  otp: string;
  name: string;
  companyName: string;
  passwordHash: string;
  createdAt: number;
}

function pendingKey(email: string): string {
  return `otp:pending:${email}`;
}

function emailAttemptKey(email: string): string {
  return `otp:attempts:${email}`;
}

function emailLockKey(email: string): string {
  return `otp:locked:${email}`;
}

function resendKey(email: string): string {
  return `otp:resend:${email}`;
}

export function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String((bytes[0] % 900000) + 100000);
}

export async function savePendingOtp(kv: KVNamespace, email: string, record: PendingOtpRecord): Promise<void> {
  await kv.put(pendingKey(email), JSON.stringify(record), { expirationTtl: OTP_TTL_SECONDS });
}

export async function readPendingOtp(kv: KVNamespace, email: string): Promise<PendingOtpRecord | null> {
  const raw = await kv.get(pendingKey(email));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingOtpRecord;
  } catch {
    await kv.delete(pendingKey(email));
    return null;
  }
}

export async function deletePendingOtp(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(pendingKey(email));
}

export async function isEmailLockedForOtp(kv: KVNamespace, email: string): Promise<boolean> {
  const lock = await kv.get(emailLockKey(email));
  return lock !== null;
}

export async function recordOtpVerifyFailure(kv: KVNamespace, email: string): Promise<number> {
  const raw = await kv.get(emailAttemptKey(email));
  const attempts = (raw ? parseInt(raw, 10) : 0) + 1;

  if (attempts >= EMAIL_MAX_VERIFY_ATTEMPTS) {
    await kv.put(emailLockKey(email), "1", { expirationTtl: EMAIL_LOCKOUT_TTL_SECONDS });
    await kv.delete(emailAttemptKey(email));
    return attempts;
  }

  await kv.put(emailAttemptKey(email), String(attempts), { expirationTtl: OTP_TTL_SECONDS });
  return attempts;
}

export async function clearOtpAttemptState(kv: KVNamespace, email: string): Promise<void> {
  await Promise.all([
    kv.delete(emailAttemptKey(email)),
    kv.delete(emailLockKey(email)),
  ]);
}

export async function isResendCoolingDown(kv: KVNamespace, email: string): Promise<boolean> {
  const cooldown = await kv.get(resendKey(email));
  return cooldown !== null;
}

export async function startResendCooldown(kv: KVNamespace, email: string): Promise<void> {
  await kv.put(resendKey(email), "1", { expirationTtl: RESEND_COOLDOWN_SECONDS });
}

export function getOtpAttemptBudget(): number {
  return EMAIL_MAX_VERIFY_ATTEMPTS;
}
