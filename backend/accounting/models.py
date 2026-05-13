from django.db import models
from django.utils import timezone

from core.models import Client, Supplier, TimeStampedModel
from hotels.models import Hotel


class LedgerEntry(TimeStampedModel):
    date = models.DateField(default=timezone.now)
    description = models.CharField(max_length=255)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.IntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.date} - {self.description}"


class Invoice(TimeStampedModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("sent", "Sent"),
        ("paid", "Paid"),
        ("overdue", "Overdue"),
    ]

    DOC_CHOICES = [
        ("ar_invoice", "AR Invoice"),
        ("ap_bill", "AP Bill"),
        ("credit_note", "Credit Note"),
        ("debit_note", "Debit Note"),
    ]

    number = models.CharField(max_length=50, unique=True)
    doc_type = models.CharField(max_length=20, choices=DOC_CHOICES, default="ar_invoice")
    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="invoices", null=True, blank=True
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="bills", null=True, blank=True
    )
    hotel = models.ForeignKey(
        Hotel, on_delete=models.PROTECT, related_name="ap_bills", null=True, blank=True
    )
    booking_id = models.IntegerField(null=True, blank=True)
    car_rental_id = models.IntegerField(null=True, blank=True)
    business_sector = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[
            ("", "—"),
            ("hotels", "Hotels / فنادق"),
            ("aviation", "Aviation / طيران"),
        ],
    )
    supplier_document_ref = models.CharField(
        max_length=120,
        blank=True,
        help_text="رقم فاتورة المورّد (الوارد) من الفندق أو شركة الطيران",
    )
    flight_ticket_id = models.IntegerField(null=True, blank=True)
    issue_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="TRY")
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8, default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.number


class InvoiceLine(TimeStampedModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_code = models.ForeignKey("TaxCode", on_delete=models.PROTECT, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def save(self, *args, **kwargs):
        self.line_total = self.quantity * self.unit_price
        rate = self.tax_code.rate if self.tax_code else 0
        if self.tax_code and self.tax_code.is_inclusive:
            # gross includes tax
            divisor = (1 + rate) if rate else 1
            net = self.line_total / divisor
            self.tax_amount = self.line_total - net
        else:
            self.tax_amount = self.line_total * rate
        super().save(*args, **kwargs)


class Payment(TimeStampedModel):
    DIRECTION_CHOICES = [
        ("receipt", "Receipt"),
        ("payment", "Payment"),
    ]
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("posted", "Posted"),
        ("void", "Void"),
    ]

    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, null=True, blank=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.PROTECT, null=True, blank=True)
    payment_date = models.DateField(default=timezone.now)
    currency = models.CharField(max_length=3, default="TRY")
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8, default=1)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="posted")
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.direction} {self.amount} {self.currency}"


class PaymentAllocation(TimeStampedModel):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="allocations")
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="allocations")
    amount = models.DecimalField(max_digits=12, decimal_places=2)


class AccountEntry(TimeStampedModel):
    TYPE_CHOICES = [
        ("payable", "Payable"),
        ("receivable", "Receivable"),
    ]
    STATUS_CHOICES = [
        ("open", "Open"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    ]

    entry_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.IntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.entry_type} - {self.amount}"


class Branch(TimeStampedModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class CostCenter(TimeStampedModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class ChartAccount(TimeStampedModel):
    TYPE_CHOICES = [
        ("asset", "Asset"),
        ("liability", "Liability"),
        ("equity", "Equity"),
        ("revenue", "Revenue"),
        ("expense", "Expense"),
    ]

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children"
    )
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class AccountingPeriod(TimeStampedModel):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("closed", "Closed"),
        ("locked", "Locked"),
    ]

    name = models.CharField(max_length=60)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="open")

    class Meta:
        unique_together = ("start_date", "end_date")

    def __str__(self) -> str:
        return f"{self.name} ({self.start_date} - {self.end_date})"


class TaxCode(TimeStampedModel):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    rate = models.DecimalField(max_digits=7, decimal_places=4, default=0)  # 0.2000 = 20%
    is_inclusive = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.code} ({self.rate})"


class JournalEntry(TimeStampedModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("posted", "Posted"),
        ("void", "Void"),
    ]

    entry_date = models.DateField(default=timezone.now)
    period = models.ForeignKey(
        AccountingPeriod, on_delete=models.PROTECT, null=True, blank=True, related_name="entries"
    )
    description = models.CharField(max_length=255, blank=True)
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="posted")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, null=True, blank=True)

    def __str__(self) -> str:
        return f"JE#{self.id} {self.entry_date}"


class JournalLine(TimeStampedModel):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="lines")
    account = models.ForeignKey(ChartAccount, on_delete=models.PROTECT, related_name="journal_lines")
    description = models.CharField(max_length=255, blank=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    currency = models.CharField(max_length=3, default="TRY")
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8, default=1)

    client = models.ForeignKey(Client, on_delete=models.PROTECT, null=True, blank=True)
    cost_center = models.ForeignKey(CostCenter, on_delete=models.PROTECT, null=True, blank=True)
    tax_code = models.ForeignKey(TaxCode, on_delete=models.PROTECT, null=True, blank=True)

    def __str__(self) -> str:
        return f"Line#{self.id} {self.account}"
