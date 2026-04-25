/**
 * HRMS Indian Payroll Calculation Engine
 *
 * Pure computation module — no DB access, fully testable.
 * Covers: PF · ESI · PT (state-wise) · TDS (new + old regime) · LWF · LOP
 *
 * Statutory references:
 *  - PF:  EPF Act 1952, wage cap ₹15,000/month (employer share)
 *  - ESI: ESI Act 1948, gross threshold ₹21,000/month
 *  - PT:  State Finance Acts (MH / KA / TN / WB / AP / TS / GJ / others)
 *  - TDS: Income Tax Act 1961, FY 2024-25 and FY 2025-26+ slabs
 *  - LWF: State Labour Welfare Fund Acts (monthly proration of annual amounts)
 *  - LOP: Per-day deduction = monthly gross / working days in month
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SalaryComponents {
  basic: number;
  hra: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  lta: number;
  specialAllowance: number;
  otherAllowances: number;
}

/**
 * All inputs needed to compute one employee's payroll for a given month.
 */
export interface PayrollInputs {
  employeeId: string;

  /** Gross monthly salary components (before LOP). */
  components: SalaryComponents;

  /**
   * Two-letter Indian state code for Professional Tax.
   * Use "NONE" if no PT applies in the employee's work state.
   * Supported: MH | KA | TN | WB | AP | TS | GJ | MP | PB | HR | KL | OR | others → 0
   */
  ptState: string;

  /** Income-tax regime chosen by the employee (new regime is default from FY 2023-24). */
  taxRegime: "new" | "old";

  /**
   * Set true if the employee is exempt from PF (e.g. contractual, or voluntarily opted out
   * after basic > ₹15,000 and first employment after Sep 2014 — employer may allow opt-out).
   */
  pfOptOut: boolean;

  /** Month being processed, format "YYYY-MM" e.g. "2025-06". */
  monthKey: string;

  /**
   * Number of months elapsed in the current financial year including this month
   * (April = 1, … March = 12). Used for TDS annualization.
   */
  monthsElapsedInFY: number;

  /** Days absent without pay this month (0 = full attendance). */
  lopDays: number;

  /**
   * Total working (paid) days defined for this month.
   * Most Indian companies use 26 or calendar-month days. Default: 26.
   */
  workingDaysInMonth?: number;

  /** Old-tax-regime declarations — ignored when taxRegime = "new". */
  declarations?: {
    section80C?: number;   // max ₹1,50,000
    section80D?: number;   // max ₹25,000 (self) / ₹50,000 (senior)
    hraExemption?: number; // pre-computed HRA exemption amount
    ltaExemption?: number;
    otherDeductions?: number;
  };
}

export interface PfBreakdown {
  pfWage: number;                 // Basic used for PF (capped at ₹15,000 for employer)
  employeeContribution: number;   // 12% of PF wage
  employerEpfContribution: number; // Employer EPF (difference after EPS)
  employerEpsContribution: number; // 8.33% of min(basic, ₹15,000), max ₹1,250/month
  totalEmployerContribution: number;
}

export interface EsiBreakdown {
  applicable: boolean;
  grossWage: number;
  employeeContribution: number;  // 0.75% of gross
  employerContribution: number;  // 3.25% of gross
}

export interface TdsBreakdown {
  fyKey: string;           // e.g. "FY2025-26"
  regime: "new" | "old";
  projectedAnnualGross: number;
  standardDeduction: number;
  declarationDeductions: number;
  annualTaxableIncome: number;
  annualTaxBeforeCess: number;
  rebate87A: number;
  educationCess: number;
  annualTax: number;
  monthlyTds: number;
}

export interface PtBreakdown {
  state: string;
  monthlyPt: number;
}

export interface LwfBreakdown {
  state: string;
  employeeContribution: number;
  employerContribution: number;
}

export interface LopBreakdown {
  lopDays: number;
  workingDaysInMonth: number;
  deductionAmount: number;
}

export interface PayrollResult {
  employeeId: string;
  monthKey: string;

  // ── Gross earnings (pre-LOP) ─────────────────────────────────────────────
  grossBeforeLop: number;

  // ── LOP ──────────────────────────────────────────────────────────────────
  lop: LopBreakdown;

  // ── Net gross after LOP ──────────────────────────────────────────────────
  grossAfterLop: number;

  // ── Salary component split (after LOP proration) ────────────────────────
  basic: number;
  hra: number;
  conveyance: number;
  medicalAllowance: number;
  lta: number;
  specialAllowance: number;
  otherAllowances: number;

  // ── Statutory deductions (employee share) ───────────────────────────────
  pf: PfBreakdown;
  esi: EsiBreakdown;
  pt: PtBreakdown;
  tds: TdsBreakdown;
  lwf: LwfBreakdown;

  // ── Summary ──────────────────────────────────────────────────────────────
  totalEmployeeDeductions: number;  // pf.employee + esi.employee + pt + tds + lwf.employee + lop
  netPay: number;                   // grossAfterLop - (pf + esi + pt + tds + lwf)

  // ── Employer liability (for CTC / cost-to-company reporting) ────────────
  employerPf: number;
  employerEsi: number;
  employerLwf: number;
  totalEmployerContributions: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n);
}

/**
 * Derive financial year key from a month_key string.
 * April (04) onwards = new FY.  e.g. "2025-06" → "FY2025-26", "2026-02" → "FY2025-26"
 */
export function getFyKey(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month >= 4) {
    return `FY${year}-${(year + 1).toString().slice(2)}`;
  }
  return `FY${year - 1}-${year.toString().slice(2)}`;
}

/**
 * Calendar month number (1–12) from monthKey.
 */
function getCalendarMonth(monthKey: string): number {
  return parseInt(monthKey.split("-")[1], 10);
}

// ── PF Computation ────────────────────────────────────────────────────────────

const PF_WAGE_CAP = 15_000;          // Employer PF wage ceiling
const PF_EMPLOYEE_RATE = 0.12;
const PF_EMPLOYER_TOTAL_RATE = 0.12;
const EPS_RATE = 0.0833;             // 8.33% of wage up to ₹15,000 → max ₹1,250
const EPS_WAGE_CAP = 15_000;

function computePf(basic: number, optOut: boolean): PfBreakdown {
  if (optOut) {
    return {
      pfWage: 0,
      employeeContribution: 0,
      employerEpfContribution: 0,
      employerEpsContribution: 0,
      totalEmployerContribution: 0,
    };
  }

  // Employee PF is on actual basic (no cap enforced here — most SMBs contribute on full basic)
  const pfWageEmployee = round(basic);
  const employeeContribution = round(pfWageEmployee * PF_EMPLOYEE_RATE);

  // Employer share is capped at ₹15,000 wage
  const pfWageEmployer = Math.min(basic, PF_WAGE_CAP);
  const employerEps = Math.min(round(pfWageEmployer * EPS_RATE), round(EPS_WAGE_CAP * EPS_RATE));
  const employerTotal = round(pfWageEmployer * PF_EMPLOYER_TOTAL_RATE);
  const employerEpf = employerTotal - employerEps;

  return {
    pfWage: pfWageEmployee,
    employeeContribution,
    employerEpfContribution: Math.max(0, employerEpf),
    employerEpsContribution: employerEps,
    totalEmployerContribution: employerTotal,
  };
}

// ── ESI Computation ───────────────────────────────────────────────────────────

const ESI_GROSS_THRESHOLD = 21_000;
const ESI_EMPLOYEE_RATE = 0.0075;   // 0.75%
const ESI_EMPLOYER_RATE = 0.0325;   // 3.25%

function computeEsi(grossWage: number): EsiBreakdown {
  if (grossWage <= 0 || grossWage > ESI_GROSS_THRESHOLD) {
    return {
      applicable: false,
      grossWage,
      employeeContribution: 0,
      employerContribution: 0,
    };
  }
  return {
    applicable: true,
    grossWage,
    employeeContribution: round(grossWage * ESI_EMPLOYEE_RATE),
    employerContribution: round(grossWage * ESI_EMPLOYER_RATE),
  };
}

// ── Professional Tax ──────────────────────────────────────────────────────────

type PtSlab = { upTo: number; monthly: number };

/**
 * Monthly PT slabs per state (gross salary as basis unless noted).
 * MH: February = ₹300 (extra ₹100 to compensate for Feb being short).
 */
const PT_SLABS: Record<string, PtSlab[]> = {
  MH: [
    { upTo: 7_500,   monthly: 0   },
    { upTo: 10_000,  monthly: 175 },
    { upTo: Infinity, monthly: 200 },  // ₹300 in February — handled separately
  ],
  KA: [
    { upTo: 15_000,  monthly: 0   },
    { upTo: 25_000,  monthly: 150 },
    { upTo: 35_000,  monthly: 200 },
    { upTo: Infinity, monthly: 200 },
  ],
  WB: [
    { upTo: 10_000,  monthly: 0   },
    { upTo: 15_000,  monthly: 110 },
    { upTo: 25_000,  monthly: 130 },
    { upTo: 40_000,  monthly: 150 },
    { upTo: Infinity, monthly: 200 },
  ],
  AP: [
    { upTo: 15_000,  monthly: 0   },
    { upTo: 20_000,  monthly: 150 },
    { upTo: 25_000,  monthly: 200 },
    { upTo: 33_333,  monthly: 300 },
    { upTo: Infinity, monthly: 350 },
  ],
  TS: [
    // Telangana — same slabs as AP
    { upTo: 15_000,  monthly: 0   },
    { upTo: 20_000,  monthly: 150 },
    { upTo: 25_000,  monthly: 200 },
    { upTo: 33_333,  monthly: 300 },
    { upTo: Infinity, monthly: 350 },
  ],
  GJ: [
    { upTo: 5_999,   monthly: 0   },
    { upTo: 8_999,   monthly: 80  },
    { upTo: 11_999,  monthly: 150 },
    { upTo: 17_999,  monthly: 150 },
    { upTo: Infinity, monthly: 200 },
  ],
  MP: [
    { upTo: 18_750,  monthly: 0   },
    { upTo: Infinity, monthly: 208 }, // ₹2,500/year → ₹208/month (approximation)
  ],
  KL: [
    { upTo: Infinity, monthly: 208 }, // Kerala: ₹2,500/year, collected half-yearly
  ],
  OR: [
    { upTo: 20_000,  monthly: 0   },
    { upTo: Infinity, monthly: 200 },
  ],
};

/**
 * Tamil Nadu PT: ₹2,500/year collected in two half-yearly instalments.
 * Instalments are due in September (month 9) and March (month 3).
 * Per-instalment = ₹1,250.  Monthly TDS equivalent = ₹1,250 / 6 ≈ ₹208.
 * We collect ₹1,250 in Sept and ₹1,250 in March, ₹0 other months.
 */
function computePtTN(grossWage: number, calendarMonth: number): number {
  if (grossWage <= 21_000) return 0;
  if (calendarMonth === 9 || calendarMonth === 3) return 1_250;
  return 0;
}

function computePt(grossWage: number, ptState: string, monthKey: string): PtBreakdown {
  const state = ptState.toUpperCase();
  const calendarMonth = getCalendarMonth(monthKey);

  // Tamil Nadu: half-yearly collection
  if (state === "TN") {
    return { state, monthlyPt: computePtTN(grossWage, calendarMonth) };
  }

  // Maharashtra: February gets ₹300 instead of ₹200
  if (state === "MH") {
    if (grossWage <= 7_500)  return { state, monthlyPt: 0   };
    if (grossWage <= 10_000) return { state, monthlyPt: 175 };
    return { state, monthlyPt: calendarMonth === 2 ? 300 : 200 };
  }

  const slabs = PT_SLABS[state];
  if (!slabs) {
    // State not listed = no PT (e.g. Delhi, UP, Rajasthan, Punjab, Haryana, Bihar, HP, UK, JH, etc.)
    return { state, monthlyPt: 0 };
  }

  for (const slab of slabs) {
    if (grossWage <= slab.upTo) {
      return { state, monthlyPt: slab.monthly };
    }
  }
  return { state, monthlyPt: 0 };
}

// ── LWF Computation ───────────────────────────────────────────────────────────

interface LwfRate { employeeAnnual: number; employerAnnual: number }

/**
 * Annual LWF amounts (employee + employer share) per state.
 * Collection month varies — most states collect in December or June+December.
 * We prorate monthly (annual / 12) for smooth deduction.
 */
const LWF_RATES: Record<string, LwfRate> = {
  MH: { employeeAnnual: 12,  employerAnnual: 36  }, // Maharashtra
  KA: { employeeAnnual: 20,  employerAnnual: 40  }, // Karnataka
  TN: { employeeAnnual: 10,  employerAnnual: 20  }, // Tamil Nadu
  WB: { employeeAnnual: 3,   employerAnnual: 3   }, // West Bengal
  AP: { employeeAnnual: 20,  employerAnnual: 40  }, // Andhra Pradesh
  TS: { employeeAnnual: 20,  employerAnnual: 40  }, // Telangana
  GJ: { employeeAnnual: 6,   employerAnnual: 12  }, // Gujarat
  MP: { employeeAnnual: 12,  employerAnnual: 24  }, // Madhya Pradesh
  HR: { employeeAnnual: 0,   employerAnnual: 0   }, // Haryana — no LWF
  DL: { employeeAnnual: 0,   employerAnnual: 0   }, // Delhi — no LWF
  RJ: { employeeAnnual: 0,   employerAnnual: 0   }, // Rajasthan — no LWF
  UP: { employeeAnnual: 0,   employerAnnual: 0   }, // Uttar Pradesh — no LWF
};

function computeLwf(ptState: string): LwfBreakdown {
  const state = ptState.toUpperCase();
  const rate = LWF_RATES[state];
  if (!rate || (rate.employeeAnnual === 0 && rate.employerAnnual === 0)) {
    return { state, employeeContribution: 0, employerContribution: 0 };
  }
  // Prorate: annual / 12, round up to nearest rupee
  return {
    state,
    employeeContribution: Math.ceil(rate.employeeAnnual / 12),
    employerContribution: Math.ceil(rate.employerAnnual / 12),
  };
}

// ── TDS / Income Tax Computation ──────────────────────────────────────────────

interface TaxSlab { upTo: number; rate: number }

// FY 2024-25 new regime slabs (post Budget 2024)
const NEW_REGIME_SLABS_FY2425: TaxSlab[] = [
  { upTo:  3_00_000, rate: 0.00 },
  { upTo:  7_00_000, rate: 0.05 },
  { upTo: 10_00_000, rate: 0.10 },
  { upTo: 12_00_000, rate: 0.15 },
  { upTo: 15_00_000, rate: 0.20 },
  { upTo: Infinity,  rate: 0.30 },
];
const NEW_REGIME_STD_DEDUCTION_FY2425 = 75_000;
const NEW_REGIME_REBATE87A_LIMIT_FY2425 = 7_00_000;   // income ≤ 7L → rebate 25k
const NEW_REGIME_REBATE87A_MAX_FY2425   = 25_000;

// FY 2025-26+ new regime slabs (Budget 2025)
const NEW_REGIME_SLABS_FY2526: TaxSlab[] = [
  { upTo:  4_00_000, rate: 0.00 },
  { upTo:  8_00_000, rate: 0.05 },
  { upTo: 12_00_000, rate: 0.10 },
  { upTo: 16_00_000, rate: 0.15 },
  { upTo: 20_00_000, rate: 0.20 },
  { upTo: 24_00_000, rate: 0.25 },
  { upTo: Infinity,  rate: 0.30 },
];
const NEW_REGIME_STD_DEDUCTION_FY2526 = 75_000;
const NEW_REGIME_REBATE87A_LIMIT_FY2526 = 12_00_000;  // income ≤ 12L → rebate 60k
const NEW_REGIME_REBATE87A_MAX_FY2526   = 60_000;

// Old regime slabs (unchanged)
const OLD_REGIME_SLABS: TaxSlab[] = [
  { upTo:  2_50_000, rate: 0.00 },
  { upTo:  5_00_000, rate: 0.05 },
  { upTo: 10_00_000, rate: 0.20 },
  { upTo: Infinity,  rate: 0.30 },
];
const OLD_REGIME_STD_DEDUCTION = 50_000;
const OLD_REGIME_REBATE87A_LIMIT = 5_00_000;   // income ≤ 5L → rebate 12.5k
const OLD_REGIME_REBATE87A_MAX   = 12_500;
const OLD_REGIME_80C_CAP = 1_50_000;
const OLD_REGIME_80D_CAP = 25_000;

const EDUCATION_CESS_RATE = 0.04;

function computeSlabTax(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0;
  let prev = 0;
  for (const slab of slabs) {
    if (taxableIncome <= 0) break;
    const slabIncome = Math.min(taxableIncome - prev, slab.upTo - prev);
    if (slabIncome <= 0) break;
    tax += slabIncome * slab.rate;
    prev = slab.upTo;
    if (taxableIncome <= slab.upTo) break;
  }
  return Math.max(0, round(tax));
}

function computeTds(inputs: {
  projectedAnnualGross: number;
  regime: "new" | "old";
  fyKey: string;
  monthsElapsedInFY: number;
  declarations?: PayrollInputs["declarations"];
}): TdsBreakdown {
  const { projectedAnnualGross, regime, fyKey, declarations } = inputs;
  const monthsRemaining = Math.max(1, 12 - inputs.monthsElapsedInFY + 1);

  // ── Standard deduction and slab selection ─────────────────────────────────
  let stdDeduction: number;
  let slabs: TaxSlab[];
  let rebate87ALimit: number;
  let rebate87AMax: number;

  if (regime === "old") {
    stdDeduction = OLD_REGIME_STD_DEDUCTION;
    slabs = OLD_REGIME_SLABS;
    rebate87ALimit = OLD_REGIME_REBATE87A_LIMIT;
    rebate87AMax = OLD_REGIME_REBATE87A_MAX;
  } else {
    // New regime — pick slabs based on FY
    const isPost2526 = fyKey >= "FY2025-26";
    stdDeduction = isPost2526 ? NEW_REGIME_STD_DEDUCTION_FY2526 : NEW_REGIME_STD_DEDUCTION_FY2425;
    slabs = isPost2526 ? NEW_REGIME_SLABS_FY2526 : NEW_REGIME_SLABS_FY2425;
    rebate87ALimit = isPost2526 ? NEW_REGIME_REBATE87A_LIMIT_FY2526 : NEW_REGIME_REBATE87A_LIMIT_FY2425;
    rebate87AMax   = isPost2526 ? NEW_REGIME_REBATE87A_MAX_FY2526   : NEW_REGIME_REBATE87A_MAX_FY2425;
  }

  // ── Declaration deductions (old regime only) ─────────────────────────────
  let declarationDeductions = 0;
  if (regime === "old" && declarations) {
    const d80C = Math.min(declarations.section80C ?? 0, OLD_REGIME_80C_CAP);
    const d80D = Math.min(declarations.section80D ?? 0, OLD_REGIME_80D_CAP);
    const dHra = declarations.hraExemption ?? 0;
    const dLta = declarations.ltaExemption ?? 0;
    const dOther = declarations.otherDeductions ?? 0;
    declarationDeductions = d80C + d80D + dHra + dLta + dOther;
  }

  // ── Taxable income ────────────────────────────────────────────────────────
  const annualTaxableIncome = Math.max(
    0,
    projectedAnnualGross - stdDeduction - declarationDeductions,
  );

  // ── Slab tax ─────────────────────────────────────────────────────────────
  const slabTax = computeSlabTax(annualTaxableIncome, slabs);

  // ── Rebate 87A (if taxable income ≤ threshold) ───────────────────────────
  const rebate87A = annualTaxableIncome <= rebate87ALimit
    ? Math.min(slabTax, rebate87AMax)
    : 0;

  const taxAfterRebate = Math.max(0, slabTax - rebate87A);

  // ── Education & Health Cess (4%) ─────────────────────────────────────────
  const educationCess = round(taxAfterRebate * EDUCATION_CESS_RATE);
  const annualTax = taxAfterRebate + educationCess;

  // ── Monthly TDS (spread across remaining months in FY) ───────────────────
  const monthlyTds = round(annualTax / monthsRemaining);

  return {
    fyKey,
    regime,
    projectedAnnualGross,
    standardDeduction: stdDeduction,
    declarationDeductions,
    annualTaxableIncome,
    annualTaxBeforeCess: taxAfterRebate + rebate87A,
    rebate87A,
    educationCess,
    annualTax,
    monthlyTds,
  };
}

// ── LOP Computation ───────────────────────────────────────────────────────────

const DEFAULT_WORKING_DAYS = 26;

function computeLop(grossBeforeLop: number, lopDays: number, workingDays: number): LopBreakdown {
  if (lopDays <= 0) {
    return { lopDays: 0, workingDaysInMonth: workingDays, deductionAmount: 0 };
  }
  const effectiveDays = Math.max(1, workingDays); // Guard against 0
  const perDay = grossBeforeLop / effectiveDays;
  const deduction = round(perDay * Math.min(lopDays, effectiveDays));
  return { lopDays, workingDaysInMonth: workingDays, deductionAmount: deduction };
}

// ── Main Compute Function ─────────────────────────────────────────────────────

/**
 * Compute a full Indian payroll for one employee in one month.
 *
 * All monetary values in the result are integers (₹, no paise).
 */
export function computePayroll(inputs: PayrollInputs): PayrollResult {
  const {
    employeeId,
    components,
    ptState,
    taxRegime,
    pfOptOut,
    monthKey,
    monthsElapsedInFY,
    lopDays,
    workingDaysInMonth = DEFAULT_WORKING_DAYS,
    declarations,
  } = inputs;

  // ── 1. Gross before LOP ───────────────────────────────────────────────────
  const grossBeforeLop = round(
    components.basic +
    components.hra +
    components.conveyanceAllowance +
    components.medicalAllowance +
    components.lta +
    components.specialAllowance +
    components.otherAllowances,
  );

  // ── 2. LOP deduction ─────────────────────────────────────────────────────
  const lop = computeLop(grossBeforeLop, lopDays, workingDaysInMonth);
  const grossAfterLop = Math.max(0, grossBeforeLop - lop.deductionAmount);

  // ── 3. Prorate components after LOP ──────────────────────────────────────
  // Proportionally scale each component by the same LOP fraction.
  const lopFraction = grossBeforeLop > 0 ? grossAfterLop / grossBeforeLop : 1;
  const basic       = round(components.basic * lopFraction);
  const hra         = round(components.hra * lopFraction);
  const conveyance  = round(components.conveyanceAllowance * lopFraction);
  const medAllowance = round(components.medicalAllowance * lopFraction);
  const ltaComp     = round(components.lta * lopFraction);
  const special     = round(components.specialAllowance * lopFraction);
  const other       = round(components.otherAllowances * lopFraction);

  // ── 4. PF ─────────────────────────────────────────────────────────────────
  const pf = computePf(basic, pfOptOut);

  // ── 5. ESI (on gross after LOP) ──────────────────────────────────────────
  const esi = computeEsi(grossAfterLop);

  // ── 6. PT ─────────────────────────────────────────────────────────────────
  const pt = computePt(grossAfterLop, ptState, monthKey);

  // ── 7. LWF ───────────────────────────────────────────────────────────────
  const lwf = computeLwf(ptState);

  // ── 8. TDS ───────────────────────────────────────────────────────────────
  // Annualize current month's gross (after LOP) across 12 months.
  const fyKey = getFyKey(monthKey);
  const projectedAnnualGross = grossAfterLop * 12;
  const tds = computeTds({
    projectedAnnualGross,
    regime: taxRegime,
    fyKey,
    monthsElapsedInFY,
    declarations,
  });

  // ── 9. Totals ─────────────────────────────────────────────────────────────
  const employeeDeductions =
    pf.employeeContribution +
    esi.employeeContribution +
    pt.monthlyPt +
    tds.monthlyTds +
    lwf.employeeContribution;

  const netPay = Math.max(0, grossAfterLop - employeeDeductions);

  const employerPf  = pf.totalEmployerContribution;
  const employerEsi = esi.employerContribution;
  const employerLwf = lwf.employerContribution;
  const totalEmployerContributions = employerPf + employerEsi + employerLwf;

  return {
    employeeId,
    monthKey,
    grossBeforeLop,
    lop,
    grossAfterLop,
    basic,
    hra,
    conveyance,
    medicalAllowance: medAllowance,
    lta: ltaComp,
    specialAllowance: special,
    otherAllowances: other,
    pf,
    esi,
    pt,
    tds,
    lwf,
    totalEmployeeDeductions: employeeDeductions,
    netPay,
    employerPf,
    employerEsi,
    employerLwf,
    totalEmployerContributions,
  };
}

// ── Salary Structure Helper ───────────────────────────────────────────────────

/**
 * Derive monthly SalaryComponents from a DB salary_structures row + annual CTC.
 * Used by the payroll compute API handler.
 */
export function deriveSalaryComponents(params: {
  annualCtc: number;
  basicPct: number;         // % of monthly CTC (e.g. 50 = 50%)
  hraPct: number;           // % of monthly CTC
  conveyanceFixed: number;  // fixed monthly ₹
  ltaFixed: number;         // fixed monthly ₹
  medicalFixed: number;     // fixed monthly ₹
  specialAllowancePct: number; // % of CTC (0 = fill remainder)
}): SalaryComponents {
  const monthly = params.annualCtc / 12;

  const basic      = round(monthly * params.basicPct / 100);
  const hra        = round(monthly * params.hraPct / 100);
  const conveyance = params.conveyanceFixed;
  const lta        = params.ltaFixed;
  const medical    = params.medicalFixed;

  // Special allowance: explicitly set OR auto-fill remainder
  let special: number;
  if (params.specialAllowancePct > 0) {
    special = round(monthly * params.specialAllowancePct / 100);
  } else {
    special = Math.max(0, round(monthly - basic - hra - conveyance - lta - medical));
  }

  return {
    basic,
    hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    lta,
    specialAllowance: special,
    otherAllowances: 0,
  };
}
