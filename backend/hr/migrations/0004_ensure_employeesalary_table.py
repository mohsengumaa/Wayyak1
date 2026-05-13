from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0003_hr_detail_models_and_sales_sync_fields"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS hr_employeesalary (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                salary_type varchar(120) NOT NULL DEFAULT '',
                period_month date NOT NULL,
                base_amount decimal NOT NULL DEFAULT 0,
                bonus_amount decimal NOT NULL DEFAULT 0,
                deduction_amount decimal NOT NULL DEFAULT 0,
                net_amount decimal NOT NULL DEFAULT 0,
                status varchar(20) NOT NULL DEFAULT 'draft',
                paid_at date NULL,
                notes text NOT NULL DEFAULT '',
                employee_id bigint NOT NULL REFERENCES hr_employee (id) DEFERRABLE INITIALLY DEFERRED
            );
            CREATE INDEX IF NOT EXISTS hr_employeesalary_employee_id_idx
                ON hr_employeesalary (employee_id);
            """,
            reverse_sql="""
            DROP INDEX IF EXISTS hr_employeesalary_employee_id_idx;
            DROP TABLE IF EXISTS hr_employeesalary;
            """,
        )
    ]
