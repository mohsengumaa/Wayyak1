from __future__ import annotations

import io
import re
from datetime import date

from django.http import FileResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

from core.pdf_arabic import pdf_text
from core.pdf_settings import draw_watermark, effective_logo_path, load_pdf_config
from core.pdf_theme import (
    draw_card,
    draw_footer,
    draw_header,
    draw_kv_grid,
    draw_kv_grid_with_snapshots,
    draw_section_title,
    set_font,
    theme_for,
)
from settingsapp.models import DropdownOption

# Summary / ملخص card only — light blue background
VOUCHER_SUMMARY_CARD_FILL = colors.HexColor("#E8F4FC")


def _fmt_d(d: date | None) -> str:
    return d.isoformat() if d else "—"


def _stay_nights(ci, co) -> str:
    """عدد الليالي بين تاريخي الدخول والخروج."""
    try:
        if not ci or not co:
            return "—"
        d1 = ci if isinstance(ci, date) else date.fromisoformat(str(ci)[:10])
        d2 = co if isinstance(co, date) else date.fromisoformat(str(co)[:10])
        return str(max(0, (d2 - d1).days))
    except Exception:
        return "—"


def _pdf_reservation_type_raw(res) -> str:
    if not res:
        return ""
    return (getattr(res, "reservation_type", None) or "").strip()


def _first_reservation(voucher):
    return voucher.reservations.all().order_by("id").first()


def _pdf_booking_type_display(*, raw_type: str, amended_pdf: bool, lang: str) -> str:
    """When voucher was amended, placeholder NEW becomes CHANGED in boxed fields."""
    r = (raw_type or "").strip()
    token = r.casefold()
    if token in ("changed", "degisti", "معدل"):
        return _tx(lang, "changed")
    if amended_pdf and (not r or token == "new"):
        return _tx(lang, "changed")
    return r or "—"


def _guest_sort_key(g) -> tuple:
    """قائد أولاً، ثم ترتيب الحجز، ثم رقم الغرفة، ثم الاسم أبجديًا."""
    room = getattr(g, "room", None)
    res_pk = 10**12
    room_nr = 10**6
    if room is not None:
        try:
            res_pk = int(getattr(room, "reservation_id", None) or 10**12)
        except (TypeError, ValueError):
            res_pk = 10**12
        try:
            room_nr = int(getattr(room, "room_number", 0) or 0)
        except (TypeError, ValueError):
            room_nr = 10**6
    leader = 0 if getattr(g, "is_leader", False) else 1
    name_key = (getattr(g, "full_name", "") or "").strip().lower()
    return (leader, res_pk, room_nr, name_key)


def _dedupe_guests_by_identity(guests: list) -> list:
    seen: set[str] = set()
    out: list = []
    for g in sorted(guests, key=_guest_sort_key):
        pn = (getattr(g, "passport_number", "") or "").strip().lower()
        fn = (getattr(g, "full_name", "") or "").strip().lower()
        key = pn if pn else fn
        if not key:
            key = f"id:{g.pk}"
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out


def _guests_for_voucher_pdf(voucher, res_header):
    """
    Guests tied to the primary (first) reservation's rooms; on single-reservation
    vouchers include unassigned guests. Dedupe by passport/name; cap to pax if still over.
    """
    from .models import VoucherRoom

    guest_source = voucher.guests.all()
    if hasattr(guest_source, "select_related"):
        guest_source = guest_source.select_related("room", "room__reservation")
    qs = list(guest_source)
    if not res_header:
        return _dedupe_guests_by_identity(qs)

    res_pk = res_header.pk
    n_res = voucher.reservations.count()
    room_pks = set(VoucherRoom.objects.filter(reservation_id=res_pk).values_list("pk", flat=True))

    tied = [g for g in qs if g.room_id and g.room_id in room_pks]
    orphans_single = [g for g in qs if not g.room_id and n_res == 1]

    if tied:
        base = tied + orphans_single
    elif n_res == 1:
        base = orphans_single or qs
    else:
        base = tied

    out = _dedupe_guests_by_identity(base)
    cap = (
        int(getattr(res_header, "adult_count", 0) or 0)
        + int(getattr(res_header, "child_count", 0) or 0)
        + int(getattr(res_header, "infant_count", 0) or 0)
    )
    if n_res == 1 and cap > 0 and len(out) > cap:
        out = sorted(out, key=_guest_sort_key)[:cap]
    return out


_GUEST_SALUTATION_LABEL = {
    "ar": {"mr": "السيد", "ms": "السيدة", "chd": "طفل", "inf": "رضيع"},
    "en": {"mr": "Mr", "ms": "Ms", "chd": "Child", "inf": "Infant"},
    "tr": {"mr": "Bay", "ms": "Bayan", "chd": "Cocuk", "inf": "Bebek"},
}

_PDF_LANGS = {"ar", "en", "tr"}
_PDF_TEXT = {
    "ar": {
        "voucher_no": "رقم القسيمة",
        "print_date": "تاريخ الطباعة",
        "booking_type": "نوع الحجز",
        "title": "قسيمة حجز فندق",
        "payment_details": "تفاصيل الدفع",
        "method": "الطريقة",
        "type": "النوع",
        "amendment": "تعديل",
        "yes": "نعم",
        "reservation_details": "تفاصيل الحجز",
        "guest_list": "قائمة الأسماء",
        "extras": "الإضافات والرسوم",
        "details": "التفاصيل",
        "summary": "الملخص",
        "extras_total": "إجمالي الإضافات",
        "payment_info": "معلومات الدفع",
        "bank": "البنك",
        "iban": "رقم الإيبان",
        "account": "الحساب",
        "notes": "الملاحظات",
        "link": "الرابط",
        "adult": "بالغ",
        "child": "طفل",
        "infant": "رضيع",
        "reservation": "الحجز",
        "room": "الغرفة",
        "room_type": "نوع الغرفة",
        "board": "الوجبة",
        "check_in": "الدخول",
        "check_out": "الخروج",
        "confirmation_no": "رقم التأكيد",
        "room_count": "عدد الغرف",
        "nights": "عدد الليالي",
        "guests_count": "الضيوف",
        "room_nr": "رقم الغرفة",
        "external_voucher_no": "رقم القسيمة الخارجي",
        "allotment_type": "نوع التخصيص",
        "transfer_note": "ملاحظة النقل",
        "additional_details": "بيانات إضافية",
        "reservations": "الحجوزات",
        "transfer": "النقل",
        "handling": "المناولة",
        "total": "الإجمالي",
        "changed": "معدل",
    },
    "en": {
        "voucher_no": "Voucher No.",
        "print_date": "Print date",
        "booking_type": "Booking type",
        "title": "Hotel Booking Voucher",
        "payment_details": "Payment details",
        "method": "Method",
        "type": "Type",
        "amendment": "Amendment",
        "yes": "Yes",
        "reservation_details": "Reservation details",
        "guest_list": "Customer name list",
        "extras": "Extras & fees",
        "details": "Details",
        "summary": "Summary",
        "extras_total": "Extras total",
        "payment_info": "Payment info",
        "bank": "Bank",
        "iban": "IBAN",
        "account": "Account",
        "notes": "Notes",
        "link": "Link",
        "adult": "adult",
        "child": "child",
        "infant": "infant",
        "reservation": "Reservation",
        "room": "Room",
        "room_type": "Room type",
        "board": "Board",
        "check_in": "Check-in",
        "check_out": "Check-out",
        "confirmation_no": "Confirmation no.",
        "room_count": "Room count",
        "nights": "Nights",
        "guests_count": "Guests",
        "room_nr": "Room nr",
        "external_voucher_no": "External voucher no",
        "allotment_type": "Allotment type",
        "transfer_note": "Transfer note",
        "additional_details": "Additional details",
        "reservations": "Reservations",
        "transfer": "Transfer",
        "handling": "Handling",
        "total": "Total",
        "changed": "CHANGED",
    },
    "tr": {
        "voucher_no": "Voucher No",
        "print_date": "Yazdırma tarihi",
        "booking_type": "Rezervasyon tipi",
        "title": "Otel Rezervasyon Kuponu",
        "payment_details": "Ödeme detayları",
        "method": "Yöntem",
        "type": "Tür",
        "amendment": "Değişiklik",
        "yes": "Evet",
        "reservation_details": "Rezervasyon detayları",
        "guest_list": "Müşteri isim listesi",
        "extras": "Ekstra ve ücretler",
        "details": "Detaylar",
        "summary": "Özet",
        "extras_total": "Ekstralar toplamı",
        "payment_info": "Ödeme bilgisi",
        "bank": "Banka",
        "iban": "IBAN",
        "account": "Hesap",
        "notes": "Notlar",
        "link": "Bağlantı",
        "adult": "yetişkin",
        "child": "çocuk",
        "infant": "bebek",
        "reservation": "Rezervasyon",
        "room": "Oda",
        "room_type": "Oda tipi",
        "board": "Pansiyon",
        "check_in": "Giris",
        "check_out": "Cikis",
        "confirmation_no": "Onay no",
        "room_count": "Oda sayisi",
        "nights": "Gece",
        "guests_count": "Misafirler",
        "room_nr": "Oda no",
        "external_voucher_no": "Harici voucher no",
        "allotment_type": "Allotment tipi",
        "transfer_note": "Transfer notu",
        "additional_details": "Ek bilgiler",
        "reservations": "Rezervasyonlar",
        "transfer": "Transfer",
        "handling": "Islem",
        "total": "Toplam",
        "changed": "DEGISTI",
    },
}


def _pdf_lang(lang: str | None) -> str:
    s = (lang or "ar").strip().lower()
    return s if s in _PDF_LANGS else "ar"


def _tx(lang: str, key: str) -> str:
    return _PDF_TEXT.get(lang, _PDF_TEXT["ar"]).get(key, key)

EXTRAS_DROPDOWN_KEY = "booking_voucher_extras"
EXTRAS_FIELD_DEFAULTS: list[tuple[str, str, str, str]] = [
    ("extra_bed", "سرير إضافي", "Extra bed", "Ek yatak"),
    ("promotion_room", "غرفة عرض", "Promotion room", "Promosyon oda"),
    ("honey_moons", "شهر عسل", "Honey moons", "Balayi"),
    ("free_of_charge", "مجاني", "Free of charge", "Ucretsiz"),
    ("package_splitting", "تقسيم الباقة", "Package splitting", "Paket bolme"),
    ("bubble", "Bubble", "Bubble", "Bubble"),
    ("passive", "غير فعال", "Passive", "Pasif"),
    ("free_sale", "بيع حر", "Free sale", "Serbest satis"),
]
EXTRAS_FIELD_KEYS = {k for k, *_ in EXTRAS_FIELD_DEFAULTS}


def _voucher_extras_field_defs(lang: str) -> list[tuple[str, str]]:
    def _norm(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")

    try:
        rows = (
            DropdownOption.objects.filter(
                category__key=EXTRAS_DROPDOWN_KEY,
                category__is_active=True,
                is_active=True,
            )
            .order_by("sort_order", "label")
            .values_list("value", "label", "meta")
        )
        out: list[tuple[str, str]] = []
        seen: set[str] = set()
        for raw_key, raw_label, raw_meta in rows:
            key = str(raw_key or "").strip()
            meta = raw_meta if isinstance(raw_meta, dict) else {}
            mapped = str(meta.get("field_key") or "").strip()
            if mapped in EXTRAS_FIELD_KEYS:
                key = mapped
            elif key not in EXTRAS_FIELD_KEYS:
                key_alias = _norm(key)
                label_alias = _norm(str(raw_label or ""))
                if key_alias in EXTRAS_FIELD_KEYS:
                    key = key_alias
                elif label_alias in EXTRAS_FIELD_KEYS:
                    key = label_alias
            # For custom user-defined extras, keep arbitrary keys (non-empty) so they can appear in UI/PDF.
            if not key:
                continue
            if key in seen:
                continue
            seen.add(key)
            label = str(raw_label or "").strip() or key
            out.append((key, label))
        return out or EXTRAS_FIELD_DEFAULTS
    except Exception:
        if lang == "ar":
            return [(k, ar) for k, ar, _en, _tr in EXTRAS_FIELD_DEFAULTS]
        if lang == "tr":
            return [(k, tr) for k, _ar, _en, tr in EXTRAS_FIELD_DEFAULTS]
        return [(k, en) for k, _ar, en, _tr in EXTRAS_FIELD_DEFAULTS]


def _guest_display_line(g, lang: str) -> str:
    name = (getattr(g, "full_name", "") or "").strip()
    if not name:
        return ""
    sal = (getattr(g, "salutation", "") or "").strip().lower()
    prefix = _GUEST_SALUTATION_LABEL.get(lang, _GUEST_SALUTATION_LABEL["ar"]).get(sal, "")
    return f"{prefix} {name}".strip() if prefix else name


def render_voucher_pdf(
    *,
    voucher,
    template: str,
    payment_box_override: bool | None = None,
    inline: bool = False,
    lang: str | None = None,
) -> FileResponse:
    """
    Modern voucher PDF (single-page card layout) to match UI screenshot style.
    """
    buff = io.BytesIO()
    pdf = canvas.Canvas(buff, pagesize=A4)
    page_w, page_h = A4
    lang = _pdf_lang(lang)
    rtl = lang == "ar"

    template_l = (template or "").lower()
    is_hotel = template_l == "hotel"
    pdf_scope = "voucher_hotel" if is_hotel else "voucher_customer"

    theme, cfg = theme_for(pdf_scope)
    logo_path = effective_logo_path(cfg)

    # Watermark (optional via settings)
    try:
        draw_watermark(pdf, cfg, page_w=page_w, page_h=page_h, logo_path=logo_path)
    except Exception:
        pass

    res_header = _first_reservation(voucher)
    amended_pdf = bool(res_header and getattr(res_header, "amended_on_voucher_pdf", False))
    raw_type = (_pdf_reservation_type_raw(res_header) or "").strip()
    type_raw_display = _pdf_booking_type_display(raw_type=raw_type, amended_pdf=amended_pdf, lang=lang)
    # Customer voucher: no booking-type line under divider (hotel keeps it).
    if not is_hotel:
        type_above_company = None
    elif amended_pdf and (not raw_type or raw_type.casefold() in ("new", "changed")):
        type_above_company = None
    else:
        type_above_company = raw_type or None
    meta_left = [
        (_tx(lang, "voucher_no"), str(getattr(voucher, "voucher_nr", "—"))),
        (_tx(lang, "print_date"), str(getattr(voucher, "issued_at", "") or "")[:10] or "—"),
    ]
    if is_hotel:
        meta_left.append((_tx(lang, "booking_type"), type_raw_display))
    # Customer voucher: no Bill To / Referrer in header (hotel: same single meta card).
    meta_right = []

    y = draw_header(
        pdf,
        doc_key=pdf_scope,
        title_en=_tx(lang, "title"),
        title_ar=_tx(lang, "title"),
        meta_left=meta_left,
        meta_right=meta_right,
        page_w=page_w,
        page_h=page_h,
        booking_type_above_company=type_above_company,
        changed_below_company=amended_pdf if is_hotel else False,
        changed_text=_tx(lang, "changed"),
        rtl=rtl,
    )

    pad = theme.page_padding
    # Footer (line + company info)
    footer_top = draw_footer(pdf, doc_key=pdf_scope, page_w=page_w, page_h=page_h)

    # Make cards bigger and reduce whitespace to "fill" the page better.
    gap = 0.55 * cm
    full_w = page_w - 2 * pad
    col_w = (full_w - gap) / 2
    left_x = pad
    right_x = pad + col_w + gap

    # Row 1: Payment details (hotel voucher only; customer has no payment / Bill-To row)
    row1_h = 2.6 * cm
    if is_hotel:
        draw_card(pdf, x=pad, y=y - row1_h, w=full_w, h=row1_h, doc_key=pdf_scope)
        draw_section_title(
            pdf,
            doc_key=pdf_scope,
            title=_tx(lang, "payment_details"),
            x=(pad + full_w - 0.45 * cm) if rtl else (pad + 0.45 * cm),
            y=y - 0.55 * cm,
            rtl=rtl,
        )
        pay_items = [(_tx(lang, "method"), "—")]
        type_pay = _pdf_booking_type_display(raw_type=raw_type, amended_pdf=amended_pdf, lang=lang)
        pay_items.append((_tx(lang, "type"), type_pay))
        pay_items.append((_tx(lang, "amendment"), _tx(lang, "yes") if amended_pdf else "—"))
        draw_kv_grid(
            pdf,
            doc_key=pdf_scope,
            items=pay_items,
            x=pad + 0.55 * cm,
            y=y - 1.25 * cm,
            w=full_w - 1.1 * cm,
            row_h=0.48 * cm,
            key_w=2.75 * cm,
            rtl=rtl,
        )
        y = y - row1_h - gap

    # Row 2: Reservation details (full width)
    res = res_header
    prev_boxes = getattr(res, "hotel_pdf_previous_snapshot", None) if res else None
    row2_h = 7.25 * cm if (is_hotel and prev_boxes) else 6.55 * cm
    draw_card(pdf, x=pad, y=y - row2_h, w=full_w, h=row2_h, doc_key=pdf_scope)
    draw_section_title(
        pdf,
        doc_key=pdf_scope,
        title=f"01 - {_tx(lang, 'reservation_details')}",
        x=(pad + full_w - 0.45 * cm) if rtl else (pad + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )

    if res:
        hotel_name = getattr(getattr(res, "hotel", None), "name", "") or "—"
        room_type_name = getattr(getattr(res, "room_type", None), "name", "") or "—"
        # يسار: الغرفة والوجبة والدخول/الخروج — يمين: التأكيد والعدد والليالي والضيوف
        ra = int(getattr(res, "adult_count", 0) or 0)
        rc = int(getattr(res, "child_count", 0) or 0)
        ri = int(getattr(res, "infant_count", 0) or 0)
        if ra + rc + ri == 0:
            ra = int(getattr(voucher, "adult_count", 0) or 0)
            rc = int(getattr(voucher, "child_count", 0) or 0)
            ri = int(getattr(voucher, "infant_count", 0) or 0)
        guests_str = f"{ra} {_tx(lang, 'adult')}, {rc} {_tx(lang, 'child')}, {ri} {_tx(lang, 'infant')}"
        room_c = getattr(res, "room_code", "") or "—"
        board_c = getattr(res, "board_code", "") or "—"
        cin = _fmt_d(getattr(res, "check_in", None))
        cout = _fmt_d(getattr(res, "check_out", None))
        conf = getattr(res, "confirmation_number", "") or "—"
        rcount = str(getattr(res, "room_count", "") or "—")
        nights = _stay_nights(getattr(res, "check_in", None), getattr(res, "check_out", None))
        raw_rt = _pdf_reservation_type_raw(res) or ""
        type_disp = _pdf_booking_type_display(raw_type=raw_rt, amended_pdf=amended_pdf, lang=lang)
        snap = getattr(res, "hotel_pdf_previous_snapshot", None) or {}

        def _was(key: str, cur: str) -> str | None:
            if not isinstance(snap, dict):
                return None
            o = snap.get(key)
            if o is None:
                return None
            if str(o).strip() == str(cur).strip():
                return None
            return str(o).strip()

        left_items: list[tuple[str, str]] = []
        if is_hotel:
            left_items.append((_tx(lang, "booking_type"), type_disp))
        left_items.extend(
            [
                (_tx(lang, "room"), room_c),
                (_tx(lang, "room_type"), room_type_name),
                (_tx(lang, "board"), board_c),
                (_tx(lang, "check_in"), cin),
                (_tx(lang, "check_out"), cout),
            ]
        )
        right_items = [
            (_tx(lang, "confirmation_no"), conf),
            (_tx(lang, "room_count"), rcount),
            (_tx(lang, "nights"), nights),
            (_tx(lang, "guests_count"), guests_str),
        ]
        kv_key_w = 3.45 * cm
        # Hotel name big line
        pdf.setFillColor(theme.text)
        pdf.setFont(pdf._fontname, 10)
        if rtl:
            pdf.drawRightString(pad + full_w - 0.55 * cm, y - 1.25 * cm, pdf_text(hotel_name))
        else:
            pdf.drawString(pad + 0.55 * cm, y - 1.25 * cm, pdf_text(hotel_name))
        if is_hotel:
            left_ts: list[tuple[str, str, str | None]] = [
                (_tx(lang, "booking_type"), type_disp, _was("reservation_type", raw_rt)),
                (_tx(lang, "room"), room_c, _was("room_code", room_c)),
                (_tx(lang, "room_type"), room_type_name, _was("room_type_name", room_type_name)),
                (_tx(lang, "board"), board_c, _was("board_code", board_c)),
                (_tx(lang, "check_in"), cin, _was("check_in", cin)),
                (_tx(lang, "check_out"), cout, _was("check_out", cout)),
            ]
            right_ts: list[tuple[str, str, str | None]] = [
                (_tx(lang, "confirmation_no"), conf, _was("confirmation_number", conf)),
                (_tx(lang, "room_count"), rcount, _was("room_count", rcount)),
                (_tx(lang, "nights"), nights, _was("nights", nights)),
                (_tx(lang, "guests_count"), guests_str, _was("guests_str", guests_str)),
            ]
            draw_kv_grid_with_snapshots(
                pdf,
                doc_key=pdf_scope,
                items=left_ts,
                x=pad + 0.55 * cm,
                y=y - 1.9 * cm,
                w=col_w - 1.1 * cm,
                row_h=0.52 * cm,
                key_w=kv_key_w,
                rtl=rtl,
            )
            draw_kv_grid_with_snapshots(
                pdf,
                doc_key=pdf_scope,
                items=right_ts,
                x=pad + col_w + gap + 0.55 * cm,
                y=y - 1.9 * cm,
                w=col_w - 1.1 * cm,
                row_h=0.52 * cm,
                key_w=kv_key_w,
                rtl=rtl,
            )
        else:
            draw_kv_grid(
                pdf,
                doc_key=pdf_scope,
                items=left_items,
                x=pad + 0.55 * cm,
                y=y - 1.9 * cm,
                w=col_w - 1.1 * cm,
                row_h=0.52 * cm,
                key_w=kv_key_w,
                rtl=rtl,
            )
            draw_kv_grid(
                pdf,
                doc_key=pdf_scope,
                items=right_items,
                x=pad + col_w + gap + 0.55 * cm,
                y=y - 1.9 * cm,
                w=col_w - 1.1 * cm,
                row_h=0.52 * cm,
                key_w=kv_key_w,
                rtl=rtl,
            )
    else:
        draw_kv_grid(
            pdf,
            doc_key=pdf_scope,
            items=[(_tx(lang, "reservation"), "—")],
            x=pad + 0.55 * cm,
            y=y - 1.25 * cm,
            w=full_w - 1.1 * cm,
            row_h=0.45 * cm,
            key_w=3.2 * cm,
            rtl=rtl,
        )

    y = y - row2_h - gap

    # Row 3: Customer list / Extras — ترتيب النزلاء ثم قائمة مرقمة سطرًا بسطر
    guest_objs = _guests_for_voucher_pdf(voucher, res_header)
    guest_objs.sort(key=_guest_sort_key)
    guest_lines: list[str] = []
    for g in guest_objs:
        disp = _guest_display_line(g, lang).strip()
        if disp:
            guest_lines.append(disp)
    if not guest_lines:
        guest_lines = ["—"]
    max_lines = 12
    if len(guest_lines) > max_lines:
        guest_lines = guest_lines[: max_lines - 1]
        guest_lines.append("…")

    extras_cfg = cfg.get("extras_fields") if isinstance(cfg.get("extras_fields"), dict) else {}
    extras_defs = _voucher_extras_field_defs(lang)

    def _extra_visible(key: str) -> bool:
        raw = extras_cfg.get(key, True)
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            return raw.strip().lower() not in {"0", "false", "off", "no"}
        return bool(raw)

    extras_prices = getattr(res_header, "extras_prices", {}) if res_header else {}
    extras_prices = extras_prices if isinstance(extras_prices, dict) else {}
    price_key = "buying_price" if is_hotel else "selling_price"
    price_currency = (
        str(getattr(res_header, "buying_currency", "EUR") or "EUR")
        if is_hotel
        else str(getattr(res_header, "selling_currency", "USD") or "USD")
    )
    extras_total = 0.0
    extras_items = []
    for key, label in extras_defs:
        row = extras_prices.get(key, {})
        row = row if isinstance(row, dict) else {}
        if res_header and key in EXTRAS_FIELD_KEYS:
            enabled = bool(getattr(res_header, key, False)) or bool(row.get("enabled", False))
        else:
            enabled = bool(row.get("enabled", False))
        if not enabled or not _extra_visible(key):
            continue
        try:
            amount = float(row.get(price_key, 0) or 0)
        except (TypeError, ValueError):
            amount = 0.0
        extras_total += amount
        extras_items.append((label, f"{amount:.2f} {price_currency}"))
    if not extras_items:
        extras_items = [("—", "—")]

    line_step = 0.36 * cm
    n_show = len(guest_lines)
    content_depth = 1.22 * cm + max(0, n_show - 1) * line_step + 0.42 * cm
    extras_depth = 1.25 * cm + max(1, len(extras_items)) * (0.52 * cm) + 0.34 * cm
    row3_h = max(3.1 * cm, min(6.8 * cm, max(content_depth, extras_depth)))

    draw_card(pdf, x=left_x, y=y - row3_h, w=col_w, h=row3_h, doc_key=pdf_scope)
    draw_card(pdf, x=right_x, y=y - row3_h, w=col_w, h=row3_h, doc_key=pdf_scope)
    draw_section_title(
        pdf,
        doc_key=pdf_scope,
        title=_tx(lang, "guest_list"),
        x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_section_title(
        pdf,
        doc_key=pdf_scope,
        title=_tx(lang, "extras"),
        x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )

    ty_guest = y - 1.2 * cm
    set_font(pdf, 8)
    pdf.setFillColor(theme.text)
    for i, line in enumerate(guest_lines, start=1):
        if rtl:
            pdf.drawRightString(left_x + col_w - 0.55 * cm, ty_guest, pdf_text(f"{i:02d}. {line}"))
        else:
            pdf.drawString(left_x + 0.55 * cm, ty_guest, pdf_text(f"{i:02d}. {line}"))
        ty_guest -= line_step

    def _clean_note(value: str) -> str:
        v = (value or "").strip()
        return "" if v.lower() in {"no", "none", "n/a", "-"} else v

    room_nr = _clean_note(getattr(res_header, "room_nr", "") if res_header else "")
    external_voucher_no = _clean_note(getattr(res_header, "external_voucher_no", "") if res_header else "")
    allotment_type = _clean_note(getattr(res_header, "allotment_type", "") if res_header else "")
    transfer_note = _clean_note(getattr(res_header, "transfer_note", "") if res_header else "")

    draw_kv_grid(
        pdf,
        doc_key=pdf_scope,
        items=extras_items,
        x=right_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.52 * cm,
        key_w=3.2 * cm,
        rtl=rtl,
    )

    y = y - row3_h - gap

    # Row 4: Details / Summary
    row4_h = 4.2 * cm
    draw_card(pdf, x=left_x, y=y - row4_h, w=col_w, h=row4_h, doc_key=pdf_scope)
    draw_card(
        pdf,
        x=right_x,
        y=y - row4_h,
        w=col_w,
        h=row4_h,
        doc_key=pdf_scope,
        fill_color=VOUCHER_SUMMARY_CARD_FILL,
    )
    draw_section_title(
        pdf,
        doc_key=pdf_scope,
        title=_tx(lang, "details"),
        x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )
    draw_section_title(
        pdf,
        doc_key=pdf_scope,
        title=_tx(lang, "summary"),
        x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
        y=y - 0.55 * cm,
        rtl=rtl,
    )

    total_pax = getattr(voucher, "total_pax", 0) or 0
    selling_total = 0.0
    for rr in voucher.reservations.all():
        try:
            selling_total += float(getattr(rr, "selling_price", 0) or 0)
        except Exception:
            pass
    handling = float(getattr(voucher, "handling_fee_total", 0) or 0)
    transfer = float(getattr(voucher, "transfer_fee", 0) or 0)
    summary_total = selling_total + handling + transfer + extras_total
    details_items = [
        (label, value)
        for label, value in [
            (_tx(lang, "room_nr"), room_nr),
            (_tx(lang, "external_voucher_no"), external_voucher_no),
            (_tx(lang, "allotment_type"), allotment_type),
            (_tx(lang, "transfer_note"), transfer_note),
        ]
        if value
    ]
    if not details_items:
        details_items = [(_tx(lang, "additional_details"), "—")]
    summary_items = (
        [
            (_tx(lang, "reservations"), f"{selling_total:.2f}"),
            (_tx(lang, "extras_total"), f"{extras_total:.2f}"),
            (_tx(lang, "total"), f"{summary_total:.2f}"),
        ]
        if is_hotel
        else [
            (_tx(lang, "reservations"), f"{selling_total:.2f}"),
            (_tx(lang, "transfer"), f"{transfer:.2f}"),
            (_tx(lang, "handling"), f"{handling:.2f}"),
            (_tx(lang, "extras_total"), f"{extras_total:.2f}"),
            (_tx(lang, "total"), f"{summary_total:.2f}"),
        ]
    )
    draw_kv_grid(
        pdf,
        doc_key=pdf_scope,
        items=details_items,
        x=left_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.56 * cm,
        key_w=3.2 * cm,
        rtl=rtl,
    )
    draw_kv_grid(
        pdf,
        doc_key=pdf_scope,
        items=summary_items,
        x=right_x + 0.55 * cm,
        y=y - 1.25 * cm,
        w=col_w - 1.1 * cm,
        row_h=0.56 * cm,
        key_w=3.2 * cm,
        rtl=rtl,
    )

    # Ensure we don't overlap the footer (future-proof if row heights change)
    # If content ever goes too low, slightly move it up.
    content_bottom = (y - row4_h)
    min_bottom = footer_top + 0.25 * cm
    y_row4 = y
    if content_bottom < min_bottom:
        # Shift everything in the last row upward
        delta = min_bottom - content_bottom
        # Redraw last row at adjusted y (simple adjustment without reflowing everything else)
        y_adj = y + delta
        y_row4 = y_adj
        draw_card(pdf, x=left_x, y=y_adj - row4_h, w=col_w, h=row4_h, doc_key=pdf_scope)
        draw_card(
            pdf,
            x=right_x,
            y=y_adj - row4_h,
            w=col_w,
            h=row4_h,
            doc_key=pdf_scope,
            fill_color=VOUCHER_SUMMARY_CARD_FILL,
        )
        draw_section_title(
            pdf,
            doc_key=pdf_scope,
            title=_tx(lang, "details"),
            x=(left_x + col_w - 0.45 * cm) if rtl else (left_x + 0.45 * cm),
            y=y_adj - 0.55 * cm,
            rtl=rtl,
        )
        draw_section_title(
            pdf,
            doc_key=pdf_scope,
            title=_tx(lang, "summary"),
            x=(right_x + col_w - 0.45 * cm) if rtl else (right_x + 0.45 * cm),
            y=y_adj - 0.55 * cm,
            rtl=rtl,
        )
        draw_kv_grid(
            pdf,
            doc_key=pdf_scope,
            items=details_items,
            x=left_x + 0.55 * cm,
            y=y_adj - 1.25 * cm,
            w=col_w - 1.1 * cm,
            row_h=0.56 * cm,
            key_w=3.2 * cm,
            rtl=rtl,
        )
        draw_kv_grid(
            pdf,
            doc_key=pdf_scope,
            items=summary_items,
            x=right_x + 0.55 * cm,
            y=y_adj - 1.25 * cm,
            w=col_w - 1.1 * cm,
            row_h=0.56 * cm,
            key_w=3.2 * cm,
            rtl=rtl,
        )

    # Payment info: stacked mini-cards (Settings -> PDF). Customer voucher PDF only.
    # payment_box_override: True/False من الواجهة (قسيمة عميل)، None = الاعتماد على الإعدادات فقط.
    pb = cfg.get("payment_box") if isinstance(cfg.get("payment_box"), dict) else {}
    is_customer_voucher_pdf = (template or "").lower() == "customer"
    settings_payment_on = bool(pb.get("enabled"))
    if payment_box_override is False:
        pb_enabled = False
    elif payment_box_override is True:
        pb_enabled = is_customer_voucher_pdf
    else:
        pb_enabled = settings_payment_on and is_customer_voucher_pdf
    if pb_enabled:

        def _pb_str(key: str) -> str:
            v = pb.get(key)
            return str(v).strip() if v is not None else ""

        def _pb_clip(s: str, max_len: int) -> str:
            t = (s or "").strip() or "—"
            if len(t) > max_len:
                return t[: max_len - 1] + "…"
            return t

        pb_title = _pb_str("title") or _tx(lang, "payment_info")
        pb_bank = _pb_str("bank")
        pb_iban = _pb_str("iban")
        pb_account = _pb_str("account")
        pb_url = _pb_str("payment_url")
        pb_info = _pb_str("info_text")

        box_gap = 0.4 * cm
        inner_pad_x = 0.5 * cm
        inner_pad_y_top = 0.42 * cm
        inner_pad_y_bottom = 0.42 * cm
        row_h = 0.52 * cm
        title_row_h = 0.58 * cm
        col_gap = 0.55 * cm

        # إحداثيات الصف الرابع بعد أي إزاحة لتفادي الفوتر — ضروري لموضع مستطيل الدفع
        min_y = footer_top + 0.25 * cm

        usable_w = full_w - 2 * inner_pad_x
        half_inner = (usable_w - col_gap) / 2
        x_left = pad + inner_pad_x
        x_right = x_left + half_inner + col_gap

        total_h = inner_pad_y_top + inner_pad_y_bottom + title_row_h + 3 * row_h

        # أعلى مستطيل الدفع لا يتجاوز المسافة تحت البطاقة الرابعة (بدون تداخل)
        natural_top = (y_row4 - row4_h) - box_gap
        outer_bottom = natural_top - total_h
        if outer_bottom < min_y:
            outer_bottom = min_y
        box_top = outer_bottom + total_h
        if box_top > natural_top:
            box_top = natural_top
            outer_bottom = box_top - total_h

        draw_card(pdf, x=pad, y=outer_bottom, w=full_w, h=total_h, doc_key=pdf_scope)

        ty = box_top - inner_pad_y_top - 0.28 * cm
        set_font(pdf, 10)
        pdf.setFillColor(theme.text)
        if rtl:
            pdf.drawRightString(pad + full_w - inner_pad_x, ty, pdf_text(_pb_clip(pb_title, 96)))
        else:
            pdf.drawString(x_left, ty, pdf_text(_pb_clip(pb_title, 96)))
        ty -= title_row_h

        set_font(pdf, 8)
        pdf.setFillColor(theme.text)
        if rtl:
            pdf.drawRightString(x_right + half_inner, ty, pdf_text(f"{_tx(lang, 'iban')}: {_pb_clip(pb_iban, 52)}"))
            pdf.drawRightString(x_left + half_inner, ty, pdf_text(f"{_tx(lang, 'bank')}: {_pb_clip(pb_bank, 52)}"))
        else:
            pdf.drawString(x_left, ty, pdf_text(f"{_tx(lang, 'bank')}: {_pb_clip(pb_bank, 52)}"))
            pdf.drawString(x_right, ty, pdf_text(f"{_tx(lang, 'iban')}: {_pb_clip(pb_iban, 52)}"))
        ty -= row_h

        if rtl:
            pdf.drawRightString(x_right + half_inner, ty, pdf_text(f"{_tx(lang, 'notes')}: {_pb_clip(pb_info, 52)}"))
            pdf.drawRightString(x_left + half_inner, ty, pdf_text(f"{_tx(lang, 'account')}: {_pb_clip(pb_account, 52)}"))
        else:
            pdf.drawString(x_left, ty, pdf_text(f"{_tx(lang, 'account')}: {_pb_clip(pb_account, 52)}"))
            pdf.drawString(x_right, ty, pdf_text(f"{_tx(lang, 'notes')}: {_pb_clip(pb_info, 52)}"))
        ty -= row_h

        pdf.setFillColor(theme.accent)
        if rtl:
            pdf.drawRightString(pad + full_w - inner_pad_x, ty, pdf_text(f"{_tx(lang, 'link')}: {_pb_clip(pb_url, 110)}"))
        else:
            pdf.drawString(x_left, ty, pdf_text(f"{_tx(lang, 'link')}: {_pb_clip(pb_url, 110)}"))

    pdf.showPage()
    pdf.save()
    buff.seek(0)
    filename = f"voucher_{getattr(voucher, 'voucher_nr', 'voucher')}_{template}.pdf"
    resp = FileResponse(
        buff,
        as_attachment=not inline,
        filename=filename,
        content_type="application/pdf",
    )
    resp["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp["Pragma"] = "no-cache"
    resp["Expires"] = "0"
    return resp

