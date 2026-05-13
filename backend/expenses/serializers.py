from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from .models import Expense, ExpensePayment
from .services import apply_payment_status_change, recalculate_expense_totals


class ExpensePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpensePayment
        fields = ["id", "amount", "paid_at", "notes", "created_at"]


class ExpenseSerializer(serializers.ModelSerializer):
    payments = ExpensePaymentSerializer(many=True, read_only=True)
    initial_paid_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        write_only=True,
        default=Decimal("0"),
    )

    class Meta:
        model = Expense
        fields = [
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
            "created_at",
            "updated_at",
            "payments",
            "initial_paid_amount",
        ]
        read_only_fields = ["journal_entry", "paid_amount"]

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        is_create = instance is None

        amount = attrs.get("amount")
        tax_amount = attrs.get("tax_amount", 0 if is_create else None)
        status = attrs.get("payment_status", "unpaid" if is_create else None)

        if is_create:
            if amount is None:
                return attrs
            tax = Decimal(str(tax_amount or 0))
            total = Decimal(str(amount)) + tax
            stat = str(status or "unpaid")
            initial = Decimal(str(attrs.get("initial_paid_amount", 0) or 0))
            if stat == "partial":
                if total <= 0:
                    raise serializers.ValidationError(
                        {
                            "payment_status": "لا يمكن تسجيل دفع جزئي بدون إجمالي موجب (المبلغ + الضريبة).",
                        }
                    )
                if initial <= 0:
                    raise serializers.ValidationError(
                        {
                            "initial_paid_amount": "أدخل المبلغ المدفوع أولاً (أكبر من صفر) أو اختر «غير مدفوع / مدفوع كاملاً».",
                        }
                    )
                if initial >= total:
                    raise serializers.ValidationError(
                        {
                            "initial_paid_amount": "للحالة الجزئية يجب أن يكون المدفوع أقل من الإجمالي، أو اختر «مدفوع».",
                        }
                    )
            elif stat == "paid" and total <= 0:
                raise serializers.ValidationError(
                    {"payment_status": "لا يمكن تسجيل حالة مدفوع كامل بلا إجمالي موجب."},
                )
            return attrs

        if not is_create and instance:
            base = instance
            am = Decimal(str(attrs["amount"]) if "amount" in attrs else base.amount)
            tx = Decimal(str(attrs["tax_amount"]) if "tax_amount" in attrs else base.tax_amount or 0)
            total = am + tx
            new_status = str(attrs["payment_status"]) if "payment_status" in attrs else base.payment_status

            if base.payments.exists() and ("amount" in attrs or "tax_amount" in attrs):
                paid_sum = base.payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")
                if paid_sum > total:
                    raise serializers.ValidationError(
                        {
                            "amount": "مجموع الدفعات المسجّلة يتجاوز الإجمالي. زِد المبلغ/الضريبة أو اضبط الحالة «غير مدفوع» لمسح الدفعات.",
                        }
                    )
            if new_status == "partial" and total <= 0:
                raise serializers.ValidationError(
                    {
                        "payment_status": "لا يمكن الإبقاء على «جزئي» بدون إجمالي موجب؛ استخدم «غير مدفوع» أو زِد المبلغ.",
                    }
                )
            if new_status == "paid" and total <= 0:
                raise serializers.ValidationError(
                    {"payment_status": "لا يمكن «مدفوع كاملاً» بلا إجمالي موجب."},
                )
        return attrs

    def create(self, validated_data):
        initial = Decimal(str(validated_data.pop("initial_paid_amount", 0) or 0))
        expense = Expense.objects.create(**validated_data)
        total = Decimal(str(expense.amount or 0)) + Decimal(str(expense.tax_amount or 0))
        status = expense.payment_status
        if status == "paid" and total > 0:
            ExpensePayment.objects.create(
                expense=expense,
                amount=total,
                paid_at=expense.date,
                notes="",
            )
        elif status == "partial" and initial > 0:
            cap = min(initial, total)
            ExpensePayment.objects.create(
                expense=expense,
                amount=cap,
                paid_at=expense.date,
                notes="",
            )
        recalculate_expense_totals(expense)
        expense.refresh_from_db()
        return expense

    def update(self, instance, validated_data):
        validated_data.pop("initial_paid_amount", None)
        prev_status = instance.payment_status
        expense = super().update(instance, validated_data)
        new_status = expense.payment_status
        if new_status != prev_status:
            apply_payment_status_change(expense, new_status)
        recalculate_expense_totals(expense)
        expense.refresh_from_db()
        return expense
