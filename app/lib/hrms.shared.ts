export function normalizeDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] || "";
}

export function isWorkEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;

  const blockedDomains = new Set([
    "yahoo.com",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "aol.com",
    "protonmail.com",
  ]);

  return !blockedDomains.has(normalizeDomain(normalized));
}

export function isAdminRole(role: string): boolean {
  return role.toLowerCase().includes("admin");
}
