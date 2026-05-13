from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="department",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
