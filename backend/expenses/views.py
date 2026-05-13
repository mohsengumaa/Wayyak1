from decimal import Decimal

from django.db.models import Prefetch, Sum
from django.utils.dateparse import parse_date
from rest_framework import serializers
from rest_framework import status as http_status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from core.mixins import ImportExportModelViewSetMixin
from .models import Expense, ExpensePayment
from .posting import post_expense
from .serializers import ExpenseSerializer
from .services import ensure_legacy_paid_migrated, recalculate_expense_totals


class ExpenseViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = (
        Expense.objects.select_related(
            "category",
            "linked_invoice",
            "account",
            "branch",
            "cost_center",
            "journal_entry",
        )
        .prefetch_related(
            Prefetch("payments", queryset=ExpensePayment.objects.order_by("-paid_at", "-id"))
        )
    )
    serializer_class = ExpenseSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "category",
        "expense_type",
        "company_name",
        "vendor_name",
        "reference_no",
        "amount",
        "tax_amount",
        "paid_amount",
        "date",
        "due_date",
        "payment_status",
        "payment_method",
        "linked_invoice",
        "account",
        "branch",
        "cost_center",
        "journal_entry",
        "notes",
    ]
    filterset_fields = ["category", "expense_type", "payment_status", "company_name", "branch", "cost_center"]

    def perform_create(self, serializer):
        exp = serializer.save()
        try:
            post_expense(exp.id)
        except ValueError as e:
            raise serializers.ValidationError({"detail": str(e)})

    def perform_update(self, serializer):
        exp = serializer.save()
        try:
            post_expense(exp.id)
        except ValueError as e:
            raise serializers.ValidationError({"detail": str(e)})

    def perform_destroy(self, instance):
        journal_entry = instance.journal_entry
        super().perform_destroy(instance)
        if journal_entry:
            journal_entry.delete()

    @action(detail=True, methods=["post"], url_path="record-payment")
    def record_payment(self, request, pk=None):
        expense = self.get_object()
        raw = request.data.get("amount")
        try:
            amt = Decimal(str(raw if raw not in (None, "") else 0))
        except Exception:
            return Response({"amount": ["مبلغ غير صالح."]}, status=http_status.HTTP_400_BAD_REQUEST)
        if amt <= 0:
            return Response(
                {"amount": ["أدخل مبلغاً أكبر من صفر."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        ensure_legacy_paid_migrated(expense)
        expense.refresh_from_db()
        total = Decimal(str(expense.amount or 0)) + Decimal(str(expense.tax_amount or 0))
        paid_so_far = expense.payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")
        remaining = total - paid_so_far
        if remaining <= 0:
            return Response(
                {"detail": "لا يوجد رصيد متبقٍ على هذا المصروف."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if amt > remaining:
            return Response(
                {"amount": [f"المبلغ يتجاوز المتبقي ({remaining})."]},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        paid_at_raw = request.data.get("paid_at")
        if paid_at_raw:
            parsed = parse_date(str(paid_at_raw).strip()[:10])
            paid_at = parsed if parsed else timezone.now().date()
        else:
            paid_at = timezone.now().date()
        notes = str(request.data.get("notes", "") or "")[:500]

        ExpensePayment.objects.create(
            expense=expense,
            amount=amt,
            paid_at=paid_at,
            notes=notes,
        )
        recalculate_expense_totals(expense)
        expense.refresh_from_db()
        try:
            post_expense(expense.id)
        except ValueError as e:
            raise serializers.ValidationError({"detail": str(e)})

        ser = ExpenseSerializer(expense)
        return Response(ser.data, status=http_status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="register/pdf")
    def register_pdf(self, request):
        from .report_pdf import render_expenses_register_pdf

        return render_expenses_register_pdf(request)
