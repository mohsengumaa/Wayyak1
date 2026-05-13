from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0005_invoice_payment_hotel"),
        ("expenses", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="account",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="expenses", to="accounting.chartaccount"),
        ),
        migrations.AddField(
            model_name="expense",
            name="branch",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="expenses", to="accounting.branch"),
        ),
        migrations.AddField(
            model_name="expense",
            name="company_name",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="expense",
            name="cost_center",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="expenses", to="accounting.costcenter"),
        ),
        migrations.AddField(
            model_name="expense",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="expense",
            name="expense_type",
            field=models.CharField(choices=[("invoice", "Invoice"), ("rent", "Rent"), ("utilities", "Utilities"), ("salary", "Salary"), ("service", "Service"), ("other", "Other")], default="other", max_length=20),
        ),
        migrations.AddField(
            model_name="expense",
            name="journal_entry",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="expenses", to="accounting.journalentry"),
        ),
        migrations.AddField(
            model_name="expense",
            name="linked_invoice",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="expenses", to="accounting.invoice"),
        ),
        migrations.AddField(
            model_name="expense",
            name="payment_method",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="expense",
            name="payment_status",
            field=models.CharField(choices=[("unpaid", "Unpaid"), ("partial", "Partial"), ("paid", "Paid")], default="unpaid", max_length=10),
        ),
        migrations.AddField(
            model_name="expense",
            name="reference_no",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="expense",
            name="tax_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="expense",
            name="vendor_name",
            field=models.CharField(blank=True, max_length=200),
        ),
    ]
