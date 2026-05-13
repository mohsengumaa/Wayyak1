export function normalizeSearchQuery(q: string): string {
  return (q || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectStrings(value: unknown, out: string[], seen: Set<unknown>) {
  if (value == null) return;
  if (seen.has(value)) return;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") {
    out.push(String(value));
    return;
  }

  if (value instanceof Date) {
    out.push(value.toISOString());
    return;
  }

  if (Array.isArray(value)) {
    seen.add(value);
    for (const item of value) collectStrings(item, out, seen);
    return;
  }

  if (t === "object") {
    seen.add(value);
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, seen);
    }
  }
}

export function rowMatchesQuery(row: unknown, query: string): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  const parts = q.split(" ").filter(Boolean);
  const strings: string[] = [];
  collectStrings(row, strings, new Set());
  const hay = strings.join(" ").toLowerCase();

  return parts.every((p) => hay.includes(p));
}

