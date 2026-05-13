"use client";

import { useEffect, useState } from "react";
import { getInitialCurrency, setCurrency, type Currency } from "@/lib/currency";

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "TRY", label: "TRY" },
];

export default function CurrencySwitcher({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [currency, setLocalCurrency] = useState<Currency>("USD");

  useEffect(() => {
    setLocalCurrency(getInitialCurrency());
    const handler = () => setLocalCurrency(getInitialCurrency());
    window.addEventListener("mb_currency_change", handler);
    return () => window.removeEventListener("mb_currency_change", handler);
  }, []);

  const handleChange = (value: Currency) => {
    setLocalCurrency(value);
    setCurrency(value);
  };

  const activeClass =
    variant === "dark"
      ? "border-transparent bg-[#f59e0b] text-white shadow"
      : "border-transparent bg-[#f59e0b] text-black shadow";
  const inactiveClass =
    variant === "dark"
      ? "border-white/30 text-white hover:bg-white/10"
      : "border-black/20 text-black hover:bg-white/60";

  return (
    <div className="flex items-center gap-2 text-xs">
      {CURRENCIES.map((item) => (
        <button
          key={item.value}
          onClick={() => handleChange(item.value)}
          className={`rounded-full border px-3 py-1 transition ${
            currency === item.value ? activeClass : inactiveClass
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}



