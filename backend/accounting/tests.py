from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Reminder
from hotels.models import Hotel

from .models import Invoice, Payment, PaymentAllocation


class HotelPaymentReminderSyncTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_superuser(
            username="accounting-admin",
            email="acc-admin@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(self.user)
        self.hotel = Hotel.objects.create(name="Test Hotel")

    def test_sync_creates_pending_reminder_for_near_due_hotel_bill(self):
        due_date = timezone.now().date() + timedelta(days=1)
        invoice = Invoice.objects.create(
            number="AP-HOTEL-001",
            doc_type="ap_bill",
            business_sector="hotels",
            hotel=self.hotel,
            issue_date=timezone.now().date(),
            due_date=due_date,
            total_amount=Decimal("1000.00"),
            currency="USD",
            fx_rate=Decimal("1"),
            status="sent",
        )

        res = self.client.post("/api/invoices/sync-hotel-payment-reminders", {"horizon_days": 3}, format="json")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["created"], 1)
        row = Reminder.objects.get(
            owner=self.user,
            reminder_type="payment_hotel",
            module="accounting",
            related_model="accounting.invoice",
            related_object_id=invoice.id,
        )
        self.assertEqual(row.status, "pending")
        self.assertEqual(row.target_date, due_date)

    def test_sync_marks_reminder_done_after_invoice_fully_paid(self):
        due_date = timezone.now().date() + timedelta(days=1)
        invoice = Invoice.objects.create(
            number="AP-HOTEL-002",
            doc_type="ap_bill",
            business_sector="hotels",
            hotel=self.hotel,
            issue_date=timezone.now().date(),
            due_date=due_date,
            total_amount=Decimal("500.00"),
            currency="USD",
            fx_rate=Decimal("1"),
            status="sent",
        )
        reminder = Reminder.objects.create(
            owner=self.user,
            created_by=self.user,
            title="استحقاق فاتورة فندق قريب",
            description="stub",
            reminder_type="payment_hotel",
            module="accounting",
            related_model="accounting.invoice",
            related_object_id=invoice.id,
            target_date=due_date,
            remind_days_before=3,
            priority="medium",
            status="pending",
        )

        payment = Payment.objects.create(
            direction="payment",
            hotel=self.hotel,
            payment_date=timezone.now().date(),
            currency="USD",
            fx_rate=Decimal("1"),
            amount=Decimal("500.00"),
            status="posted",
        )
        PaymentAllocation.objects.create(payment=payment, invoice=invoice, amount=Decimal("500.00"))

        res = self.client.post("/api/invoices/sync-hotel-payment-reminders", {"horizon_days": 3}, format="json")

        self.assertEqual(res.status_code, 200)
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, "done")
