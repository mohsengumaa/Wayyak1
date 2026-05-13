from decimal import Decimal

from core.models import ExchangeRate


def format_money(amount: Decimal, currency: str) -> str:
    return f"{amount:.2f} {currency}"


def convert_eur_to_usd(amount: Decimal, rate: Decimal) -> Decimal:
    resolved_rate = rate
    if resolved_rate <= 0:
        latest = (
            ExchangeRate.objects.filter(base_currency="EUR", quote_currency="USD")
            .order_by("-rate_date")
            .first()
        )
        if latest:
            resolved_rate = latest.rate
    if resolved_rate <= 0:
        return amount
    return (amount * resolved_rate).quantize(Decimal("0.01"))
