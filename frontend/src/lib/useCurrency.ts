"use client";

import { useEffect, useState } from "react";
import { getInitialCurrency, setCurrency, type Currency } from "@/lib/currency";

export function useCurrency() {
  const [currency, setLocalCurrency] = useState<Currency>("USD");

  useEffect(() => {
    setLocalCurrency(getInitialCurrency());
    const handler = () => setLocalCurrency(getInitialCurrency());
    window.addEventListener("mb_currency_change", handler);
    return () => window.removeEventListener("mb_currency_change", handler);
  }, []);

  return {
    currency,
    setCurrency,
  };
}
