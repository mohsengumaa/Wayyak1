"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatYmdSlash, parseToIsoYmd } from "@/lib/dateFormat";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function daysInMonth(year: number, month: number) {
  // month: 1..12
  return new Date(year, month, 0).getDate();
}

function startWeekdaySunday(year: number, month: number) {
  // 0=Sun..6=Sat
  return new Date(year, month - 1, 1).getDay();
}

function isoFromParts(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export default function PopupYmdDatePicker({
  value,
  onChange,
  className = "mb-input-raised rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm",
  disabled,
  yearFrom = 1990,
  yearTo = 2060,
  name,
  required,
}: {
  value: string;
  onChange: (nextIsoYmd: string) => void;
  className?: string;
  disabled?: boolean;
  yearFrom?: number;
  yearTo?: number;
  name?: string;
  required?: boolean;
}) {
  const initialIso = parseToIsoYmd(value) || value || "";
  const initialParts = initialIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = new Date();
  const initY = initialParts ? Number(initialParts[1]) : now.getFullYear();
  const initM = initialParts ? Number(initialParts[2]) : now.getMonth() + 1;
  const initD = initialParts ? Number(initialParts[3]) : now.getDate();

  const [open, setOpen] = useState(false);
  const [viewY, setViewY] = useState(initY);
  const [viewM, setViewM] = useState(initM);

  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!open) return;
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    const iso = parseToIsoYmd(value) || value || "";
    const p = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (p) {
      setViewY(Number(p[1]));
      setViewM(Number(p[2]));
    }
  }, [value]);

  const selectedIso = parseToIsoYmd(value) || value || "";
  const selectedParts = selectedIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const selectedY = selectedParts ? Number(selectedParts[1]) : initY;
  const selectedM = selectedParts ? Number(selectedParts[2]) : initM;
  const selectedD = selectedParts ? Number(selectedParts[3]) : initD;

  const maxDay = daysInMonth(viewY, viewM);
  const firstW = startWeekdaySunday(viewY, viewM);

  const years = useMemo(() => {
    const from = Math.min(yearFrom, yearTo);
    const to = Math.max(yearFrom, yearTo);
    const list: number[] = [];
    for (let y = to; y >= from; y--) list.push(y);
    return list;
  }, [yearFrom, yearTo]);

  const display = selectedIso ? formatYmdSlash(selectedIso) : "";

  const stepMonth = (delta: number) => {
    let y = viewY;
    let m = viewM + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewY(clamp(y, Math.min(yearFrom, yearTo), Math.max(yearFrom, yearTo)));
    setViewM(m);
  };

  return (
    <div className="relative" ref={rootRef}>
      {/* Keep a real input for native form required validation */}
      {name ? (
        <input
          name={name}
          value={selectedIso}
          readOnly
          required={required}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
      <button
        type="button"
        className={`${className} w-full text-right font-mono tabular-nums`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {display || "YYYY/MM/DD"}
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-[280px] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
              onClick={() => stepMonth(-1)}
              aria-label="Prev month"
            >
              ‹
            </button>

            <div className="flex items-center gap-2">
              <select
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
                value={String(viewY)}
                onChange={(e) => setViewY(Number(e.target.value))}
              >
                {years.map((yy) => (
                  <option key={yy} value={String(yy)}>
                    {yy}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-mono"
                value={pad2(viewM)}
                onChange={(e) => setViewM(Number(e.target.value))}
              >
                {Array.from({ length: 12 }).map((_, idx) => {
                  const mm = idx + 1;
                  return (
                    <option key={mm} value={String(mm)}>
                      {pad2(mm)}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((x) => (
              <div key={x} className="py-1">
                {x}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstW }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: maxDay }).map((_, idx) => {
              const day = idx + 1;
              const isSelected = viewY === selectedY && viewM === selectedM && day === selectedD;
              return (
                <button
                  key={day}
                  type="button"
                  className={`h-8 rounded-md text-xs font-medium ${
                    isSelected ? "bg-emerald-600 text-white" : "hover:bg-zinc-100 text-zinc-800"
                  }`}
                  onClick={() => {
                    onChange(isoFromParts(viewY, viewM, day));
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-2 py-1 text-[11px]"
              onClick={() => {
                const today = new Date();
                const iso = isoFromParts(today.getFullYear(), today.getMonth() + 1, today.getDate());
                onChange(iso);
                setOpen(false);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-2 py-1 text-[11px]"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

