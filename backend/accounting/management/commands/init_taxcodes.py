from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand

from accounting.models import TaxCode


class Command(BaseCommand):
    help = "Initialize common Turkish VAT tax codes."

    def handle(self, *args, **options):
        defaults = [
            ("TR-VAT0", "VAT 0%", Decimal("0.0000"), False),
            ("TR-VAT1", "VAT 1%", Decimal("0.0100"), False),
            ("TR-VAT10", "VAT 10%", Decimal("0.1000"), False),
            ("TR-VAT20", "VAT 20%", Decimal("0.2000"), False),
        ]

        created = 0
        for code, name, rate, inclusive in defaults:
            _, was_created = TaxCode.objects.get_or_create(
                code=code,
                defaults={"name": name, "rate": rate, "is_inclusive": inclusive, "is_active": True},
            )
            if was_created:
                created += 1

        self.stdout.write(self.style.SUCCESS(f"Tax codes initialized. Created: {created}"))

