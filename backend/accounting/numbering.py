from __future__ import annotations

from datetime import date
from typing import Final

from django.db import IntegrityError, transaction
from django.db.models import Max

from .models import Invoice


SYSTEM_PREFIX: Final[str] = "MB"


def _doc_prefix(doc_type: str) -> str:
    if doc_type == "ar_invoice":
        return "AR"
    if doc_type == "ap_bill":
        return "AP"
    if doc_type == "credit_note":
        return "CN"
    if doc_type == "debit_note":
        return "DN"
    return "INV"


def _next_seq_for_prefix(prefix: str) -> int:
    # Extract last 6 digits sequence from existing numbers
    max_number = (
        Invoice.objects.filter(number__startswith=prefix)
        .aggregate(m=Max("number"))
        .get("m")
    )
    if not max_number:
        return 1
    try:
        return int(max_number.split("-")[-1]) + 1
    except Exception:
        return 1


def generate_invoice_number(*, doc_type: str, issue_date: date | None) -> str:
    d = issue_date or date.today()
    ym = d.strftime("%Y%m")
    prefix = f"{SYSTEM_PREFIX}-{_doc_prefix(doc_type)}-{ym}-"

    # Retry in case of race / unique constraint
    for _ in range(5):
        with transaction.atomic():
            seq = _next_seq_for_prefix(prefix)
            candidate = f"{prefix}{seq:06d}"
            if not Invoice.objects.filter(number=candidate).exists():
                return candidate
        # if exists due to concurrency, loop
    # fallback: add a suffix if still colliding
    return f"{prefix}{_next_seq_for_prefix(prefix):06d}"


def assign_invoice_number(invoice: Invoice) -> Invoice:
    if invoice.number and str(invoice.number).strip():
        return invoice
    invoice.number = generate_invoice_number(doc_type=invoice.doc_type, issue_date=invoice.issue_date)
    return invoice

