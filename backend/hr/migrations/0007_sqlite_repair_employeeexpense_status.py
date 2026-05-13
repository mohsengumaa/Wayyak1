from django.db import migrations


def _table_exists(schema_editor, table_name: str) -> bool:
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        return table_name in connection.introspection.table_names(cursor)


def _ensure_column(schema_editor, table_name: str, column_name: str, column_sql: str) -> None:
    if not _table_exists(schema_editor, table_name):
        return

    connection = schema_editor.connection
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    existing = {col.name for col in description}
    if column_name in existing:
        return
    schema_editor.execute(
        f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {column_sql}'
    )


def repair_employeeexpense_status(apps, schema_editor):
    # Some SQLite databases have partially upgraded hr_employeeexpense schema.
    _ensure_column(
        schema_editor,
        "hr_employeeexpense",
        "status",
        "varchar(20) NOT NULL DEFAULT 'submitted'",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0006_sqlite_repair_hr_task_expense_columns"),
    ]

    operations = [
        migrations.RunPython(repair_employeeexpense_status, migrations.RunPython.noop),
    ]
