from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0002_employee_department"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="employment_status",
            field=models.CharField(
                choices=[("active", "Active"), ("on_leave", "On Leave"), ("inactive", "Inactive")],
                default="active",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="employee",
            name="monthly_salary",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="employee",
            name="notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="salesrecord",
            name="booking_count",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="salesrecord",
            name="gross_amount",
            field=models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12),
        ),
        migrations.AddField(
            model_name="salesrecord",
            name="notes",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="salesrecord",
            name="source_type",
            field=models.CharField(
                choices=[("booking", "Booking"), ("car_rental", "Car Rental"), ("manual", "Manual")],
                default="manual",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="EmployeeExpense",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("expense_type", models.CharField(blank=True, default="", max_length=120)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("expense_date", models.DateField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("submitted", "Submitted"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                            ("reimbursed", "Reimbursed"),
                        ],
                        default="submitted",
                        max_length=20,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                (
                    "employee",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="expenses", to="hr.employee"),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.CreateModel(
            name="EmployeeSalary",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("salary_type", models.CharField(blank=True, default="", max_length=120)),
                ("period_month", models.DateField()),
                ("base_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("bonus_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("deduction_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("net_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("approved", "Approved"), ("paid", "Paid")],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("paid_at", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="salary_entries",
                        to="hr.employee",
                    ),
                ),
            ],
            options={"abstract": False},
        ),
        migrations.CreateModel(
            name="EmployeeTask",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=200)),
                ("task_type", models.CharField(blank=True, default="", max_length=120)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("todo", "To Do"),
                            ("in_progress", "In Progress"),
                            ("done", "Done"),
                            ("cancelled", "Cancelled"),
                        ],
                        default="todo",
                        max_length=20,
                    ),
                ),
                (
                    "priority",
                    models.CharField(
                        choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")],
                        default="medium",
                        max_length=20,
                    ),
                ),
                ("due_date", models.DateField(blank=True, null=True)),
                ("description", models.TextField(blank=True)),
                (
                    "employee",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tasks", to="hr.employee"),
                ),
            ],
            options={"abstract": False},
        ),
    ]
