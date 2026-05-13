from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from django.db import transaction

from .models import ExchangeRate


TCMB_SOURCE = "tcmb"
RATE_TYPE_FOREX_SELLING = "forex_selling"


@dataclass(frozen=True)
class SyncResult:
    rate_date: date
    upserted: int
    skipped: int


def _tcmb_url_for_date(rate_date: date) -> str:
    """
    TCMB publishes daily XML under kurlar/YYYYMM/DDMMYYYY.xml.
    Same calendar day uses today.xml (alias of the latest published file).
    """
    today = date.today()
    if rate_date == today:
        return "https://www.tcmb.gov.tr/kurlar/today.xml"
    folder = rate_date.strftime("%Y%m")
    filename = rate_date.strftime("%d%m%Y") + ".xml"
    return f"https://www.tcmb.gov.tr/kurlar/{folder}/{filename}"


def _fetch_tcmb_xml(start_date: date, *, max_lookback: int = 14) -> tuple[date, bytes]:
    """
    Fetch TCMB XML. On 404 (weekend/holiday / missing file), try previous days.
    """
    today = date.today()
    if start_date > today:
        start_date = today

    last_error: Exception | None = None
    for i in range(max_lookback):
        d = start_date - timedelta(days=i)
        url = _tcmb_url_for_date(d)
        try:
            with urlopen(url, timeout=30) as resp:
                return d, resp.read()
        except HTTPError as e:
            last_error = e
            if e.code == 404:
                continue
            raise
        except URLError:
            raise

    if last_error is not None:
        raise last_error
    raise OSError("TCMB: no XML available")


def _iter_tcmb_rates(xml_bytes: bytes) -> Iterable[tuple[str, Decimal]]:
    root = ET.fromstring(xml_bytes)
    for cur in root.findall("Currency"):
        code = (cur.attrib.get("CurrencyCode") or "").strip()
        if not code:
            continue
        selling = (cur.findtext("ForexSelling") or "").strip()
        if not selling:
            continue
        try:
            yield code, Decimal(selling)
        except InvalidOperation:
            continue


@transaction.atomic
def sync_tcmb_rates(rate_date: date, *, base_currency: str = "TRY") -> SyncResult:
    effective_date, xml_bytes = _fetch_tcmb_xml(rate_date)

    upserted = 0
    skipped = 0

    # Always keep base/base at 1.0
    ExchangeRate.objects.update_or_create(
        base_currency=base_currency,
        quote_currency=base_currency,
        rate_date=effective_date,
        source=TCMB_SOURCE,
        rate_type=RATE_TYPE_FOREX_SELLING,
        defaults={"rate": Decimal("1.0")},
    )

    for code, rate in _iter_tcmb_rates(xml_bytes):
        if code == base_currency:
            skipped += 1
            continue
        ExchangeRate.objects.update_or_create(
            base_currency=base_currency,
            quote_currency=code,
            rate_date=effective_date,
            source=TCMB_SOURCE,
            rate_type=RATE_TYPE_FOREX_SELLING,
            defaults={"rate": rate},
        )
        upserted += 1

    return SyncResult(rate_date=effective_date, upserted=upserted, skipped=skipped)

