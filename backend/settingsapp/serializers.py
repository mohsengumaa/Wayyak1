from rest_framework import serializers
import re

from .models import AppSetting, DropdownCategory, DropdownOption, PdfAsset


class DropdownOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DropdownOption
        fields = [
            "id",
            "category",
            "label",
            "value",
            "description",
            "color",
            "sort_order",
            "meta",
            "is_active",
        ]


class DropdownCategorySerializer(serializers.ModelSerializer):
    options = DropdownOptionSerializer(many=True, read_only=True)

    class Meta:
        model = DropdownCategory
        fields = ["id", "name", "key", "description", "is_active", "sort_order", "options"]


class AppSettingSerializer(serializers.ModelSerializer):
    SECTION_RE = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
    KEY_RE = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")

    def validate(self, attrs):
        section = str(attrs.get("section", getattr(self.instance, "section", "")) or "").strip().lower()
        key = str(attrs.get("key", getattr(self.instance, "key", "")) or "").strip().lower()
        if not section or not self.SECTION_RE.match(section):
            raise serializers.ValidationError({"section": "Use lowercase slug format: module.section"})
        if not key or not self.KEY_RE.match(key):
            raise serializers.ValidationError({"key": "Use lowercase slug format: field.name or module.section.key"})
        attrs["section"] = section
        attrs["key"] = key
        return attrs

    class Meta:
        model = AppSetting
        fields = ["id", "section", "key", "label", "value", "description", "updated_at"]
        read_only_fields = ["updated_at"]


class PdfAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PdfAsset
        fields = ["id", "name", "file", "url", "created_at"]
        read_only_fields = ["url", "created_at"]

    def get_url(self, obj: PdfAsset) -> str:
        try:
            return obj.file.url
        except Exception:
            return ""
