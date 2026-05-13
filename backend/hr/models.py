from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class Employee(TimeStampedModel):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("on_leave", "On Leave"),
        ("inactive", "Inactive"),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employee"
    )
    department = models.CharField(max_length=150, blank=True, default="")
    position = models.CharField(max_length=150)
    salary = models.DecimalField(max_digits=12, decimal_places=2)
    hours_per_week = models.DecimalField(max_digits=5, decimal_places=2, default=40)
    employment_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.user.get_full_name() or self.user.username}"


class SalesRecord(TimeStampedModel):
    SOURCE_CHOICES = [
        ("booking", "Booking"),
        ("car_rental", "Car Rental"),
        ("manual", "Manual"),
    ]
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="sales"
    )
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="manual")
    booking_id = models.IntegerField(null=True, blank=True)
    car_rental_id = models.IntegerField(null=True, blank=True)
    booking_count = models.PositiveIntegerField(default=1)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    net_profit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    sale_date = models.DateField()
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.employee} - {self.sale_date}"


class EmployeeTask(TimeStampedModel):
    STATUS_CHOICES = [
        ("todo", "To Do"),
        ("in_progress", "In Progress"),
        ("done", "Done"),
        ("cancelled", "Cancelled"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    task_type = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="todo")
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default="medium")
    due_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.title


class EmployeeSalary(TimeStampedModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("approved", "Approved"),
        ("paid", "Paid"),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="salary_entries")
    salary_type = models.CharField(max_length=120, blank=True, default="")
    period_month = models.DateField()
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    paid_at = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        self.net_amount = (
            Decimal(self.base_amount or 0)
            + Decimal(self.bonus_amount or 0)
            - Decimal(self.deduction_amount or 0)
        )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.employee} - {self.period_month}"


class EmployeeExpense(TimeStampedModel):
    STATUS_CHOICES = [
        ("submitted", "Submitted"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("reimbursed", "Reimbursed"),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="expenses")
    expense_type = models.CharField(max_length=120, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="submitted")
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.employee} - {self.amount}"
