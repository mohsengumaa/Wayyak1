from django.db import models
from django.utils import timezone

from accounting.models import Branch, ChartAccount, CostCenter, Invoice, JournalEntry
from core.models import TimeStampedModel
from settingsapp.models import DropdownOption


class Expense(TimeStampedModel):
    TYPE_CHOICES = [
        ("invoice", "Invoice"),
        ("rent", "Rent"),
        ("utilities", "Utilities"),
        ("salary", "Salary"),
        ("service", "Service"),
        ("other", "Other"),
    ]
    STATUS_CHOICES = [
        ("unpaid", "Unpaid"),
        ("partial", "Partial"),
        ("paid", "Paid"),
    ]

    category = models.ForeignKey(
        DropdownOption, on_delete=models.PROTECT, related_name="expenses"
    )
    expense_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="other")
    company_name = models.CharField(max_length=200, blank=True)
    vendor_name = models.CharField(max_length=200, blank=True)
    reference_no = models.CharField(max_length=120, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)
    payment_status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="unpaid")
    payment_method = models.CharField(max_length=50, blank=True)
    linked_invoice = models.ForeignKey(
        Invoice, on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses"
    )
    account = models.ForeignKey(
        ChartAccount, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses"
    )
    branch = models.ForeignKey(
        Branch, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses"
    )
    cost_center = models.ForeignKey(
        CostCenter, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses"
    )
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses"
    )
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.category.label} - {self.amount}"


class ExpensePayment(TimeStampedModel):
    """سطر دفعة؛ المجموع يحدّث paid_amount على المصروف عبر services.recalculate_expense_totals."""

    expense = models.ForeignKey(
        Expense, on_delete=models.CASCADE, related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateField(default=timezone.now)
    notes = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-paid_at", "-id"]

    def __str__(self) -> str:
        return f"Expense #{self.expense_id} +{self.amount} @{self.paid_at}"
