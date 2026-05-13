from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0008_voucherreservation_hotel_invoice_ref"),
    ]

    operations = [
        migrations.AlterField(
            model_name="voucherguest",
            name="salutation",
            field=models.CharField(
                blank=True,
                choices=[
                    ("mr", "Mr"),
                    ("ms", "Ms"),
                    ("chd", "طفل"),
                    ("inf", "رضيع"),
                ],
                help_text="Shown before guest name on voucher prints.",
                max_length=3,
            ),
        ),
    ]
