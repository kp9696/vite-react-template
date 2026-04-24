/**
 * Pure tax-calculation helpers shared between server (payroll.server.ts)
 * and client (hrms.it-declaration.tsx).
 *
 * Must NOT import any server-only or Node.js modules.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ITDeclarationForPayroll {
  tax_regime: "new" | "old";
  // 80C (annual amounts declared)
  ppf: number; elss: number; lic: number; nsc: number; ulip: number;
  home_loan_principal: number; tuition_fees: number; other_80c: number;
  // 80D
  medical_self: number; medical_parents: number;
  // HRA
  monthly_rent: number; is_metro: number; // 0|1
  // 24(b)
  home_loan_interest: number;
  // 80CCD(1B)
  nps_80ccd1b: number;
  // other
  other_deductions: number;
}

// ── New Regime ────────────────────────────────────────────────────────────────

/**
 * Compute annual income tax under New Tax Regime (FY 2025-26 / Budget 2025).
 * Standard deduction: ₹75,000.
 * Slabs: 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, >24L 30%.
 * Rebate u/s 87A: net taxable ≤ ₹12L → full rebate (tax = 0).
 * Health & Education Cess: 4% on tax.
 */
export function computeNewRegimeTDS(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75_000);
  if (taxable === 0) return 0;

  const slabs: Array<{ upto: number; rate: number }> = [
    { upto: 400_000,  rate: 0 },
    { upto: 800_000,  rate: 0.05 },
    { upto: 1_200_000, rate: 0.10 },
    { upto: 1_600_000, rate: 0.15 },
    { upto: 2_000_000, rate: 0.20 },
    { upto: 2_400_000, rate: 0.25 },
    { upto: Infinity,  rate: 0.30 },
  ];

  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, slab.upto) - prev) * slab.rate;
    prev = slab.upto;
  }

  // Rebate u/s 87A — taxable ≤ ₹12,00,000 → tax = 0
  if (taxable <= 1_200_000) return 0;

  return Math.round(tax * 1.04);
}

// ── Old Regime ────────────────────────────────────────────────────────────────

/**
 * Compute annual income tax under Old Tax Regime (FY 2025-26).
 * Standard deduction: ₹50,000.
 * Slabs: 0-2.5L nil, 2.5-5L 5%, 5-10L 20%, >10L 30%.
 * Rebate u/s 87A: taxable ≤ ₹5L → tax = 0.
 * Deductions: 80C (cap ₹1.5L), 80D self (cap ₹25k) + parents (cap ₹25k),
 *             HRA exemption, 24(b) home loan interest (cap ₹2L), 80CCD(1B) (cap ₹50k).
 * Health & Education Cess: 4%.
 */
export function computeOldRegimeTDS(
  annualGross: number,
  monthlyBasic: number,
  monthlyHra: number,
  decl: ITDeclarationForPayroll,
): number {
  const stdDeduction = 50_000;

  // 80C aggregate cap ₹1,50,000
  const c80Total =
    decl.ppf + decl.elss + decl.lic + decl.nsc + decl.ulip +
    decl.home_loan_principal + decl.tuition_fees + decl.other_80c;
  const c80 = Math.min(c80Total, 150_000);

  // 80D caps
  const d80 =
    Math.min(decl.medical_self, 25_000) +
    Math.min(decl.medical_parents, 25_000);

  // HRA exemption (per year) — only if employee pays rent
  let hraExemption = 0;
  if (decl.monthly_rent > 0) {
    const rentPA  = decl.monthly_rent * 12;
    const basicPA = monthlyBasic * 12;
    const hraPA   = monthlyHra * 12;
    const hraPercent        = decl.is_metro === 1 ? 0.50 : 0.40;
    const hraPercentOfBasic = Math.round(basicPA * hraPercent);
    const hraRentBased      = Math.max(0, rentPA - Math.round(basicPA * 0.10));
    hraExemption = Math.min(hraPA, hraPercentOfBasic, hraRentBased);
  }

  // Section 24(b): home loan interest cap ₹2,00,000
  const sec24b = Math.min(decl.home_loan_interest, 200_000);

  // 80CCD(1B): additional NPS cap ₹50,000
  const nps = Math.min(decl.nps_80ccd1b, 50_000);

  const totalDeductions =
    stdDeduction + c80 + d80 + hraExemption + sec24b + nps + decl.other_deductions;
  const taxable = Math.max(0, annualGross - totalDeductions);

  if (taxable === 0) return 0;

  const slabs: Array<{ upto: number; rate: number }> = [
    { upto: 250_000,  rate: 0 },
    { upto: 500_000,  rate: 0.05 },
    { upto: 1_000_000, rate: 0.20 },
    { upto: Infinity,  rate: 0.30 },
  ];

  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, slab.upto) - prev) * slab.rate;
    prev = slab.upto;
  }

  // Rebate u/s 87A — if taxable ≤ ₹5,00,000, tax = 0
  if (taxable <= 500_000) return 0;

  return Math.round(tax * 1.04);
}
