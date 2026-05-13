from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    AccountingPeriod,
    ChartAccount,
    Invoice,
    JournalEntry,
    JournalLine,
    Payment,
)


@dataclass(frozen=True)
class PostingAccounts:
    cash: str
    ar: str
    ap: str
    revenue: str
    expense: str
    suspense: str


def _accounts_config() -> PostingAccounts:
    cfg = getattr(settings, "ACCOUNTING_DEFAULT_ACCOUNTS", None) or {}
    return PostingAccounts(
        cash=str(cfg.get("cash", "1000")),
        ar=str(cfg.get("ar", "1200")),
        ap=str(cfg.get("ap", "2000")),
        revenue=str(cfg.get("revenue", "4000")),
        expense=str(cfg.get("expense", "5000")),
        suspense=str(cfg.get("suspense", "9999")),
    )


def _get_account(code: str, *, fallback_code: str) -> ChartAccount:
    try:
        return ChartAccount.objects.get(code=code)
    except ChartAccount.DoesNotExist:
        return ChartAccount.objects.get(code=fallback_code)


def _find_period(entry_date):
    return (
        AccountingPeriod.objects.filter(start_date__lte=entry_date, end_date__gte=entry_date)
        .order_by("-start_date")
        .first()
    )


def _ensure_period_open(period: AccountingPeriod | None):
    if not period:
        return
    if period.status in ("closed", "locked"):
        raise ValueError(f"Accounting period is {period.status} for this date.")


@transaction.atomic
def post_invoice(invoice_id: int) -> JournalEntry | None:
    inv = (
        Invoice.objects.select_related("client", "supplier")
        .prefetch_related("lines")
        .get(id=invoice_id)
    )

    if inv.status == "draft":
        return None

    existing = JournalEntry.objects.filter(reference_type="invoice", reference_id=inv.id).first()
    if existing:
        return existing

    entry_date = inv.issue_date or timezone.now().date()
    period = _find_period(entry_date)
    _ensure_period_open(period)

    cfg = _accounts_config()
    suspense = _get_account(cfg.suspense, fallback_code=cfg.suspense)

    if inv.doc_type == "ar_invoice":
        debit_acct = _get_account(cfg.ar, fallback_code=cfg.suspense)
        credit_acct = _get_account(cfg.revenue, fallback_code=cfg.suspense)
    elif inv.doc_type == "ap_bill":
        debit_acct = _get_account(cfg.expense, fallback_code=cfg.suspense)
        credit_acct = _get_account(cfg.ap, fallback_code=cfg.suspense)
    else:
        # Notes (credit/debit) are handled later; keep safe
        debit_acct = suspense
        credit_acct = suspense

    je = JournalEntry.objects.create(
        entry_date=entry_date,
        period=period,
        description=f"Invoice {inv.number}",
        reference_type="invoice",
        reference_id=inv.id,
        status="posted",
    )

    amount = Decimal(inv.total_amount or 0)
    JournalLine.objects.create(
        entry=je,
        account=debit_acct,
        description=f"Invoice {inv.number}",
        debit=amount,
        credit=0,
        currency=inv.currency,
        fx_rate=inv.fx_rate,
        client=inv.client if inv.doc_type == "ar_invoice" else None,
    )
    JournalLine.objects.create(
        entry=je,
        account=credit_acct,
        description=f"Invoice {inv.number}",
        debit=0,
        credit=amount,
        currency=inv.currency,
        fx_rate=inv.fx_rate,
        client=inv.client if inv.doc_type == "ar_invoice" else None,
    )

    return je


@transaction.atomic
def post_payment(payment_id: int) -> JournalEntry | None:
    pay = Payment.objects.select_related("client", "supplier").get(id=payment_id)
    if pay.status != "posted":
        return None

    existing = JournalEntry.objects.filter(reference_type="payment", reference_id=pay.id).first()
    if existing:
        return existing

    entry_date = pay.payment_date or timezone.now().date()
    period = _find_period(entry_date)
    _ensure_period_open(period)

    cfg = _accounts_config()
    cash = _get_account(cfg.cash, fallback_code=cfg.suspense)
    ar = _get_account(cfg.ar, fallback_code=cfg.suspense)
    ap = _get_account(cfg.ap, fallback_code=cfg.suspense)

    je = JournalEntry.objects.create(
        entry_date=entry_date,
        period=period,
        description=f"Payment #{pay.id}",
        reference_type="payment",
        reference_id=pay.id,
        status="posted",
    )

    amount = Decimal(pay.amount or 0)
    if pay.direction == "receipt":
        # Dr Cash, Cr AR
        JournalLine.objects.create(
            entry=je,
            account=cash,
            description=f"Receipt #{pay.id}",
            debit=amount,
            credit=0,
            currency=pay.currency,
            fx_rate=pay.fx_rate,
            client=pay.client,
        )
        JournalLine.objects.create(
            entry=je,
            account=ar,
            description=f"Receipt #{pay.id}",
            debit=0,
            credit=amount,
            currency=pay.currency,
            fx_rate=pay.fx_rate,
            client=pay.client,
        )
    else:
        # Supplier payment: Dr AP, Cr Cash
        JournalLine.objects.create(
            entry=je,
            account=ap,
            description=f"Supplier payment #{pay.id}",
            debit=amount,
            credit=0,
            currency=pay.currency,
            fx_rate=pay.fx_rate,
        )
        JournalLine.objects.create(
            entry=je,
            account=cash,
            description=f"Supplier payment #{pay.id}",
            debit=0,
            credit=amount,
            currency=pay.currency,
            fx_rate=pay.fx_rate,
        )

    return je

