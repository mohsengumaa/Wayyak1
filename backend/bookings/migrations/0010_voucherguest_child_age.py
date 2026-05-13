from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0009_alter_voucherguest_salutation"),
    ]

    operations = [
        migrations.AddField(
            model_name="voucherguest",
            name="child_age",
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                help_text="Age in years when salutation is child (chd); shown on guest list PDF.",
            ),
        ),
    ]
