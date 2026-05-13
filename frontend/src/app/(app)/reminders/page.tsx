"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import TypeableSelect from "@/components/TypeableSelect";
import { TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { BellIcon, CalendarIcon, NotesIcon, PriorityIcon, TagIcon } from "@/components/FieldIcons";
import { formatYmdSlash } from "@/lib/dateFormat";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import {
  alertCardClass,
  dismissPayable,
  readPayableDismissed,
  tonePendingPayment,
  toneForReminderCard,
  daysUntilFromYmd,
} from "@/lib/reminderAlertUi";
import { markApBillPaidFromAlert, markExpensePaidFromAlert } from "@/lib/payableAlertActions";

type Reminder = {
  id: number;
  title: string;
  description: string;
  reminder_type: string;
  module: string;
  target_date: string;
  remind_days_before: number;
  remind_at: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "done" | "cancelled";
  is_read: boolean;
  is_due: boolean;
  days_until_target: number;
  updated_at?: string;
};

type DashboardNotifications = {
  reminders: { id: number; title: string; remind_at: string; target_date: string; priority: string }[];
  hotel_payables: { id: number; number: string; hotel__name: string; due_date: string; total_amount: number; currency: string }[];
  expense_payables: {
    id: number;
    company_name: string;
    vendor_name: string;
    due_date: string;
    amount: number;
    tax_amount: number;
    payment_status: string;
  }[];
};

type DashboardData = {
  notifications: DashboardNotifications;
};

export default function RemindersPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.reminders]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      subtitle:
        lang === "ar"
          ? "مركز التذكيرات: دفعات فنادق، متابعة عملاء، وأي تفاصيل تريد تذكير تلقائي لها."
          : lang === "tr"
            ? "Hatirlatici merkezi: otel odemeleri, musteri takipleri ve otomatik hatirlatma gereken tum detaylar."
            : "Reminders center: hotel payments, client follow-ups, and any detail you want automatic alerts for.",
      loadFailed: lang === "ar" ? "تعذر تحميل التذكيرات." : lang === "tr" ? "Hatirlaticilar yuklenemedi." : "Unable to load reminders.",
      added: lang === "ar" ? "تمت إضافة التذكير بنجاح." : lang === "tr" ? "Hatirlatici basariyla eklendi." : "Reminder added successfully.",
      addFailed: lang === "ar" ? "تعذر إضافة التذكير." : lang === "tr" ? "Hatirlatici eklenemedi." : "Unable to add reminder.",
      done: lang === "ar" ? "تم إنهاء التذكير." : lang === "tr" ? "Hatirlatici tamamlandi." : "Reminder marked done.",
      updateFailed: lang === "ar" ? "تعذر تحديث التذكير." : lang === "tr" ? "Hatirlatici guncellenemedi." : "Unable to update reminder.",
      deleted: lang === "ar" ? "تم حذف التذكير." : lang === "tr" ? "Hatirlatici silindi." : "Reminder deleted.",
      deleteFailed: lang === "ar" ? "تعذر حذف التذكير." : lang === "tr" ? "Hatirlatici silinemedi." : "Unable to delete reminder.",
      deleteConfirm: (title: string) =>
        lang === "ar"
          ? `هل تريد تأكيد حذف التذكير "${title}"؟`
          : lang === "tr"
            ? `"${title}" hatirlaticisini silmek istiyor musunuz?`
            : `Delete reminder "${title}"?`,
      addTitle: lang === "ar" ? "إضافة تذكير جديد" : lang === "tr" ? "Yeni hatirlatici ekle" : "Add new reminder",
      reminderTitle: lang === "ar" ? "عنوان التذكير" : lang === "tr" ? "Hatirlatici basligi" : "Reminder title",
      reminderTitleHint:
        lang === "ar"
          ? "اسم واضح للتذكير (مثال: دفعة فندق مرمرة)."
          : lang === "tr"
            ? "Hatirlatici icin net bir ad (ornek: Marmara otel odemesi)."
            : "Clear reminder title (e.g. Marmara hotel payment).",
      details: lang === "ar" ? "تفاصيل إضافية" : lang === "tr" ? "Ek detaylar" : "Additional details",
      detailsHint:
        lang === "ar"
          ? "شرح مختصر أو ملاحظات للموظفين (اختياري)."
          : lang === "tr"
            ? "Ekip icin kisa aciklama veya notlar (opsiyonel)."
            : "Short description or staff notes (optional).",
      reminderType: lang === "ar" ? "نوع التذكير" : lang === "tr" ? "Hatirlatici turu" : "Reminder type",
      reminderTypeHint:
        lang === "ar"
          ? "يساعد على تصنيف التذكيرات وعرضها."
          : lang === "tr"
            ? "Hatirlaticilari siniflandirmaya yardimci olur."
            : "Helps classify and present reminders.",
      module: lang === "ar" ? "القسم (اختياري)" : lang === "tr" ? "Modul (opsiyonel)" : "Module (optional)",
      moduleHint:
        lang === "ar"
          ? "مثال: الفنادق / العملاء / المحاسبة."
          : lang === "tr"
            ? "Ornek: oteller / musteriler / muhasebe."
            : "Example: hotels / clients / accounting.",
      targetDate: lang === "ar" ? "تاريخ الاستحقاق" : lang === "tr" ? "Vade tarihi" : "Due date",
      targetDateHint:
        lang === "ar"
          ? "اختر السنة ثم الشهر (بالوسط) ثم اليوم. العرض يكون YYYY/MM/DD."
          : lang === "tr"
            ? "Once yil, sonra ay (ortada), sonra gun secin. Gosterim YYYY/MM/DD."
            : "Pick year, then month (middle), then day. Display format is YYYY/MM/DD.",
      remindBeforeDays: lang === "ar" ? "التذكير قبل (أيام)" : lang === "tr" ? "Hatirlatma once (gun)" : "Remind before (days)",
      remindBeforeHint:
        lang === "ar"
          ? "مثال: 3 يعني ينبهك قبل 3 أيام من الاستحقاق."
          : lang === "tr"
            ? "Ornek: 3, vade tarihinden 3 gun once uyarir."
            : "Example: 3 means alert 3 days before due date.",
      oneDay: lang === "ar" ? "قبل يوم" : lang === "tr" ? "1 gun once" : "1 day before",
      twoDays: lang === "ar" ? "قبل يومين" : lang === "tr" ? "2 gun once" : "2 days before",
      threeDays: lang === "ar" ? "قبل 3 أيام" : lang === "tr" ? "3 gun once" : "3 days before",
      priority: lang === "ar" ? "الأولوية" : lang === "tr" ? "Oncelik" : "Priority",
      priorityHint:
        lang === "ar"
          ? "تحدد لون التنبيه وأهميته."
          : lang === "tr"
            ? "Uyarinin rengi ve onemini belirler."
            : "Determines alert color and importance.",
      low: lang === "ar" ? "أولوية منخفضة" : lang === "tr" ? "Dusuk oncelik" : "Low priority",
      medium: lang === "ar" ? "أولوية متوسطة" : lang === "tr" ? "Orta oncelik" : "Medium priority",
      high: lang === "ar" ? "أولوية عالية" : lang === "tr" ? "Yuksek oncelik" : "High priority",
      saving: lang === "ar" ? "جاري الحفظ..." : lang === "tr" ? "Kaydediliyor..." : "Saving...",
      activeReminders: lang === "ar" ? "التذكيرات النشطة" : lang === "tr" ? "Aktif hatirlaticilar" : "Active reminders",
      paid: lang === "ar" ? "تم الدفع" : lang === "tr" ? "Odendi" : "Paid",
      alertLine: (r: string, d: string, m?: string) =>
        lang === "ar"
          ? `التنبيه: ${r} | الاستحقاق: ${d}${m ? ` | القسم: ${m}` : ""}`
          : lang === "tr"
            ? `Hatirlatma: ${r} | Vade: ${d}${m ? ` | Modul: ${m}` : ""}`
            : `Reminder: ${r} | Due: ${d}${m ? ` | Module: ${m}` : ""}`,
      sysAlerts: lang === "ar" ? "تنبيهات تلقائية من النظام" : lang === "tr" ? "Sistemden otomatik uyarilar" : "Automatic system alerts",
      hotelPayables:
        lang === "ar"
          ? "دفعات الفنادق (تظهر خلال 3 أيام من الاستحقاق أو بعده)"
          : lang === "tr"
            ? "Otel odemeleri (vade tarihinden 3 gun once ve sonrasi)"
            : "Hotel payables (shown within 3 days to due date and after)",
      expensePayables:
        lang === "ar" ? "مصاريف مستحقة (نفس نافذة الـ 3 أيام)" : lang === "tr" ? "Vadesi gelen giderler (ayni 3 gunluk pencere)" : "Expense payables (same 3-day window)",
      expenseFallback: lang === "ar" ? "مصروف" : lang === "tr" ? "Gider" : "Expense",
      noItems: lang === "ar" ? "لا يوجد" : lang === "tr" ? "Yok" : "None",
      expensePayFailed:
        lang === "ar" ? "تعذر تسجيل دفع المصروف." : lang === "tr" ? "Gider odemesi kaydedilemedi." : "Unable to register expense payment.",
      invoicePayFailed:
        lang === "ar" ? "تعذر تسجيل دفع الفاتورة في المحاسبة." : lang === "tr" ? "Fatura odemesi muhasebede kaydedilemedi." : "Unable to register invoice payment in accounting.",
      completed: lang === "ar" ? "التذكيرات المنتهية" : lang === "tr" ? "Tamamlanan hatirlaticilar" : "Completed reminders",
      dueToday: lang === "ar" ? "مستحق اليوم" : lang === "tr" ? "Bugun vadesi var" : "Due today",
      overdueDays: (d: number) =>
        lang === "ar" ? `متأخر ${d} يوم` : lang === "tr" ? `${d} gun gecikmis` : `${d} days overdue`,
      remainingDays: (d: number) =>
        lang === "ar" ? `باقي ${d} يوم` : lang === "tr" ? `${d} gun kaldi` : `${d} days left`,
    }),
    [lang],
  );
  const reminderTypeOptions = useMemo(
    () => [
      { value: "payment_hotel", label: lang === "ar" ? "دفعة فندق" : lang === "tr" ? "Otel odemesi" : "Hotel payment" },
      { value: "payment_supplier", label: lang === "ar" ? "دفعة مورد" : lang === "tr" ? "Tedarikci odemesi" : "Supplier payment" },
      { value: "client_followup", label: lang === "ar" ? "متابعة عميل" : lang === "tr" ? "Musteri takibi" : "Client follow-up" },
      { value: "booking_followup", label: lang === "ar" ? "متابعة حجز" : lang === "tr" ? "Rezervasyon takibi" : "Booking follow-up" },
      { value: "general", label: lang === "ar" ? "تذكير عام" : lang === "tr" ? "Genel hatirlatici" : "General reminder" },
    ],
    [lang],
  );

  const [rows, setRows] = useState<Reminder[]>([]);
  const [dashboardNotifications, setDashboardNotifications] = useState<DashboardNotifications | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [payableDismissed, setPayableDismissed] = useState<{
    hotel: number[];
    expense: number[];
  }>({ hotel: [], expense: [] });
  const [payableBusy, setPayableBusy] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    reminder_type: "general",
    module: "",
    target_date: "",
    remind_days_before: 3,
    priority: "medium",
  });

  const load = () => {
    Promise.all([api.get<Reminder[]>("/reminders"), api.get<DashboardData>("/dashboard")])
      .then(([reminderRows, dashboard]) => {
        setRows(reminderRows);
        setDashboardNotifications(dashboard.notifications);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : ui.loadFailed);
      });
  };

  useEffect(() => {
    setPayableDismissed(readPayableDismissed());
    load();
  }, []);

  const pendingRows = useMemo(
    () => rows.filter((row) => row.status === "pending").sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
    [rows],
  );
  const doneRows = useMemo(
    () =>
      rows
        .filter((row) => row.status === "done")
        .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")),
    [rows],
  );

  const addReminder = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const payload = {
        ...form,
        remind_days_before: Number(form.remind_days_before || 0),
      };
      const created = await api.post<Reminder>("/reminders", payload);
      setRows((prev) => [created, ...prev]);
      setStatus(ui.added);
      setForm({
        title: "",
        description: "",
        reminder_type: "general",
        module: "",
        target_date: "",
        remind_days_before: 3,
        priority: "medium",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.addFailed);
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (row: Reminder) => {
    setError("");
    try {
      const updated = await api.post<Reminder>(`/reminders/${row.id}/mark_done/`, {});
      setRows((prev) => prev.map((item) => (item.id === row.id ? updated : item)));
      setStatus(ui.done);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.updateFailed);
    }
  };

  const deleteReminder = async (row: Reminder) => {
    setError("");
    try {
      await api.delete(`/reminders/${row.id}`, {
        confirmMessage: ui.deleteConfirm(row.title),
      });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setStatus(ui.deleted);
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteFailed);
    }
  };

  const setDaysShortcut = (days: number) => {
    setForm((prev) => ({ ...prev, remind_days_before: days }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.reminders}</h1>
        <p className="text-sm text-zinc-500">
          {ui.subtitle}
        </p>
      </div>

      {status && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <form onSubmit={addReminder} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">{ui.addTitle}</h2>
          <div className="space-y-1">
            <FieldLabel icon={<BellIcon className="h-4 w-4" />} text={ui.reminderTitle} hint={ui.reminderTitleHint} />
            <input
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={ui.reminderTitleHint}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={ui.details} hint={ui.detailsHint} />
            <textarea
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={ui.details}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.reminderType} hint={ui.reminderTypeHint} />
            <TypeableSelect
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              value={form.reminder_type}
              onChange={(e) => setForm((prev) => ({ ...prev, reminder_type: e.target.value }))}
            >
              {reminderTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TypeableSelect>
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.module} hint={ui.moduleHint} />
            <input
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={ui.moduleHint}
              value={form.module}
              onChange={(e) => setForm((prev) => ({ ...prev, module: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel
              icon={<CalendarIcon className="h-4 w-4" />}
              text={ui.targetDate}
              hint={ui.targetDateHint}
            />
            <PopupYmdDatePicker
              value={form.target_date || ""}
              onChange={(nextIso) => setForm((prev) => ({ ...prev, target_date: nextIso }))}
              disabled={saving}
              yearFrom={1990}
              yearTo={2060}
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              name="reminder_target_date"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.remindBeforeDays} hint={ui.remindBeforeHint} />
              <input
                type="number"
                min={0}
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={ui.remindBeforeDays}
                value={form.remind_days_before}
                onChange={(e) => setForm((prev) => ({ ...prev, remind_days_before: Number(e.target.value) }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDaysShortcut(1)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs">
                {ui.oneDay}
              </button>
              <button type="button" onClick={() => setDaysShortcut(2)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs">
                {ui.twoDays}
              </button>
              <button type="button" onClick={() => setDaysShortcut(3)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs">
                {ui.threeDays}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabel icon={<PriorityIcon className="h-4 w-4" />} text={ui.priority} hint={ui.priorityHint} />
            <TypeableSelect
              className="w-full min-h-[48px] rounded-md mb-input-raised px-3 py-3 text-sm font-medium"
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as "low" | "medium" | "high" }))}
            >
              <option value="low">{ui.low}</option>
              <option value="medium">{ui.medium}</option>
              <option value="high">{ui.high}</option>
            </TypeableSelect>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">{ui.low}</span>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">{ui.medium}</span>
              <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">{ui.high}</span>
            </div>
          </div>
          <button disabled={saving} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60">
            {saving ? ui.saving : t.commonSave}
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">{ui.activeReminders}</h2>
            <div className="space-y-2 text-sm">
              {pendingRows.map((row) => {
                const payTone = toneForReminderCard(row.days_until_target);
                return (
                <div key={row.id} className={`rounded-md border p-3 ${alertCardClass(payTone)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{row.title}</div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          payTone === "red"
                            ? "bg-red-200/80 text-red-900"
                            : payTone === "orange"
                              ? "bg-amber-200/80 text-amber-950"
                              : "bg-zinc-200/80 text-zinc-800"
                        }`}
                      >
                        {row.days_until_target <= 0
                          ? row.days_until_target === 0
                            ? ui.dueToday
                            : ui.overdueDays(Math.abs(row.days_until_target))
                          : ui.remainingDays(row.days_until_target)}
                      </span>
                      <button type="button" onClick={() => void markDone(row)} className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                        {ui.paid}
                      </button>
                      <button type="button" onClick={() => void deleteReminder(row)} className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700" aria-label={t.commonDelete} title={t.commonDelete}>
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {ui.alertLine(formatYmdSlash(row.remind_at), formatYmdSlash(row.target_date), row.module || undefined)}
                  </div>
                  {row.description && <div className="mt-1 text-xs text-zinc-600">{row.description}</div>}
                </div>
              );
              })}
              {!pendingRows.length && <p className="text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>

          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">{ui.sysAlerts}</h2>
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600">
                  {ui.hotelPayables}
                </div>
                <div className="space-y-1 text-xs text-zinc-600">
                  {dashboardNotifications?.hotel_payables
                    ?.filter((row) => !payableDismissed.hotel.includes(row.id))
                    .map((row) => {
                      const d = daysUntilFromYmd(row.due_date);
                      const payTone = tonePendingPayment(d);
                      return (
                        <div
                          key={row.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 ${alertCardClass(payTone)}`}
                        >
                          <span>
                            {row.number} - {row.hotel__name || "-"} · {formatYmdSlash(row.due_date)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-zinc-700">
                              {d <= 0 ? (d === 0 ? ui.dueToday : ui.overdueDays(Math.abs(d))) : ui.remainingDays(d)}
                            </span>
                            <button
                              type="button"
                              disabled={payableBusy === `hotel-${row.id}`}
                              className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              onClick={async () => {
                                setError("");
                                setPayableBusy(`hotel-${row.id}`);
                                try {
                                  await markApBillPaidFromAlert(row.id);
                                  setPayableDismissed(dismissPayable("hotel", row.id));
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : ui.invoicePayFailed,
                                  );
                                } finally {
                                  setPayableBusy(null);
                                }
                              }}
                            >
                              {ui.paid}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {!dashboardNotifications?.hotel_payables?.filter((row) => !payableDismissed.hotel.includes(row.id))
                    .length && <div className="text-zinc-400">{ui.noItems}</div>}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-zinc-600">
                  {ui.expensePayables}
                </div>
                <div className="space-y-1 text-xs text-zinc-600">
                  {dashboardNotifications?.expense_payables
                    ?.filter((row) => !payableDismissed.expense.includes(row.id))
                    .map((row) => {
                      const d = daysUntilFromYmd(row.due_date);
                      const payTone = tonePendingPayment(d);
                      return (
                        <div
                          key={row.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 ${alertCardClass(payTone)}`}
                        >
                          <span>
                            #{row.id} - {row.company_name || row.vendor_name || ui.expenseFallback} · {formatYmdSlash(row.due_date)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-zinc-700">
                              {d <= 0 ? (d === 0 ? ui.dueToday : ui.overdueDays(Math.abs(d))) : ui.remainingDays(d)}
                            </span>
                            <button
                              type="button"
                              disabled={payableBusy === `expense-${row.id}`}
                              className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              onClick={async () => {
                                setError("");
                                setPayableBusy(`expense-${row.id}`);
                                try {
                                  await markExpensePaidFromAlert(row.id);
                                  setPayableDismissed(dismissPayable("expense", row.id));
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : ui.expensePayFailed,
                                  );
                                } finally {
                                  setPayableBusy(null);
                                }
                              }}
                            >
                              {ui.paid}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {!dashboardNotifications?.expense_payables?.filter((row) => !payableDismissed.expense.includes(row.id))
                    .length && <div className="text-zinc-400">{ui.noItems}</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">{ui.completed}</h2>
            <div className="space-y-1 text-xs text-zinc-600">
              {doneRows.slice(0, 20).map((row) => (
                <div
                  key={row.id}
                  className={`flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1.5`}
                >
                  <span className="text-emerald-950">{row.title}</span>
                  <span className="text-emerald-800">{formatYmdSlash(row.target_date)}</span>
                </div>
              ))}
              {!doneRows.length && <div className="text-zinc-400">{ui.noItems}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

