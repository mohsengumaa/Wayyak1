import { api } from "./api";
import { DROPDOWN_CATEGORY_KEYS } from "./dropdownOptions";

export type RoomKindOption = {
  value: string;
  label: string;
  capacity: number;
};

const FALLBACK_ROOM_KIND_OPTIONS: RoomKindOption[] = [
  { value: "SNG", label: "Single", capacity: 1 },
  { value: "DBL", label: "Double", capacity: 2 },
  { value: "TWN", label: "Twin", capacity: 2 },
  { value: "TPL", label: "Triple", capacity: 3 },
  { value: "FAM", label: "Family", capacity: 4 },
  { value: "STE", label: "Suite", capacity: 2 },
  { value: "DLX", label: "Deluxe", capacity: 2 },
];

const DEFAULT_CAPACITY_BY_KIND = Object.fromEntries(
  FALLBACK_ROOM_KIND_OPTIONS.map((row) => [row.value, row.capacity])
) as Record<string, number>;

function parseCapacity(label: string): number | null {
  const m = String(label).match(/\((\d+)\s*people\)|\((\d+)\s*أشخاص\)|(\d+)/i);
  const n = Number(m?.[1] || m?.[2] || m?.[3] || "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

type DropdownCategoryRow = { id: number; key: string };
type DropdownOptionRow = {
  category: number;
  label: string;
  value: string;
  is_active?: boolean;
  meta?: Record<string, unknown>;
  sort_order?: number;
};

export async function fetchHotelRoomKindOptions(): Promise<RoomKindOption[]> {
  try {
    const [categories, options] = await Promise.all([
      api.get<DropdownCategoryRow[]>("/dropdown-categories/", { cache: "no-store" }),
      api.get<DropdownOptionRow[]>("/dropdown-options/", { cache: "no-store" }),
    ]);
    const cat = categories.find((c) => c.key === DROPDOWN_CATEGORY_KEYS.hotelRoomKind);
    if (!cat) return FALLBACK_ROOM_KIND_OPTIONS;

    const catId = Number(cat.id);
    const rows = options
      .filter((o) => Number(o.category) === catId && o.is_active !== false)
      .sort(
        (a, b) =>
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.label.localeCompare(b.label),
      );
    if (!rows.length) return FALLBACK_ROOM_KIND_OPTIONS;

    return rows.map((row) => {
      const metaGuests = Number((row.meta || {}).max_guests || 0);
      const parsed = parseCapacity(row.label);
      const fallback = DEFAULT_CAPACITY_BY_KIND[row.value] || 1;
      return {
        value: row.value,
        label: row.label,
        capacity:
          (Number.isFinite(metaGuests) && metaGuests > 0 ? Math.floor(metaGuests) : null) ??
          parsed ??
          fallback,
      };
    });
  } catch {
    return FALLBACK_ROOM_KIND_OPTIONS;
  }
}

export function resolveKindCapacity(
  kind: string,
  options: RoomKindOption[],
  overrides?: Record<string, number>
): number {
  const custom = Number(overrides?.[kind] || 0);
  if (Number.isFinite(custom) && custom > 0) return Math.floor(custom);
  const fromOptions = options.find((o) => o.value === kind)?.capacity;
  if (fromOptions && fromOptions > 0) return Math.floor(fromOptions);
  return DEFAULT_CAPACITY_BY_KIND[kind] || 1;
}
