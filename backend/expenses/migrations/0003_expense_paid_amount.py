from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("expenses", "0002_expense_accounting_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="paid_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
    ]
