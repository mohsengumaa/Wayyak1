from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_referrer_and_client_link"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Reminder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True)),
                (
                    "reminder_type",
                    models.CharField(
                        choices=[
                            ("payment_hotel", "Payment - Hotel"),
                            ("payment_supplier", "Payment - Supplier"),
                            ("client_followup", "Client Follow-up"),
                            ("booking_followup", "Booking Follow-up"),
                            ("general", "General"),
                        ],
                        default="general",
                        max_length=30,
                    ),
                ),
                ("module", models.CharField(blank=True, max_length=50)),
                ("related_model", models.CharField(blank=True, max_length=80)),
                ("related_object_id", models.PositiveIntegerField(blank=True, null=True)),
                ("target_date", models.DateField()),
                ("remind_days_before", models.PositiveIntegerField(default=0)),
                ("remind_at", models.DateField(db_index=True, editable=False)),
                ("priority", models.CharField(choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")], default="medium", max_length=10)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("done", "Done"), ("cancelled", "Cancelled")], default="pending", max_length=20)),
                ("is_read", models.BooleanField(default=False)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reminders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["status", "remind_at", "target_date", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="reminder",
            index=models.Index(fields=["owner", "status", "remind_at"], name="core_rem_owner_idx"),
        ),
        migrations.AddIndex(
            model_name="reminder",
            index=models.Index(fields=["target_date"], name="core_rem_target_idx"),
        ),
    ]
