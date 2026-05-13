from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0007_voucherguest_salutation"),
    ]

    operations = [
        migrations.AddField(
            model_name="voucherreservation",
            name="hotel_invoice_ref",
            field=models.CharField(
                blank=True,
                help_text="رقم فاتورة الفندق كما يصدر من الأوتيل (مرجع خارجي، ليس رقم سند المحاسبة).",
                max_length=120,
                verbose_name="Hotel invoice ref",
            ),
        ),
    ]
