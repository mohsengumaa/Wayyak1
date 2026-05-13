from django.db import models
from django.conf import settings
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Referrer(TimeStampedModel):
    """
    Person or entity that refers clients (intermediary / broker).
    Bookings, rentals, and accounting follow linked clients.
    """

    referrer_code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["referrer_code"]

    def __str__(self) -> str:
        return f"{self.referrer_code} - {self.name}"


class Client(TimeStampedModel):
    client_code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    referrer = models.ForeignKey(
        Referrer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clients",
    )

    def __str__(self) -> str:
        return f"{self.client_code} - {self.name}"


class ClientDocument(TimeStampedModel):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="documents")
    file = models.FileField(upload_to="client-documents/")
    label = models.CharField(max_length=200, blank=True)

    def __str__(self) -> str:
        return self.label or self.file.name


class ExchangeRate(TimeStampedModel):
    base_currency = models.CharField(max_length=3)
    quote_currency = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=12, decimal_places=6)
    rate_date = models.DateField()
    source = models.CharField(max_length=30, default="manual")
    rate_type = models.CharField(max_length=30, default="mid")

    class Meta:
        unique_together = ("base_currency", "quote_currency", "rate_date", "source", "rate_type")

    def __str__(self) -> str:
        return f"{self.base_currency}/{self.quote_currency} {self.rate}"


class Supplier(TimeStampedModel):
    supplier_code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self) -> str:
        return f"{self.supplier_code} - {self.name}"


class Reminder(TimeStampedModel):
    TYPE_CHOICES = [
        ("payment_hotel", "Payment - Hotel"),
        ("payment_supplier", "Payment - Supplier"),
        ("client_followup", "Client Follow-up"),
        ("booking_followup", "Booking Follow-up"),
        ("general", "General"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("done", "Done"),
        ("cancelled", "Cancelled"),
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_reminders"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    reminder_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="general")
    module = models.CharField(max_length=50, blank=True)
    related_model = models.CharField(max_length=80, blank=True)
    related_object_id = models.PositiveIntegerField(null=True, blank=True)
    target_date = models.DateField()
    remind_days_before = models.PositiveIntegerField(default=3)
    remind_at = models.DateField(db_index=True, editable=False)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="medium")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["status", "remind_at", "target_date", "-id"]
        indexes = [
            models.Index(fields=["owner", "status", "remind_at"]),
            models.Index(fields=["target_date"]),
        ]

    def save(self, *args, **kwargs):
        self.remind_at = self.target_date - timezone.timedelta(days=int(self.remind_days_before or 0))
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.title} ({self.remind_at})"


class AuditLog(TimeStampedModel):
    ACTION_CHOICES = [
        ("create", "Create"),
        ("update", "Update"),
        ("delete", "Delete"),
    ]

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs"
    )
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    model_label = models.CharField(max_length=120)  # app_label.ModelName
    object_id = models.CharField(max_length=64)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["model_label", "object_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.created_at} {self.action} {self.model_label}#{self.object_id}"
