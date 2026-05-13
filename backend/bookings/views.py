import datetime

from django.db.models import Prefetch, Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounting.models import Invoice
from accounting.numbering import assign_invoice_number
from core.mixins import ImportExportModelViewSetMixin
from core.models import Referrer
from accounts.permissions import RoleBasedPermission
from .models import Booking, Voucher, VoucherGuest, VoucherReservation
from .serializers import BookingSerializer, VoucherReservationSerializer, VoucherSerializer
from .voucher_pdf import render_voucher_pdf
from .guest_list_pdf import render_guest_list_pdf
from .voucher_numbering import allocate_voucher_nr


class BookingViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Booking.objects.select_related("hotel", "room_type", "client")
    serializer_class = BookingSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "hotel",
        "room_type",
        "client",
        "check_in",
        "check_out",
        "total_price",
        "net_profit",
        "status",
    ]


class VoucherViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Voucher.objects.select_related("client", "referrer").prefetch_related(
        "reservations",
        Prefetch("guests", queryset=VoucherGuest.objects.select_related("room")),
    )
    serializer_class = VoucherSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "voucher_nr", "client", "issued_at", "adult_count", "child_count", "status"]

    @action(detail=False, methods=["get"], url_path="next-number-preview")
    def next_number_preview(self, request):
        referrer_raw = (request.query_params.get("referrer") or "").strip()
        sale_date_raw = (request.query_params.get("sale_date") or "").strip()

        referrer = None
        if referrer_raw:
            if referrer_raw.isdigit():
                referrer = Referrer.objects.filter(pk=int(referrer_raw)).first()
            else:
                referrer = Referrer.objects.filter(referrer_code__iexact=referrer_raw).first()

        sale_date = None
        if sale_date_raw:
            try:
                sale_date = datetime.datetime.strptime(sale_date_raw, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"detail": "Invalid sale_date (YYYY-MM-DD)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        voucher_nr, sequence_number, destination_code = allocate_voucher_nr(referrer, sale_date)
        return Response(
            {
                "voucher_nr": voucher_nr,
                "sequence_number": sequence_number,
                "destination_code": destination_code,
            }
        )


class VoucherReservationViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = VoucherReservation.objects.select_related("voucher", "hotel").prefetch_related("rooms")
    serializer_class = VoucherReservationSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "voucher", "hotel", "check_in", "check_out", "selling_price", "selling_currency"]

    @staticmethod
    def _linked_invoice_for_reservation(reservation: VoucherReservation):
        return (
            Invoice.objects.filter(
                doc_type="ap_bill",
                business_sector="hotels",
                booking_id=reservation.id,
                hotel_id=reservation.hotel_id,
            )
            .order_by("-issue_date", "-id")
            .first()
        )

    @action(detail=False, methods=["get"], url_path="accounting-overview")
    def accounting_overview(self, request):
        invoiced_filter = (request.query_params.get("invoiced") or "all").strip().lower()
        if invoiced_filter not in {"all", "yes", "no"}:
            return Response(
                {"detail": "Invalid invoiced filter. Use: all|yes|no."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = []
        reservations = (
            VoucherReservation.objects.select_related("voucher", "hotel")
            .order_by("-check_in", "-id")
        )
        for reservation in reservations:
            linked = self._linked_invoice_for_reservation(reservation)
            has_linked = linked is not None
            if invoiced_filter == "yes" and not has_linked:
                continue
            if invoiced_filter == "no" and has_linked:
                continue

            linked_payload = None
            if linked:
                allocated = linked.allocations.aggregate(s=Sum("amount")).get("s") or 0
                outstanding = max(float(linked.total_amount) - float(allocated), 0.0)
                linked_payload = {
                    "id": linked.id,
                    "number": linked.number,
                    "status": linked.status,
                    "issue_date": str(linked.issue_date),
                    "outstanding_amount": outstanding,
                    "is_paid": linked.status == "paid" or outstanding <= 0.01,
                }

            rows.append(
                {
                    "id": reservation.id,
                    "hotel_id": reservation.hotel_id,
                    "voucher_nr": reservation.voucher_id,
                    "hotel_name": reservation.hotel.name,
                    "check_in": str(reservation.check_in),
                    "check_out": str(reservation.check_out),
                    "selling_price": float(reservation.selling_price),
                    "selling_currency": reservation.selling_currency,
                    "confirmation_number": reservation.confirmation_number,
                    "hotel_invoice_ref": reservation.hotel_invoice_ref,
                    "linked_invoice": linked_payload,
                }
            )

        return Response({"rows": rows})

    @action(detail=True, methods=["post"], url_path="set-hotel-invoice-ref")
    def set_hotel_invoice_ref(self, request, pk=None):
        reservation = self.get_object()
        hotel_invoice_ref = (request.data.get("hotel_invoice_ref") or "").strip()
        reservation.hotel_invoice_ref = hotel_invoice_ref
        reservation.save(update_fields=["hotel_invoice_ref", "updated_at"])
        return Response({"id": reservation.id, "hotel_invoice_ref": reservation.hotel_invoice_ref})

    @action(detail=True, methods=["post"], url_path="create-hotel-invoice")
    def create_hotel_invoice(self, request, pk=None):
        reservation = self.get_object()
        existing = self._linked_invoice_for_reservation(reservation)
        if existing:
            allocated = existing.allocations.aggregate(s=Sum("amount")).get("s") or 0
            outstanding = max(float(existing.total_amount) - float(allocated), 0.0)
            return Response(
                {
                    "created": False,
                    "invoice": {
                        "id": existing.id,
                        "number": existing.number,
                        "status": existing.status,
                        "issue_date": str(existing.issue_date),
                        "outstanding_amount": outstanding,
                    },
                }
            )

        hotel_invoice_ref = (reservation.hotel_invoice_ref or "").strip()
        if not hotel_invoice_ref:
            return Response(
                {"detail": "Hotel invoice ref is required before creating AP invoice."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = reservation.buying_price if float(reservation.buying_price or 0) > 0 else reservation.selling_price
        issue_date = reservation.selling_date or timezone.localdate()
        invoice = Invoice(
            number="",
            doc_type="ap_bill",
            client=None,
            supplier=None,
            hotel_id=reservation.hotel_id,
            booking_id=reservation.id,
            business_sector="hotels",
            supplier_document_ref=hotel_invoice_ref,
            issue_date=issue_date,
            due_date=reservation.check_out,
            total_amount=amount,
            currency=(reservation.buying_currency or reservation.selling_currency or "USD").upper(),
            fx_rate=1,
            status="draft",
            notes=f"Auto-created from voucher {reservation.voucher_id}.",
        )
        assign_invoice_number(invoice)
        invoice.save()

        return Response(
            {
                "created": True,
                "invoice": {
                    "id": invoice.id,
                    "number": invoice.number,
                    "status": invoice.status,
                    "issue_date": str(invoice.issue_date),
                    "outstanding_amount": float(invoice.total_amount),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class VoucherPdfView(APIView):
    """Voucher PDF (modern unified layout)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, voucher_nr: str, template: str):
        voucher = get_object_or_404(
            Voucher.objects.select_related("client", "referrer").prefetch_related("reservations", "guests"),
            voucher_nr=voucher_nr,
        )
        raw_pb = request.GET.get("payment_box")
        payment_box_override = None
        if raw_pb is not None:
            s = str(raw_pb).strip().lower()
            if s in ("1", "true", "yes", "on"):
                payment_box_override = True
            elif s in ("0", "false", "no", "off"):
                payment_box_override = False
        return render_voucher_pdf(
            voucher=voucher,
            template=template,
            payment_box_override=payment_box_override,
            lang=request.GET.get("lang") or "ar",
        )


class VoucherGuestListPdfView(APIView):
    """Guest list PDF (modern unified layout)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, voucher_nr: str):
        voucher = get_object_or_404(Voucher.objects.prefetch_related("guests"), voucher_nr=voucher_nr)
        return render_guest_list_pdf(voucher=voucher, lang=request.GET.get("lang") or "ar")
