from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0011_voucherreservation_amended_on_voucher_pdf"),
    ]

    operations = [
        migrations.AddField(
            model_name="voucherreservation",
            name="hotel_pdf_previous_snapshot",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Last values shown on hotel voucher before this row was edited (PDF «كان» hints).",
            ),
        ),
    ]
