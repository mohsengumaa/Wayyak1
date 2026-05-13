"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import { formatYmdSlash } from "@/lib/dateFormat";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MoneyIcon, NotesIcon, SearchIcon, StatusIcon, TagIcon } from "@/components/FieldIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { rowMatchesQuery } from "@/lib/search";
import { useModuleUiSettings } from "@/lib/useModuleUiSettings";
import { openPdfBlobWithFallback } from "@/lib/pdfOpen";

import { translations, type Language } from "@/lib/i18n";

type DropdownOption = { id: number; label: string; category: number };
type Branch = { id: number; code: string; name: string };
type CostCenter = { id: number; code: string; name: string };
type Account = { id: number; code: string; name: string; account_type: string };
type Invoice = { id: number; number: string };
type ExpensePaymentRow = {
  id: number;
  amount: string | number;
  paid_at: string;
  notes: string;
  created_at: string;
};
type Expense = {
  id: number;
  category: number;
  expense_type: string;
  company_name: string;
  vendor_name: string;
  reference_no: string;
  amount: number;
  tax_amount: number;
  paid_amount?: number;
  date: string;
  due_date?: string | null;
  payment_status: string;
  payment_method: string;
  linked_invoice?: number | null;
  account?: number | null;
  branch?: number | null;
  cost_center?: number | null;
  journal_entry?: number | null;
  notes: string;
  payments?: ExpensePaymentRow[];
};

type PaymentTone = "paid" | "grace" | "overdue";

type ExpenseFormState = {
  category: string;
  expense_type: string;
  company_name: string;
  vendor_name: string;
  reference_no: string;
  amount: number;
  tax_amount: number;
  paid_amount: number;
  date: string;
  due_date: string;
  payment_status: string;
  payment_method: string;
  linked_invoice: string;
  account: string;
  branch: string;
  cost_center: string;
  notes: string;
};

const emptyForm = (): ExpenseFormState => ({
  category: "",
  expense_type: "other",
  company_name: "",
  vendor_name: "",
  reference_no: "",
  amount: 0,
  tax_amount: 0,
  paid_amount: 0,
  date: "",
  due_date: "",
  payment_status: "unpaid",
  payment_method: "",
  linked_invoice: "",
  account: "",
  branch: "",
  cost_center: "",
  notes: "",
});

function expenseToForm(e: Expense): ExpenseFormState {
  return {
    category: String(e.category),
    expense_type: e.expense_type,
    company_name: e.company_name || "",
    vendor_name: e.vendor_name || "",
    reference_no: e.reference_no || "",
    amount: Number(e.amount) || 0,
    tax_amount: Number(e.tax_amount) || 0,
    paid_amount: Number(e.paid_amount ?? 0) || 0,
    date: e.date || "",
    due_date: (e.due_date as string) || "",
    payment_status: e.payment_status,
    payment_method: e.payment_method || "",
    linked_invoice: e.linked_invoice != null ? String(e.linked_invoice) : "",
    account: e.account != null ? String(e.account) : "",
    branch: e.branch != null ? String(e.branch) : "",
    cost_center: e.cost_center != null ? String(e.cost_center) : "",
    notes: e.notes || "",
  };
}

function parseExpenseDueDate(value: string | null | undefined): Date | null {
  if (value == null || String(value).trim() === "") return null;
  const head = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** قيمة الحالة من الـ API (قد تأتي بمسافات أو حالة أحرف مختلفة). */
function normalizeExpensePaymentStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function expensePaymentTone(e: Expense): PaymentTone {
  const ps = normalizeExpensePaymentStatus(e.payment_status);
  if (ps === "paid") return "paid";
  const due = parseExpenseDueDate(e.due_date);
  if (due) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    if (dueStart > todayStart) return "grace";
  }
  return "overdue";
}

function expenseRowToneClass(tone: PaymentTone): string {
  switch (tone) {
    case "paid":
      return "border-emerald-500 bg-emerald-50/90 dark:border-emerald-600 dark:bg-emerald-950/35";
    case "grace":
      /* برتقالي واضح — يميز عن الأخضر على خلفية الصفحة الخضراء الفاتحة */
      return "border-orange-400 bg-orange-50/95 dark:border-orange-600 dark:bg-orange-950/40";
    case "overdue":
      return "border-red-400 bg-red-50/80 dark:border-red-800 dark:bg-red-950/35";
    default:
      return "border-zinc-200 bg-zinc-50/50";
  }
}

/** لون شارة النص: يعتمد على الحالة الفعلية حتى لا تظهر «غير مدفوع» بشكل مدفوع. */
function expenseStatusBadgeClass(e: Expense, tone: PaymentTone): string {
  const ps = normalizeExpensePaymentStatus(e.payment_status);
  if (ps === "paid") {
    return "bg-emerald-200/90 text-emerald-950 ring-1 ring-emerald-500/40";
  }
  if (ps === "partial") {
    return "bg-violet-200/90 text-violet-950 ring-1 ring-violet-500/35";
  }
  if (tone === "grace") {
    return "bg-orange-200/95 text-orange-950 ring-1 ring-orange-500/45";
  }
  return "bg-red-200/90 text-red-950 ring-1 ring-red-500/40";
}

function paymentStatusLabel(status: string | null | undefined, t: (typeof translations)[Language]): string {
  const ps = normalizeExpensePaymentStatus(status);
  if (ps === "paid") return t.expensesPaymentPaid;
  if (ps === "unpaid") return t.expensesPaymentUnpaid;
  if (ps === "partial") return t.expensesPaymentPartial;
  return String(status ?? "");
}

function formGrossTotal(f: Pick<ExpenseFormState, "amount" | "tax_amount">): number {
  return Number(f.amount || 0) + Number(f.tax_amount || 0);
}

function nextFormAfterPaymentStatus(prev: ExpenseFormState, status: string): ExpenseFormState {
  const total = formGrossTotal(prev);
  if (status === "unpaid") {
    return { ...prev, payment_status: status, paid_amount: 0 };
  }
  if (status === "paid") {
    return { ...prev, payment_status: status, paid_amount: total };
  }
  const paid = Number(prev.paid_amount || 0);
  if (paid > 0 && paid < total) {
    return { ...prev, payment_status: status };
  }
  return { ...prev, payment_status: status, paid_amount: 0 };
}

function nextFormAfterAmountTax(
  prev: ExpenseFormState,
  patch: Partial<Pick<ExpenseFormState, "amount" | "tax_amount">>,
): ExpenseFormState {
  const next = { ...prev, ...patch };
  const total = formGrossTotal(next);
  if (next.payment_status === "paid") {
    return { ...next, paid_amount: total };
  }
  return next;
}

function expenseGrossTotalAmount(e: Pick<Expense, "amount" | "tax_amount">): number {
  return Number(e.amount || 0) + Number(e.tax_amount || 0);
}

function expensePaidRecorded(e: Expense): number {
  const ps = normalizeExpensePaymentStatus(e.payment_status);
  if (ps === "paid") return expenseGrossTotalAmount(e);
  return Number(e.paid_amount ?? 0);
}

function expenseRemainingAmount(e: Expense): number {
  return Math.max(expenseGrossTotalAmount(e) - expensePaidRecorded(e), 0);
}

function buildExpensePayload(
  f: ExpenseFormState,
  mode: "create" | "patch",
  categoryErrorMessage: string,
): { error: string | null; payload: Record<string, unknown> | null } {
  const categoryStr = String(f.category ?? "").trim();
  const categoryId = categoryStr ? Number.parseInt(categoryStr, 10) : NaN;
  if (!Number.isFinite(categoryId) || categoryId < 1) {
    return { error: categoryErrorMessage, payload: null };
  }
  const base: Record<string, unknown> = {
    category: categoryId,
    expense_type: f.expense_type,
    company_name: f.company_name,
    vendor_name: f.vendor_name,
    reference_no: f.reference_no,
    amount: Number(f.amount),
    tax_amount: Number(f.tax_amount),
    date: f.date || null,
    due_date: f.due_date || null,
    payment_status: f.payment_status,
    payment_method: f.payment_method,
    linked_invoice: f.linked_invoice ? Number(f.linked_invoice) : null,
    account: f.account ? Number(f.account) : null,
    branch: f.branch ? Number(f.branch) : null,
    cost_center: f.cost_center ? Number(f.cost_center) : null,
    notes: f.notes,
  };
  if (mode === "create") {
    const initialPaid =
      normalizeExpensePaymentStatus(f.payment_status) === "partial"
        ? Number(f.paid_amount || 0)
        : 0;
    base.initial_paid_amount = initialPaid;
  }
  return { error: null, payload: base };
}

export default function ExpensesPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.expenses]);
  const { t, lang } = useI18n();
  const l = (ar: string, tr: string, en: string) => (lang === "ar" ? ar : lang === "tr" ? tr : en);
  const moduleUi = useModuleUiSettings("expenses");
  const expensesPageTitle = String(moduleUi.page_title || "").trim() || t.expenses;
  const defaultPaymentStatus = String(moduleUi.default_payment_status || "unpaid");
  const { currency } = useCurrency();
  const [categories, setCategories] = useState<DropdownOption[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ExpenseFormState>(() => ({
    ...emptyForm(),
    payment_status: defaultPaymentStatus || "unpaid",
  }));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ExpenseFormState | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [pdfStart, setPdfStart] = useState("");
  const [pdfEnd, setPdfEnd] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "paid" | "partial" | "grace" | "overdue" | "unpaid_all"
  >("all");
  const [payOpenId, setPayOpenId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [searchAny, setSearchAny] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<DropdownOption[]>("/dropdown-options/", { cache: "no-store" }),
      api.get<Branch[]>("/branches"),
      api.get<CostCenter[]>("/cost-centers"),
      api.get<Account[]>("/chart-accounts"),
      api.get<Invoice[]>("/invoices"),
      api.get<Expense[]>("/expenses"),
    ])
      .then(([categoryRows, branchRows, ccRows, accountRows, invoiceRows, expenseRows]) => {
        setCategories(categoryRows);
        setBranches(branchRows);
        setCostCenters(ccRows);
        setAccounts(accountRows.filter((a) => a.account_type === "expense"));
        setInvoices(invoiceRows);
        setExpenses(expenseRows);
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message
            : l("تعذر تحميل بيانات المصاريف.", "Gider verileri yuklenemedi.", "Unable to load expenses data.");
        setError(msg);
      });
  }, []);

  const filteredExpenses = useMemo(() => {
    const base =
      paymentFilter === "all"
        ? expenses
        : expenses.filter((row) => {
      const tone = expensePaymentTone(row);
      if (paymentFilter === "paid") return tone === "paid";
      if (paymentFilter === "partial") return normalizeExpensePaymentStatus(row.payment_status) === "partial";
      if (paymentFilter === "grace") return tone === "grace";
      if (paymentFilter === "overdue") return tone === "overdue";
      if (paymentFilter === "unpaid_all") return tone !== "paid";
      return true;
    });
    return base.filter((row) => rowMatchesQuery(row, searchAny));
  }, [expenses, paymentFilter, searchAny]);

  const addExpense = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const { error: err, payload } = buildExpensePayload(
      form,
      "create",
      l("اختر فئة المصروف من القائمة.", "Gider kategorisini listeden secin.", "Select expense category from list."),
    );
    if (err) {
      setError(err);
      return;
    }
    if (!payload) return;
    try {
      const expense = await api.post<Expense>("/expenses", payload);
      setExpenses((prev) => [expense, ...prev]);
      setForm({ ...emptyForm(), payment_status: defaultPaymentStatus || "unpaid" });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : l("تعذر إضافة المصروف.", "Gider eklenemedi.", "Unable to add expense.");
      setError(msg);
    }
  };

  const startEdit = (e: Expense) => {
    setError("");
    setEditingId(e.id);
    setEditForm(expenseToForm(e));
  };

  const closePayPanel = () => {
    setPayOpenId(null);
    setPayAmount("");
    setPayDate("");
    setPayNote("");
  };

  const openPayPanel = (expense: Expense) => {
    const gross = expenseGrossTotalAmount(expense);
    const paidRec = expensePaidRecorded(expense);
    const rem = Math.max(gross - paidRec, 0);
    setPayOpenId(expense.id);
    setPayAmount(rem > 0 ? String(rem) : "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayNote("");
    setError("");
  };

  const cancelEdit = () => {
    closePayPanel();
    setEditingId(null);
    setEditForm(null);
  };

  const submitRecordPayment = async (expenseId: number) => {
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(
        l("أدخل مبلغ الدفعة (أكبر من صفر).", "Odeme tutarini girin (sifirdan buyuk).", "Enter payment amount greater than zero."),
      );
      return;
    }
    setError("");
    setPayBusy(true);
    try {
      const updated = await api.post<Expense>(`/expenses/${expenseId}/record-payment/`, {
        amount: amt,
        ...(payDate ? { paid_at: payDate } : {}),
        ...(payNote.trim() ? { notes: payNote.trim() } : {}),
      });
      setExpenses((prev) => prev.map((x) => (x.id === expenseId ? updated : x)));
      if (editingId === expenseId) {
        setEditForm(expenseToForm(updated));
      }
      closePayPanel();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : l("تعذر تسجيل الدفعة.", "Odeme kaydedilemedi.", "Unable to record payment."),
      );
    } finally {
      setPayBusy(false);
    }
  };

  const saveEdit = async () => {
    if (editingId == null || !editForm) return;
    setError("");
    const { error: err, payload } = buildExpensePayload(
      editForm,
      "patch",
      l("اختر فئة المصروف من القائمة.", "Gider kategorisini listeden secin.", "Select expense category from list."),
    );
    if (err) {
      setError(err);
      return;
    }
    if (!payload) return;
    setSavingId(editingId);
    try {
      const updated = await api.patch<Expense>(`/expenses/${editingId}/`, payload);
      setExpenses((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
      cancelEdit();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : l("تعذر حفظ التعديلات.", "Degisiklikler kaydedilemedi.", "Unable to save changes."),
      );
    } finally {
      setSavingId(null);
    }
  };

  const deleteExpense = async (expense: Expense) => {
    setError("");
    try {
      await api.delete(`/expenses/${expense.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف المصروف رقم", "Gider kaydini silmeyi onayliyor musunuz", "Confirm deleting expense #") + ` ${expense.id}?`,
      });
      setExpenses((prev) => prev.filter((row) => row.id !== expense.id));
      if (editingId === expense.id) cancelEdit();
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(
        err instanceof Error
          ? err.message
          : l("تعذر حذف المصروف.", "Gider silinemedi.", "Unable to delete expense."),
      );
    }
  };

  const fetchExpensesRegisterPdf = async (mode: "download" | "print") => {
    if (pdfStart && pdfEnd && pdfStart > pdfEnd) {
      setError(
        l(
          "تاريخ «من» يجب أن يكون قبل أو يساوي «إلى».",
          "Baslangic tarihi bitis tarihinden kucuk veya esit olmali.",
          "From date must be before or equal to To date.",
        ),
      );
      return;
    }
    setError("");
    setPdfLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (pdfStart && pdfEnd) {
        params.set("start", pdfStart);
        params.set("end", pdfEnd);
      } else if (pdfStart || pdfEnd) {
        setError(
          l(
            "حدّد تاريخي «من» و«إلى» معًا، أو اترك الحقلين فارغين لسجل كامل.",
            "Baslangic ve bitis tarihini birlikte secin veya tum kayitlar icin bos birakin.",
            "Set both From and To dates together, or leave both empty for full register.",
          ),
        );
        setPdfLoading(false);
        return;
      }
      const q = params.toString();
      const path = q ? `/expenses/register/pdf/?${q}` : `/expenses/register/pdf/`;
      const res = await fetch(`${API_BASE}${path}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) {
        const raw = await res.text();
        throw new Error(
          raw ||
            l(
              `تعذر إنشاء PDF (${res.status})`,
              `PDF olusturulamadi (${res.status})`,
              `Unable to generate PDF (${res.status})`,
            ),
        );
      }
      const blob = await res.blob();
      if (mode === "print") {
        openPdfBlobWithFallback(blob, { mode: "preview", downloadFileName: "expenses-register.pdf" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const name =
          pdfStart && pdfEnd
            ? `expenses-register-${pdfStart}-${pdfEnd}.pdf`
            : "expenses-register-all.pdf";
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : l("تعذر تحميل PDF.", "PDF yuklenemedi.", "Unable to load PDF."),
      );
    } finally {
      setPdfLoading(false);
    }
  };

  const categoryLabel = (id: number) => categories.find((c) => c.id === id)?.label || `#${id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{expensesPageTitle}</h1>
          <p className="text-sm text-zinc-500">{t.expensesSubtitle}</p>
          <p className="mt-2 max-w-3xl text-xs text-zinc-600 leading-relaxed">
            {l(
              "سجّل هنا مصاريف التشغيل (إيجارات، فواتير خدمات، رواتب، إلخ). صنف المصاريف عبر فئات في ",
              "Burada operasyon giderlerini kaydedin (kira, faturalar, maaslar vb.). Giderleri ",
              "Record operating expenses here (rent, utility bills, salaries, etc.). Classify expenses via ",
            )}
            <strong>{l("الإعدادات → القوائم المنسدلة", "Ayarlar -> Acilir listeler", "Settings -> Dropdown lists")}</strong>
            {l(" ثم اربطها ببنود المحاسبة من قسم ", " ve gerektiginde ", " and link them to accounting entries from ")}
            <strong>{l("المحاسبة", "Muhasebe", "Accounting")}</strong>
            {l(" عند الحاجة.", " bolumunden baglayin.", " when needed.")}
          </p>
        </div>
        <ImportExportActions
          exportUrl={`${API_BASE}/expenses/export/`}
          importUrl={`${API_BASE}/expenses/import_xlsx/`}
          onImported={() => api.get<Expense[]>("/expenses").then(setExpenses)}
        />
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <form onSubmit={addExpense} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">{t.expensesAdd}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesExpenseType} hint={l("نوع المصروف (فاتورة/إيجار/رواتب...).", "Gider tipi (fatura/kira/maas...).", "Expense type (invoice/rent/salary...).")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.expense_type}
                onChange={(e) => setForm((prev) => ({ ...prev, expense_type: e.target.value }))}
              >
                <option value="invoice">{t.expensesTypeInvoice}</option>
                <option value="rent">{t.expensesTypeRent}</option>
                <option value="utilities">{t.expensesTypeUtilities}</option>
                <option value="salary">{t.expensesTypeSalary}</option>
                <option value="service">{t.expensesTypeService}</option>
                <option value="other">{t.expensesTypeOther}</option>
              </TypeableSelect>
            </label>
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<StatusIcon className="h-4 w-4" />} text={t.expensesPaymentStatus} hint={l("غير مدفوع/جزئي/مدفوع.", "Odenmedi/kismi/odendi.", "Unpaid/partial/paid.")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.payment_status}
                onChange={(e) =>
                  setForm((prev) => nextFormAfterPaymentStatus(prev, e.target.value))
                }
              >
                <option value="unpaid">{t.expensesPaymentUnpaid}</option>
                <option value="partial">{t.expensesPaymentPartial}</option>
                <option value="paid">{t.expensesPaymentPaid}</option>
              </TypeableSelect>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesCategory} hint={l("تصنيف المصروف (من الإعدادات).", "Gider sinifi (ayarlardan).", "Expense classification (from settings).")} />
            <TypeableSelect
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              required
            >
              <option value="">{t.expensesSelectCategory}</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </TypeableSelect>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesCompanyName} hint={l("اسم الشركة/الجهة (اختياري).", "Sirket/taraf adi (opsiyonel).", "Company/party name (optional).")} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={t.expensesCompanyName}
                value={form.company_name}
                onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesVendorName} hint={l("اسم المورد/البائع (اختياري).", "Tedarikci/satici adi (opsiyonel).", "Vendor/supplier name (optional).")} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={t.expensesVendorName}
                value={form.vendor_name}
                onChange={(e) => setForm((prev) => ({ ...prev, vendor_name: e.target.value }))}
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesReferenceNo} hint={l("رقم مرجعي/فاتورة/سند (اختياري).", "Referans/fatura/belge no (opsiyonel).", "Reference/invoice/document no. (optional).")} />
            <input
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.expensesReferenceNo}
              value={form.reference_no}
              onChange={(e) => setForm((prev) => ({ ...prev, reference_no: e.target.value }))}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesExpenseAccount} hint={l("ربط المصروف بحساب محاسبي (اختياري).", "Gideri muhasebe hesabina bagla (opsiyonel).", "Link expense to accounting account (optional).")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.account}
                onChange={(e) => setForm((prev) => ({ ...prev, account: e.target.value }))}
              >
                <option value="">{t.commonSelect}</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </TypeableSelect>
            </label>
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesLinkedInvoiceOpt} hint={l("ربط المصروف بفاتورة (اختياري).", "Gideri faturaya bagla (opsiyonel).", "Link expense to invoice (optional).")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.linked_invoice}
                onChange={(e) => setForm((prev) => ({ ...prev, linked_invoice: e.target.value }))}
              >
                <option value="">{t.commonSelect}</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number}
                  </option>
                ))}
              </TypeableSelect>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesBranch} hint={l("الفرع (اختياري).", "Sube (opsiyonel).", "Branch (optional).")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.branch}
                onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
              >
                <option value="">{t.commonSelect}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} - {b.name}
                  </option>
                ))}
              </TypeableSelect>
            </label>
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesCostCenter} hint={l("مركز الكلفة (اختياري).", "Maliyet merkezi (opsiyonel).", "Cost center (optional).")} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.cost_center}
                onChange={(e) => setForm((prev) => ({ ...prev, cost_center: e.target.value }))}
              >
                <option value="">{t.commonSelect}</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </TypeableSelect>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.commonAmount} hint={l("قيمة المصروف بدون الضريبة.", "Vergi haric gider tutari.", "Expense amount excluding tax.")} />
            <input
              type="number"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.commonAmount}
              value={form.amount}
              onChange={(e) =>
                setForm((prev) => nextFormAfterAmountTax(prev, { amount: Number(e.target.value) }))
              }
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.expensesTaxAmount} hint={l("قيمة الضريبة (اختياري).", "Vergi tutari (opsiyonel).", "Tax amount (optional).")} />
            <input
              type="number"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.expensesTaxAmount}
              value={form.tax_amount}
              onChange={(e) =>
                setForm((prev) => nextFormAfterAmountTax(prev, { tax_amount: Number(e.target.value) }))
              }
            />
          </label>
          {form.payment_status === "partial" && (
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.expensesPaidAmount} hint={l("المدفوع مبدئيًا عند إنشاء المصروف.", "Gider olusturulurken ilk odenen tutar.", "Initial paid amount when creating expense.")} />
              <input
                type="number"
                step="any"
                min={0}
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.paid_amount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, paid_amount: Number(e.target.value) }))
                }
              />
              <span className="text-[11px] text-zinc-500">{t.expensesInitialPaidHint}</span>
              {formGrossTotal(form) > 0 && (
                <span className="text-[11px] font-medium text-violet-800">
                  {t.expensesRemainingAmount}:{" "}
                  {formatCurrency(
                    Math.max(formGrossTotal(form) - Number(form.paid_amount || 0), 0),
                    currency,
                    lang,
                  )}
                </span>
              )}
            </label>
          )}
          {form.payment_status === "paid" && formGrossTotal(form) > 0 && (
            <p className="text-xs text-zinc-600">{t.expensesPaidFullNote}</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={t.expensesIssueDate} hint={l("تاريخ حدوث المصروف.", "Giderin olustugu tarih.", "Date expense occurred.")} />
              <PopupYmdDatePicker
                value={form.date}
                onChange={(nextIso) => setForm((prev) => ({ ...prev, date: nextIso }))}
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                name="expense_date"
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-600">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={t.expensesDueDate} hint={l("موعد الاستحقاق/الدفع (اختياري).", "Vade/odeme tarihi (opsiyonel).", "Due/payment date (optional).")} />
              <PopupYmdDatePicker
                value={form.due_date}
                onChange={(nextIso) => setForm((prev) => ({ ...prev, due_date: nextIso }))}
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                name="expense_due_date"
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.expensesPaymentMethod} hint={l("مثال: Cash / Bank / Card.", "Ornek: Cash / Bank / Card.", "Example: Cash / Bank / Card.")} />
            <input
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.expensesPaymentMethod}
              value={form.payment_method}
              onChange={(e) => setForm((prev) => ({ ...prev, payment_method: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-xs text-zinc-600">
            <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.commonNotes} hint={l("أي ملاحظات إضافية (اختياري).", "Ek notlar (opsiyonel).", "Any extra notes (optional).")} />
            <textarea
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.commonNotes}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </label>
          <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
            {t.commonSave}
          </button>
        </form>

        <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <h2 className="text-sm font-semibold">{t.expensesLog}</h2>
              <label className="grid max-w-md gap-1 text-xs text-zinc-600">
                <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={l("بحث عام", "Genel arama", "Global search")} hint={l("اسم شركة/بائع/مرجع/مبلغ/تاريخ…", "Sirket/satici/referans/tutar/tarih...", "Company/vendor/reference/amount/date...")} />
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder={l("ابحث داخل المصاريف…", "Giderlerde ara...", "Search within expenses...")}
                  value={searchAny}
                  onChange={(e) => setSearchAny(e.target.value)}
                />
              </label>
              <label className="grid max-w-md gap-1 text-xs text-zinc-600">
                <FieldLabel icon={<StatusIcon className="h-4 w-4" />} text={t.expensesFilterPayment} hint={l("فلترة حسب حالة الدفع.", "Odeme durumuna gore filtrele.", "Filter by payment status.")} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={paymentFilter}
                  onChange={(e) =>
                    setPaymentFilter(
                      e.target.value as "all" | "paid" | "partial" | "grace" | "overdue" | "unpaid_all",
                    )
                  }
                >
                  <option value="all">{t.expensesFilterAll}</option>
                  <option value="paid">{t.expensesFilterPaid}</option>
                  <option value="partial">{t.expensesFilterPartialOnly}</option>
                  <option value="grace">{t.expensesFilterGrace}</option>
                  <option value="overdue">{t.expensesFilterOverdue}</option>
                  <option value="unpaid_all">{t.expensesFilterUnpaidAll}</option>
                </TypeableSelect>
              </label>
              <div className="rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] leading-snug text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200">{t.expensesLegendTitle}</div>
                <div className="mt-1 space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span>{t.expensesLegendPaid}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                    <span>{t.expensesLegendPartial}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                    <span>{t.expensesLegendGrace}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    <span>{t.expensesLegendOverdue}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                <span>{t.expensesPdfOptional}:</span>
                <label className="flex items-center gap-1">
                  {t.expensesPdfFrom}
                  <PopupYmdDatePicker
                    value={pdfStart}
                    onChange={(nextIso) => setPdfStart(nextIso)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                    name="expenses_pdf_from"
                  />
                </label>
                <label className="flex items-center gap-1">
                  {t.expensesPdfTo}
                  <PopupYmdDatePicker
                    value={pdfEnd}
                    onChange={(nextIso) => setPdfEnd(nextIso)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs"
                    name="expenses_pdf_to"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pdfLoading}
                  onClick={() => void fetchExpensesRegisterPdf("download")}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {pdfLoading ? "…" : t.expensesPdfDownload}
                </button>
                <button
                  type="button"
                  disabled={pdfLoading}
                  onClick={() => void fetchExpensesRegisterPdf("print")}
                  className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                >
                  {pdfLoading ? "…" : t.expensesPdfPrint}
                </button>
              </div>
            </div>
          </div>
          <p className="mb-3 text-xs text-zinc-500">{t.expensesPdfHint}</p>
          <div className="space-y-3 text-sm">
            {filteredExpenses.map((expense) => {
              const tone = expensePaymentTone(expense);
              const gross = expenseGrossTotalAmount(expense);
              const paidRec = expensePaidRecorded(expense);
              const rem = expenseRemainingAmount(expense);
              const psNorm = normalizeExpensePaymentStatus(expense.payment_status);
              return (
              <div
                key={expense.id}
                className={`rounded-md border-2 p-3 ${expenseRowToneClass(tone)}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">
                      #{expense.id} — {expense.expense_type} — {categoryLabel(expense.category)}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-700">
                      <span className="font-semibold text-zinc-900">
                        {formatCurrency(gross, currency, lang)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${expenseStatusBadgeClass(
                          expense,
                          tone,
                        )}`}
                      >
                        {paymentStatusLabel(expense.payment_status, t)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rem > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          payOpenId === expense.id ? closePayPanel() : openPayPanel(expense)
                        }
                        className="inline-flex items-center justify-center rounded-md border border-violet-400 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                      >
                        {t.expensesRecordPayment}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        editingId === expense.id ? cancelEdit() : startEdit(expense)
                      }
                      className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                      aria-label={editingId === expense.id ? t.commonCancel : t.bookingEdit}
                      title={editingId === expense.id ? t.commonCancel : t.bookingEdit}
                    >
                      {editingId === expense.id ? t.commonCancel : <PencilGlyph className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteExpense(expense)}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {gross > 0 && psNorm !== "unpaid" && (
                  <div className="mt-2 space-y-1.5 rounded-md border border-zinc-200/90 bg-white/70 px-2.5 py-2 text-xs dark:border-zinc-600 dark:bg-zinc-900/40">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        <span className="font-medium text-zinc-500">{t.commonTotal}: </span>
                        {formatCurrency(gross, currency, lang)}
                      </span>
                      <span>
                        <span className="font-medium text-zinc-500">{t.expensesPaidAmount}: </span>
                        {formatCurrency(paidRec, currency, lang)}
                      </span>
                      {rem > 0 ? (
                        <span className="font-semibold text-violet-900 dark:text-violet-200">
                          <span className="font-medium text-zinc-500">{t.expensesRemainingAmount}: </span>
                          {formatCurrency(rem, currency, lang)}
                        </span>
                      ) : (
                        <span className="text-emerald-800 dark:text-emerald-300">
                          {t.expensesPaymentPaid}
                        </span>
                      )}
                    </div>
                    {psNorm === "partial" && gross > 0 ? (
                      <div>
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          {t.expensesPaymentProgress}
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-[width]"
                            style={{
                              width: `${Math.min(100, Math.round((paidRec / gross) * 1000) / 10)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
                <dl className="mt-2 grid gap-1.5 text-xs text-zinc-700 sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesCompanyName}: </dt>
                    <dd className="inline">{expense.company_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesVendorName}: </dt>
                    <dd className="inline">{expense.vendor_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesReferenceNo}: </dt>
                    <dd className="inline">{expense.reference_no || "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesPaymentMethod}: </dt>
                    <dd className="inline">{expense.payment_method || "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesIssueDate}: </dt>
                    <dd className="inline">{expense.date ? formatYmdSlash(expense.date) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesDueDate}: </dt>
                    <dd className="inline">{expense.due_date ? formatYmdSlash(expense.due_date) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesJournalEntryShort}: </dt>
                    <dd className="inline">{expense.journal_entry ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-zinc-500">{t.expensesLinkedInvoiceShort}: </dt>
                    <dd className="inline">{expense.linked_invoice ?? "—"}</dd>
                  </div>
                </dl>

                {expense.payments && expense.payments.length > 0 && (
                  <div className="mt-2 rounded-md border border-zinc-200/90 bg-white/60 px-2.5 py-2 text-[11px] dark:border-zinc-600 dark:bg-zinc-900/35">
                    <div className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">
                      {t.expensesPaymentLines}
                    </div>
                    <ul className="max-h-28 space-y-1 overflow-y-auto text-zinc-600 dark:text-zinc-400">
                      {expense.payments.map((p) => (
                        <li key={p.id}>
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            {formatCurrency(Number(p.amount), currency, lang)}
                          </span>{" "}
                          <span className="text-zinc-500">— {p.paid_at ? formatYmdSlash(p.paid_at) : "—"}</span>
                          {p.notes ? <span className="text-zinc-500"> — {p.notes}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {payOpenId === expense.id && rem > 0 && (
                  <div className="mt-2 space-y-2 rounded-md border border-violet-200 bg-violet-50/80 p-3 text-xs dark:border-violet-800 dark:bg-violet-950/40">
                    <p className="text-[11px] leading-snug text-violet-950 dark:text-violet-100">
                      {t.expensesRecordPaymentHint}{" "}
                      <span className="font-semibold">
                        ({t.expensesPayRemaining}: {formatCurrency(rem, currency, lang)})
                      </span>
                    </p>
                    <label className="grid gap-1 text-zinc-700 dark:text-zinc-300">
                      <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.commonAmount} />
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className="w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 dark:border-violet-700 dark:bg-zinc-900"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1 text-zinc-700 dark:text-zinc-300">
                      <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={t.expensesPaymentDate} />
                      <PopupYmdDatePicker
                        value={payDate}
                        onChange={(nextIso) => setPayDate(nextIso)}
                        className="w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm dark:border-violet-700 dark:bg-zinc-900"
                        name="expense_payment_date"
                      />
                    </label>
                    <label className="grid gap-1 text-zinc-700 dark:text-zinc-300">
                      <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.expensesPaymentNoteOpt} />
                      <input
                        className="w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 dark:border-violet-700 dark:bg-zinc-900"
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={payBusy}
                        onClick={() => void submitRecordPayment(expense.id)}
                        className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                      >
                        {payBusy ? t.expensesRecordPaymentBusy : t.expensesRecordPaymentSubmit}
                      </button>
                      <button
                        type="button"
                        disabled={payBusy}
                        onClick={closePayPanel}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        {t.commonCancel}
                      </button>
                    </div>
                  </div>
                )}

                {editingId === expense.id && editForm && (
                  <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3">
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesExpenseType}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.expense_type}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, expense_type: e.target.value } : prev
                            )
                          }
                        >
                          <option value="invoice">{t.expensesTypeInvoice}</option>
                          <option value="rent">{t.expensesTypeRent}</option>
                          <option value="utilities">{t.expensesTypeUtilities}</option>
                          <option value="salary">{t.expensesTypeSalary}</option>
                          <option value="service">{t.expensesTypeService}</option>
                          <option value="other">{t.expensesTypeOther}</option>
                        </TypeableSelect>
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesPaymentStatus}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.payment_status}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? nextFormAfterPaymentStatus(prev, e.target.value) : prev
                            )
                          }
                        >
                          <option value="unpaid">{t.expensesPaymentUnpaid}</option>
                          <option value="partial">{t.expensesPaymentPartial}</option>
                          <option value="paid">{t.expensesPaymentPaid}</option>
                        </TypeableSelect>
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.expensesCategory}</span>
                      <TypeableSelect
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        value={editForm.category}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, category: e.target.value } : prev
                          )
                        }
                        required
                      >
                        <option value="">{t.expensesSelectCategory}</option>
                        {categories.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </TypeableSelect>
                    </label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesCompanyName}</span>
                        <input
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          placeholder={t.expensesCompanyName}
                          value={editForm.company_name}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, company_name: e.target.value } : prev
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesVendorName}</span>
                        <input
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          placeholder={t.expensesVendorName}
                          value={editForm.vendor_name}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, vendor_name: e.target.value } : prev
                            )
                          }
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.expensesReferenceNo}</span>
                      <input
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        placeholder={t.expensesReferenceNo}
                        value={editForm.reference_no}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, reference_no: e.target.value } : prev
                          )
                        }
                      />
                    </label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesExpenseAccount}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.account}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, account: e.target.value } : prev
                            )
                          }
                        >
                          <option value="">{t.commonSelect}</option>
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </TypeableSelect>
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesLinkedInvoiceOpt}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.linked_invoice}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, linked_invoice: e.target.value } : prev
                            )
                          }
                        >
                          <option value="">{t.commonSelect}</option>
                          {invoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number}
                            </option>
                          ))}
                        </TypeableSelect>
                      </label>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesBranch}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.branch}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, branch: e.target.value } : prev
                            )
                          }
                        >
                          <option value="">{t.commonSelect}</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.code} - {b.name}
                            </option>
                          ))}
                        </TypeableSelect>
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesCostCenter}</span>
                        <TypeableSelect
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          value={editForm.cost_center}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev ? { ...prev, cost_center: e.target.value } : prev
                            )
                          }
                        >
                          <option value="">{t.commonSelect}</option>
                          {costCenters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                        </TypeableSelect>
                      </label>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.commonAmount}</span>
                        <input
                          type="number"
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          placeholder={t.commonAmount}
                          value={editForm.amount}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev
                                ? nextFormAfterAmountTax(prev, { amount: Number(e.target.value) })
                                : prev
                            )
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesTaxAmount}</span>
                        <input
                          type="number"
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          placeholder={t.expensesTaxAmount}
                          value={editForm.tax_amount}
                          onChange={(e) =>
                            setEditForm((prev) =>
                              prev
                                ? nextFormAfterAmountTax(prev, { tax_amount: Number(e.target.value) })
                                : prev
                            )
                          }
                        />
                      </label>
                    </div>
                    {editForm.payment_status === "partial" && (
                      <div className="space-y-2 rounded-md border border-violet-100 bg-violet-50/50 p-2 dark:border-violet-900/50 dark:bg-violet-950/20">
                        <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                          {t.expensesEditPartialNote}
                        </p>
                        {expense.payments && expense.payments.length > 0 && (
                          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-zinc-600 dark:text-zinc-400">
                            {expense.payments.map((p) => (
                              <li key={p.id}>
                                {formatCurrency(Number(p.amount), currency, lang)} — {p.paid_at}
                                {p.notes ? ` — ${p.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {editForm.payment_status === "paid" && formGrossTotal(editForm) > 0 && (
                      <p className="text-xs text-zinc-600">{t.expensesPaidFullNote}</p>
                    )}
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesIssueDate}</span>
                        <PopupYmdDatePicker
                          value={editForm.date}
                          onChange={(nextIso) =>
                            setEditForm((prev) => (prev ? { ...prev, date: nextIso } : prev))
                          }
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          name="expense_edit_issue_date"
                          required
                        />
                      </label>
                      <label className="grid gap-1 text-xs text-zinc-600">
                        <span>{t.expensesDueDate}</span>
                        <PopupYmdDatePicker
                          value={editForm.due_date}
                          onChange={(nextIso) =>
                            setEditForm((prev) => (prev ? { ...prev, due_date: nextIso } : prev))
                          }
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          name="expense_edit_due_date"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.expensesPaymentMethod}</span>
                      <input
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        placeholder={t.expensesPaymentMethod}
                        value={editForm.payment_method}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, payment_method: e.target.value } : prev
                          )
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.commonNotes}</span>
                      <textarea
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        placeholder={t.commonNotes}
                        value={editForm.notes}
                        onChange={(e) =>
                          setEditForm((prev) =>
                            prev ? { ...prev, notes: e.target.value } : prev
                          )
                        }
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === editingId}
                        onClick={() => void saveEdit()}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        {savingId === editingId ? t.expensesSaving : t.expensesSaveEdit}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm"
                      >
                        {t.commonCancel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            {!filteredExpenses.length && (
              <p className="text-zinc-400">
                {expenses.length ? t.expensesFilterNoResults : t.commonNoData}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
