from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import ExchangeRate


class ExchangeRateAutoSyncTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_superuser(
            username="fx-admin",
            email="fx-admin@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(self.user)

    def test_rate_endpoint_auto_syncs_from_tcmb_when_missing(self):
        requested = date(2026, 5, 1)

        def fake_sync(rate_date, base_currency="TRY"):
            ExchangeRate.objects.update_or_create(
                base_currency=base_currency,
                quote_currency="USD",
                rate_date=rate_date,
                source="tcmb",
                rate_type="forex_selling",
                defaults={"rate": Decimal("38.500000")},
            )
            return None

        with patch("core.views.sync_tcmb_rates", side_effect=fake_sync) as mocked_sync:
            res = self.client.get(f"/api/exchange-rates/rate?quote=USD&date={requested.isoformat()}")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["quote_currency"], "USD")
        self.assertEqual(res.data["rate_date"], requested.isoformat())
        self.assertEqual(Decimal(res.data["rate"]), Decimal("38.500000"))
        self.assertTrue(res.data["auto_synced"])
        mocked_sync.assert_called_once()

    def test_rate_endpoint_uses_existing_rate_without_sync(self):
        requested = date(2026, 5, 2)
        ExchangeRate.objects.create(
            base_currency="TRY",
            quote_currency="EUR",
            rate=Decimal("43.120000"),
            rate_date=requested,
            source="tcmb",
            rate_type="forex_selling",
        )

        with patch("core.views.sync_tcmb_rates") as mocked_sync:
            res = self.client.get(f"/api/exchange-rates/rate?quote=EUR&date={requested.isoformat()}")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["quote_currency"], "EUR")
        self.assertEqual(res.data["rate_date"], requested.isoformat())
        self.assertEqual(Decimal(res.data["rate"]), Decimal("43.120000"))
        self.assertFalse(res.data["auto_synced"])
        mocked_sync.assert_not_called()
