from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from .models import Expense, ExpensePayment


def recalculate_expense_totals(expense: Expense) -> None:
    """يحدّث paid_amount و payment_status من sum(الدفعات) أو من الحقل إن لا توجد أسطر."""
    total = Decimal(expense.amount or 0) + Decimal(expense.tax_amount or 0)
    if expense.payments.exists():
        paid = expense.payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")
    else:
        paid = Decimal(str(expense.paid_amount or 0))
    cap = total if total > 0 else Decimal("0")
    paid = min(max(paid, Decimal("0")), cap)
    expense.paid_amount = paid
    if paid <= 0:
        expense.payment_status = "unpaid"
    elif total > 0 and paid >= total:
        expense.payment_status = "paid"
    else:
        expense.payment_status = "partial"
    expense.save(update_fields=["paid_amount", "payment_status", "updated_at"])


def ensure_legacy_paid_migrated(expense: Expense) -> None:
    """أول دفعة على سجل قديم / مستورد: تحويل paid_amount إلى سطر دفعة واحد."""
    if expense.payments.exists():
        return
    legacy = Decimal(str(expense.paid_amount or 0))
    if legacy > 0:
        ExpensePayment.objects.create(
            expense=expense,
            amount=legacy,
            paid_at=expense.date,
            notes="",
        )


def apply_payment_status_change(expense: Expense, new_status: str) -> None:
    if new_status == "unpaid":
        expense.payments.all().delete()
    elif new_status == "paid":
        total = Decimal(expense.amount or 0) + Decimal(expense.tax_amount or 0)
        if total <= 0:
            return
        paid_so_far = expense.payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")
        remaining = total - paid_so_far
        if remaining > 0:
            ExpensePayment.objects.create(
                expense=expense,
                amount=remaining,
                paid_at=timezone.now().date(),
                notes="",
            )
