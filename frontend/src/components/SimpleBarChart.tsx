"use client";

import { useI18n } from "@/lib/useI18n";
import { useMemo, useState } from "react";

type Item = { label: string; value: number };

type Props = {
  title: string;
  items: Item[];
  valueFormatter?: (value: number) => string;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function SimpleBarChart({ title, items, valueFormatter }: Props) {
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      order: lang === "ar" ? "ترتيب" : lang === "tr" ? "Sıralama" : "Order",
      value: lang === "ar" ? "قيمة" : lang === "tr" ? "Değer" : "Value",
      toggleOrder: lang === "ar" ? "تبديل الترتيب" : lang === "tr" ? "Sıralamayı değiştir" : "Toggle order",
      toggleMode: lang === "ar" ? "تبديل العرض" : lang === "tr" ? "Görünümü değiştir" : "Toggle display mode",
      clickToSelect: lang === "ar" ? "اضغط للتحديد" : lang === "tr" ? "Seçmek için tıklayın" : "Click to select",
    }),
    [lang],
  );
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [mode, setMode] = useState<"value" | "percent">("value");
  const [selected, setSelected] = useState<string | null>(null);

  const safeItems = useMemo(() => {
    const rows = (items || []).slice();
    rows.sort((a, b) => (sortDir === "desc" ? b.value - a.value : a.value - b.value));
    return rows;
  }, [items, sortDir]);

  const max = Math.max(...safeItems.map((item) => item.value), 1);
  const total = safeItems.reduce((acc, x) => acc + (Number.isFinite(x.value) ? x.value : 0), 0);

  const fmt = (n: number) => (valueFormatter ? valueFormatter(n) : String(n));
  const active = selected ? safeItems.find((x) => x.label === selected) : null;
  const activePct = active && total > 0 ? clamp01(active.value / total) : null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-100 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/40 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/60 blur-2xl" />

      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700 hover:bg-zinc-50"
            onClick={() => setSortDir((p) => (p === "desc" ? "asc" : "desc"))}
            title={ui.toggleOrder}
          >
            {sortDir === "desc" ? "↓" : "↑"} {ui.order}
          </button>
          <button
            type="button"
            className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-zinc-700 hover:bg-zinc-50"
            onClick={() => setMode((p) => (p === "value" ? "percent" : "value"))}
            title={ui.toggleMode}
          >
            {mode === "value" ? ui.value : "%"}
          </button>
        </div>
      </div>

      {active ? (
        <div className="mt-3 rounded-xl border border-zinc-100 bg-white/70 px-3 py-2 text-xs text-zinc-700">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate">{active.label}</span>
            <span className="font-mono">
              {mode === "value" ? fmt(active.value) : activePct != null ? `${Math.round(activePct * 100)}%` : "—"}
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-emerald-600"
              style={{
                width: `${clamp01(mode === "value" ? active.value / max : (activePct ?? 0)) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {safeItems.map((item) => {
          const w = clamp01(mode === "value" ? item.value / max : total > 0 ? item.value / total : 0);
          const isSelected = selected === item.label;
          return (
            <button
              key={item.label}
              type="button"
              className={`w-full text-left rounded-lg px-2 py-1.5 transition ${
                isSelected ? "bg-emerald-50/80" : "hover:bg-zinc-50/80"
              }`}
              onClick={() => setSelected((p) => (p === item.label ? null : item.label))}
              title={ui.clickToSelect}
            >
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                <span className="truncate">{item.label}</span>
                <span className="shrink-0 font-mono">
                  {mode === "value" ? fmt(item.value) : total > 0 ? `${Math.round((item.value / total) * 100)}%` : "—"}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-zinc-100">
                <div className="h-2 rounded-full bg-[#0ea5a4]" style={{ width: `${w * 100}%` }} />
              </div>
            </button>
          );
        })}
        {!safeItems.length && <p className="text-xs text-zinc-400">{t.commonNoData}</p>}
      </div>
    </div>
  );
}



