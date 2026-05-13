from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0010_voucherguest_child_age"),
    ]

    operations = [
        migrations.AddField(
            model_name="voucherreservation",
            name="amended_on_voucher_pdf",
            field=models.BooleanField(
                default=False,
                help_text="True after this reservation row is updated via API; voucher PDF shows معدل.",
            ),
        ),
    ]
