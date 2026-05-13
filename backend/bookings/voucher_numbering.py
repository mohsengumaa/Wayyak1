"""Voucher number allocation: {referrer_code}-{year}-{sequence:07d}."""

from __future__ import annotations

from datetime import date as date_cls

from django.utils import timezone
from django.db.models import Max

from core.models import Referrer


def _year_token(sale_date: date_cls | None) -> str:
    current = sale_date or timezone.localdate()
    return str(current.year)


def voucher_nr_prefix(ref: Referrer | None, sale_date: date_cls | None) -> str:
    year = _year_token(sale_date)
    if ref:
        code = ref.referrer_code.strip().upper()
        return f"{code}-{year}"
    return f"GEN-{year}"


def allocate_voucher_nr(ref: Referrer | None, sale_date: date_cls | None) -> tuple[str, int, str]:
    """Return (voucher_nr, next_sequence_number, year_token)."""
    from .models import Voucher

    year = _year_token(sale_date)
    prefix = voucher_nr_prefix(ref, sale_date)

    qs = Voucher.objects.filter(destination_code=year)
    if ref:
        qs = qs.filter(referrer_id=ref.pk)
    else:
        qs = qs.filter(referrer__isnull=True)

    seq = (qs.aggregate(m=Max("sequence_number"))["m"] or 0) + 1
    voucher_nr = f"{prefix}-{seq:07d}"
    return voucher_nr, seq, year
