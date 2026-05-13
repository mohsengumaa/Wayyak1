"use client";

import { useEffect, useState } from "react";
import { getInitialLanguage, setLanguage, type Language } from "@/lib/i18n";

const LANGS: { value: Language; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
];

export default function LanguageSwitcher({
  onChange,
  variant = "light",
}: {
  onChange?: (lang: Language) => void;
  variant?: "light" | "dark";
}) {
  const [lang, setLang] = useState<Language>("ar");

  useEffect(() => {
    setLang(getInitialLanguage());
  }, []);

  const handleChange = (value: Language) => {
    setLang(value);
    setLanguage(value);
    if (onChange) {
      onChange(value);
    }
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
      {LANGS.map((item) => (
        <button
          key={item.value}
          onClick={() => handleChange(item.value)}
          className={`rounded-full border px-3 py-1 transition ${
            lang === item.value ? activeClass : inactiveClass
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}



