from rest_framework import serializers

from .models import Employee, EmployeeExpense, EmployeeSalary, EmployeeTask, SalesRecord


class EmployeeSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Employee
        fields = [
            "id",
            "user",
            "user_username",
            "department",
            "position",
            "salary",
            "hours_per_week",
            "employment_status",
            "monthly_salary",
            "notes",
            "created_at",
            "updated_at",
        ]


class SalesRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.user.username", read_only=True)

    class Meta:
        model = SalesRecord
        fields = [
            "id",
            "employee",
            "employee_name",
            "source_type",
            "booking_id",
            "car_rental_id",
            "booking_count",
            "gross_amount",
            "net_profit",
            "sale_date",
            "notes",
            "created_at",
            "updated_at",
        ]


class EmployeeTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeTask
        fields = [
            "id",
            "employee",
            "title",
            "task_type",
            "status",
            "priority",
            "due_date",
            "description",
            "created_at",
            "updated_at",
        ]


class EmployeeSalarySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeSalary
        fields = [
            "id",
            "employee",
            "salary_type",
            "period_month",
            "base_amount",
            "bonus_amount",
            "deduction_amount",
            "net_amount",
            "status",
            "paid_at",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["net_amount"]


class EmployeeExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeExpense
        fields = [
            "id",
            "employee",
            "expense_type",
            "amount",
            "expense_date",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]
