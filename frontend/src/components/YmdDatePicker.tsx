import { useMemo } from "react";
import { formatYmdSlash, parseToIsoYmd } from "@/lib/dateFormat";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  // month: 1..12
  return new Date(year, month, 0).getDate();
}

export default function YmdDatePicker({
  value,
  onChange,
  className = "w-full rounded-md mb-input-raised px-3 py-2 text-sm",
  yearFrom = 1990,
  yearTo = 2050,
  disabled,
}: {
  value: string;
  onChange: (nextIsoYmd: string) => void;
  className?: string;
  yearFrom?: number;
  yearTo?: number;
  disabled?: boolean;
}) {
  const iso = parseToIsoYmd(value) || value || "";
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const y = parts ? Number(parts[1]) : new Date().getFullYear();
  const m = parts ? Number(parts[2]) : new Date().getMonth() + 1;
  const d = parts ? Number(parts[3]) : new Date().getDate();

  const years = useMemo(() => {
    const from = Math.min(yearFrom, yearTo);
    const to = Math.max(yearFrom, yearTo);
    const list: number[] = [];
    for (let yy = to; yy >= from; yy--) list.push(yy);
    return list;
  }, [yearFrom, yearTo]);

  const maxDay = daysInMonth(y, m);
  const safeDay = Math.min(Math.max(1, d || 1), maxDay);
  const display = formatYmdSlash(`${y}-${pad2(m)}-${pad2(safeDay)}`);

  const setY = (nextY: number) => {
    const nextMax = daysInMonth(nextY, m);
    const nextD = Math.min(safeDay, nextMax);
    onChange(`${nextY}-${pad2(m)}-${pad2(nextD)}`);
  };
  const setM = (nextM: number) => {
    const nextMax = daysInMonth(y, nextM);
    const nextD = Math.min(safeDay, nextMax);
    onChange(`${y}-${pad2(nextM)}-${pad2(nextD)}`);
  };
  const setD = (nextD: number) => {
    onChange(`${y}-${pad2(m)}-${pad2(nextD)}`);
  };

  return (
    <div className="space-y-1">
      <div className={className}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono tabular-nums text-zinc-800">{display}</span>
          <span className="text-[11px] text-zinc-500">YYYY/MM/DD</span>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-3">
        <select
          className="w-full rounded-md mb-input-raised px-2 py-2 text-sm"
          value={String(y)}
          onChange={(e) => setY(Number(e.target.value))}
          disabled={disabled}
          aria-label="Year"
        >
          {years.map((yy) => (
            <option key={yy} value={String(yy)}>
              {yy}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-md mb-input-raised px-2 py-2 text-sm"
          value={pad2(m)}
          onChange={(e) => setM(Number(e.target.value))}
          disabled={disabled}
          aria-label="Month"
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
        <select
          className="w-full rounded-md mb-input-raised px-2 py-2 text-sm"
          value={pad2(safeDay)}
          onChange={(e) => setD(Number(e.target.value))}
          disabled={disabled}
          aria-label="Day"
        >
          {Array.from({ length: maxDay }).map((_, idx) => {
            const dd = idx + 1;
            return (
              <option key={dd} value={String(dd)}>
                {pad2(dd)}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}

