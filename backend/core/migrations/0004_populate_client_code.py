from django.db import migrations, models


def populate_client_codes(apps, schema_editor):
    Client = apps.get_model("core", "Client")
    for client in Client.objects.filter(client_code__isnull=True).order_by("id"):
        client.client_code = f"C{client.id:06d}"
        client.save(update_fields=["client_code"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_client_client_code_clientdocument"),
    ]

    operations = [
        migrations.RunPython(populate_client_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="client",
            name="client_code",
            field=models.CharField(max_length=30, unique=True),
        ),
    ]
