from decimal import Decimal

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models
from django.db.models import Sum


def backfill_payments_from_paid_amount(apps, schema_editor):
    Expense = apps.get_model("expenses", "Expense")
    ExpensePayment = apps.get_model("expenses", "ExpensePayment")
    for e in Expense.objects.filter(paid_amount__gt=0):
        ExpensePayment.objects.create(
            expense_id=e.pk,
            amount=e.paid_amount,
            paid_at=e.date,
            notes="",
        )


def refresh_expense_totals(apps, schema_editor):
    Expense = apps.get_model("expenses", "Expense")
    ExpensePayment = apps.get_model("expenses", "ExpensePayment")
    for e in Expense.objects.all():
        total = Decimal(str(e.amount or 0)) + Decimal(str(e.tax_amount or 0))
        if ExpensePayment.objects.filter(expense_id=e.pk).exists():
            paid = ExpensePayment.objects.filter(expense_id=e.pk).aggregate(s=Sum("amount"))["s"] or Decimal(
                "0"
            )
        else:
            paid = Decimal(str(e.paid_amount or 0))
        cap = total if total > 0 else Decimal("0")
        paid = min(max(paid, Decimal("0")), cap)
        e.paid_amount = paid
        if paid <= 0:
            e.payment_status = "unpaid"
        elif total > 0 and paid >= total:
            e.payment_status = "paid"
        else:
            e.payment_status = "partial"
        e.save(update_fields=["paid_amount", "payment_status"])


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0003_expense_paid_amount"),
    ]

    operations = [
        migrations.CreateModel(
            name="ExpensePayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("paid_at", models.DateField(default=django.utils.timezone.now)),
                ("notes", models.CharField(blank=True, max_length=500)),
                (
                    "expense",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="expenses.expense",
                    ),
                ),
            ],
            options={
                "ordering": ["-paid_at", "-id"],
            },
        ),
        migrations.RunPython(backfill_payments_from_paid_amount, migrations.RunPython.noop),
        migrations.RunPython(refresh_expense_totals, migrations.RunPython.noop),
    ]
