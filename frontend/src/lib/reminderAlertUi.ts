/** Days from reference (local) calendar date to target YYYY-MM-DD. Negative = overdue. */
export function daysUntilFromYmd(targetYmd: string, reference: Date = new Date()): number {
  const parts = targetYmd.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  const [y, m, d] = parts;
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const tgt = new Date(y, m - 1, d);
  return Math.round((tgt.getTime() - ref.getTime()) / 86400000);
}

/** Urgent payment strip / bell: red overdue or due today; orange if 1–3 days left; muted fallback. */
export function tonePendingPayment(daysUntil: number): "orange" | "red" | "muted" {
  if (daysUntil <= 0) return "red";
  if (daysUntil <= 3) return "orange";
  return "muted";
}

const toneClasses = {
  green: "border-emerald-300 bg-emerald-50",
  orange: "border-amber-300 bg-amber-50",
  red: "border-red-300 bg-red-50",
  muted: "border-zinc-200 bg-zinc-50",
} as const;

export function alertCardClass(tone: keyof typeof toneClasses): string {
  return toneClasses[tone];
}

/** Pending reminder row: muted if due in more than 3 days. */
export function toneForReminderCard(daysUntil: number): "orange" | "red" | "muted" {
  if (daysUntil <= 0) return "red";
  if (daysUntil <= 3) return "orange";
  return "muted";
}

const PAYABLE_DISMISS_STORAGE_KEY = "erp-mb.dismissed-payables.v1";

export type PayableDismissed = { hotel: number[]; expense: number[] };

export function readPayableDismissed(): PayableDismissed {
  if (typeof window === "undefined") return { hotel: [], expense: [] };
  try {
    const raw = localStorage.getItem(PAYABLE_DISMISS_STORAGE_KEY);
    if (!raw) return { hotel: [], expense: [] };
    const p = JSON.parse(raw) as Partial<PayableDismissed>;
    return {
      hotel: Array.isArray(p.hotel) ? p.hotel : [],
      expense: Array.isArray(p.expense) ? p.expense : [],
    };
  } catch {
    return { hotel: [], expense: [] };
  }
}

export function writePayableDismissed(next: PayableDismissed): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAYABLE_DISMISS_STORAGE_KEY, JSON.stringify(next));
}

export function dismissPayable(kind: "hotel" | "expense", id: number): PayableDismissed {
  const cur = readPayableDismissed();
  const key = kind === "hotel" ? "hotel" : "expense";
  if (cur[key].includes(id)) return cur;
  const next = { ...cur, [key]: [...cur[key], id] };
  writePayableDismissed(next);
  return next;
}
