from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0012_voucherreservation_hotel_pdf_previous_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="voucherreservation",
            name="extras_prices",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Per-extra prices keyed by extra field key, ex: {'extra_bed': {'buying_price': 10, 'selling_price': 15}}",
            ),
        ),
    ]
