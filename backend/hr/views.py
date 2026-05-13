from django.contrib.auth import get_user_model
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from core.mixins import ImportExportModelViewSetMixin
from .models import Employee, EmployeeExpense, EmployeeSalary, EmployeeTask, SalesRecord
from .serializers import (
    EmployeeExpenseSerializer,
    EmployeeSalarySerializer,
    EmployeeSerializer,
    EmployeeTaskSerializer,
    SalesRecordSerializer,
)

User = get_user_model()


class EmployeeViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Employee.objects.select_related("user")
    serializer_class = EmployeeSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "user",
        "department",
        "position",
        "salary",
        "hours_per_week",
        "employment_status",
        "monthly_salary",
        "notes",
    ]

    @action(detail=False, methods=["get"], url_path="user-options")
    def user_options(self, request):
        employee_user_ids = set(Employee.objects.values_list("user_id", flat=True))
        rows = (
            User.objects.filter(is_active=True, is_superuser=False)
            .order_by("username")
            .values("id", "username", "first_name", "last_name")
        )
        payload = [
            {
                "id": row["id"],
                "username": row["username"],
                "full_name": f'{row["first_name"]} {row["last_name"]}'.strip(),
                "has_employee_profile": row["id"] in employee_user_ids,
            }
            for row in rows
        ]
        return Response(payload)


class SalesRecordViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = SalesRecord.objects.select_related("employee", "employee__user")
    serializer_class = SalesRecordSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "employee",
        "source_type",
        "booking_id",
        "car_rental_id",
        "booking_count",
        "gross_amount",
        "net_profit",
        "sale_date",
        "notes",
    ]
    filterset_fields = ["employee", "source_type", "sale_date"]

    @action(detail=False, methods=["post"], url_path="sync-from-sources")
    def sync_from_sources(self, request):
        from .signals import sync_booking_sales_record, sync_car_rental_sales_record
        from bookings.models import Booking
        from fleet.models import CarRental

        booking_rows = 0
        car_rows = 0
        for booking in Booking.objects.select_related("assigned_employee").all():
            sync_booking_sales_record(booking)
            booking_rows += 1
        for rental in CarRental.objects.select_related("assigned_employee").all():
            sync_car_rental_sales_record(rental)
            car_rows += 1
        return Response({"synced_bookings": booking_rows, "synced_car_rentals": car_rows})


class EmployeeTaskViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = EmployeeTask.objects.select_related("employee", "employee__user")
    serializer_class = EmployeeTaskSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "employee", "title", "task_type", "status", "priority", "due_date"]
    filterset_fields = ["employee", "status", "task_type", "priority"]


class EmployeeSalaryViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = EmployeeSalary.objects.select_related("employee", "employee__user")
    serializer_class = EmployeeSalarySerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
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
    ]
    filterset_fields = ["employee", "salary_type", "status", "period_month"]


class EmployeeExpenseViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = EmployeeExpense.objects.select_related("employee", "employee__user")
    serializer_class = EmployeeExpenseSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "employee", "expense_type", "amount", "expense_date", "status", "notes"]
    filterset_fields = ["employee", "expense_type", "status", "expense_date"]
