"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CapabilitiesProvider, useCapabilities } from "@/lib/CapabilitiesContext";
import { NAV_LINK_CONFIG } from "@/lib/modulePermissions";
import { api } from "@/lib/api";
import {
  AccountingIcon,
  BookingIcon,
  ClientIcon,
  DashboardIcon,
  ExpenseIcon,
  FleetIcon,
  FlightIcon,
  HotelIcon,
  HrIcon,
  ReminderIcon,
  SettingsIcon,
  UsersIcon,
  VoucherIcon,
} from "@/components/NavIcons";
import {
  alertCardClass,
  daysUntilFromYmd,
  dismissPayable,
  readPayableDismissed,
  tonePendingPayment,
} from "@/lib/reminderAlertUi";
import { markApBillPaidFromAlert, markExpensePaidFromAlert } from "@/lib/payableAlertActions";
import { useLogout } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CurrencySwitcher from "@/components/CurrencySwitcher";
import DeleteConfirmDialogHost from "@/components/DeleteConfirmDialogHost";

function SidebarNavLinks() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { ready, hasNavAccess } = useCapabilities();

  const iconByKey: Partial<Record<(typeof NAV_LINK_CONFIG)[number]["key"], React.ReactNode>> = {
    dashboard: <DashboardIcon />,
    clients: <ClientIcon />,
    reminders: <ReminderIcon />,
    vouchers: <VoucherIcon />,
    bookings: <BookingIcon />,
    hotels: <HotelIcon />,
    flights: <FlightIcon />,
    fleet: <FleetIcon />,
    accounting: <AccountingIcon />,
    hr: <HrIcon />,
    expenses: <ExpenseIcon />,
    users: <UsersIcon />,
    settings: <SettingsIcon />,
  };

  if (!ready) {
    return <div className="px-3 py-2 text-xs text-white/60">…</div>;
  }

  return (
    <>
      {NAV_LINK_CONFIG.map((item) => {
        if (!hasNavAccess({ key: item.key, permission: item.permission })) return null;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-md px-3 py-2 text-sm transition ${
              isActive
                ? "bg-[#f59e0b] text-white shadow-[0_6px_20px_-10px_rgba(245,158,11,0.9)]"
                : "text-white/85 hover:bg-white/10"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={isActive ? "text-white [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-white" : "text-white/80 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-white/80"}>
                {iconByKey[item.key] ?? null}
              </span>
              <span>{t[item.key]}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

type ReminderAlertApiRow = {
  id: number;
  title: string;
  remind_at: string;
  target_date: string;
  priority: string;
  days_until_target?: number;
};

type ShellAlert = {
  key: string;
  source: "reminder" | "hotel" | "expense";
  realId: number;
  title: string;
  remind_at: string;
  target_date: string;
  priority: string;
  daysUntil: number;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useLogout();
  const { t } = useI18n();
  const [openNotifications, setOpenNotifications] = useState(false);
  const [alerts, setAlerts] = useState<ShellAlert[] | null>(null);
  const [notificationActionError, setNotificationActionError] = useState("");
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const dueCount = useMemo(() => alerts?.length || 0, [alerts]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get<ReminderAlertApiRow[]>("/reminders/alerts"),
      api.get<{
        notifications?: {
          hotel_payables?: { id: number; number: string; hotel__name: string; due_date: string }[];
          expense_payables?: { id: number; company_name: string; vendor_name: string; due_date: string }[];
        };
      }>("/dashboard"),
    ]).then((results) => {
      if (cancelled) return;
      const reminderResult = results[0];
      const dashboardResult = results[1];
      const rows =
        reminderResult.status === "fulfilled" && Array.isArray(reminderResult.value)
          ? reminderResult.value
          : [];
      const dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
      const dismissed = readPayableDismissed();
      const reminderAlerts: ShellAlert[] = rows.map((item) => ({
        key: `r-${item.id}`,
        source: "reminder",
        realId: item.id,
        title: item.title,
        remind_at: item.remind_at,
        target_date: item.target_date,
        priority: item.priority,
        daysUntil:
          typeof item.days_until_target === "number"
            ? item.days_until_target
            : daysUntilFromYmd(item.target_date),
      }));
      const hotelAlerts: ShellAlert[] =
        dashboard?.notifications?.hotel_payables
          ?.filter((item) => !dismissed.hotel.includes(item.id))
          .map((item) => ({
            key: `h-${item.id}`,
            source: "hotel",
            realId: item.id,
            title: `دفعة فندق: ${item.number} - ${item.hotel__name || "-"}`,
            remind_at: item.due_date,
            target_date: item.due_date,
            priority: "high",
            daysUntil: daysUntilFromYmd(item.due_date),
          })) || [];
      const expenseAlerts: ShellAlert[] =
        dashboard?.notifications?.expense_payables
          ?.filter((item) => !dismissed.expense.includes(item.id))
          .map((item) => ({
            key: `e-${item.id}`,
            source: "expense",
            realId: item.id,
            title: `مصروف مستحق: ${item.company_name || item.vendor_name || `#${item.id}`}`,
            remind_at: item.due_date,
            target_date: item.due_date,
            priority: "medium",
            daysUntil: daysUntilFromYmd(item.due_date),
          })) || [];
      setAlerts([...reminderAlerts, ...hotelAlerts, ...expenseAlerts].slice(0, 30));
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const markAlertPaid = async (event: MouseEvent, item: ShellAlert) => {
    event.preventDefault();
    event.stopPropagation();
    setNotificationActionError("");
    if (item.source === "reminder") {
      try {
        await api.post(`/reminders/${item.realId}/mark_done/`, {});
        setAlerts((prev) => (prev ? prev.filter((a) => a.key !== item.key) : null));
      } catch (err) {
        setNotificationActionError(
          err instanceof Error ? err.message : "تعذر إنهاء التذكير.",
        );
      }
      return;
    }
    try {
      if (item.source === "expense") {
        await markExpensePaidFromAlert(item.realId);
        dismissPayable("expense", item.realId);
      } else {
        await markApBillPaidFromAlert(item.realId);
        dismissPayable("hotel", item.realId);
      }
      setAlerts((prev) => (prev ? prev.filter((a) => a.key !== item.key) : null));
    } catch (err) {
      setNotificationActionError(
        err instanceof Error ? err.message : "تعذر تسجيل الدفع في النظام.",
      );
    }
  };

  const alertLinkHref = (item: ShellAlert) => {
    if (item.source === "expense") return "/expenses";
    if (item.source === "hotel") return "/accounting";
    return "/reminders";
  };

  useEffect(() => {
    const onClickAway = (event: Event) => {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setOpenNotifications(false);
      }
    };
    window.addEventListener("click", onClickAway);
    return () => window.removeEventListener("click", onClickAway);
  }, []);

  return (
    <CapabilitiesProvider>
    <div className="mb-app-theme min-h-screen bg-[#ecfdf5] text-black">
      <div className="flex min-h-screen">
        <aside className="w-72 bg-gradient-to-b from-[#0f766e] to-[#115e59] border-r border-emerald-900/20 px-5 py-6 text-white">
          <div className="mb-6 space-y-2">
            <h1 className="text-lg font-semibold tracking-wide">{t.appTitle}</h1>
            <p className="text-xs text-white/70">{t.adminPanel}</p>
            <LanguageSwitcher variant="dark" />
            <CurrencySwitcher variant="dark" />
            <div className="relative pt-1" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  setNotificationActionError("");
                  setOpenNotifications((prev) => !prev);
                }}
                className="flex w-full items-center justify-between rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15"
              >
                <span>🔔 {t.notifications}</span>
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-semibold text-emerald-950">
                  {dueCount}
                </span>
              </button>
              {openNotifications && (
                <div className="absolute z-50 mt-2 w-full rounded-md border border-zinc-200 bg-white p-2 text-zinc-800 shadow-lg">
                  <div className="mb-2 text-xs font-semibold">{t.notifications}</div>
                  {notificationActionError ? (
                    <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                      {notificationActionError}
                    </div>
                  ) : null}
                  {alerts === null ? (
                    <div className="text-xs text-zinc-500">{t.commonLoading}</div>
                  ) : alerts.length ? (
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {alerts.map((item) => {
                        const payTone = tonePendingPayment(item.daysUntil);
                        return (
                          <div
                            key={item.key}
                            className={`rounded-md border px-2 py-1.5 text-xs ${alertCardClass(payTone)}`}
                          >
                            <Link
                              href={alertLinkHref(item)}
                              className="block font-semibold text-zinc-900 hover:underline"
                              onClick={() => setOpenNotifications(false)}
                            >
                              {item.title}
                            </Link>
                            <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-zinc-600">
                              <span>
                                {item.remind_at}
                                {" · "}
                                {item.daysUntil <= 0
                                  ? item.daysUntil === 0
                                    ? "مستحق اليوم"
                                    : `متأخر ${Math.abs(item.daysUntil)} يوم`
                                  : `باقي ${item.daysUntil} يوم`}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 rounded border border-emerald-600 bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700"
                                onClick={(e) => void markAlertPaid(e, item)}
                              >
                                تم الدفع
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">{t.notificationsNone}</div>
                  )}
                  <Link
                    href="/reminders"
                    className="mt-2 block rounded-md bg-emerald-600 px-2 py-1.5 text-center text-xs font-semibold text-white hover:bg-emerald-700"
                    onClick={() => setOpenNotifications(false)}
                  >
                    {t.openRemindersCenter}
                  </Link>
                </div>
              )}
            </div>
          </div>
          <nav className="space-y-1">
            <SidebarNavLinks />
          </nav>
          <button
            onClick={logout}
            className="mt-8 w-full rounded-md border border-white/30 px-3 py-2 text-sm text-white hover:bg-white/10 transition"
          >
            {t.logout}
          </button>
        </aside>
        <main className="flex-1 bg-[#ecfdf5] text-black">
          <div className="mb-ai-bg min-h-screen px-8 py-6 transition-opacity duration-300">
            {children}
          </div>
        </main>
      </div>
      <DeleteConfirmDialogHost />
    </div>
    </CapabilitiesProvider>
  );
}



