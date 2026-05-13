from datetime import timedelta
from decimal import Decimal
from urllib.error import HTTPError, URLError

from django.db.models import Count, Sum
from django.conf import settings
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import RoleBasedPermission
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from accounting.models import Invoice, Payment
from bookings.models import Booking
from expenses.models import Expense
from fleet.models import CarRental
from hr.models import SalesRecord
from hotels.models import Hotel

from .mixins import ImportExportModelViewSetMixin
from .models import Client, ClientDocument, ExchangeRate, Referrer, Reminder, Supplier
from .serializers import (
    ClientDocumentSerializer,
    ClientSerializer,
    ExchangeRateSerializer,
    ReferrerSerializer,
    ReminderSerializer,
    SupplierSerializer,
)
from .tcmb import sync_tcmb_rates, TCMB_SOURCE, RATE_TYPE_FOREX_SELLING


class ReferrerViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Referrer.objects.all()
    serializer_class = ReferrerSerializer
    permission_classes = [IsAuthenticated]
    export_fields = ["id", "referrer_code", "name", "phone", "email", "notes", "is_active"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """Per-referrer aggregates: clients, bookings, rentals, invoices, receipts."""
        rows = []
        for r in Referrer.objects.all().order_by("referrer_code"):
            clients_qs = Client.objects.filter(referrer=r)
            if not clients_qs.exists():
                rows.append(
                    {
                        "id": r.id,
                        "referrer_code": r.referrer_code,
                        "name": r.name,
                        "phone": r.phone,
                        "email": r.email,
                        "is_active": r.is_active,
                        "clients_count": 0,
                        "bookings_count": 0,
                        "bookings_total": "0",
                        "rentals_count": 0,
                        "rentals_total": "0",
                        "invoices_count": 0,
                        "invoices_total": "0",
                        "payments_received": "0",
                    }
                )
                continue

            client_ids = clients_qs.values_list("id", flat=True)
            clients_count = clients_qs.count()

            bookings = Booking.objects.filter(client_id__in=client_ids).exclude(status="cancelled")
            rentals = CarRental.objects.filter(client_id__in=client_ids)
            invoices = Invoice.objects.filter(client_id__in=client_ids)
            payments = Payment.objects.filter(
                client_id__in=client_ids, direction="receipt", status="posted"
            )

            rows.append(
                {
                    "id": r.id,
                    "referrer_code": r.referrer_code,
                    "name": r.name,
                    "phone": r.phone,
                    "email": r.email,
                    "is_active": r.is_active,
                    "clients_count": clients_count,
                    "bookings_count": bookings.count(),
                    "bookings_total": str(bookings.aggregate(s=Sum("total_price"))["s"] or Decimal("0")),
                    "rentals_count": rentals.count(),
                    "rentals_total": str(rentals.aggregate(s=Sum("total_price"))["s"] or Decimal("0")),
                    "invoices_count": invoices.count(),
                    "invoices_total": str(invoices.aggregate(s=Sum("total_amount"))["s"] or Decimal("0")),
                    "payments_received": str(payments.aggregate(s=Sum("amount"))["s"] or Decimal("0")),
                }
            )
        return Response(rows)

    @action(detail=True, methods=["get"], url_path="accounting-breakdown")
    def accounting_breakdown(self, request, pk=None):
        ref = self.get_object()
        clients_qs = Client.objects.filter(referrer=ref)
        if not clients_qs.exists():
            return Response({"invoices": [], "payments": [], "clients": []})
        client_ids = clients_qs.values_list("id", flat=True)

        invoices = (
            Invoice.objects.filter(client_id__in=client_ids)
            .select_related("client")
            .values(
                "id",
                "number",
                "issue_date",
                "due_date",
                "total_amount",
                "currency",
                "status",
                "doc_type",
                "client_id",
                "booking_id",
                "car_rental_id",
            )
            .order_by("-issue_date", "-id")[:500]
        )
        payments = (
            Payment.objects.filter(client_id__in=client_ids)
            .values(
                "id",
                "direction",
                "payment_date",
                "amount",
                "currency",
                "reference",
                "status",
                "client_id",
            )
            .order_by("-payment_date", "-id")[:500]
        )
        clients = clients_qs.values("id", "client_code", "name", "balance")
        return Response(
            {
                "invoices": list(invoices),
                "payments": list(payments),
                "clients": list(clients),
            }
        )


class ClientViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Client.objects.select_related("referrer").all()
    serializer_class = ClientSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "client_code",
        "name",
        "email",
        "phone",
        "balance",
        "referrer_id",
    ]

    def get_queryset(self):
        queryset = super().get_queryset()
        client_code = self.request.query_params.get("client_code")
        if client_code:
            queryset = queryset.filter(client_code__icontains=client_code)
        return queryset

    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser])
    def documents(self, request, pk=None):
        client = self.get_object()
        if request.method.lower() == "post":
            serializer = ClientDocumentSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(client=client)
        serializer = ClientDocumentSerializer(client.documents.all(), many=True)
        return Response(serializer.data)


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.all().order_by("-rate_date")
    serializer_class = ExchangeRateSerializer
    permission_classes = [RoleBasedPermission]

    @action(detail=False, methods=["post"])
    def sync_tcmb(self, request):
        """
        Trigger TCMB XML FX sync.
        Body (optional):
          - date: YYYY-MM-DD (defaults to today)
        """
        raw = (request.data or {}).get("date") if hasattr(request, "data") else None
        if raw:
            try:
                rate_date = timezone.datetime.strptime(raw, "%Y-%m-%d").date()
            except ValueError:
                return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=400)
        else:
            rate_date = timezone.now().date()

        base = getattr(settings, "BASE_CURRENCY", "TRY")
        requested = str(rate_date)
        try:
            result = sync_tcmb_rates(rate_date, base_currency=base)
        except HTTPError as e:
            return Response({"detail": f"TCMB returned HTTP {e.code}."}, status=502)
        except URLError as e:
            reason = getattr(e, "reason", e)
            return Response({"detail": f"Could not reach TCMB: {reason!s}"}, status=503)

        return Response(
            {
                "base_currency": base,
                "requested_date": requested,
                "rate_date": str(result.rate_date),
                "upserted": result.upserted,
                "skipped": result.skipped,
                "source": TCMB_SOURCE,
                "rate_type": RATE_TYPE_FOREX_SELLING,
            }
        )

    @action(detail=False, methods=["get"])
    def rate(self, request):
        """
        Get a single FX rate for base->quote at date.
        Query params:
          - quote: currency code (e.g. USD)
          - date: YYYY-MM-DD (defaults today)
          - source: (optional) defaults tcmb
          - rate_type: (optional) defaults forex_selling
        """
        quote = (request.query_params.get("quote") or "").upper().strip()
        if not quote:
            return Response({"detail": "quote is required"}, status=400)

        raw = request.query_params.get("date")
        if raw:
            try:
                rate_date = timezone.datetime.strptime(raw, "%Y-%m-%d").date()
            except ValueError:
                return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=400)
        else:
            rate_date = timezone.now().date()

        base = getattr(settings, "BASE_CURRENCY", "TRY")
        source = request.query_params.get("source") or TCMB_SOURCE
        rate_type = request.query_params.get("rate_type") or RATE_TYPE_FOREX_SELLING

        row = (
            ExchangeRate.objects.filter(
                base_currency=base,
                quote_currency=quote,
                rate_date=rate_date,
                source=source,
                rate_type=rate_type,
            )
            .values_list("rate", "rate_date")
            .first()
        )
        auto_synced = False
        if row is None and source == TCMB_SOURCE:
            # Keep TCMB linkage automatic for all consumers of this endpoint.
            try:
                sync_tcmb_rates(rate_date, base_currency=base)
                auto_synced = True
            except (HTTPError, URLError):
                # If TCMB is temporarily unavailable, fallback to latest cached below.
                auto_synced = False
            row = (
                ExchangeRate.objects.filter(
                    base_currency=base,
                    quote_currency=quote,
                    rate_date=rate_date,
                    source=source,
                    rate_type=rate_type,
                )
                .values_list("rate", "rate_date")
                .first()
            )
        if row is None:
            # fallback to latest <= date
            row = (
                ExchangeRate.objects.filter(
                    base_currency=base, quote_currency=quote, rate_date__lte=rate_date, source=source, rate_type=rate_type
                )
                .order_by("-rate_date")
                .values_list("rate", "rate_date")
                .first()
            )
        if row is None:
            return Response({"detail": "Rate not found."}, status=404)
        rate, found_date = row
        return Response(
            {
                "base_currency": base,
                "quote_currency": quote,
                "requested_date": str(rate_date),
                "rate_date": str(found_date),
                "rate": str(rate),
                "source": source,
                "rate_type": rate_type,
                "auto_synced": auto_synced,
            }
        )


class SupplierViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "supplier_code", "name", "email", "phone", "balance"]


class ReminderViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Reminder.objects.select_related("owner", "created_by").all()
    serializer_class = ReminderSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "owner_id",
        "title",
        "reminder_type",
        "module",
        "target_date",
        "remind_days_before",
        "remind_at",
        "priority",
        "status",
        "is_read",
    ]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_superuser:
            return queryset
        return queryset.filter(owner=user)

    def perform_create(self, serializer):
        owner = serializer.validated_data.get("owner") or self.request.user
        if not self.request.user.is_superuser:
            owner = self.request.user
        serializer.save(created_by=self.request.user, owner=owner)

    @action(detail=False, methods=["get"])
    def alerts(self, request):
        today = timezone.now().date()
        horizon = today + timedelta(days=3)
        queryset = self.get_queryset().filter(status="pending", target_date__lte=horizon)
        return Response(
            ReminderSerializer(queryset.order_by("target_date", "remind_at", "-priority"), many=True).data
        )

    @action(detail=True, methods=["post"])
    def mark_done(self, request, pk=None):
        row = self.get_object()
        row.status = "done"
        row.is_read = True
        row.save(update_fields=["status", "is_read", "updated_at"])
        return Response(ReminderSerializer(row).data)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        row = self.get_object()
        row.is_read = True
        row.save(update_fields=["is_read", "updated_at"])
        return Response(ReminderSerializer(row).data)


class DashboardViewSet(viewsets.ViewSet):
    def list(self, request):
        return self.overview(request)

    @action(detail=False, methods=["get"])
    def overview(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)

        revenue = (
            Invoice.objects.filter(status="paid", issue_date__gte=month_start)
            .aggregate(total=Sum("total_amount"))
            .get("total")
            or 0
        )

        top_hotels = (
            Hotel.objects.annotate(bookings_count=Count("bookings"))
            .order_by("-bookings_count")[:5]
            .values("id", "name", "bookings_count")
        )

        car_stats = CarRental.objects.aggregate(
            total_rentals=Count("id"), total_revenue=Sum("total_price")
        )

        employee_perf = (
            SalesRecord.objects.values("employee__id", "employee__user__username")
            .annotate(net_profit=Sum("net_profit"))
            .order_by("-net_profit")[:5]
        )

        upcoming_bookings = (
            Booking.objects.filter(check_in__lte=today + timedelta(days=7))
            .exclude(status="cancelled")
            .values("id", "client__name", "hotel__name", "check_in")
            .order_by("check_in")[:10]
        )

        low_balance_clients = (
            Client.objects.filter(balance__lt=0)
            .values("id", "name", "balance")
            .order_by("balance")[:10]
        )

        horizon = today + timedelta(days=3)
        reminder_queryset = Reminder.objects.filter(status="pending", target_date__lte=horizon)
        if not request.user.is_superuser:
            reminder_queryset = reminder_queryset.filter(owner=request.user)
        reminder_rows = []
        for row in reminder_queryset.order_by("target_date", "remind_at")[:20]:
            reminder_rows.append(
                {
                    "id": row.id,
                    "title": row.title,
                    "reminder_type": row.reminder_type,
                    "target_date": row.target_date,
                    "remind_at": row.remind_at,
                    "priority": row.priority,
                    "status": row.status,
                    "days_until_target": (row.target_date - today).days,
                }
            )

        payable_invoices = list(
            Invoice.objects.filter(
                doc_type="ap_bill",
                status__in=["draft", "sent", "overdue"],
                due_date__isnull=False,
                due_date__lte=horizon,
            )
            .select_related("hotel")
            .order_by("due_date")
            .values("id", "number", "hotel__name", "due_date", "total_amount", "currency")[:20]
        )
        payable_expenses = list(
            Expense.objects.filter(
                payment_status__in=["unpaid", "partial"],
                due_date__isnull=False,
                due_date__lte=horizon,
            )
            .order_by("due_date")
            .values("id", "company_name", "vendor_name", "due_date", "amount", "tax_amount", "paid_amount", "payment_status")[:20]
        )

        return Response(
            {
                "monthly_revenue": revenue,
                "top_hotels": list(top_hotels),
                "car_rentals": car_stats,
                "employee_performance": list(employee_perf),
                "notifications": {
                    "upcoming_bookings": list(upcoming_bookings),
                    "low_balance_clients": list(low_balance_clients),
                    "reminders": reminder_rows,
                    "hotel_payables": payable_invoices,
                    "expense_payables": payable_expenses,
                },
            }
        )
