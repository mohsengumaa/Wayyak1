import { api } from "./api";

/** Row from settings dropdown API, normalized for selects */
export type DropdownOptionRow = { value: string; label: string; fieldKey?: string };

export type SearchOption = { value: string; label: string };

/** Category `key` values in `DropdownCategory` — must match backend rows if configured */
export const DROPDOWN_CATEGORY_KEYS = {
  bookingRoomCode: "booking_room_code",
  bookingRoomTypeCode: "booking_room_type_code",
  bookingBoardCode: "booking_board_code",
  bookingConfirmation: "booking_confirmation",
  bookingReservationStatus: "booking_reservation_status",
  bookingReservationType: "booking_reservation_type",
  bookingVoucherExtras: "booking_voucher_extras",
  accountingDocType: "accounting_doc_type",
  accountingPaymentDirection: "accounting_payment_direction",
  commonCurrency: "common_currency",
  hotelRoomKind: "hotel_room_kind",
  hrDepartment: "hr_department",
  hrPosition: "hr_position",
  hrTaskType: "hr_task_type",
  hrSalaryType: "hr_salary_type",
  hrExpenseType: "hr_expense_type",
} as const;

type NestedDropdownOption = {
  label: string;
  value: string;
  meta?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
};

type DropdownCategoryResponse = {
  id: number | string;
  name: string;
  key: string;
  /** Present on `/dropdown-categories/` when the API embeds related options */
  options?: NestedDropdownOption[];
};

type DropdownOptionResponse = {
  id: number;
  category: number | string | { id: number };
  label: string;
  value: string;
  meta?: Record<string, unknown>;
  is_active?: boolean;
  sort_order?: number;
};

function parseCategoryId(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "object" && "id" in (raw as object)) {
    const n = Number((raw as { id: unknown }).id);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function upsertRow(
  bucket: { value: string; label: string; sort: number; fieldKey?: string }[],
  row: { value: string; label: string; sort: number; fieldKey?: string },
) {
  const idx = bucket.findIndex((r) => r.value === row.value);
  if (idx === -1) bucket.push(row);
  else bucket[idx] = row;
}

/**
 * Load active options for the given category keys.
 *
 * Merges nested `options` on `/dropdown-categories/` with the flat `/dropdown-options/` list
 * (nested can be empty in some deployments; flat uses FK ids that we normalize to numbers).
 * On failure or missing categories, returns empty arrays (callers merge fallbacks).
 */
export async function fetchDropdownOptionsMap(
  keys: string[]
): Promise<Record<string, DropdownOptionRow[]>> {
  const want = new Set(keys);
  const empty = (): Record<string, DropdownOptionRow[]> =>
    Object.fromEntries(keys.map((k) => [k, [] as DropdownOptionRow[]])) as Record<
      string,
      DropdownOptionRow[]
    >;

  try {
    const [categories, options] = await Promise.all([
      api.get<DropdownCategoryResponse[]>("/dropdown-categories/", { cache: "no-store" }),
      api.get<DropdownOptionResponse[]>("/dropdown-options/", { cache: "no-store" }),
    ]);

    const keyByCategoryId = new Map<number, string>();
    type Row = { value: string; label: string; sort: number; fieldKey?: string };
    const buckets = Object.fromEntries(keys.map((k) => [k, [] as Row[]])) as Record<string, Row[]>;

    for (const cat of categories) {
      if (!want.has(cat.key)) continue;
      const kid = parseCategoryId(cat.id);
      if (kid == null) continue;
      keyByCategoryId.set(kid, cat.key);
      const nested = cat.options;
      if (!Array.isArray(nested)) continue;
      for (const o of nested) {
        if (o.is_active === false) continue;
        upsertRow(buckets[cat.key], {
          value: String(o.value),
          label: String(o.label),
          sort: Number(o.sort_order) || 0,
          fieldKey: typeof o.meta?.field_key === "string" ? String(o.meta.field_key) : undefined,
        });
      }
    }

    for (const opt of options) {
      if (opt.is_active === false) continue;
      const cid = parseCategoryId(opt.category);
      if (cid == null) continue;
      const catKey = keyByCategoryId.get(cid);
      if (!catKey) continue;
      upsertRow(buckets[catKey], {
        value: String(opt.value),
        label: String(opt.label),
        sort: Number(opt.sort_order) || 0,
        fieldKey: typeof opt.meta?.field_key === "string" ? String(opt.meta.field_key) : undefined,
      });
    }

    const out = empty();
    for (const key of keys) {
      out[key] = buckets[key]
        .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
        .map(({ value, label, fieldKey }) => ({ value, label, fieldKey }));
    }
    return out;
  } catch {
    return empty();
  }
}

/** API options first, then fallbacks; de-duplicate by `value` */
export function mergeSearchOptions(
  apiRows: DropdownOptionRow[],
  fallbacks: SearchOption[]
): SearchOption[] {
  const seen = new Set<string>();
  const result: SearchOption[] = [];
  for (const row of apiRows) {
    const v = row.value;
    if (seen.has(v)) continue;
    seen.add(v);
    result.push({ value: row.value, label: row.label });
  }
  for (const row of fallbacks) {
    if (seen.has(row.value)) continue;
    seen.add(row.value);
    result.push(row);
  }
  return result;
}
