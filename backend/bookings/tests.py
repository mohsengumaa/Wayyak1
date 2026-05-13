from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounting.models import Invoice
from core.models import Client, Referrer
from hotels.models import Hotel, RoomType

from .models import Voucher, VoucherReservation


class VoucherAccountingEndpointsTests(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.user = get_user_model().objects.create_superuser(
            username="test-admin",
            email="admin@example.com",
            password="pass1234",
        )
        self.client_api.force_authenticate(user=self.user)

        self.referrer = Referrer.objects.create(referrer_code="SR001", name="Ref 1")
        self.hotel = Hotel.objects.create(name="Hotel Alpha")
        self.room_type = RoomType.objects.create(hotel=self.hotel, name="STD")
        self.customer = Client.objects.create(client_code="C001", name="Client A")
        self.voucher = Voucher.objects.create(
            voucher_nr="SR001-2026-0000001",
            destination_code="2026",
            sequence_number=1,
            referrer=self.referrer,
            client=self.customer,
            client_name=self.customer.name,
        )
        self.reservation = VoucherReservation.objects.create(
            voucher=self.voucher,
            hotel=self.hotel,
            room_type=self.room_type,
            check_in="2026-05-20",
            check_out="2026-05-22",
            selling_price=250,
            selling_currency="USD",
            buying_price=200,
            buying_currency="USD",
            confirmation_number="CNF-1",
        )

    def test_next_number_preview_endpoint_returns_expected_shape(self):
        response = self.client_api.get(
            "/api/vouchers/next-number-preview",
            {"referrer": self.referrer.id, "sale_date": "2026-05-20"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("voucher_nr", response.data)
        self.assertIn("sequence_number", response.data)
        self.assertIn("destination_code", response.data)
        self.assertTrue(str(response.data["voucher_nr"]).startswith("SR001-2026-"))

    def test_accounting_overview_endpoint_returns_reservation_rows(self):
        response = self.client_api.get(
            "/api/voucher-reservations/accounting-overview",
            {"invoiced": "all"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("rows", response.data)
        self.assertEqual(len(response.data["rows"]), 1)
        self.assertEqual(response.data["rows"][0]["id"], self.reservation.id)

    def test_set_hotel_invoice_ref_endpoint_updates_reservation(self):
        response = self.client_api.post(
            f"/api/voucher-reservations/{self.reservation.id}/set-hotel-invoice-ref",
            {"hotel_invoice_ref": "H-INV-100"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.hotel_invoice_ref, "H-INV-100")

    def test_create_hotel_invoice_endpoint_creates_ap_invoice(self):
        self.reservation.hotel_invoice_ref = "H-INV-200"
        self.reservation.save(update_fields=["hotel_invoice_ref"])

        response = self.client_api.post(
            f"/api/voucher-reservations/{self.reservation.id}/create-hotel-invoice",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data.get("created"))
        invoice_id = response.data["invoice"]["id"]
        inv = Invoice.objects.get(id=invoice_id)
        self.assertEqual(inv.doc_type, "ap_bill")
        self.assertEqual(inv.booking_id, self.reservation.id)
        self.assertEqual(inv.hotel_id, self.hotel.id)
