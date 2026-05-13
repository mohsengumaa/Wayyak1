export type Currency = "USD" | "EUR" | "TRY";

export const CURRENCY_KEY = "mb_currency";

export function getInitialCurrency(): Currency {
  if (typeof window === "undefined") {
    return "USD";
  }
  const saved = window.localStorage.getItem(CURRENCY_KEY) as Currency | null;
  return saved || "USD";
}

export function setCurrency(currency: Currency): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CURRENCY_KEY, currency);
  window.dispatchEvent(new Event("mb_currency_change"));
}

export function formatCurrency(
  value: number,
  currency: Currency,
  locale: string
): string {
  if (Number.isNaN(value)) {
    return "";
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
