"""Capture reservation row as shown on hotel voucher PDF (before an edit)."""
from __future__ import annotations

from datetime import date


def _fmt_d(d: date | None) -> str:
    return d.isoformat() if d else "—"


def _stay_nights(ci, co) -> str:
    try:
        if not ci or not co:
            return "—"
        d1 = ci if isinstance(ci, date) else date.fromisoformat(str(ci)[:10])
        d2 = co if isinstance(co, date) else date.fromisoformat(str(co)[:10])
        return str(max(0, (d2 - d1).days))
    except Exception:
        return "—"


def build_reservation_display_snapshot(res) -> dict:
    """Values aligned with hotel voucher «تفاصيل الحجز» block (for strikethrough / was-line)."""
    if not res:
        return {}
    ra = int(getattr(res, "adult_count", 0) or 0)
    rc = int(getattr(res, "child_count", 0) or 0)
    ri = int(getattr(res, "infant_count", 0) or 0)
    if ra + rc + ri == 0:
        v = getattr(res, "voucher", None)
        if v is not None:
            ra = int(getattr(v, "adult_count", 0) or 0)
            rc = int(getattr(v, "child_count", 0) or 0)
            ri = int(getattr(v, "infant_count", 0) or 0)
    guests_str = f"{ra} بالغ، {rc} طفل، {ri} رضيع"
    rt_name = getattr(getattr(res, "room_type", None), "name", "") or "—"
    return {
        "check_in": _fmt_d(getattr(res, "check_in", None)),
        "check_out": _fmt_d(getattr(res, "check_out", None)),
        "room_code": getattr(res, "room_code", "") or "—",
        "board_code": getattr(res, "board_code", "") or "—",
        "room_type_name": str(rt_name),
        "confirmation_number": getattr(res, "confirmation_number", "") or "—",
        "room_count": str(getattr(res, "room_count", "") or "—"),
        "nights": _stay_nights(getattr(res, "check_in", None), getattr(res, "check_out", None)),
        "guests_str": guests_str,
        "reservation_type": (getattr(res, "reservation_type", None) or "").strip(),
    }
