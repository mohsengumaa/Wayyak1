from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("fleet", "0002_flightticket"),
    ]

    operations = [
        migrations.AddField(
            model_name="flightticket",
            name="buying_currency",
            field=models.CharField(default="USD", max_length=3),
        ),
        migrations.AddField(
            model_name="flightticket",
            name="selling_currency",
            field=models.CharField(default="USD", max_length=3),
        ),
        migrations.AddField(
            model_name="flightticket",
            name="service_fee_currency",
            field=models.CharField(default="USD", max_length=3),
        ),
    ]
