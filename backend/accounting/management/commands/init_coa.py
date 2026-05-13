from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand

from accounting.models import ChartAccount


class Command(BaseCommand):
    help = "Initialize a minimal chart of accounts required for posting."

    def handle(self, *args, **options):
        cfg = getattr(settings, "ACCOUNTING_DEFAULT_ACCOUNTS", {})
        codes = {
            cfg.get("cash", "1000"): ("Cash", "asset"),
            cfg.get("ar", "1200"): ("Accounts Receivable", "asset"),
            cfg.get("ap", "2000"): ("Accounts Payable", "liability"),
            cfg.get("revenue", "4000"): ("Revenue", "revenue"),
            cfg.get("expense", "5000"): ("Expense", "expense"),
            cfg.get("suspense", "9999"): ("Suspense", "equity"),
        }

        created = 0
        for code, (name, typ) in codes.items():
            _, was_created = ChartAccount.objects.get_or_create(
                code=str(code),
                defaults={"name": name, "account_type": typ, "is_active": True},
            )
            if was_created:
                created += 1
        self.stdout.write(self.style.SUCCESS(f"COA initialized. Created: {created}"))

