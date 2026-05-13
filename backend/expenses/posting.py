from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import transaction

from accounting.models import ChartAccount, JournalEntry, JournalLine
from accounting.posting import _find_period, _ensure_period_open
from .models import Expense


def _cfg_code(key: str, default: str) -> str:
    cfg = getattr(settings, "ACCOUNTING_DEFAULT_ACCOUNTS", None) or {}
    return str(cfg.get(key, default))


def _get_account(code: str, fallback: str) -> ChartAccount:
    try:
        return ChartAccount.objects.get(code=code)
    except ChartAccount.DoesNotExist:
        return ChartAccount.objects.get(code=fallback)


@transaction.atomic
def post_expense(expense_id: int) -> JournalEntry:
    exp = (
        Expense.objects.select_related("account", "branch", "cost_center", "journal_entry")
        .get(id=expense_id)
    )
    entry_date = exp.date
    period = _find_period(entry_date)
    _ensure_period_open(period)

    suspense_code = _cfg_code("suspense", "9999")
    expense_code = _cfg_code("expense", "5000")
    cash_code = _cfg_code("cash", "1000")
    ap_code = _cfg_code("ap", "2000")

    debit_account = exp.account or _get_account(expense_code, suspense_code)
    credit_account = _get_account(
        cash_code if exp.payment_status == "paid" else ap_code, suspense_code
    )

    total = Decimal(exp.amount or 0) + Decimal(exp.tax_amount or 0)
    if total <= 0:
        total = Decimal("0")

    je = exp.journal_entry
    if je is None:
        je = JournalEntry.objects.create(
            entry_date=entry_date,
            period=period,
            description=f"Expense #{exp.id} {exp.expense_type}",
            reference_type="expense",
            reference_id=exp.id,
            status="posted",
            branch=exp.branch,
        )
        exp.journal_entry = je
        exp.save(update_fields=["journal_entry"])
    else:
        je.entry_date = entry_date
        je.period = period
        je.description = f"Expense #{exp.id} {exp.expense_type}"
        je.branch = exp.branch
        je.reference_type = "expense"
        je.reference_id = exp.id
        je.status = "posted"
        je.save(
            update_fields=[
                "entry_date",
                "period",
                "description",
                "branch",
                "reference_type",
                "reference_id",
                "status",
            ]
        )
        je.lines.all().delete()

    JournalLine.objects.create(
        entry=je,
        account=debit_account,
        description=f"Expense #{exp.id}",
        debit=total,
        credit=0,
        cost_center=exp.cost_center,
    )
    JournalLine.objects.create(
        entry=je,
        account=credit_account,
        description=f"Expense #{exp.id}",
        debit=0,
        credit=total,
        cost_center=exp.cost_center,
    )
    return je
