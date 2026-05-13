import io

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework import viewsets
from rest_framework.decorators import action

from accounts.permissions import RoleBasedPermission
from core.mixins import ImportExportModelViewSetMixin
from core.pdf_arabic import pdf_rows as _pdf_rows
from core.pdf_arabic import pdf_text as _pdf_text
from core.pdf_arabic import register_arabic_font
from core.pdf_settings import draw_watermark, effective_logo_path, load_pdf_config
from core.pdf_theme import draw_body_card_for_platypus, draw_header
from .models import Car, CarRental, FlightTicket
from .serializers import CarRentalSerializer, CarSerializer, FlightTicketSerializer


class CarViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Car.objects.all()
    serializer_class = CarSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "make", "model", "year", "plate_number", "daily_rate", "status", "location"]


class CarRentalViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = CarRental.objects.select_related("car", "client")
    serializer_class = CarRentalSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "car", "client", "start_date", "end_date", "total_price", "booked_at"]


class FlightTicketViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = FlightTicket.objects.select_related("client", "assigned_employee")
    serializer_class = FlightTicketSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "client",
        "passenger_name",
        "passport_number",
        "airline",
        "ticket_number",
        "pnr",
        "trip_type",
        "departure_airport",
        "arrival_airport",
        "departure_datetime",
        "return_datetime",
        "buying_price",
        "buying_currency",
        "selling_price",
        "selling_currency",
        "currency",
        "service_fee",
        "service_fee_currency",
        "total_price",
        "net_profit",
        "status",
        "booked_at",
    ]

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        ticket = self.get_object()
        font_name = register_arabic_font()
        bold_font = font_name if font_name != "Helvetica" else "Helvetica-Bold"
        cfg = load_pdf_config("flight_ticket")
        logo_path = effective_logo_path(cfg)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=165, bottomMargin=36)
        styles = getSampleStyleSheet()
        elements = []

        title_style = styles["Title"]
        subtitle_style = styles["Heading2"]
        normal = styles["BodyText"]
        for style in (title_style, subtitle_style, normal, styles["Heading3"], styles["Italic"]):
            style.fontName = font_name

        elements.append(Paragraph(_pdf_text("MB Tourism"), title_style))
        elements.append(Paragraph(_pdf_text("Flight Ticket / تذكرة طيران"), subtitle_style))
        elements.append(Spacer(1, 12))

        trip_type = {
            "one_way": "One way / ذهاب فقط",
            "round_trip": "Round trip / ذهاب وعودة",
            "multi_city": "Multi city / وجهات متعددة",
        }.get(ticket.trip_type, ticket.trip_type)
        status = {
            "draft": "Draft / مسودة",
            "reserved": "Reserved / محجوزة",
            "issued": "Issued / مصدرة",
            "cancelled": "Cancelled / ملغاة",
            "refunded": "Refunded / مستردة",
        }.get(ticket.status, ticket.status)

        meta_data = [
            ["Client / العميل", getattr(ticket.client, "name", "-"), "Status / الحالة", status],
            ["Passenger / الراكب", ticket.passenger_name, "Passport / الجواز", ticket.passport_number or "-"],
            ["Airline / شركة الطيران", ticket.airline or "-", "PNR", ticket.pnr or "-"],
            ["Ticket No. / رقم التذكرة", ticket.ticket_number or "-", "Trip Type / نوع الرحلة", trip_type],
        ]
        meta_table = Table(_pdf_rows(meta_data), colWidths=[105, 165, 105, 165])
        meta_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTNAME", (0, 0), (0, -1), bold_font),
                    ("FONTNAME", (2, 0), (2, -1), bold_font),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        elements.append(meta_table)
        elements.append(Spacer(1, 14))

        flight_data = [
            ["From / من", ticket.departure_airport, "To / إلى", ticket.arrival_airport],
            ["Departure / المغادرة", ticket.departure_datetime.strftime("%Y-%m-%d %H:%M"), "Return / العودة", ticket.return_datetime.strftime("%Y-%m-%d %H:%M") if ticket.return_datetime else "-"],
        ]
        flight_table = Table(_pdf_rows(flight_data), colWidths=[105, 165, 105, 165])
        flight_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTNAME", (0, 0), (0, -1), bold_font),
                    ("FONTNAME", (2, 0), (2, -1), bold_font),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        elements.append(flight_table)
        elements.append(Spacer(1, 14))

        price_data = [
            ["Buying / الشراء", f"{ticket.buying_price:.2f} {ticket.buying_currency}"],
            ["Selling / البيع", f"{ticket.selling_price:.2f} {ticket.selling_currency}"],
            ["Service Fee / رسوم الخدمة", f"{ticket.service_fee:.2f} {ticket.service_fee_currency}"],
            ["Total / الإجمالي", f"{ticket.total_price:.2f} {ticket.selling_currency or ticket.currency}"],
            ["Net Profit / صافي الربح", f"{ticket.net_profit:.2f} {ticket.selling_currency or ticket.currency}"],
        ]
        price_table = Table(_pdf_rows(price_data), colWidths=[180, 180])
        price_table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("BACKGROUND", (0, 3), (-1, -1), colors.HexColor("#ecfdf5")),
                    ("FONTNAME", (0, 0), (-1, -1), font_name),
                    ("FONTNAME", (0, 0), (0, -1), bold_font),
                    ("PADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        elements.append(price_table)

        if ticket.notes:
            elements.append(Spacer(1, 14))
            elements.append(Paragraph(_pdf_text("Notes / ملاحظات"), styles["Heading3"]))
            elements.append(Paragraph(_pdf_text(ticket.notes), normal))

        elements.append(Spacer(1, 24))
        elements.append(Paragraph(_pdf_text("This document was generated by Wayyak ERP."), styles["Italic"]))

        def _on_page(c, doc_obj):
            draw_watermark(c, cfg, page_w=doc_obj.pagesize[0], page_h=doc_obj.pagesize[1], logo_path=logo_path)
            draw_header(
                c,
                doc_key="flight_ticket",
                title_en="Flight Ticket",
                title_ar="تذكرة طيران",
                meta_left=[("Ticket No.", ticket.ticket_number or str(ticket.id)), ("PNR", ticket.pnr or "—")],
                meta_right=[("Client", getattr(ticket.client, "name", "—")), ("Status", status)],
                page_w=doc_obj.pagesize[0],
                page_h=doc_obj.pagesize[1],
            )
            draw_body_card_for_platypus(c, doc_key="flight_ticket", doc_obj=doc_obj)

        doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
        pdf = buffer.getvalue()
        buffer.close()

        response = HttpResponse(pdf, content_type="application/pdf")
        filename = f"flight-ticket-{ticket.id}.pdf"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
