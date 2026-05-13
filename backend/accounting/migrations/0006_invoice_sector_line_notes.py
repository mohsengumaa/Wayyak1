from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0005_invoice_payment_hotel"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceline",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="invoice",
            name="business_sector",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "—"),
                    ("hotels", "Hotels / فنادق"),
                    ("aviation", "Aviation / طيران"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="supplier_document_ref",
            field=models.CharField(
                blank=True,
                help_text="رقم الفاتورة على أصل المستند الوارد من الفندق أو شركة الطيران",
                max_length=120,
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="flight_ticket_id",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
