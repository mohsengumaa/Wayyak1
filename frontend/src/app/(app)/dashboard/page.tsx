"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import SimpleBarChart from "@/components/SimpleBarChart";
import { alertCardClass, daysUntilFromYmd, tonePendingPayment } from "@/lib/reminderAlertUi";
import { formatYmdSlash } from "@/lib/dateFormat";
import FieldLabel from "@/components/FieldLabel";
import { SearchIcon } from "@/components/FieldIcons";
import {
  AccountingIcon,
  BookingIcon,
  ClientIcon,
  ExpenseIcon,
  FleetIcon,
  HotelIcon,
  HrIcon,
  ReminderIcon,
  UsersIcon,
  VoucherIcon,
} from "@/components/NavIcons";

type DashboardData = {
  monthly_revenue: number;
  top_hotels: { id: number; name: string; bookings_count: number }[];
  car_rentals: { total_rentals: number; total_revenue: number };
  employee_performance: { employee__id: number; employee__user__username: string; net_profit: number }[];
  notifications: {
    upcoming_bookings: { id: number; client__name: string; hotel__name: string; check_in: string }[];
    low_balance_clients: { id: number; name: string; balance: number }[];
    reminders?: {
      id: number;
      title: string;
      remind_at: string;
      target_date: string;
      priority: string;
      days_until_target?: number;
      status?: string;
    }[];
  };
};

function StatCard({
  title,
  value,
  sub,
  icon,
  tone = "emerald",
}: {
  title: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "emerald" | "sky" | "amber" | "zinc" | "violet";
}) {
  const toneClasses: Record<string, string> = {
    emerald: "from-emerald-500/15 via-white to-emerald-50/40",
    sky: "from-sky-500/15 via-white to-sky-50/40",
    amber: "from-amber-500/20 via-white to-amber-50/40",
    zinc: "from-zinc-400/20 via-white to-zinc-50/40",
    violet: "from-violet-500/15 via-white to-violet-50/40",
  };
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-zinc-100 bg-gradient-to-br ${toneClasses[tone]} p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/60 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-zinc-600">{title}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
          {sub ? <div className="mt-1 text-[11px] text-zinc-500">{sub}</div> : null}
        </div>
        {icon ? (
          <div className="rounded-lg border border-zinc-200/60 bg-white/60 p-2 text-zinc-600 transition group-hover:bg-white">
            <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-200/70 ${className}`} />;
}

export default function DashboardPage() {
  useRequireAuth();
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      loadFailed:
        lang === "ar"
          ? "تعذر تحميل لوحة التحكم."
          : lang === "tr"
            ? "Kontrol paneli yüklenemedi."
            : "Unable to load dashboard.",
      refreshLoading: lang === "ar" ? "جاري التحديث…" : lang === "tr" ? "Yenileniyor..." : "Refreshing...",
      refresh: lang === "ar" ? "تحديث" : lang === "tr" ? "Yenile" : "Refresh",
      last30Days: lang === "ar" ? "آخر 30 يوم" : lang === "tr" ? "Son 30 gün" : "Last 30 days",
      totalCarBookings:
        lang === "ar" ? "إجمالي حجوزات السيارات" : lang === "tr" ? "Toplam araç rezervasyonu" : "Total car bookings",
      carRevenue: lang === "ar" ? "إيراد السيارات" : lang === "tr" ? "Araç geliri" : "Car revenue",
      topHotelsCount:
        lang === "ar" ? "عدد الفنادق ضمن الأعلى" : lang === "tr" ? "Üst otel sayısı" : "Top hotels count",
      quickBoard: lang === "ar" ? "لوحة سريعة" : lang === "tr" ? "Hızlı panel" : "Quick panel",
      quickBoardHint:
        lang === "ar"
          ? "اختصارات للأقسام الأكثر استخداماً"
          : lang === "tr"
            ? "En çok kullanılan bölümler için kısayollar"
            : "Shortcuts for the most used sections",
      dashboardSearch: lang === "ar" ? "بحث داخل اللوحة" : lang === "tr" ? "Panel içi arama" : "Dashboard search",
      dashboardSearchHint:
        lang === "ar"
          ? "بحث داخل التنبيهات والقوائم."
          : lang === "tr"
            ? "Uyarılar ve listeler içinde arayın."
            : "Search inside alerts and lists.",
      dashboardSearchPlaceholder: lang === "ar" ? "اسم/رقم/تاريخ…" : lang === "tr" ? "Ad/no/tarih..." : "Name/no/date...",
      dueToday: lang === "ar" ? "مستحق اليوم" : lang === "tr" ? "Bugün vadesi var" : "Due today",
      overdueDays: (d: number) =>
        lang === "ar" ? `متأخر ${d} يوم` : lang === "tr" ? `${d} gün gecikmiş` : `${d} days overdue`,
      remainingDays: (d: number) =>
        lang === "ar" ? `باقي ${d} يوم` : lang === "tr" ? `${d} gün kaldı` : `${d} days left`,
    }),
    [lang],
  );
  const { currency } = useCurrency();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"alerts" | "upcoming" | "balances">("alerts");
  const [searchAny, setSearchAny] = useState("");

  const refresh = () => {
    setLoading(true);
    setError(null);
    api.get<DashboardData>("/dashboard/")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : ui.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const upcomingBookings = useMemo(() => {
    const rows = data?.notifications.upcoming_bookings || [];
    const term = searchAny.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((x) => `${x.client__name} ${x.hotel__name} ${x.check_in}`.toLowerCase().includes(term));
  }, [data, searchAny]);

  const lowBalance = useMemo(() => {
    const rows = data?.notifications.low_balance_clients || [];
    const term = searchAny.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((x) => `${x.name} ${x.balance}`.toLowerCase().includes(term));
  }, [data, searchAny]);

  const reminders = useMemo(() => {
    const rows = data?.notifications.reminders || [];
    const term = searchAny.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((x) => `${x.title} ${x.remind_at} ${x.target_date} ${x.priority}`.toLowerCase().includes(term));
  }, [data, searchAny]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.dashboard}</h1>
          <p className="text-sm text-zinc-500">{t.dashboardSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? ui.refreshLoading : ui.refresh}
          </button>
          <Link href="/settings" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-black">
            {t.settings}
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-100 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/50 p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            <>
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-32" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-24" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
              <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-7 w-16" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            </>
          ) : (
            <>
              <StatCard
                title={t.dashboardMonthlyRevenue}
                value={data ? formatCurrency(data.monthly_revenue, currency, lang) : "—"}
                sub={ui.last30Days}
                icon={<AccountingIcon />}
                tone="amber"
              />
              <StatCard
                title={t.dashboardTotalRentals}
                value={data ? String(data.car_rentals.total_rentals) : "—"}
                sub={ui.totalCarBookings}
                icon={<FleetIcon />}
                tone="sky"
              />
              <StatCard
                title={t.dashboardCarRevenue}
                value={data ? formatCurrency(data.car_rentals.total_revenue || 0, currency, lang) : "—"}
                sub={ui.carRevenue}
                icon={<FleetIcon />}
                tone="violet"
              />
              <StatCard
                title={t.dashboardTopHotels}
                value={data ? String(data.top_hotels.length) : "—"}
                sub={ui.topHotelsCount}
                icon={<HotelIcon />}
                tone="emerald"
              />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleBarChart
          title={t.dashboardMonthlyRevenue}
          valueFormatter={(v) => formatCurrency(v, currency, lang)}
          items={[
            {
              label: t.dashboardRevenueLabel,
              value: data?.monthly_revenue || 0,
            },
          ]}
        />
        <SimpleBarChart
          title={t.fleet}
          valueFormatter={(v) => formatCurrency(v, currency, lang)}
          items={[
            {
              label: t.dashboardRentalsCount,
              value: data?.car_rentals.total_rentals || 0,
            },
            {
              label: t.dashboardCarRevenueLabel,
              value: data?.car_rentals.total_revenue || 0,
            },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="grid gap-4">
          <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">{ui.quickBoard}</div>
                <div className="text-xs text-zinc-500">{ui.quickBoardHint}</div>
              </div>
              <div className="min-w-[260px]">
                <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.dashboardSearch} hint={ui.dashboardSearchHint} />
                <input
                  className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  placeholder={ui.dashboardSearchPlaceholder}
                  value={searchAny}
                  onChange={(e) => setSearchAny(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { href: "/vouchers", label: t.vouchers, icon: <VoucherIcon /> },
                { href: "/bookings", label: t.bookings, icon: <BookingIcon /> },
                { href: "/hotels", label: t.hotels, icon: <HotelIcon /> },
                { href: "/clients", label: t.clients, icon: <ClientIcon /> },
                { href: "/expenses", label: t.expenses, icon: <ExpenseIcon /> },
                { href: "/accounting", label: t.accounting, icon: <AccountingIcon /> },
                { href: "/hr", label: t.hr, icon: <HrIcon /> },
                { href: "/reminders", label: t.reminders, icon: <ReminderIcon /> },
                { href: "/fleet", label: t.fleet, icon: <FleetIcon /> },
                { href: "/users", label: t.users, icon: <UsersIcon /> },
              ].map((x) => (
                <Link
                  key={x.href}
                  href={x.href}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 py-2.5 text-sm text-zinc-800 transition hover:-translate-y-0.5 hover:border-zinc-200 hover:bg-white hover:shadow-sm"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="text-zinc-500 [&>svg]:h-4 [&>svg]:w-4">{x.icon}</span>
                    <span className="truncate font-medium">{x.label}</span>
                  </span>
                  <span className="text-zinc-400 transition group-hover:text-zinc-600">›</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SimpleBarChart
              title={t.dashboardTopHotels}
              items={data?.top_hotels.map((hotel) => ({ label: hotel.name, value: hotel.bookings_count })) || []}
            />
            <SimpleBarChart
              title={t.dashboardEmployeePerformance}
              valueFormatter={(v) => formatCurrency(v, currency, lang)}
              items={data?.employee_performance.map((item) => ({ label: item.employee__user__username, value: item.net_profit })) || []}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: "alerts" as const, label: t.reminders },
                { key: "upcoming" as const, label: t.dashboardUpcomingBookings },
                { key: "balances" as const, label: t.dashboardLowBalance },
              ].map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setPanel(x.key)}
                  className={`rounded-full px-3 py-1.5 text-xs border transition ${
                    panel === x.key
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {x.label}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      panel === x.key ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-700"
                    }`}>
                      {x.key === "alerts"
                        ? reminders.length
                        : x.key === "upcoming"
                          ? upcomingBookings.length
                          : lowBalance.length}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {panel === "alerts" ? (
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t.dashboardUpcomingBookings}</div>
                  <Link href="/reminders" className="text-xs text-emerald-700 hover:underline">
                    {t.openRemindersCenter}
                  </Link>
                </div>
                {loading ? <div className="text-xs text-zinc-500">{t.commonLoading}</div> : null}
                {reminders.map((item) => {
                  const d = typeof item.days_until_target === "number" ? item.days_until_target : daysUntilFromYmd(item.target_date);
                  const payTone = tonePendingPayment(d);
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${alertCardClass(payTone)}`}
                    >
                      <span className="font-medium">{item.title}</span>
                      <span className="text-[11px] text-zinc-700">
                        {formatYmdSlash(item.remind_at)} ·{" "}
                        {d <= 0 ? (d === 0 ? ui.dueToday : ui.overdueDays(Math.abs(d))) : ui.remainingDays(d)}
                      </span>
                    </div>
                  );
                })}
                {!reminders.length && !loading ? <div className="text-xs text-zinc-400">{t.commonNoData}</div> : null}
              </div>
            ) : null}

            {panel === "upcoming" ? (
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <div className="text-sm font-semibold">{t.dashboardUpcomingBookings}</div>
                {upcomingBookings.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-white px-2 py-2">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{item.client__name}</span>{" "}
                      <span className="text-zinc-500">— {item.hotel__name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-600">{formatYmdSlash(item.check_in)}</span>
                  </div>
                ))}
                {!upcomingBookings.length && !loading ? <div className="text-xs text-zinc-400">{t.commonNoData}</div> : null}
              </div>
            ) : null}

            {panel === "balances" ? (
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <div className="text-sm font-semibold">{t.dashboardLowBalance}</div>
                {lowBalance.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-white px-2 py-2">
                    <span className="min-w-0 truncate font-medium">{item.name}</span>
                    <span className="shrink-0 font-mono text-xs text-zinc-600">{formatCurrency(item.balance, currency, lang)}</span>
                  </div>
                ))}
                {!lowBalance.length && !loading ? <div className="text-xs text-zinc-400">{t.commonNoData}</div> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}



