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


def repair_hr_task_expense_columns(apps, schema_editor):
    # Repair partial/faked migrations by adding any missing HR detail columns.
    _ensure_column(
        schema_editor,
        "hr_employeetask",
        "task_type",
        "varchar(120) NOT NULL DEFAULT ''",
    )
    _ensure_column(
        schema_editor,
        "hr_employeeexpense",
        "expense_type",
        "varchar(120) NOT NULL DEFAULT ''",
    )
    _ensure_column(
        schema_editor,
        "hr_employeeexpense",
        "expense_date",
        "date NOT NULL DEFAULT '2000-01-01'",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0005_sqlite_repair_missing_columns"),
    ]

    operations = [
        migrations.RunPython(repair_hr_task_expense_columns, migrations.RunPython.noop),
    ]
