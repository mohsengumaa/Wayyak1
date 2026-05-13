from __future__ import annotations

from datetime import date, datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand

from core.tcmb import sync_tcmb_rates


class Command(BaseCommand):
    help = "Sync FX rates from TCMB XML into core.ExchangeRate."

    def add_arguments(self, parser):
        parser.add_argument("--date", dest="date", default=None, help="YYYY-MM-DD (defaults to today)")
        parser.add_argument("--start", dest="start", default=None, help="YYYY-MM-DD (inclusive)")
        parser.add_argument("--end", dest="end", default=None, help="YYYY-MM-DD (inclusive)")
        parser.add_argument("--base", dest="base", default=None, help="Base currency (defaults to settings.BASE_CURRENCY)")

    def handle(self, *args, **options):
        base = options.get("base") or getattr(settings, "BASE_CURRENCY", "TRY")

        raw_date = options.get("date")
        raw_start = options.get("start")
        raw_end = options.get("end")

        if raw_date and (raw_start or raw_end):
            raise ValueError("Use either --date OR --start/--end")

        def parse(d: str) -> date:
            return datetime.strptime(d, "%Y-%m-%d").date()

        if raw_start or raw_end:
            if not raw_start or not raw_end:
                raise ValueError("Both --start and --end are required")
            start = parse(raw_start)
            end = parse(raw_end)
        else:
            day = parse(raw_date) if raw_date else date.today()
            start = day
            end = day

        if end < start:
            raise ValueError("--end must be >= --start")

        current = start
        total = 0
        while current <= end:
            result = sync_tcmb_rates(current, base_currency=base)
            total += result.upserted
            self.stdout.write(
                self.style.SUCCESS(
                    f"{current}: upserted={result.upserted} skipped={result.skipped} base={base}"
                )
            )
            current += timedelta(days=1)

        self.stdout.write(self.style.SUCCESS(f"Done. Total upserted: {total}"))

