"use client";

import { useEffect, useMemo, useState } from "react";
import { getInitialLanguage, translations, type Language } from "@/lib/i18n";

export function useI18n() {
  const [lang, setLang] = useState<Language>("ar");

  useEffect(() => {
    setLang(getInitialLanguage());
    const handler = () => setLang(getInitialLanguage());
    window.addEventListener("mb_lang_change", handler);
    return () => window.removeEventListener("mb_lang_change", handler);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const t = useMemo(() => translations[lang], [lang]);

  return { lang, t };
}
