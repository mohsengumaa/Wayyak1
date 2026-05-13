"""
Detailed party (client / hotel) account statement: ledger, settlements, aging, summary.
Client (AR): positive balance = they owe you.
Hotel (AP): positive balance = you owe the hotel.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any

from django.db.models import Prefetch, QuerySet, Sum
from django.utils import timezone

from core.models import Client
from hotels.models import Hotel

from .models import Invoice, Payment, PaymentAllocation

ZERO = Decimal("0")


def _parse_date(s: str | None) -> datetime.date | None:
    if not s:
        return None
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _f(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, float):
        return x
    return float(x)


def _invoice_outstanding(inv: Invoice) -> Decimal:
    alloc = inv.allocations.aggregate(s=Sum("amount")).get("s") or ZERO
    if isinstance(alloc, (int, float)):
        alloc = Decimal(str(alloc))
    out = inv.total_amount - alloc
    return out if out > 0 else ZERO


def _aging_bucket(days: int) -> str:
    if days <= 0:
        return "current"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "91_plus"


def _party_invoice_qs(is_client: bool, party_id: int) -> QuerySet[Invoice]:
    qs = (
        Invoice.objects.filter(client_id=party_id) if is_client else Invoice.objects.filter(hotel_id=party_id)
    )
    if is_client:
        qs = qs.filter(doc_type__in=["ar_invoice", "credit_note", "debit_note"])
    else:
        qs = qs.filter(doc_type__in=["ap_bill", "credit_note", "debit_note"])
    return qs


def _party_payments_qs(is_client: bool, party_id: int) -> QuerySet[Payment]:
    if is_client:
        return Payment.objects.filter(client_id=party_id, direction="receipt")
    return Payment.objects.filter(hotel_id=party_id, direction="payment")


def _impact_on_balance(is_client: bool, doc_type: str, amount: Decimal) -> Decimal:
    if is_client:
        if doc_type in ("ar_invoice", "debit_note"):
            return amount
        if doc_type == "credit_note":
            return -amount
        return ZERO
    if doc_type in ("ap_bill", "debit_note"):
        return amount
    if doc_type == "credit_note":
        return -amount
    return ZERO


def _compute_opening_balance(
    is_client: bool, party_id: int, before: datetime.date
) -> Decimal:
    """Balance carried into [before, …) = stuff before that date (exclusive of `before` as a statement line date)."""
    o = ZERO
    for inv in _party_invoice_qs(is_client, party_id).filter(issue_date__lt=before):
        o += _impact_on_balance(is_client, inv.doc_type, inv.total_amount)
    for pay in _party_payments_qs(is_client, party_id).filter(payment_date__lt=before):
        o -= pay.amount
    return o


def build_party_statement(
    *,
    client_id: int | None,
    hotel_id: int | None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
) -> dict[str, Any] | None:
    if bool(client_id) == bool(hotel_id):
        return None
    is_client = bool(client_id)
    pid = int(client_id or hotel_id or 0)
    as_of = date_to or timezone.now().date()

    try:
        if is_client:
            party = Client.objects.get(pk=pid)
            party_name = party.name
            party_code = party.client_code
        else:
            party = Hotel.objects.get(pk=pid)
            party_name = party.name
            party_code = str(party.id)
    except (Client.DoesNotExist, Hotel.DoesNotExist):
        return {"error": "not_found", "detail": "Client or hotel not found."}

    opening = _compute_opening_balance(is_client, pid, before=date_from) if date_from else ZERO

    def in_window_d(d: datetime.date) -> bool:
        if date_from and d < date_from:
            return False
        if date_to and d > date_to:
            return False
        return True

    inv_all = (
        _party_invoice_qs(is_client, pid)
        .select_related("client", "hotel", "supplier")
        .prefetch_related("lines", Prefetch("allocations", queryset=PaymentAllocation.objects.select_related("payment")))
    )
    pay_all = _party_payments_qs(is_client, pid).select_related("client", "hotel").prefetch_related("allocations")

    events: list[tuple[datetime.date, int, str, Any]] = []
    for inv in inv_all:
        if in_window_d(inv.issue_date):
            events.append((inv.issue_date, 0, "invoice", inv))
    for pay in pay_all:
        if in_window_d(pay.payment_date):
            events.append((pay.payment_date, 1, "payment", pay))
    events.sort(key=lambda t: (t[0], t[1], getattr(t[3], "id", 0)))

    run = opening if date_from else ZERO
    ledger: list[dict[str, Any]] = []
    if date_from:
        ledger.append(
            {
                "row_kind": "opening",
                "date": str(date_from),
                "ref": "—",
                "description": "رصيد افتتاحي (قبل نطاق التقرير) / Opening balance",
                "increase": _f(max(opening, ZERO)),
                "decrease": _f(-min(opening, ZERO)),
                "signed_movement": 0.0,
                "balance": _f(opening),
                "currency": "—",
            }
        )

    for _d, _ord, k, obj in events:
        if k == "invoice":
            inv: Invoice = obj
            move = _impact_on_balance(is_client, inv.doc_type, inv.total_amount)
            run += move
            label = {
                "ar_invoice": "فاتورة مبيعات (AR)" if is_client else "—",
                "ap_bill": "فاتورة مشتريات (AP)",
                "credit_note": "إشعار دائن / Credit N.",
                "debit_note": "إشعار مدين / Debit N.",
            }.get(inv.doc_type, inv.doc_type)
            inc = _f(move) if move > 0 else 0.0
            dec = _f(-move) if move < 0 else 0.0
            notes = (inv.notes or "").strip()[:80]
            ledger.append(
                {
                    "row_kind": "invoice",
                    "date": str(_d),
                    "ref": inv.number,
                    "doc_type": inv.doc_type,
                    "description": f"{label} {notes}".strip(),
                    "increase": inc,
                    "decrease": dec,
                    "signed_movement": _f(move),
                    "balance": _f(run),
                    "currency": inv.currency,
                    "invoice_id": inv.id,
                    "status": inv.status,
                    "total_amount": _f(inv.total_amount),
                }
            )
        else:
            pay: Payment = obj
            run -= pay.amount
            ledger.append(
                {
                    "row_kind": "payment",
                    "date": str(_d),
                    "ref": pay.reference or f"PMT-{pay.id}",
                    "description": "قبض / Receipt" if is_client else "سداد / Payment to supplier",
                    "increase": 0.0,
                    "decrease": _f(pay.amount),
                    "signed_movement": _f(-pay.amount),
                    "balance": _f(run),
                    "currency": pay.currency,
                    "payment_id": pay.id,
                    "amount": _f(pay.amount),
                    "notes": (pay.notes or "")[:200],
                }
            )

    # Invoice detail rows (for tables)
    inv_list = _party_invoice_qs(is_client, pid)
    if date_from:
        inv_list = inv_list.filter(issue_date__gte=date_from)
    if date_to:
        inv_list = inv_list.filter(issue_date__lte=date_to)
    inv_list = inv_list.select_related("client", "hotel").prefetch_related("lines", "allocations").order_by(
        "-issue_date", "-id"
    )

    rows: list[dict[str, Any]] = []
    by_currency: dict[str, dict[str, Decimal]] = {}
    total_outstanding = ZERO
    for inv in inv_list:
        allocated = inv.allocations.aggregate(s=Sum("amount")).get("s") or ZERO
        if isinstance(allocated, (int, float)):
            allocated = Decimal(str(allocated))
        outstanding = inv.total_amount - allocated
        if outstanding < 0:
            outstanding = ZERO
        total_outstanding += outstanding
        ccy = inv.currency or "TRY"
        by_currency.setdefault(ccy, {"invoiced": ZERO, "outstanding": ZERO, "allocated": ZERO})
        by_currency[ccy]["invoiced"] += inv.total_amount
        by_currency[ccy]["allocated"] += allocated
        by_currency[ccy]["outstanding"] += outstanding
        line_qs = inv.lines.all()[:30]
        line_items = [
            {
                "description": ln.description,
                "qty": _f(ln.quantity),
                "unit_price": _f(ln.unit_price),
                "line_total": _f(ln.line_total),
                "tax": _f(ln.tax_amount),
            }
            for ln in line_qs
        ]
        rows.append(
            {
                "invoice_id": inv.id,
                "number": inv.number,
                "doc_type": inv.doc_type,
                "issue_date": str(inv.issue_date),
                "due_date": str(inv.due_date) if inv.due_date else None,
                "total_amount": _f(inv.total_amount),
                "allocated_amount": _f(allocated),
                "outstanding_amount": _f(outstanding),
                "status": inv.status,
                "currency": inv.currency,
                "fx_rate": _f(inv.fx_rate),
                "notes": (inv.notes or "")[:300],
                "business_sector": inv.business_sector,
                "supplier_document_ref": inv.supplier_document_ref,
                "booking_id": inv.booking_id,
                "flight_ticket_id": inv.flight_ticket_id,
                "line_count": inv.lines.count(),
                "line_preview": line_items,
            }
        )

    party_ids = set(_party_invoice_qs(is_client, pid).values_list("id", flat=True))
    settlements: list[dict[str, Any]] = []
    for a in (
        PaymentAllocation.objects.filter(invoice_id__in=party_ids)
        .select_related("payment", "invoice")
        .order_by("-payment__payment_date", "-id")[:2000]
    ):
        p = a.payment
        if date_from and p.payment_date < date_from:
            continue
        if date_to and p.payment_date > date_to:
            continue
        settlements.append(
            {
                "id": a.id,
                "payment_id": p.id,
                "payment_date": str(p.payment_date),
                "payment_direction": p.direction,
                "payment_ref": p.reference,
                "payment_amount": _f(p.amount),
                "payment_currency": p.currency,
                "invoice_id": a.invoice_id,
                "invoice_number": a.invoice.number,
                "allocated_amount": _f(a.amount),
            }
        )

    bucket = {"current": ZERO, "1_30": ZERO, "31_60": ZERO, "61_90": ZERO, "91_plus": ZERO}
    for inv in _party_invoice_qs(is_client, pid).exclude(status="paid").prefetch_related("allocations"):
        o = _invoice_outstanding(inv)
        if o <= 0:
            continue
        due = inv.due_date or inv.issue_date
        days = (as_of - due).days
        b = _aging_bucket(days)
        bucket[b] = bucket.get(b, ZERO) + o
    aging = {k: _f(v) for k, v in bucket.items()}

    # Party-wide total outstanding (all invoices), for debt summary
    full_outstanding = ZERO
    for inv in _party_invoice_qs(is_client, pid).prefetch_related("allocations"):
        full_outstanding += _invoice_outstanding(inv)

    if is_client:
        ar = _party_invoice_qs(is_client, pid).filter(doc_type="ar_invoice")
        cn = _party_invoice_qs(is_client, pid).filter(doc_type="credit_note")
        dn = _party_invoice_qs(is_client, pid).filter(doc_type="debit_note")
        receipts = _party_payments_qs(is_client, pid)
        summary = {
            "gross_sales_ar": _f(ar.aggregate(s=Sum("total_amount"))["s"] or 0),
            "credit_notes_total": _f(cn.aggregate(s=Sum("total_amount"))["s"] or 0),
            "debit_notes_total": _f(dn.aggregate(s=Sum("total_amount"))["s"] or 0),
            "net_billed": _f(
                (ar.aggregate(s=Sum("total_amount"))["s"] or ZERO)
                + (dn.aggregate(s=Sum("total_amount"))["s"] or ZERO)
                - (cn.aggregate(s=Sum("total_amount"))["s"] or ZERO)
            ),
            "total_receipts": _f(receipts.aggregate(s=Sum("amount"))["s"] or 0),
            "outstanding_receivable": _f(full_outstanding),
        }
    else:
        bills = _party_invoice_qs(is_client, pid).filter(doc_type="ap_bill")
        cn = _party_invoice_qs(is_client, pid).filter(doc_type="credit_note")
        dn = _party_invoice_qs(is_client, pid).filter(doc_type="debit_note")
        pays = _party_payments_qs(is_client, pid)
        summary = {
            "gross_purchases_ap": _f(bills.aggregate(s=Sum("total_amount"))["s"] or 0),
            "credit_notes_total": _f(cn.aggregate(s=Sum("total_amount"))["s"] or 0),
            "debit_notes_total": _f(dn.aggregate(s=Sum("total_amount"))["s"] or 0),
            "net_billed": _f(
                (bills.aggregate(s=Sum("total_amount"))["s"] or ZERO)
                + (dn.aggregate(s=Sum("total_amount"))["s"] or ZERO)
                - (cn.aggregate(s=Sum("total_amount"))["s"] or ZERO)
            ),
            "total_payments_made": _f(pays.aggregate(s=Sum("amount"))["s"] or 0),
            "outstanding_payable": _f(full_outstanding),
        }

    by_currency_out = {k: {kk: _f(vv) for kk, vv in v.items()} for k, v in by_currency.items()}

    return {
        "party": {
            "kind": "client" if is_client else "hotel",
            "id": pid,
            "name": party_name,
            "code": party_code,
        },
        "as_of": str(as_of),
        "date_from": str(date_from) if date_from else None,
        "date_to": str(date_to) if date_to else None,
        "opening_balance": _f(opening) if date_from else None,
        "ledger": ledger,
        "rows": rows,
        "outstanding_total": _f(total_outstanding),
        "outstanding_all_invoices": _f(full_outstanding),
        "aging": aging,
        "settlements": settlements,
        "by_currency": by_currency_out,
        "summary": summary,
        "labels": {
            "balance": "رصيد مدين (للسندات في النطاق) = ما على العميل" if is_client else "رصيد دائن = ما للفندق (مستحقات)",
        },
    }


def statement_from_request_params(request) -> dict[str, Any]:
    q = request.query_params
    client_id = q.get("client")
    hotel_id = q.get("hotel")
    cid: int | None = int(client_id) if client_id and str(client_id).isdigit() else None
    hid: int | None = int(hotel_id) if hotel_id and str(hotel_id).isdigit() else None
    date_from = _parse_date(q.get("date_from"))
    date_to = _parse_date(q.get("date_to"))
    if date_from and date_to and date_from > date_to:
        return {"error": "bad_range", "detail": "date_from must be on or before date_to."}
    r = build_party_statement(client_id=cid, hotel_id=hid, date_from=date_from, date_to=date_to)
    return r or {"error": "args", "detail": "Provide exactly one of client or hotel."}
