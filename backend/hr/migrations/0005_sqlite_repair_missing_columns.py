from django.db import migrations


def _ensure_column(schema_editor, table_name: str, column_name: str, column_sql: str) -> None:
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    existing = {col.name for col in description}
    if column_name in existing:
        return
    schema_editor.execute(
        f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_sql}'
    )


def repair_hr_columns(apps, schema_editor):
    # Repair partial/faked migrations on SQLite by adding any missing columns.
    _ensure_column(
        schema_editor,
        "hr_employee",
        "employment_status",
        "varchar(20) NOT NULL DEFAULT 'active'",
    )
    _ensure_column(
        schema_editor,
        "hr_employee",
        "monthly_salary",
        "decimal NOT NULL DEFAULT 0",
    )
    _ensure_column(
        schema_editor,
        "hr_employee",
        "notes",
        "text NOT NULL DEFAULT ''",
    )

    _ensure_column(
        schema_editor,
        "hr_salesrecord",
        "source_type",
        "varchar(20) NOT NULL DEFAULT 'manual'",
    )
    _ensure_column(
        schema_editor,
        "hr_salesrecord",
        "booking_count",
        "integer NOT NULL DEFAULT 1",
    )
    _ensure_column(
        schema_editor,
        "hr_salesrecord",
        "gross_amount",
        "decimal NOT NULL DEFAULT 0",
    )
    _ensure_column(
        schema_editor,
        "hr_salesrecord",
        "notes",
        "text NOT NULL DEFAULT ''",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0004_ensure_employeesalary_table"),
    ]

    operations = [
        migrations.RunPython(repair_hr_columns, migrations.RunPython.noop),
    ]
