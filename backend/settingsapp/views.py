from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.invoice_pdf import render_invoice_pdf
from bookings.voucher_pdf import render_voucher_pdf

from core.mixins import AuditModelViewSetMixin, ImportExportModelViewSetMixin
from .models import AppSetting, DropdownCategory, DropdownOption, PdfAsset
from .serializers import (
    AppSettingSerializer,
    DropdownCategorySerializer,
    DropdownOptionSerializer,
    PdfAssetSerializer,
)


class DropdownCategoryViewSet(AuditModelViewSetMixin, ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = DropdownCategory.objects.prefetch_related("options").all()
    serializer_class = DropdownCategorySerializer
    permission_classes = [IsAuthenticated]
    export_fields = ["id", "name", "key", "description", "is_active", "sort_order"]
    filterset_fields = ["key", "is_active"]
    search_fields = ["name", "key", "description"]
    ordering_fields = ["sort_order", "name", "key"]


class DropdownOptionViewSet(AuditModelViewSetMixin, ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = DropdownOption.objects.select_related("category").all()
    serializer_class = DropdownOptionSerializer
    permission_classes = [IsAuthenticated]
    export_fields = [
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
    filterset_fields = ["category", "category__key", "is_active"]
    search_fields = ["label", "value", "description", "category__name", "category__key"]
    ordering_fields = ["sort_order", "label", "value", "category"]


class AppSettingViewSet(AuditModelViewSetMixin, ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = AppSetting.objects.all()
    serializer_class = AppSettingSerializer
    permission_classes = [IsAuthenticated]
    export_fields = ["id", "section", "key", "label", "value", "description"]
    filterset_fields = ["section", "key"]
    search_fields = ["section", "key", "label", "description", "value"]
    ordering_fields = ["section", "key", "updated_at"]

    @action(detail=False, methods=["get"], url_path="snapshot-export")
    def snapshot_export(self, request):
        section = (request.query_params.get("section") or "").strip()
        rows = self.get_queryset()
        if section:
            rows = rows.filter(section=section)
        payload = [
            {
                "section": row.section,
                "key": row.key,
                "label": row.label,
                "value": row.value,
                "description": row.description,
            }
            for row in rows.order_by("section", "key")
        ]
        return Response({"count": len(payload), "section": section or "all", "rows": payload})

    @action(detail=False, methods=["post"], url_path="snapshot-import")
    def snapshot_import(self, request):
        rows = (request.data or {}).get("rows") if hasattr(request, "data") else None
        mode = ((request.data or {}).get("mode") if hasattr(request, "data") else None) or "upsert"
        section = ((request.data or {}).get("section") if hasattr(request, "data") else None) or ""
        if not isinstance(rows, list):
            return Response({"detail": "rows must be a list."}, status=400)
        if mode not in {"upsert", "replace"}:
            return Response({"detail": "mode must be upsert or replace."}, status=400)

        if mode == "replace" and section:
            AppSetting.objects.filter(section=section).delete()

        created = 0
        updated = 0
        for item in rows:
            if not isinstance(item, dict):
                continue
            row_section = str(item.get("section") or section or "").strip()
            row_key = str(item.get("key") or "").strip()
            if not row_section or not row_key:
                continue
            defaults = {
                "label": str(item.get("label") or "").strip(),
                "value": str(item.get("value") or ""),
                "description": str(item.get("description") or "").strip(),
            }
            _, was_created = AppSetting.objects.update_or_create(
                section=row_section,
                key=row_key,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                updated += 1
        return Response({"created": created, "updated": updated, "mode": mode, "section": section or "mixed"})

    @action(detail=False, methods=["post"], url_path="reset-section")
    def reset_section(self, request):
        section = str((request.data or {}).get("section") if hasattr(request, "data") else "").strip()
        if not section:
            return Response({"detail": "section is required."}, status=400)
        deleted, _ = AppSetting.objects.filter(section=section).delete()
        return Response({"section": section, "deleted": deleted})


class PdfAssetViewSet(AuditModelViewSetMixin, ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = PdfAsset.objects.all()
    serializer_class = PdfAssetSerializer
    permission_classes = [IsAuthenticated]
    export_fields = ["id", "name", "file", "created_at"]
    filterset_fields = ["name"]
    search_fields = ["name"]
    ordering_fields = ["created_at", "id", "name"]


def _preview_fake_voucher():
    """In-memory placeholder — لوحة الإعدادات تعرض PDF بدون قسيمة حقيقية."""

    class _ResQS:
        def order_by(self, *args):
            return self

        def first(self):
            return None

        def __iter__(self):
            return iter(())

    class _Reservations:
        def all(self):
            return _ResQS()

    class _GuestSlice:
        def __init__(self, rows):
            self._rows = rows

        def order_by(self, *args):
            return self

        def __getitem__(self, s):
            if isinstance(s, slice):
                return self._rows[s]
            return self._rows[s]

    class _Guests:
        def __init__(self):
            self._rows = [
                SimpleNamespace(full_name="معاينة بالغ", is_leader=True, salutation="mr"),
                SimpleNamespace(full_name="معاينة طفل", is_leader=False, salutation="chd"),
            ]

        def all(self):
            return _GuestSlice(self._rows)

    return SimpleNamespace(
        voucher_nr="PREVIEW",
        issued_at=timezone.now(),
        client_name="عميل معاينة",
        client_title="mr",
        adult_count=2,
        child_count=1,
        infant_count=0,
        transfer_fee=25.0,
        handling_fee_total=15.0,
        total_pax=4,
        client=None,
        referrer=SimpleNamespace(referrer_code="REF-DEMO", name="محيل تجريبي"),
        reservations=_Reservations(),
        guests=_Guests(),
    )


def _preview_fake_invoice():
    return SimpleNamespace(
        number="PREVIEW-INV-001",
        issue_date=date.today(),
        due_date=date.today(),
        total_amount=Decimal("249.00"),
        currency="USD",
        status="draft",
        doc_type="ar_invoice",
        notes="نص تجريبي للمعاينة.",
        fx_rate=Decimal("1"),
        business_sector="hotels",
        client=SimpleNamespace(name="عميل معاينة"),
        supplier=None,
        hotel=None,
        lines=SimpleNamespace(all=lambda: []),
    )


class PdfSettingsPreviewView(APIView):
    """معاينة PDF حسب إعدادات التطبيق المحفوظة (بيانات نموذجية فقط)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw = (request.GET.get("kind") or "voucher_customer").strip().lower().replace("-", "_")
        lang = (request.GET.get("lang") or "ar").strip().lower()

        if raw == "global":
            raw = "voucher_customer"

        if raw in ("voucher_customer", "voucher_hotel"):
            return render_voucher_pdf(
                voucher=_preview_fake_voucher(),
                template="hotel" if raw == "voucher_hotel" else "customer",
                payment_box_override=None,
                inline=True,
                lang=lang,
            )

        if raw == "invoice":
            return render_invoice_pdf(invoice=_preview_fake_invoice(), inline=True, lang=lang)

        return Response(
            {"detail": "Unsupported preview kind. Use voucher_customer, voucher_hotel, invoice, or global."},
            status=400,
        )
