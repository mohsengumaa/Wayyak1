import re

from rest_framework import serializers

from .models import Client, ClientDocument, ExchangeRate, Referrer, Reminder, Supplier


class ReferrerSerializer(serializers.ModelSerializer):
    def _generate_referrer_code(self) -> str:
        codes = Referrer.objects.filter(referrer_code__regex=r"^R\d+$").values_list(
            "referrer_code", flat=True
        )
        max_number = 0
        for code in codes:
            match = re.search(r"\d+$", code)
            if match:
                max_number = max(max_number, int(match.group()))
        return f"R{max_number + 1:06d}"

    def create(self, validated_data):
        code = (validated_data.get("referrer_code") or "").strip()
        if not code:
            validated_data["referrer_code"] = self._generate_referrer_code()
        return super().create(validated_data)

    class Meta:
        model = Referrer
        fields = [
            "id",
            "referrer_code",
            "name",
            "phone",
            "email",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ReferrerMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Referrer
        fields = ["id", "referrer_code", "name", "phone"]


class ClientDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientDocument
        fields = ["id", "file", "label", "created_at"]


class ClientSerializer(serializers.ModelSerializer):
    documents = ClientDocumentSerializer(many=True, read_only=True)
    referrer = serializers.PrimaryKeyRelatedField(
        queryset=Referrer.objects.all(),
        allow_null=True,
        required=False,
    )
    referrer_display = ReferrerMinimalSerializer(source="referrer", read_only=True)

    def _generate_client_code(self) -> str:
        codes = Client.objects.filter(client_code__regex=r"^C\d+$").values_list(
            "client_code", flat=True
        )
        max_number = 0
        for code in codes:
            match = re.search(r"\d+$", code)
            if match:
                max_number = max(max_number, int(match.group()))
        return f"C{max_number + 1:06d}"

    def create(self, validated_data):
        client_code = (validated_data.get("client_code") or "").strip()
        if not client_code:
            validated_data["client_code"] = self._generate_client_code()
        return super().create(validated_data)

    class Meta:
        model = Client
        fields = [
            "id",
            "client_code",
            "name",
            "email",
            "phone",
            "balance",
            "referrer",
            "referrer_display",
            "documents",
            "created_at",
            "updated_at",
        ]


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "base_currency", "quote_currency", "rate", "rate_date", "source", "rate_type"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "supplier_code", "name", "email", "phone", "balance", "created_at", "updated_at"]


class ReminderSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source="owner.username", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    is_due = serializers.SerializerMethodField()
    days_until_target = serializers.SerializerMethodField()

    class Meta:
        model = Reminder
        fields = [
            "id",
            "owner",
            "owner_username",
            "created_by",
            "created_by_username",
            "title",
            "description",
            "reminder_type",
            "module",
            "related_model",
            "related_object_id",
            "target_date",
            "remind_days_before",
            "remind_at",
            "priority",
            "status",
            "is_read",
            "is_due",
            "days_until_target",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "remind_at", "is_due", "days_until_target"]
        extra_kwargs = {"owner": {"required": False}}

    def get_is_due(self, obj):
        from django.utils import timezone

        return obj.status == "pending" and obj.remind_at <= timezone.now().date()

    def get_days_until_target(self, obj):
        from django.utils import timezone

        return (obj.target_date - timezone.now().date()).days
