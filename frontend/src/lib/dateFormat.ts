export function formatYmdSlash(dateValue?: string | null): string {
  const v = (dateValue || "").trim();
  if (!v) return "";

  // Fast-path: already YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return v;

  // Common case from DB/forms: YYYY-MM-DD (or ISO with time)
  // Also normalize odd-but-seen shapes like YYYY-DD-MM into YYYY/MM/DD.
  const ymdDash = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (ymdDash) {
    const y = ymdDash[1];
    const a = Number(ymdDash[2]); // usually month
    const b = Number(ymdDash[3]); // usually day
    if (Number.isFinite(a) && Number.isFinite(b)) {
      // If middle part can't be a month but last part can, assume YYYY-DD-MM.
      const mm = a >= 1 && a <= 12 ? a : b >= 1 && b <= 12 ? b : a;
      const dd = mm === a ? b : a;
      return `${y}/${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")}`;
    }
    return `${y}/${ymdDash[2]}/${ymdDash[3]}`;
  }

  // Some APIs may send YYYY/MM/DD or YYYY/DD/MM
  const ymdSlash = v.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymdSlash) {
    const y = ymdSlash[1];
    const a = Number(ymdSlash[2]);
    const b = Number(ymdSlash[3]);
    const mm = a >= 1 && a <= 12 ? a : b >= 1 && b <= 12 ? b : a;
    const dd = mm === a ? b : a;
    return `${y}/${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")}`;
  }

  // Some users paste DD/MM/YYYY (keep month in middle by converting to YYYY/MM/DD when safe)
  const dmySlash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlash) {
    const dd = Number(dmySlash[1]);
    const mm = Number(dmySlash[2]);
    const y = dmySlash[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${y}/${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")}`;
    }
  }

  // Fallback: try Date parsing for unknown shapes
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;

  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function parseToIsoYmd(input?: string | null): string | null {
  const v = (input || "").trim();
  if (!v) return null;

  // Accept YYYY-MM-DD (or ISO datetime) -> keep date part
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Accept YYYY/MM/DD or YYYY/DD/MM -> normalize to YYYY-MM-DD (month in middle)
  const ySlash = v.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ySlash) {
    const y = ySlash[1];
    const a = Number(ySlash[2]);
    const b = Number(ySlash[3]);
    const mm = a >= 1 && a <= 12 ? a : b >= 1 && b <= 12 ? b : a;
    const dd = mm === a ? b : a;
    if (dd < 1 || dd > 31) return null;
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  // Accept DD/MM/YYYY -> normalize
  const dSlash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dSlash) {
    const dd = Number(dSlash[1]);
    const mm = Number(dSlash[2]);
    const y = dSlash[3];
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  return null;
}

