import io
import json
from datetime import date, datetime, time

from django.db import models
from django.http import HttpResponse
from django.utils import timezone as dj_timezone
from openpyxl import Workbook, load_workbook
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from decimal import Decimal

from core.models import AuditLog


class ImportExportModelViewSetMixin:
    export_fields: list[str] = []
    import_fields: list[str] = []

    def _get_fields(self) -> list[str]:
        if self.export_fields:
            return self.export_fields
        return [field.name for field in self.queryset.model._meta.fields]

    def _export_cell_value(self, obj, field_name: str):
        model_cls = self.queryset.model
        try:
            model_field = model_cls._meta.get_field(field_name)
        except Exception:
            model_field = None

        # Export FK fields as raw ids so Excel receives scalar values.
        if isinstance(model_field, models.ForeignKey):
            val = getattr(obj, model_field.attname, None)
        else:
            val = getattr(obj, field_name, None)

        if isinstance(val, models.Model):
            val = getattr(val, "pk", str(val))
        elif isinstance(val, datetime):
            if dj_timezone.is_aware(val):
                val = dj_timezone.make_naive(val, dj_timezone.get_current_timezone())
            # Keep export deterministic and Excel-safe.
            val = val.strftime("%Y-%m-%d %H:%M:%S")
        elif isinstance(val, date):
            val = val.isoformat()
        elif isinstance(val, time):
            if val.tzinfo is not None:
                val = val.replace(tzinfo=None)
            val = val.strftime("%H:%M:%S")
        elif isinstance(val, (bytes, bytearray)):
            try:
                val = bytes(val).decode("utf-8")
            except Exception:
                val = bytes(val).hex()
        elif isinstance(val, Decimal):
            val = str(val)
        elif isinstance(val, (dict, list)):
            val = json.dumps(val, ensure_ascii=False)
        elif val is None or isinstance(val, (str, int, float, bool)):
            pass
        else:
            val = str(val)
        return val

    @action(detail=False, methods=["get"])
    def export(self, request):
        fields = self._get_fields()
        wb = Workbook()
        ws = wb.active
        ws.append(fields)
        for obj in self.get_queryset():
            row = []
            for f in fields:
                row.append(self._export_cell_value(obj, f))
            ws.append(row)

        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        response = HttpResponse(
            stream.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="export.xlsx"'
        return response

    @action(detail=False, methods=["post"])
    def import_xlsx(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"detail": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        wb = load_workbook(file_obj)
        ws = wb.active
        headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
        fields = self.import_fields or headers

        created = 0
        for row in ws.iter_rows(min_row=2, values_only=True):
            data = dict(zip(headers, row))
            payload = {field: data.get(field) for field in fields}
            payload = {k: v for k, v in payload.items() if v is not None}
            self.queryset.model.objects.create(**payload)
            created += 1

        return Response({"created": created})


class AuditModelViewSetMixin:
    """
    Lightweight immutable audit trail for create/update/delete operations.
    """

    audit_exclude_fields: set[str] = {"created_at", "updated_at"}

    def _audit_ip(self, request) -> str:
        xff = request.META.get("HTTP_X_FORWARDED_FOR")
        if xff:
            return xff.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "") or ""

    def _audit_snapshot(self, instance):
        data = {}
        for field in instance._meta.fields:
            name = field.name
            if name in self.audit_exclude_fields:
                continue
            # For relations store the *_id, not the related object
            if isinstance(field, models.ForeignKey):
                val = getattr(instance, field.attname, None)
            else:
                val = getattr(instance, name, None)

            if isinstance(val, Decimal):
                val = str(val)
            if hasattr(val, "isoformat"):
                try:
                    val = val.isoformat()
                except Exception:
                    pass
            data[name] = val
        return data

    def _audit_log(self, request, *, action: str, instance, before, after):
        user = getattr(request, "user", None)
        actor = user if user and getattr(user, "is_authenticated", False) else None
        AuditLog.objects.create(
            actor=actor,
            action=action,
            model_label=f"{instance._meta.app_label}.{instance.__class__.__name__}",
            object_id=str(instance.pk),
            before=before,
            after=after,
            ip_address=self._audit_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "") or "")[:255],
        )

    def perform_create(self, serializer):
        obj = serializer.save()
        self._audit_log(self.request, action="create", instance=obj, before=None, after=self._audit_snapshot(obj))

    def perform_update(self, serializer):
        obj = self.get_object()
        before = self._audit_snapshot(obj)
        obj = serializer.save()
        self._audit_log(self.request, action="update", instance=obj, before=before, after=self._audit_snapshot(obj))

    def perform_destroy(self, instance):
        before = self._audit_snapshot(instance)
        pk = instance.pk
        model = instance.__class__
        super().perform_destroy(instance)
        # create a tombstone audit record
        AuditLog.objects.create(
            actor=self.request.user if getattr(self.request.user, "is_authenticated", False) else None,
            action="delete",
            model_label=f"{model._meta.app_label}.{model.__name__}",
            object_id=str(pk),
            before=before,
            after=None,
            ip_address=self._audit_ip(self.request),
            user_agent=(self.request.META.get("HTTP_USER_AGENT", "") or "")[:255],
        )
