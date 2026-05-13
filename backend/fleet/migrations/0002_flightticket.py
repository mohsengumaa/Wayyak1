from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_reminder"),
        ("fleet", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FlightTicket",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("passenger_name", models.CharField(max_length=200)),
                ("passport_number", models.CharField(blank=True, max_length=80)),
                ("airline", models.CharField(blank=True, max_length=120)),
                ("ticket_number", models.CharField(blank=True, max_length=120)),
                ("pnr", models.CharField(blank=True, max_length=80)),
                (
                    "trip_type",
                    models.CharField(
                        choices=[("one_way", "One way"), ("round_trip", "Round trip"), ("multi_city", "Multi city")],
                        default="one_way",
                        max_length=20,
                    ),
                ),
                ("departure_airport", models.CharField(max_length=80)),
                ("arrival_airport", models.CharField(max_length=80)),
                ("departure_datetime", models.DateTimeField()),
                ("return_datetime", models.DateTimeField(blank=True, null=True)),
                ("buying_price", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("selling_price", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("currency", models.CharField(default="USD", max_length=3)),
                ("service_fee", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total_price", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("net_profit", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("reserved", "Reserved"),
                            ("issued", "Issued"),
                            ("cancelled", "Cancelled"),
                            ("refunded", "Refunded"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("notes", models.TextField(blank=True)),
                ("booked_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "assigned_employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="flight_tickets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="flight_tickets",
                        to="core.client",
                    ),
                ),
            ],
            options={
                "ordering": ["-departure_datetime", "-id"],
            },
        ),
    ]
