from rest_framework import serializers
from django.db import models

from .models import (
    AccountEntry,
    AccountingPeriod,
    Branch,
    ChartAccount,
    CostCenter,
    Invoice,
    InvoiceLine,
    JournalEntry,
    JournalLine,
    LedgerEntry,
    Payment,
    PaymentAllocation,
    TaxCode,
)
from .numbering import assign_invoice_number


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = [
            "id",
            "invoice",
            "description",
            "notes",
            "quantity",
            "unit_price",
            "line_total",
            "tax_code",
            "tax_amount",
            "created_at",
            "updated_at",
        ]


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = [
            "id",
            "date",
            "description",
            "debit",
            "credit",
            "reference_type",
            "reference_id",
            "created_at",
            "updated_at",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    lines = serializers.SerializerMethodField()
    allocated_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    apply_booking_settlement = serializers.BooleanField(default=False, write_only=True)

    def get_lines(self, obj):
        return InvoiceLineSerializer(obj.lines.all(), many=True).data

    def get_allocated_amount(self, obj):
        total = obj.allocations.aggregate(s=models.Sum("amount")).get("s") or 0
        return total

    def get_outstanding_amount(self, obj):
        if obj.status == "paid":
            return 0
        allocated = obj.allocations.aggregate(s=models.Sum("amount")).get("s") or 0
        return max(obj.total_amount - allocated, 0)

    def validate(self, attrs):
        """
        Lock currency/fx_rate once invoice is not draft.
        """
        instance = getattr(self, "instance", None)
        if not instance:
            return attrs

        new_currency = attrs.get("currency", instance.currency)
        new_fx_rate = attrs.get("fx_rate", instance.fx_rate)
        if instance.status != "draft" and (new_currency != instance.currency or str(new_fx_rate) != str(instance.fx_rate)):
            raise serializers.ValidationError({"detail": "لا يمكن تغيير العملة أو سعر الصرف بعد اعتماد/ترحيل الفاتورة."})
        return attrs

    def _apply_booking_settlement(self, inv: Invoice) -> None:
        if inv.doc_type != "ap_bill":
            return
        if inv.business_sector == "hotels" and inv.booking_id and inv.hotel_id:
            from bookings.models import VoucherReservation

            r = VoucherReservation.objects.filter(pk=inv.booking_id, hotel_id=inv.hotel_id).first()
            if r:
                inv.status = "paid"
                inv.save(update_fields=["status", "updated_at"])
        elif inv.business_sector == "aviation" and inv.flight_ticket_id:
            from fleet.models import FlightTicket

            if FlightTicket.objects.filter(pk=inv.flight_ticket_id).exists():
                inv.status = "paid"
                inv.save(update_fields=["status", "updated_at"])

    def create(self, validated_data):
        apply_settlement = validated_data.pop("apply_booking_settlement", False)
        inv = Invoice(**validated_data)
        assign_invoice_number(inv)
        inv.save()
        if apply_settlement:
            self._apply_booking_settlement(inv)
        return inv

    class Meta:
        model = Invoice
        extra_kwargs = {
            "number": {"required": False, "allow_blank": True},
        }
        fields = [
            "id",
            "number",
            "doc_type",
            "client",
            "supplier",
            "hotel",
            "booking_id",
            "car_rental_id",
            "business_sector",
            "supplier_document_ref",
            "flight_ticket_id",
            "issue_date",
            "due_date",
            "total_amount",
            "currency",
            "fx_rate",
            "status",
            "notes",
            "lines",
            "allocated_amount",
            "outstanding_amount",
            "apply_booking_settlement",
            "created_at",
            "updated_at",
        ]


class PaymentAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentAllocation
        fields = ["id", "payment", "invoice", "amount", "created_at", "updated_at"]


class PaymentSerializer(serializers.ModelSerializer):
    allocations = PaymentAllocationSerializer(many=True, read_only=True)

    def validate(self, attrs):
        """
        Lock currency/fx_rate once payment is posted.
        """
        instance = getattr(self, "instance", None)
        if not instance:
            return attrs

        new_currency = attrs.get("currency", instance.currency)
        new_fx_rate = attrs.get("fx_rate", instance.fx_rate)
        if instance.status != "draft" and (new_currency != instance.currency or str(new_fx_rate) != str(instance.fx_rate)):
            raise serializers.ValidationError({"detail": "لا يمكن تغيير العملة أو سعر الصرف بعد ترحيل الدفعة."})
        return attrs

    class Meta:
        model = Payment
        fields = [
            "id",
            "direction",
            "client",
            "supplier",
            "hotel",
            "payment_date",
            "currency",
            "fx_rate",
            "amount",
            "reference",
            "status",
            "notes",
            "allocations",
            "created_at",
            "updated_at",
        ]

class AccountEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountEntry
        fields = [
            "id",
            "entry_type",
            "amount",
            "due_date",
            "status",
            "reference_type",
            "reference_id",
            "created_at",
            "updated_at",
        ]


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]


class ChartAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChartAccount
        fields = ["id", "code", "name", "account_type", "parent", "is_active", "created_at", "updated_at"]


class AccountingPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountingPeriod
        fields = ["id", "name", "start_date", "end_date", "status", "created_at", "updated_at"]


class TaxCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCode
        fields = ["id", "code", "name", "rate", "is_inclusive", "is_active", "created_at", "updated_at"]


class JournalLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalLine
        fields = [
            "id",
            "entry",
            "account",
            "description",
            "debit",
            "credit",
            "currency",
            "fx_rate",
            "client",
            "cost_center",
            "tax_code",
            "created_at",
            "updated_at",
        ]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)

    class Meta:
        model = JournalEntry
        fields = [
            "id",
            "entry_date",
            "period",
            "description",
            "reference_type",
            "reference_id",
            "status",
            "branch",
            "lines",
            "created_at",
            "updated_at",
        ]
