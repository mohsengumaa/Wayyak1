// Replaced by AR/AP-focused UI (A)
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import {
  DROPDOWN_CATEGORY_KEYS,
  fetchDropdownOptionsMap,
  mergeSearchOptions,
  type DropdownOptionRow,
} from "@/lib/dropdownOptions";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import { getToken } from "@/lib/auth";
import { requestDeleteConfirm } from "@/lib/deleteConfirm";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useModuleUiSettings } from "@/lib/useModuleUiSettings";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import { formatYmdSlash } from "@/lib/dateFormat";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MoneyIcon, NotesIcon, SearchIcon, StatusIcon, TagIcon, TicketIcon, UserIcon } from "@/components/FieldIcons";
import { HotelIcon } from "@/components/NavIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import { rowMatchesQuery } from "@/lib/search";

type Client = { id: number; name: string };
type Hotel = { id: number; name: string };
type Supplier = { id: number; name: string };
type InvoiceLine = {
  id: number;
  invoice: number;
  description: string;
  notes?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
type TaxCode = { id: number; code: string; name: string; rate: number; is_inclusive: boolean; is_active?: boolean };
type Invoice = {
  id: number;
  number: string;
  doc_type: "ar_invoice" | "ap_bill" | "credit_note" | "debit_note";
  client: number | null;
  supplier: number | null;
  hotel?: number | null;
  business_sector?: "" | "hotels" | "aviation";
  supplier_document_ref?: string;
  booking_id?: number | null;
  flight_ticket_id?: number | null;
  notes?: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  currency: string;
  fx_rate: number;
  status: string;
  lines?: InvoiceLine[];
  allocated_amount?: number;
  outstanding_amount?: number;
};
type PartyStatement = { kind: string; id: number; name: string; code: string };
type StatementSummary = {
  gross_sales_ar?: number;
  credit_notes_total?: number;
  debit_notes_total?: number;
  net_billed?: number;
  total_receipts?: number;
  outstanding_receivable?: number;
  gross_purchases_ap?: number;
  total_payments_made?: number;
  outstanding_payable?: number;
};
type StatementPayload = {
  party: PartyStatement;
  as_of: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: number | null;
  ledger: {
    row_kind: string;
    date: string;
    ref: string;
    description: string;
    increase: number;
    decrease: number;
    balance: number;
    currency: string;
    doc_type?: string;
    status?: string;
    signed_movement?: number;
    payment_id?: number;
    invoice_id?: number;
    total_amount?: number;
  }[];
  rows: {
    invoice_id: number;
    number: string;
    issue_date: string;
    due_date: string | null;
    total_amount: number;
    outstanding_amount: number;
    allocated_amount?: number;
    doc_type: string;
    status?: string;
    currency?: string;
    notes?: string;
    supplier_document_ref?: string;
    line_count: number;
    line_preview: { description: string; line_total: number; qty?: number; unit_price?: number; tax?: number }[];
    [key: string]: unknown;
  }[];
  outstanding_total: number;
  outstanding_all_invoices: number;
  aging: Record<string, number>;
  settlements: {
    id: number;
    payment_id: number;
    payment_date: string;
    invoice_number: string;
    allocated_amount: number;
    payment_amount: number;
    payment_currency?: string;
    payment_ref?: string | null;
    invoice_id?: number;
  }[];
  by_currency: Record<string, { invoiced: number; outstanding: number; allocated: number }>;
  summary: StatementSummary;
  labels?: { balance?: string };
};

const ACCOUNT_TYPE_LABELS: Record<"ar" | "en" | "tr", Record<string, string>> = {
  ar: {
    asset: "أصول",
    liability: "خصوم",
    equity: "حقوق ملكية",
    revenue: "إيرادات",
    expense: "مصروفات",
  },
  en: {
    asset: "Assets",
    liability: "Liabilities",
    equity: "Equity",
    revenue: "Revenue",
    expense: "Expenses",
  },
  tr: {
    asset: "Varliklar",
    liability: "Yukumlulukler",
    equity: "Ozsermaye",
    revenue: "Gelirler",
    expense: "Giderler",
  },
};

type ChartAccount = { id: number; code: string; name: string; account_type: string; is_active?: boolean; parent?: number | null };
type TrialBalanceResponse = {
  start: string;
  end: string;
  rows: {
    account_code: string;
    account_name: string;
    account_type?: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  totals: { debit: number; credit: number };
};
type VatSummaryApi = {
  start: string;
  end: string;
  doc_type: string | null;
  totals: { net_total: number; tax_total: number };
  by_tax_code: Record<string, { rate: number; is_inclusive: boolean; net_total: number; tax_total: number }>;
};
type GeneralLedgerResponse = {
  start: string;
  end: string;
  count: number;
  rows: {
    entry_id: number;
    entry_date: string;
    description: string;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    currency: string;
    reference_type: string;
    reference_id: number | null;
  }[];
};
type GlobalAging = { as_of: string; doc_type: string; summary: Record<string, number> };
type SettingsCategory = {
  id: number;
  name: string;
  key: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
};
type SettingsOption = {
  id: number;
  category: number;
  label: string;
  value: string;
  description?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
};
type SettingsAppSetting = {
  id: number;
  section: string;
  key: string;
  label?: string;
  value: string;
  description?: string;
  updated_at?: string;
};
type SettingsPdfAsset = {
  id: number;
  name?: string;
  url?: string;
  created_at?: string;
};

type ReservationAccountingRow = {
  id: number;
  hotel_id: number;
  voucher_nr: string;
  hotel_name: string;
  check_in: string;
  check_out: string;
  selling_price: number;
  selling_currency: string;
  confirmation_number: string;
  /** رقم فاتورة الفندق من الأوتيل (مرجع خارجي، ليس رقم سند AP في النظام) */
  hotel_invoice_ref?: string;
  linked_invoice: {
    id: number;
    number: string;
    status: string;
    issue_date: string;
    outstanding_amount: number;
    is_paid: boolean;
  } | null;
};

type PaymentAllocation = { id: number; payment: number; invoice: number; amount: number };
type Payment = {
  id: number;
  direction: "receipt" | "payment";
  client: number | null;
  supplier: number | null;
  hotel?: number | null;
  payment_date: string;
  currency: string;
  fx_rate: number;
  amount: number;
  reference?: string;
  status?: string;
  notes?: string;
  allocations?: PaymentAllocation[];
};
type CarRentalLite = { id: number; total_price: number };
type FlightTicketLite = {
  id: number;
  selling_price: number;
  selling_currency?: string;
  service_fee: number;
  service_fee_currency?: string;
  total_price: number;
  currency?: string;
  buying_price: number;
  buying_currency?: string;
};
type ExpenseLite = { id: number; amount: number; tax_amount?: number; paid_amount?: number; payment_status?: string };
type VoucherLite = {
  voucher_nr: string;
  referrer_display?: { id?: number; referrer_code?: string; name?: string } | null;
  transfer_fee?: number;
  transfer_buying_price?: number;
  transfer_currency?: string;
  reservations: {
    id: number;
    hotel?: number;
    selling_price?: number;
    selling_currency?: string;
    buying_price?: number;
    buying_currency?: string;
  }[];
};
type OpsMoneyRow = {
  accountRef?: string;
  source: string;
  entity: string;
  person?: string;
  bookingRef?: string;
  method: string;
  paymentDate?: string;
  amount: number;
  currency: string;
  note?: string;
};

const COMMON_CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

function toSupportedCurrency(code: string): "USD" | "EUR" | "TRY" {
  const c = String(code || "").toUpperCase();
  if (c === "EUR" || c === "TRY" || c === "USD") return c;
  return "USD";
}

function settlementStateFromAmounts(total: number, allocated: number, outstanding: number): "unpaid" | "partial" | "paid" {
  if (total <= 0) return "paid";
  if (outstanding <= 0.01) return "paid";
  if (allocated <= 0.01) return "unpaid";
  return "partial";
}

function addMoney(map: Record<string, number>, currencyCode: string, amount: number) {
  const c = String(currencyCode || "").toUpperCase() || "USD";
  map[c] = (map[c] || 0) + Number(amount || 0);
}

type ManualIncomeMeta = {
  accountRef?: string;
  person?: string;
  bookingRef?: string;
  method?: string;
  note?: string;
};

function encodeManualIncomeMeta(meta: ManualIncomeMeta) {
  return `MI:${JSON.stringify(meta)}`;
}

function parseManualIncomeMeta(notes?: string): ManualIncomeMeta | null {
  const raw = String(notes || "");
  if (!raw.startsWith("MI:")) return null;
  try {
    const parsed = JSON.parse(raw.slice(3)) as ManualIncomeMeta;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default function AccountingPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.accounting]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      previewTitle:
        lang === "ar" ? "معاينة الفاتورة (PDF)" : lang === "tr" ? "Fatura önizleme (PDF)" : "Invoice preview (PDF)",
      download: lang === "ar" ? "تنزيل" : lang === "tr" ? "İndir" : "Download",
      close: lang === "ar" ? "إغلاق" : lang === "tr" ? "Kapat" : "Close",
      tabInvoices: lang === "ar" ? "الفواتير" : lang === "tr" ? "Faturalar" : "Invoices",
      tabPayments: lang === "ar" ? "الدفعات" : lang === "tr" ? "Ödemeler" : "Payments",
      tabIncome: lang === "ar" ? "المدخول" : lang === "tr" ? "Gelir" : "Income",
      tabReservations: lang === "ar" ? "حجوزات / فواتير" : lang === "tr" ? "Rezervasyonlar / Faturalar" : "Reservations / Invoices",
      tabStatements: lang === "ar" ? "كشوف الحساب / Aging" : lang === "tr" ? "Hesap dökümü / Aging" : "Statements / Aging",
      tabSettings: lang === "ar" ? "إعدادات المحاسبة" : lang === "tr" ? "Muhasebe ayarları" : "Accounting settings",
      tabReports: lang === "ar" ? "التقارير" : lang === "tr" ? "Raporlar" : "Reports",
      globalSearch: lang === "ar" ? "بحث عام" : lang === "tr" ? "Genel arama" : "Global search",
      globalSearchHint:
        lang === "ar"
          ? "ابحث بأي شيء داخل التبويب الحالي (رقم، اسم، مبلغ، تاريخ…)."
          : lang === "tr"
            ? "Geçerli sekmede her şeye göre ara (numara, ad, tutar, tarih...)."
            : "Search anything in current tab (number, name, amount, date...).",
      globalSearchPlaceholder: lang === "ar" ? "اكتب للبحث…" : lang === "tr" ? "Aramak için yaz..." : "Type to search...",
      tablePdf: lang === "ar" ? "جدول PDF" : lang === "tr" ? "PDF tablo" : "Table PDF",
      loadReservationsFailed: lang === "ar" ? "تعذر تحميل الحجوزات" : lang === "tr" ? "Rezervasyonlar yuklenemedi" : "Unable to load reservations",
      loadLinksFailed: lang === "ar" ? "تعذر تحميل ربط الأقسام." : lang === "tr" ? "Bolum baglantilari yuklenemedi." : "Unable to load section links.",
      settingsLoaded: lang === "ar" ? "تم تحميل إعدادات المحاسبة." : lang === "tr" ? "Muhasebe ayarlari yuklendi." : "Accounting settings loaded.",
      settingsLoadFailed: lang === "ar" ? "تعذر تحميل الإعدادات." : lang === "tr" ? "Ayarlar yuklenemedi." : "Unable to load settings.",
      syncRemindersDone: lang === "ar" ? "تمت مزامنة تذكيرات استحقاقات الفنادق." : lang === "tr" ? "Otel vade hatirlaticilari senkronize edildi." : "Hotel due reminders synced.",
      syncRemindersSummary:
        lang === "ar"
          ? "تمت مزامنة التذكيرات"
          : lang === "tr"
            ? "Hatirlaticilar senkronize edildi"
            : "Reminders synced",
      pdfDownloadFailed: lang === "ar" ? "تعذر تنزيل PDF" : lang === "tr" ? "PDF indirilemedi" : "Unable to download PDF",
      noPartner: lang === "ar" ? "بدون شريك" : lang === "tr" ? "Ortak yok" : "No partner",
      noMethod: lang === "ar" ? "غير محدد" : lang === "tr" ? "Belirtilmemis" : "Unspecified",
      unspecifiedParty: lang === "ar" ? "جهة غير محددة" : lang === "tr" ? "Belirtilmemis taraf" : "Unspecified party",
      paymentMethodCash: lang === "ar" ? "نقدي" : lang === "tr" ? "Nakit" : "Cash",
      paymentMethodBank: lang === "ar" ? "تحويل بنكي" : lang === "tr" ? "Banka havalesi" : "Bank transfer",
      paymentMethodCard: lang === "ar" ? "بطاقة" : lang === "tr" ? "Kart" : "Card",
      paymentMethodCheque: lang === "ar" ? "شيك" : lang === "tr" ? "Cek" : "Cheque",
      paymentMethodWallet: lang === "ar" ? "محفظة إلكترونية" : lang === "tr" ? "E-cuzdan" : "E-wallet",
      paymentMethodWire: lang === "ar" ? "حوالة" : lang === "tr" ? "Havale" : "Wire transfer",
      paymentMethodOther: lang === "ar" ? "أخرى" : lang === "tr" ? "Diger" : "Other",
      mainCashbox: lang === "ar" ? "الصندوق الرئيسي" : lang === "tr" ? "Ana kasa" : "Main cashbox",
      bank: lang === "ar" ? "البنك" : lang === "tr" ? "Banka" : "Bank",
      bankUsd: lang === "ar" ? "بنك USD" : lang === "tr" ? "USD Bankasi" : "USD Bank",
      bankEur: lang === "ar" ? "بنك EUR" : lang === "tr" ? "EUR Bankasi" : "EUR Bank",
      paymentPlaceRequired: lang === "ar" ? "الحساب الذي تم الدفع منه" : lang === "tr" ? "Odemenin yapildigi hesap" : "Account paid from",
      choose: lang === "ar" ? "اختر" : lang === "tr" ? "Secin" : "Select",
      chooseSector: lang === "ar" ? "اختر القطاع: فنادق أو طيران." : lang === "tr" ? "Sektor secin: Oteller veya Havacilik." : "Select sector: Hotels or Aviation.",
      chooseHotelForInvoice: lang === "ar" ? "اختر الفندق لفاتورة الفنادق." : lang === "tr" ? "Otel faturasi icin otel secin." : "Select hotel for hotel invoice.",
      chooseSupplier: lang === "ar" ? "اختر المورّد (شركة الطيران أو الوكيل)." : lang === "tr" ? "Tedarikci secin (havayolu/acentasi)." : "Select supplier (airline/agent).",
      requireBookingId:
        lang === "ar"
          ? "أدخل معرّف سطر الحجز (الرقم من إدارة الحجوزات) لإتمام الربط والتسديد."
          : lang === "tr"
            ? "Eslestirme/odeme icin rezervasyon satir kimligini girin."
            : "Enter booking line ID to complete linking and settlement.",
      requireFlightId:
        lang === "ar"
          ? "أدخل معرّف تذكرة الطيران لإتمام الربط والتسديد."
          : lang === "tr"
            ? "Eslestirme/odeme icin ucus bileti kimligini girin."
            : "Enter flight ticket ID to complete linking and settlement.",
      chooseHotelPayments: lang === "ar" ? "اختر الفندق. الدفعات اليدوية الخارجية تكون خاصة بالفنادق فقط." : lang === "tr" ? "Otel secin. Manuel dis odemeler sadece oteller icindir." : "Select hotel. Manual outgoing payments are hotel-only.",
      amountGreaterZero: lang === "ar" ? "أدخل مبلغ قبض أكبر من الصفر." : lang === "tr" ? "Sifirdan buyuk tahsilat tutari girin." : "Enter collected amount greater than zero.",
      enterReceiveMethod: lang === "ar" ? "أدخل طريقة القبض." : lang === "tr" ? "Tahsilat yontemini girin." : "Enter collection method.",
      enterPartyName: lang === "ar" ? "أدخل اسم الجهة." : lang === "tr" ? "Taraf adini girin." : "Enter party name.",
      choosePartyFromList: lang === "ar" ? "اختر الجهة من القائمة." : lang === "tr" ? "Tarafi listeden secin." : "Select party from list.",
      partyNameUnknown: lang === "ar" ? "تعذر تحديد اسم الجهة." : lang === "tr" ? "Taraf adi belirlenemedi." : "Unable to determine party name.",
      confirmDeleteInvoicePrefix: lang === "ar" ? "هل تريد تأكيد حذف الفاتورة" : lang === "tr" ? "Faturayi silmeyi onayliyor musunuz" : "Confirm deleting invoice",
      confirmDeletePaymentPrefix: lang === "ar" ? "هل تريد تأكيد حذف الدفعة" : lang === "tr" ? "Odemeyi silmeyi onayliyor musunuz" : "Confirm deleting payment",
      confirmDelete: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      deleteInvoiceFailed: lang === "ar" ? "تعذر حذف الفاتورة." : lang === "tr" ? "Fatura silinemedi." : "Unable to delete invoice.",
      deletePaymentFailed: lang === "ar" ? "تعذر حذف الدفعة." : lang === "tr" ? "Odeme silinemedi." : "Unable to delete payment.",
      chooseClientOrHotel: lang === "ar" ? "اختر عميلاً أو فندقاً أولاً." : lang === "tr" ? "Once musteri veya otel secin." : "Select a client or hotel first.",
      loadStatementFailed: lang === "ar" ? "تعذر تحميل كشف الحساب." : lang === "tr" ? "Hesap ekstresi yuklenemedi." : "Unable to load statement.",
      loadAgingFailed: lang === "ar" ? "تعذر تحميل أعمار الدين." : lang === "tr" ? "Vade yaslandirma yuklenemedi." : "Unable to load aging.",
      invoiceBillTitle: lang === "ar" ? "فاتورة / Bill" : lang === "tr" ? "Fatura / Bill" : "Invoice / Bill",
      documentType: lang === "ar" ? "نوع المستند" : lang === "tr" ? "Belge tipi" : "Document type",
      invoiceAutoNumber: lang === "ar" ? "رقم الفاتورة: يولّد تلقائياً بواسطة السيستم" : lang === "tr" ? "Fatura no: sistem tarafindan otomatik olusturulur" : "Invoice number: auto-generated by the system",
      invoiceCurrency: lang === "ar" ? "العملة" : lang === "tr" ? "Para birimi" : "Currency",
      invoiceCurrencyHint: lang === "ar" ? "عملة الفاتورة." : lang === "tr" ? "Fatura para birimi." : "Invoice currency.",
      fxRateLabel: lang === "ar" ? "سعر الصرف" : lang === "tr" ? "Kur" : "Exchange rate",
      syncTcmb: lang === "ar" ? "مزامنة TCMB" : lang === "tr" ? "TCMB senkronize et" : "Sync TCMB",
      syncTcmbDone: lang === "ar" ? "تمت مزامنة TCMB. سيتم تحديث السعر تلقائياً." : lang === "tr" ? "TCMB senkronize edildi. Kur otomatik guncellenecek." : "TCMB synced. Rate will auto-update.",
      invoiceClient: lang === "ar" ? "العميل" : lang === "tr" ? "Musteri" : "Client",
      invoiceClientHint: lang === "ar" ? "الطرف الذي ستصدر له الفاتورة." : lang === "tr" ? "Faturanin duzenlenecegi taraf." : "Party this invoice is issued to.",
      sectorHint: lang === "ar" ? "فنادق أو طيران لتحديد الطرف والمرجع." : lang === "tr" ? "Taraf ve referans icin Oteller veya Havacilik secin." : "Choose Hotels or Aviation to define party and reference.",
      hotel: lang === "ar" ? "الفندق" : lang === "tr" ? "Otel" : "Hotel",
      chooseHotel: lang === "ar" ? "اختر الفندق" : lang === "tr" ? "Otel secin" : "Select hotel",
      aviationSupplier: lang === "ar" ? "المورّد (طيران)" : lang === "tr" ? "Tedarikci (havacilik)" : "Supplier (aviation)",
      chooseAviationSupplier: lang === "ar" ? "اختر المورّد (طيران)" : lang === "tr" ? "Tedarikci secin (havacilik)" : "Select supplier (aviation)",
      hotelInvoiceNumber: lang === "ar" ? "رقم فاتورة الفندق" : lang === "tr" ? "Otel fatura numarasi" : "Hotel invoice number",
      invoiceReference: lang === "ar" ? "مرجع الفاتورة" : lang === "tr" ? "Fatura referansi" : "Invoice reference",
      invoiceReferenceHint: lang === "ar" ? "رقم فاتورة المورد/الفندق." : lang === "tr" ? "Tedarikci/otel fatura numarasi." : "Supplier/hotel invoice number.",
      hotelInvoicePlaceholder: lang === "ar" ? "رقم فاتورة الفندق من الأوتيل" : lang === "tr" ? "Otelden gelen otel fatura no" : "Hotel invoice number from hotel",
      issueDate: lang === "ar" ? "تاريخ الإصدار" : lang === "tr" ? "Duzenleme tarihi" : "Issue date",
      dueDateOptional: lang === "ar" ? "تاريخ الاستحقاق (اختياري)" : lang === "tr" ? "Vade tarihi (opsiyonel)" : "Due date (optional)",
      invoiceNotesHint: lang === "ar" ? "ملاحظات عامة تظهر على الفاتورة/للمراجعة." : lang === "tr" ? "Faturada/gözden gecirme icin genel notlar." : "General notes shown on invoice/for review.",
      invoiceLines: lang === "ar" ? "بنود الفاتورة" : lang === "tr" ? "Fatura satirlari" : "Invoice lines",
      description: lang === "ar" ? "الوصف" : lang === "tr" ? "Aciklama" : "Description",
      quantity: lang === "ar" ? "الكمية" : lang === "tr" ? "Miktar" : "Quantity",
      unitPrice: lang === "ar" ? "سعر" : lang === "tr" ? "Fiyat" : "Price",
      tax: lang === "ar" ? "الضريبة" : lang === "tr" ? "Vergi" : "Tax",
      action: lang === "ar" ? "إجراء" : lang === "tr" ? "Islem" : "Action",
      noTax: lang === "ar" ? "بدون ضريبة" : lang === "tr" ? "Vergisiz" : "No tax",
      noteLabel: lang === "ar" ? "ملاحظة" : lang === "tr" ? "Not" : "Note",
      tryEquivalent: lang === "ar" ? "المعادل TRY" : lang === "tr" ? "TRY karsiligi" : "TRY equivalent",
      preview: lang === "ar" ? "معاينة" : lang === "tr" ? "Onizleme" : "Preview",
      paidFull: lang === "ar" ? "مدفوعة بالكامل" : lang === "tr" ? "Tam odendi" : "Fully paid",
      paidPartial: lang === "ar" ? "مدفوعة جزئيًا" : lang === "tr" ? "Kismen odendi" : "Partially paid",
      unpaid: lang === "ar" ? "غير مدفوعة" : lang === "tr" ? "Odenmedi" : "Unpaid",
      paymentRatio: lang === "ar" ? "نسبة التسديد" : lang === "tr" ? "Odeme orani" : "Payment ratio",
      incomeSection: lang === "ar" ? "قسم المدخول (الإيرادات)" : lang === "tr" ? "Gelir bolumu" : "Income section",
      outgoingSection: lang === "ar" ? "قسم الخارج (الدفعات والمصاريف)" : lang === "tr" ? "Gider bolumu (odemeler ve masraflar)" : "Outgoing section (payments and expenses)",
      paymentTitle: lang === "ar" ? "دفعة" : lang === "tr" ? "Odeme" : "Payment",
      paymentType: lang === "ar" ? "نوع الدفعة" : lang === "tr" ? "Odeme tipi" : "Payment type",
      paymentTypeHint: lang === "ar" ? "دفعة فندق فقط." : lang === "tr" ? "Sadece otel odemesi." : "Hotel payment only.",
      paymentDate: lang === "ar" ? "تاريخ الدفعة" : lang === "tr" ? "Odeme tarihi" : "Payment date",
      incomeManualEntry: lang === "ar" ? "إدخال قبض يدوي" : lang === "tr" ? "Manuel tahsilat girisi" : "Manual collection entry",
      accountRef: lang === "ar" ? "معرّف الحساب" : lang === "tr" ? "Hesap referansi" : "Account reference",
      noAccountSpecified: lang === "ar" ? "بدون حساب محدد" : lang === "tr" ? "Hesap belirtilmedi" : "No account specified",
      partyType: lang === "ar" ? "نوع الجهة" : lang === "tr" ? "Taraf tipi" : "Party type",
      partyOrPerson: lang === "ar" ? "الشخص / الجهة" : lang === "tr" ? "Kisi / taraf" : "Person / party",
      chooseParty: lang === "ar" ? "اختر الجهة" : lang === "tr" ? "Taraf secin" : "Select party",
      bookingRef: lang === "ar" ? "الحجز / المرجع" : lang === "tr" ? "Rezervasyon / referans" : "Booking / reference",
      noBookingRef: lang === "ar" ? "بدون مرجع حجز" : lang === "tr" ? "Rezervasyon referansi yok" : "No booking reference",
      receiveMethod: lang === "ar" ? "طريقة القبض" : lang === "tr" ? "Tahsilat yontemi" : "Collection method",
      collectionDate: lang === "ar" ? "تاريخ القبض" : lang === "tr" ? "Tahsilat tarihi" : "Collection date",
      receivedAmount: lang === "ar" ? "المبلغ المقبوض" : lang === "tr" ? "Tahsil edilen tutar" : "Collected amount",
      addManualCollection: lang === "ar" ? "إضافة قبض يدوي" : lang === "tr" ? "Manuel tahsilat ekle" : "Add manual collection",
      resetFilters: lang === "ar" ? "تصفير الفلاتر" : lang === "tr" ? "Filtreleri sifirla" : "Reset filters",
      paymentsListTitle: lang === "ar" ? "الدفعات" : lang === "tr" ? "Odemeler" : "Payments",
      net: lang === "ar" ? "الصافي" : lang === "tr" ? "Net" : "Net",
      vatTax: lang === "ar" ? "الضريبة" : lang === "tr" ? "KDV/Vergi" : "VAT/Tax",
      smartInvoiceMonitor: lang === "ar" ? "مراقبة ذكية للفواتير" : lang === "tr" ? "Akilli fatura izleme" : "Smart Invoice Monitor",
      allTypes: lang === "ar" ? "كل الأنواع" : lang === "tr" ? "Tum turler" : "All types",
      arInvoice: lang === "ar" ? "فاتورة AR" : lang === "tr" ? "AR Faturasi" : "AR Invoice",
      apBill: lang === "ar" ? "فاتورة AP" : lang === "tr" ? "AP Faturasi" : "AP Bill",
      creditNote: lang === "ar" ? "إشعار دائن" : lang === "tr" ? "Alacak dekontu" : "Credit Note",
      debitNote: lang === "ar" ? "إشعار مدين" : lang === "tr" ? "Borc dekontu" : "Debit Note",
      allStatuses: lang === "ar" ? "كل الحالات" : lang === "tr" ? "Tum durumlar" : "All statuses",
      draft: lang === "ar" ? "مسودة" : lang === "tr" ? "Taslak" : "Draft",
      sent: lang === "ar" ? "مرسلة" : lang === "tr" ? "Gonderildi" : "Sent",
      paid: lang === "ar" ? "مدفوعة" : lang === "tr" ? "Odendi" : "Paid",
      overdue: lang === "ar" ? "متأخرة" : lang === "tr" ? "Gecikmis" : "Overdue",
      allParties: lang === "ar" ? "كل الجهات" : lang === "tr" ? "Tum taraflar" : "All parties",
      arClients: lang === "ar" ? "عملاء AR" : lang === "tr" ? "AR musterileri" : "AR clients",
      apHotels: lang === "ar" ? "فنادق AP" : lang === "tr" ? "AP otelleri" : "AP hotels",
      apAviation: lang === "ar" ? "طيران AP" : lang === "tr" ? "AP havacilik" : "AP aviation",
      allCurrencies: lang === "ar" ? "كل العملات" : lang === "tr" ? "Tum para birimleri" : "All currencies",
      newestFirst: lang === "ar" ? "الأحدث أولاً" : lang === "tr" ? "En yeni once" : "Newest first",
      oldestFirst: lang === "ar" ? "الأقدم أولاً" : lang === "tr" ? "En eski once" : "Oldest first",
      highestOutstanding: lang === "ar" ? "أعلى متبقٍ" : lang === "tr" ? "En yuksek kalan" : "Highest outstanding",
      highestTotal: lang === "ar" ? "أعلى إجمالي" : lang === "tr" ? "En yuksek toplam" : "Highest total",
      overdueOnly: lang === "ar" ? "متأخرات فقط" : lang === "tr" ? "Sadece gecikmisler" : "Overdue only",
      invoiceCount: lang === "ar" ? "عدد الفواتير" : lang === "tr" ? "Fatura sayisi" : "Invoice count",
      outstanding: lang === "ar" ? "المتبقي" : lang === "tr" ? "Kalan" : "Outstanding",
      paidDraft: lang === "ar" ? "المسدّد / مسودة" : lang === "tr" ? "Odendi / Taslak" : "Paid / Draft",
      sectorHotels: lang === "ar" ? "فنادق" : lang === "tr" ? "Oteller" : "Hotels",
      sectorAviation: lang === "ar" ? "طيران" : lang === "tr" ? "Havacilik" : "Aviation",
      due: lang === "ar" ? "استحقاق" : lang === "tr" ? "Vade" : "Due",
      delayDays: lang === "ar" ? "تأخير" : lang === "tr" ? "Gecikme" : "Delay",
      incomingRef: lang === "ar" ? "وارد" : lang === "tr" ? "Gelen" : "Incoming",
      bookingRefShort: lang === "ar" ? "حجز" : lang === "tr" ? "Rezervasyon" : "Booking",
      ticketRefShort: lang === "ar" ? "تذكرة" : lang === "tr" ? "Bilet" : "Ticket",
      incomingPaymentsAccounting: lang === "ar" ? "الدفعات المقبوضة - المحاسبة" : lang === "tr" ? "Gelen Odemeler - Muhasebe" : "Incoming Payments - Accounting",
      account: lang === "ar" ? "الحساب" : lang === "tr" ? "Hesap" : "Account",
      source: lang === "ar" ? "المصدر" : lang === "tr" ? "Kaynak" : "Source",
      party: lang === "ar" ? "الجهة" : lang === "tr" ? "Taraf" : "Party",
      reference: lang === "ar" ? "المرجع" : lang === "tr" ? "Referans" : "Reference",
      method: lang === "ar" ? "الطريقة" : lang === "tr" ? "Yontem" : "Method",
      date: lang === "ar" ? "التاريخ" : lang === "tr" ? "Tarih" : "Date",
      amount: lang === "ar" ? "المبلغ" : lang === "tr" ? "Tutar" : "Amount",
      note: lang === "ar" ? "ملاحظة" : lang === "tr" ? "Not" : "Note",
      incomeCenter: lang === "ar" ? "مركز المدخول" : lang === "tr" ? "Gelir merkezi" : "Income Center",
      incomeManualHint:
        lang === "ar"
          ? "سجّل أي مبلغ قبضته يدويًا مع الشخص ومرجع الحجز وطريقة القبض."
          : lang === "tr"
            ? "Manuel tahsil ettiginiz tutari kisi, rezervasyon referansi ve yontemle kaydedin."
            : "Record any manually collected amount with party, booking reference, and method.",
      partyTypeClient: lang === "ar" ? "عميل" : lang === "tr" ? "Musteri" : "Client",
      partyTypeHotel: lang === "ar" ? "فندق" : lang === "tr" ? "Otel" : "Hotel",
      partyTypeSupplier: lang === "ar" ? "مورد" : lang === "tr" ? "Tedarikci" : "Supplier",
      partyTypeOther: lang === "ar" ? "أخرى" : lang === "tr" ? "Diger" : "Other",
      partyNamePlaceholder: lang === "ar" ? "اسم الجهة" : lang === "tr" ? "Taraf adi" : "Party name",
      totalFormula:
        lang === "ar"
          ? "الإجمالي = (الكمية × السعر) + الضريبة."
          : lang === "tr"
            ? "Toplam = (Miktar x Fiyat) + Vergi."
            : "Total = (Qty x Unit Price) + Tax.",
      invoicesAccounting: lang === "ar" ? "الفواتير - المحاسبة" : lang === "tr" ? "Faturalar - Muhasebe" : "Invoices - Accounting",
      number: lang === "ar" ? "الرقم" : lang === "tr" ? "Numara" : "Number",
      type: lang === "ar" ? "النوع" : lang === "tr" ? "Tur" : "Type",
      status: lang === "ar" ? "الحالة" : lang === "tr" ? "Durum" : "Status",
      dueDate: lang === "ar" ? "تاريخ الاستحقاق" : lang === "tr" ? "Vade tarihi" : "Due Date",
      outgoingPaymentsAccounting: lang === "ar" ? "الدفعات الخارجة - المحاسبة" : lang === "tr" ? "Giden Odemeler - Muhasebe" : "Outgoing Payments - Accounting",
      outflowCenter: lang === "ar" ? "مركز الخارج" : lang === "tr" ? "Gider merkezi" : "Outflow Center",
      outflowSearchPlaceholder:
        lang === "ar"
          ? "بحث: جهة، حجز، طريقة دفع، ملاحظة..."
          : lang === "tr"
            ? "Ara: taraf, rezervasyon, odeme yontemi, not..."
            : "Search: party, booking, payment method, note...",
      allSources: lang === "ar" ? "كل المصادر" : lang === "tr" ? "Tum kaynaklar" : "All sources",
      allPaymentMethods: lang === "ar" ? "كل طرق الدفع" : lang === "tr" ? "Tum odeme yontemleri" : "All payment methods",
      outflowTotalFiltered: lang === "ar" ? "إجمالي الخارج (حسب الفلاتر)" : lang === "tr" ? "Toplam cikis (filtrelere gore)" : "Total outflow (filtered)",
      outflowByCurrencyFiltered:
        lang === "ar"
          ? "الخارج حسب العملة (حسب الفلاتر)"
          : lang === "tr"
            ? "Para birimine gore cikis (filtrelere gore)"
            : "Outflow by currency (filtered)",
      outflowDetailsTitle:
        lang === "ar"
          ? "تفصيل الخارج: الحساب، الجهة، المرجع، وطريقة الدفع"
          : lang === "tr"
            ? "Cikis detayi: hesap, taraf, referans ve odeme yontemi"
            : "Outflow details: account, party, reference, and payment method",
      noOutflowData: lang === "ar" ? "لا توجد بيانات خارج" : lang === "tr" ? "Giden veri yok" : "No outflow data",
      paymentComposer: lang === "ar" ? "منشئ الدفعات" : lang === "tr" ? "Odeme olusturucu" : "Payment Composer",
      paymentAllocation: lang === "ar" ? "توزيع الدفعة" : lang === "tr" ? "Odeme dagitimi" : "Payment allocation",
      invoiceLabel: lang === "ar" ? "الفاتورة" : lang === "tr" ? "Fatura" : "Invoice",
      invoiceOutstandingHint:
        lang === "ar"
          ? "اختر فاتورة عليها رصيد مستحق."
          : lang === "tr"
            ? "Bakiyesi olan bir fatura secin."
            : "Select an invoice with outstanding balance.",
      chooseInvoice: lang === "ar" ? "اختر فاتورة" : lang === "tr" ? "Fatura secin" : "Select invoice",
      outstandingShort: lang === "ar" ? "المتبقي" : lang === "tr" ? "Kalan" : "outstanding",
      paymentLedgerView: lang === "ar" ? "عرض دفتر الدفعات" : lang === "tr" ? "Odeme defteri gorunumu" : "Payment Ledger View",
      allocationsCount: lang === "ar" ? "تخصيصات" : lang === "tr" ? "dagitimlar" : "allocations",
      allocated: lang === "ar" ? "مخصّص" : lang === "tr" ? "Dagitilan" : "Allocated",
      unallocated: lang === "ar" ? "غير مخصّص" : lang === "tr" ? "Dagitilmayan" : "Unallocated",
      incomeNotePlaceholder:
        lang === "ar"
          ? "تفاصيل إضافية عن القبض"
          : lang === "tr"
            ? "Tahsilatla ilgili ek detaylar"
            : "Additional collection details",
      incomeSearchPlaceholder:
        lang === "ar"
          ? "بحث: شخص، حجز، طريقة قبض، ملاحظة..."
          : lang === "tr"
            ? "Ara: kisi, rezervasyon, tahsilat yontemi, not..."
            : "Search: person, booking, collection method, note...",
      allCollectionMethods: lang === "ar" ? "كل طرق القبض" : lang === "tr" ? "Tum tahsilat yontemleri" : "All collection methods",
      incomeTotalFiltered: lang === "ar" ? "إجمالي المدخول (حسب الفلاتر)" : lang === "tr" ? "Toplam gelir (filtrelere gore)" : "Total income (filtered)",
      incomeByCurrencyFiltered:
        lang === "ar"
          ? "المدخول حسب العملة (حسب الفلاتر)"
          : lang === "tr"
            ? "Para birimine gore gelir (filtrelere gore)"
            : "Income by currency (filtered)",
      incomeDetailsTitle:
        lang === "ar"
          ? "تفصيل المدخول: الحساب، الشخص، الحجز، وطريقة القبض"
          : lang === "tr"
            ? "Gelir detayi: hesap, kisi, rezervasyon ve tahsilat yontemi"
            : "Income details: account, person, booking, and collection method",
      collectionMethod: lang === "ar" ? "طريقة الاستلام" : lang === "tr" ? "Tahsilat yontemi" : "Collection method",
      noIncomeData: lang === "ar" ? "لا توجد بيانات مدخول" : lang === "tr" ? "Gelir verisi yok" : "No income data",
      reservationsSupplierApTitle:
        lang === "ar" ? "حجوزات الفنادق وفواتير المورد (AP)" : lang === "tr" ? "Otel rezervasyonlari ve tedarikci faturasi (AP)" : "Hotel reservations and supplier invoices (AP)",
      saveHotelInvoiceRefStrong: lang === "ar" ? "احفظ رقم فاتورة الفندق" : lang === "tr" ? "Otel fatura numarasini kaydedin" : "Save hotel invoice number",
      createApVoucherStrong: lang === "ar" ? "أنشئ سند AP" : lang === "tr" ? "AP fisini olusturun" : "Create AP voucher",
      reservationsApHintTail:
        lang === "ar"
          ? "من الأوتيل (برتقالي) ثم"
          : lang === "tr"
            ? "Otelden (turuncu) ve sonra"
            : "from the hotel (orange), then",
      reservationsApHintTail2:
        lang === "ar"
          ? "(يصير أخضر). لا يُفعّل زر سند AP قبل حفظ رقم الفاتورة."
          : lang === "tr"
            ? "(yesil olur). Fatura no kaydedilmeden AP fis butonu aktif olmaz."
            : "(turns green). AP voucher button is disabled until invoice number is saved.",
      hotelReservationsApAccounting:
        lang === "ar" ? "حجوزات الفنادق AP - المحاسبة" : lang === "tr" ? "Otel Rezervasyonlari AP - Muhasebe" : "Hotel Reservations AP - Accounting",
      voucher: lang === "ar" ? "القسيمة" : lang === "tr" ? "Voucher" : "Voucher",
      checkIn: lang === "ar" ? "الدخول" : lang === "tr" ? "Giris" : "Check-in",
      checkOut: lang === "ar" ? "الخروج" : lang === "tr" ? "Cikis" : "Check-out",
      hotelRef: lang === "ar" ? "مرجع الفندق" : lang === "tr" ? "Otel referansi" : "Hotel Ref",
      linkedApInvoice: lang === "ar" ? "فاتورة AP المرتبطة" : lang === "tr" ? "Bagli AP faturasi" : "Linked AP Invoice",
      show: lang === "ar" ? "عرض" : lang === "tr" ? "Goster" : "Show",
      all: lang === "ar" ? "الكل" : lang === "tr" ? "Tum" : "All",
      invoicedOnly: lang === "ar" ? "مفوترة فقط" : lang === "tr" ? "Sadece faturalanan" : "Invoiced only",
      uninvoiced: lang === "ar" ? "غير مفوترة" : lang === "tr" ? "Faturalanmamis" : "Uninvoiced",
      hotelFilter: lang === "ar" ? "فندق" : lang === "tr" ? "Otel" : "Hotel",
      filterByHotel: lang === "ar" ? "تصفية حسب الفندق" : lang === "tr" ? "Otele gore filtrele" : "Filter by hotel",
      allHotels: lang === "ar" ? "كل الفنادق" : lang === "tr" ? "Tum oteller" : "All hotels",
      apVoucherCreated: lang === "ar" ? "سند AP مُنشأ" : lang === "tr" ? "AP fisi olusturuldu" : "AP voucher created",
      hotelInvoiceRefSavedOnly: lang === "ar" ? "رقم فاتورة فندق محفوظ فقط" : lang === "tr" ? "Sadece otel fatura no kayitli" : "Only hotel invoice number saved",
      noRecord: lang === "ar" ? "بدون تسجيل" : lang === "tr" ? "Kayit yok" : "No record",
      confirmation: lang === "ar" ? "تأكيد" : lang === "tr" ? "Onay" : "Confirmation",
      apVoucherLabel: lang === "ar" ? "سند AP" : lang === "tr" ? "AP fisi" : "AP voucher",
      issuedOn: lang === "ar" ? "بإصدار" : lang === "tr" ? "Duzenleme" : "Issued",
      savedCreateApWhenReady:
        lang === "ar"
          ? "رقم فاتورة الفندق:"
          : lang === "tr"
            ? "Otel fatura numarasi:"
            : "Hotel invoice number:",
      savedCreateApWhenReadyTail:
        lang === "ar"
          ? "— محفوظ — أنشئ سند AP عند التجهيز"
          : lang === "tr"
            ? "— kayitli — hazir oldugunda AP fisi olusturun"
            : "— saved — create AP voucher when ready",
      registerHotelInvoiceFirst:
        lang === "ar" ? "سجّل رقم فاتورة الفندق أولاً" : lang === "tr" ? "Once otel fatura numarasini kaydedin" : "Save hotel invoice number first",
      hotelInvoiceNumberHelp:
        lang === "ar"
          ? "من الأوتيل. بعد الحفظ يصير السطر برتقالي. حقل فارغ + حفظ يزيل التسجيل."
          : lang === "tr"
            ? "Otelden gelen numara. Kayit sonrasi satir turuncu olur. Bos alan + kaydet kaydi kaldirir."
            : "From the hotel. After saving, row turns orange. Empty field + save clears the record.",
      saving: lang === "ar" ? "جاري الحفظ…" : lang === "tr" ? "Kaydediliyor…" : "Saving…",
      clearRecord: lang === "ar" ? "إزالة التسجيل" : lang === "tr" ? "Kaydi kaldir" : "Clear record",
      afterSaveApHelp:
        lang === "ar" ? "بعد حفظ رقم فاتورة الفندق يُفعّل الزر. السطر يصير أخضر." : lang === "tr" ? "Otel fatura no kaydedildikten sonra buton aktif olur. Satir yesile doner." : "After saving hotel invoice number, button is enabled and row turns green.",
      saveHotelInvoiceFirstTitle:
        lang === "ar" ? "سجّل رقم فاتورة الفندق واضغط «حفظ» أولاً" : lang === "tr" ? "Once otel fatura no kaydedip «Kaydet»e basin" : "Save hotel invoice number and click Save first",
      creating: lang === "ar" ? "جاري الإنشاء…" : lang === "tr" ? "Olusturuluyor…" : "Creating…",
      createApVoucher: lang === "ar" ? "إنشاء سند AP" : lang === "tr" ? "AP fisi olustur" : "Create AP voucher",
      noReservationsForHotelFilter:
        lang === "ar" ? "لا حجوزات لهذا الفندق مع عرض التصفية الحالي." : lang === "tr" ? "Bu otel icin mevcut filtrede rezervasyon yok." : "No reservations for this hotel with current filter.",
      noReservationsInCurrentFilter:
        lang === "ar" ? "لا حجوزات في هذا التصفية." : lang === "tr" ? "Bu filtrede rezervasyon yok." : "No reservations in this filter.",
      unableCreateHotelInvoice:
        lang === "ar" ? "تعذر إنشاء سند AP للفندق" : lang === "tr" ? "Otel AP fisi olusturulamadi" : "Unable to create hotel AP invoice",
      unableSaveHotelInvoiceNumber:
        lang === "ar" ? "تعذر حفظ رقم فاتورة الفندق" : lang === "tr" ? "Otel fatura numarasi kaydedilemedi" : "Unable to save hotel invoice number",
      unableClearHotelInvoiceNumber:
        lang === "ar" ? "تعذر إزالة رقم فاتورة الفندق" : lang === "tr" ? "Otel fatura numarasi kaldirilamadi" : "Unable to clear hotel invoice number",
      statementGuideTitle: lang === "ar" ? "دليل استخدام كشف الحساب" : lang === "tr" ? "Hesap ekstresi kullanim rehberi" : "Statement usage guide",
      statementGuideItem1:
        lang === "ar"
          ? "اختر نوع الطرف: عميل لذمم المبيعات (فواتير AR، مقبوضات) أو فندق لذمم المشتريات (AP، مدفوعات)."
          : lang === "tr"
            ? "Taraf tipini secin: satis alacaklari icin musteri (AR faturalari, tahsilatlar) veya alim borclari icin otel (AP, odemeler)."
            : "Choose party type: client for sales receivables (AR invoices, receipts) or hotel for purchase payables (AP, payments).",
      statementGuideItem2: lang === "ar" ? "اختر اسم العميل أو الفندق من القائمة." : lang === "tr" ? "Listeden musteri veya otel secin." : "Choose client or hotel from the list.",
      statementGuideItem3:
        lang === "ar"
          ? "(اختياري) حدّد من تاريخ/إلى تاريخ لتقييد الحركة والفواتير والتصفيات، مع إظهار رصيد افتتاحي عند إدخال «من تاريخ» فقط."
          : lang === "tr"
            ? "(Opsiyonel) Hareket, fatura ve dagitimlari sinirlamak icin baslangic/bitis tarihi secin; sadece baslangic tarihi varsa acilis bakiyesi gosterilir."
            : "(Optional) Set from/to dates to limit ledger, invoices, and settlements; opening balance appears when only from-date is set.",
      statementGuideItem4:
        lang === "ar"
          ? "اضغط «تحديث الكشف الكامل» لعرض الملخص، العملات، دفتر الحركة، التصفيات، الفواتير مع البنود، ثم أعمار الدين."
          : lang === "tr"
            ? "Ozet, para birimleri, hareket defteri, dagitimlar, satirli faturalar ve yaslandirma icin \"Tam ekstreyi yenile\"ye basin."
            : "Click “Refresh full statement” to load summary, currencies, ledger, settlements, invoices with lines, then aging.",
      statementGuideItem5:
        lang === "ar"
          ? "زر Aging يحدّث أعمدة أعمار الدين فقط بدون إعادة تحميل باقي الأقسام."
          : lang === "tr"
            ? "Aging dugmesi sadece yaslandirma sutunlarini gunceller, diger bolumleri yeniden yuklemez."
            : "Aging button refreshes only aging buckets without reloading other sections.",
      statementGuideNote:
        lang === "ar"
          ? "ملاحظة: تبويب «تقارير» منفصل — فيه ميزان مراجعة وضريبة ودفتر أستاذ عام لعامة النظام."
          : lang === "tr"
            ? "Not: \"Raporlar\" sekmesi ayridir; trial balance, vergi ozeti ve genel defter raporlari vardir."
            : "Note: the Reports tab is separate and includes trial balance, tax summary, and general ledger.",
      statementPartyTitle: lang === "ar" ? "كشف حساب الطرف (عميل / فندق)" : lang === "tr" ? "Taraf ekstresi (Musteri / Otel)" : "Party statement (Client / Hotel)",
      statementPartySubtitle:
        lang === "ar"
          ? "تقرير واحد يجمع: الملخص، الحركة، التصفيات، الفواتير والبنود، والأعمار — حسب النطاق الذي تختاره."
          : lang === "tr"
            ? "Tek rapor: ozet, hareket, dagitimlar, fatura/satirlar ve yaslandirma - sectiginiz araliga gore."
            : "One report combining summary, movement, settlements, invoices with lines, and aging by selected range.",
      statementInvoicesAccounting: lang === "ar" ? "فواتير كشف الحساب - المحاسبة" : lang === "tr" ? "Ekstre Faturalari - Muhasebe" : "Statement Invoices - Accounting",
      statementStudio: lang === "ar" ? "استوديو الكشف" : lang === "tr" ? "Ekstre studyosu" : "Statement Studio",
      statementTargetClient: lang === "ar" ? "عميل (ذمم مدينة AR)" : lang === "tr" ? "Musteri (AR alacak)" : "Client (AR receivable)",
      statementTargetHotel: lang === "ar" ? "فندق (ذمم دائنة AP)" : lang === "tr" ? "Otel (AP borc)" : "Hotel (AP payable)",
      chooseTargetParty: lang === "ar" ? "اختر الطرف" : lang === "tr" ? "Taraf secin" : "Select party",
      quickRange: lang === "ar" ? "نطاق سريع" : lang === "tr" ? "Hizli aralik" : "Quick range",
      thisMonth: lang === "ar" ? "هذا الشهر" : lang === "tr" ? "Bu ay" : "This month",
      thisQuarter: lang === "ar" ? "هذا الربع" : lang === "tr" ? "Bu ceyrek" : "This quarter",
      yearToDate: lang === "ar" ? "منذ بداية السنة" : lang === "tr" ? "Yil basindan beri" : "Year to date",
      allDates: lang === "ar" ? "كل التواريخ" : lang === "tr" ? "Tum tarihler" : "All dates",
      refreshFullStatement: lang === "ar" ? "تحديث الكشف الكامل" : lang === "tr" ? "Tam ekstreyi yenile" : "Refresh full statement",
      refreshAgingOnly: lang === "ar" ? "تحديث أعمار الدين فقط" : lang === "tr" ? "Sadece aging yenile" : "Refresh aging only",
      asOf: lang === "ar" ? "كما في" : lang === "tr" ? "Tarih itibariyla" : "As of",
      movementRangeFrom: lang === "ar" ? "نطاق الحركة: من" : lang === "tr" ? "Hareket araligi: baslangic" : "Movement range: from",
      openingBalance: lang === "ar" ? "رصيد افتتاحي" : lang === "tr" ? "Acilis bakiyesi" : "Opening balance",
      outstandingInvoicesInTable:
        lang === "ar"
          ? "متبقٍ (فواتير ضمن نطاق جدول الفواتير)"
          : lang === "tr"
            ? "Kalan (fatura tablosu araligindaki faturalar)"
            : "Outstanding (invoices within invoice-table range)",
      totalExposure:
        lang === "ar"
          ? "ذمة إجمالية (كل سندات الطرف — غير مُسدد)"
          : lang === "tr"
            ? "Toplam risk (tarafin tum belgeleri - odenmemis)"
            : "Total exposure (all party documents — unpaid)",
      totalSalesAr: lang === "ar" ? "إجمالي مبيعات (AR)" : lang === "tr" ? "Toplam satis (AR)" : "Total sales (AR)",
      creditDebitNotes: lang === "ar" ? "إشعارات دائن / مدين" : lang === "tr" ? "Alacak / borc notlari" : "Credit / debit notes",
      netBilling: lang === "ar" ? "صافي الفوترة" : lang === "tr" ? "Net faturalama" : "Net billed",
      totalReceipts: lang === "ar" ? "إجمالي المقبوضات" : lang === "tr" ? "Toplam tahsilat" : "Total receipts",
      outstandingReceivablesAll: lang === "ar" ? "ديون/ذمم مستحقة (كل الفواتير)" : lang === "tr" ? "Bekleyen alacaklar (tum faturalar)" : "Outstanding receivables (all invoices)",
      totalPurchasesAp: lang === "ar" ? "إجمالي فواتير المشتريات (AP)" : lang === "tr" ? "Toplam alim faturasi (AP)" : "Total purchase invoices (AP)",
      netPayable: lang === "ar" ? "صافي الاستحقاق" : lang === "tr" ? "Net borcluluk" : "Net payable",
      totalPaidToSupplierHotel: lang === "ar" ? "إجمالي المدفوع للمورد/الفندق" : lang === "tr" ? "Tedarikci/otele toplam odeme" : "Total paid to supplier/hotel",
      outstandingPayables: lang === "ar" ? "مستحقات/ديون (متبقي)" : lang === "tr" ? "Bekleyen borclar" : "Outstanding payables",
      byCurrencyInRange:
        lang === "ar"
          ? "حسب العملة (أرقام بعملة السند، ضمن نطاق الجدول)"
          : lang === "tr"
            ? "Para birimine gore (belge para birimi, tablo araliginda)"
            : "By currency (document currency amounts, within table range)",
      invoiced: lang === "ar" ? "مفوتر" : lang === "tr" ? "Faturalanan" : "Invoiced",
      settled: lang === "ar" ? "مسدد" : lang === "tr" ? "Tahsil/odeme" : "Settled",
      movementLedgerTitle: lang === "ar" ? "دفتر حركة (الترحيل الزمني)" : lang === "tr" ? "Hareket defteri (zaman sirasi)" : "Movement ledger (chronological)",
      movementLedgerHint:
        lang === "ar"
          ? "كل سند (فاتورة/إشعار) ودفعة في النطاق؛ الرصيد تراكمي بعملة العرض للأرقام."
          : lang === "tr"
            ? "Araliktaki her belge (fatura/not) ve odeme; bakiye gosterim para biriminde kumulatiftir."
            : "Every document (invoice/note) and payment in range; balance is cumulative in display currency.",
      descriptionLabel: lang === "ar" ? "البيان" : lang === "tr" ? "Aciklama" : "Description",
      increase: lang === "ar" ? "زيادة" : lang === "tr" ? "Artis" : "Increase",
      decrease: lang === "ar" ? "نقصان" : lang === "tr" ? "Azalis" : "Decrease",
      movement: lang === "ar" ? "حركة" : lang === "tr" ? "Hareket" : "Movement",
      balanceLabel: lang === "ar" ? "الرصيد" : lang === "tr" ? "Bakiye" : "Balance",
      choosePartyAndRefresh:
        lang === "ar"
          ? "اختر عميل/فندق واضغط «تحديث الكشف الكامل»"
          : lang === "tr"
            ? "Musteri/otel secip \"Tam ekstreyi yenile\"ye basin"
            : "Select client/hotel and click “Refresh full statement”",
      settlementsTitle: lang === "ar" ? "تصفيات (ربط دفعات على فواتير)" : lang === "tr" ? "Dagitimlar (odemeleri faturalara bagla)" : "Settlements (allocating payments to invoices)",
      settlementsHint:
        lang === "ar"
          ? "كل تخصيص مبلغ من دفعة إلى فاتورة ضمن فترة تواريخ الدفعة عند اختيار نطاق."
          : lang === "tr"
            ? "Aralik secildiginde, odeme tarihi araligindaki tum dagitimlar."
            : "Each amount allocation from payment to invoice within payment-date range.",
      paymentRef: lang === "ar" ? "مرجع دفعة" : lang === "tr" ? "Odeme referansi" : "Payment reference",
      paymentCurrency: lang === "ar" ? "ع. دفعة" : lang === "tr" ? "Odeme p.b." : "Pay ccy",
      allocatedToInvoice: lang === "ar" ? "مخصص للفاتورة" : lang === "tr" ? "Faturaya dagitilan" : "Allocated to invoice",
      paymentAmountLabel: lang === "ar" ? "مبلغ الدفعة" : lang === "tr" ? "Odeme tutari" : "Payment amount",
      noSettlementsInRange: lang === "ar" ? "لا توجد تصفيات في النطاق" : lang === "tr" ? "Aralikta dagitim yok" : "No settlements in range",
      invoicesWithLinesTitle: lang === "ar" ? "فواتير وأرقام — مع بنود" : lang === "tr" ? "Faturalar ve numaralar — satirlarla" : "Invoices and numbers — with lines",
      invoicesWithLinesHint:
        lang === "ar"
          ? "السندات ضمن نطاق تواريخ الإصدار؛ المتبقي حسب تخصيصات الدفعات. يصل العرض حتى 30 بنداً لكل فاتورة في القائمة."
          : lang === "tr"
            ? "Belgeler duzenleme tarihi araliginda; kalan tutar odeme dagitimina gore. Listede fatura basina en fazla 30 satir."
            : "Documents within issue-date range; outstanding based on payment allocations. Up to 30 lines per invoice in list.",
      doc: lang === "ar" ? "السند" : lang === "tr" ? "Belge" : "Document",
      notesDocument: lang === "ar" ? "ملاحظات / وثيقة" : lang === "tr" ? "Notlar / Belge" : "Notes / Document",
      pdfAndLines: lang === "ar" ? "PDF وبنود" : lang === "tr" ? "PDF ve satirlar" : "PDF and lines",
      documentLabel: lang === "ar" ? "وثيقة" : lang === "tr" ? "Belge" : "Document",
      moreLinesSuffix: lang === "ar" ? "بند" : lang === "tr" ? "satir" : "lines",
      agingTitle: lang === "ar" ? "أعمار الدين (لنفس العميل/الفندق)" : lang === "tr" ? "Yaslandirma (ayni musteri/otel)" : "Aging (same client/hotel)",
      agingAutoHint: lang === "ar" ? "يُملأ تلقائياً مع «تحديث الكشف» أو زر Aging." : lang === "tr" ? "“Ekstreyi yenile” veya Aging dugmesiyle otomatik dolar." : "Filled automatically with statement refresh or Aging button.",
      agingCurrent: lang === "ar" ? "حالي" : lang === "tr" ? "Guncel" : "Current",
      aging1To30: lang === "ar" ? "1–30 يوم" : lang === "tr" ? "1–30 gun" : "1-30 days",
      aging91Plus: lang === "ar" ? "+90 يوم" : lang === "tr" ? "+90 gun" : "+90 days",
      currencyShort: lang === "ar" ? "ع." : lang === "tr" ? "PB" : "Ccy",
      settingsTitle: lang === "ar" ? "إعدادات المحاسبة" : lang === "tr" ? "Muhasebe ayarlari" : "Accounting settings",
      settingsSubtitle:
        lang === "ar"
          ? "إدارة الحسابات، الضرائب، القوائم، العملات، ومفاتيح الإعدادات من مكان واحد."
          : lang === "tr"
            ? "Hesaplar, vergiler, listeler, para birimleri ve uygulama ayarlari tek merkezde."
            : "Manage accounts, taxes, lists, currencies, and setting keys in one place.",
      refreshData: lang === "ar" ? "تحديث البيانات" : lang === "tr" ? "Verileri yenile" : "Refresh data",
      settingsUpdated: lang === "ar" ? "تم التحديث." : lang === "tr" ? "Guncellendi." : "Updated.",
      settingsUpdateFailed: lang === "ar" ? "تعذر التحديث." : lang === "tr" ? "Guncelleme basarisiz." : "Update failed.",
      chartOfAccounts: lang === "ar" ? "شجرة الحسابات (Chart of Accounts)" : lang === "tr" ? "Hesap plani (Chart of Accounts)" : "Chart of Accounts",
      addAccount: lang === "ar" ? "إضافة حساب" : lang === "tr" ? "Hesap ekle" : "Add account",
      taxCodes: lang === "ar" ? "الضرائب (Tax Codes)" : lang === "tr" ? "Vergi kodlari (Tax Codes)" : "Tax Codes",
      addTax: lang === "ar" ? "إضافة ضريبة" : lang === "tr" ? "Vergi ekle" : "Add tax",
      inclusive: lang === "ar" ? "شامل" : lang === "tr" ? "Dahil" : "Inclusive",
      dropdownCategories: lang === "ar" ? "فئات القوائم (Dropdown Categories)" : lang === "tr" ? "Acilir liste kategorileri" : "Dropdown Categories",
      addCategory: lang === "ar" ? "إضافة فئة" : lang === "tr" ? "Kategori ekle" : "Add category",
      dropdownOptionsCurrencies: lang === "ar" ? "خيارات القوائم / العملات" : lang === "tr" ? "Liste secenekleri / para birimleri" : "Dropdown options / currencies",
      expensesCategory: lang === "ar" ? "الفئة" : lang === "tr" ? "Kategori" : "Category",
      addOption: lang === "ar" ? "إضافة خيار" : lang === "tr" ? "Secenek ekle" : "Add option",
      active: lang === "ar" ? "نشط" : lang === "tr" ? "Aktif" : "Active",
      yes: lang === "ar" ? "نعم" : lang === "tr" ? "Evet" : "Yes",
      no: lang === "ar" ? "لا" : lang === "tr" ? "Hayir" : "No",
      appSettingsTitle: lang === "ar" ? "إعدادات المفاتيح (App Settings)" : lang === "tr" ? "Uygulama ayarlari (App Settings)" : "App Settings",
      saveUpdateSetting: lang === "ar" ? "حفظ / تحديث الإعداد" : lang === "tr" ? "Ayari kaydet / guncelle" : "Save / update setting",
      section: lang === "ar" ? "القسم" : lang === "tr" ? "Bolum" : "Section",
      key: lang === "ar" ? "المفتاح" : lang === "tr" ? "Anahtar" : "Key",
      label: lang === "ar" ? "العنوان" : lang === "tr" ? "Etiket" : "Label",
      value: lang === "ar" ? "القيمة" : lang === "tr" ? "Deger" : "Value",
      descriptionOptional: lang === "ar" ? "الوصف (اختياري)" : lang === "tr" ? "Aciklama (opsiyonel)" : "Description (optional)",
      pdfAssets: lang === "ar" ? "الملفات (PDF Assets)" : lang === "tr" ? "Dosyalar (PDF Assets)" : "PDF Assets",
      fileNameOptional: lang === "ar" ? "اسم الملف (اختياري)" : lang === "tr" ? "Dosya adi (opsiyonel)" : "File name (optional)",
      upload: lang === "ar" ? "رفع" : lang === "tr" ? "Yukle" : "Upload",
      link: lang === "ar" ? "الرابط" : lang === "tr" ? "Baglanti" : "Link",
      open: lang === "ar" ? "فتح" : lang === "tr" ? "Ac" : "Open",
      editRow: lang === "ar" ? "تعديل" : lang === "tr" ? "Duzenle" : "Edit",
      saveChanges: lang === "ar" ? "حفظ التعديلات" : lang === "tr" ? "Degisiklikleri kaydet" : "Save changes",
      codeLabel: lang === "ar" ? "الكود" : lang === "tr" ? "Kod" : "Code",
      reportsTitle: lang === "ar" ? "التقارير المالية" : lang === "tr" ? "Finansal raporlar" : "Financial reports",
      reportsSubtitle:
        lang === "ar"
          ? "ميزان مراجعة، ملخص ضريبة، دفتر أستاذ عام، وأعمار ذمم — بنفس نطاق «من / إلى». يمكن عرض البيانات في الصفحة أو تنزيل PDF."
          : lang === "tr"
            ? "Trial balance, vergi ozeti, genel defter ve aging raporlari ayni tarih araligiyla; sayfada goruntuleyin veya PDF indirin."
            : "Trial balance, tax summary, general ledger, and aging with the same date range; view on page or download PDF.",
      reportsHub: lang === "ar" ? "مركز التقارير" : lang === "tr" ? "Rapor merkezi" : "Reports Hub",
      trialBalanceBtn: lang === "ar" ? "ميزان المراجعة" : lang === "tr" ? "Trial balance" : "Trial balance",
      vatSummaryBtn: lang === "ar" ? "ملخص الضريبة" : lang === "tr" ? "Vergi ozeti" : "Tax summary",
      generalLedgerBtn: lang === "ar" ? "دفتر الأستاذ العام" : lang === "tr" ? "Genel defter" : "General ledger",
      agingClientsArBtn: lang === "ar" ? "أعمار ذمم العملاء (AR)" : lang === "tr" ? "Musteri aging (AR)" : "Client aging (AR)",
      agingSuppliersApBtn: lang === "ar" ? "أعمار ذمم الموردين (AP)" : lang === "tr" ? "Tedarikci aging (AP)" : "Supplier aging (AP)",
      expensesPdfFrom: lang === "ar" ? "من" : lang === "tr" ? "Baslangic" : "From",
      expensesPdfTo: lang === "ar" ? "إلى" : lang === "tr" ? "Bitis" : "To",
      pdfDownloadSameRange: lang === "ar" ? "تنزيل PDF (نفس نطاق التواريخ أعلاه)" : lang === "tr" ? "PDF indir (yukaridaki ayni tarih araligi)" : "Download PDF (same date range above)",
      pdfTrialBalance: lang === "ar" ? "PDF — ميزان المراجعة" : lang === "tr" ? "PDF — Trial balance" : "PDF — Trial balance",
      pdfVatSummary: lang === "ar" ? "PDF — ملخص الضريبة" : lang === "tr" ? "PDF — Vergi ozeti" : "PDF — Tax summary",
      pdfGeneralLedger: lang === "ar" ? "PDF — دفتر الأستاذ العام" : lang === "tr" ? "PDF — Genel defter" : "PDF — General ledger",
      pdfAgingAr: lang === "ar" ? "PDF — أعمار AR (كما في «إلى»)" : lang === "tr" ? "PDF — AR aging (bitis tarihine gore)" : "PDF — AR aging (as of To)",
      pdfAgingAp: lang === "ar" ? "PDF — أعمار AP (كما في «إلى»)" : lang === "tr" ? "PDF — AP aging (bitis tarihine gore)" : "PDF — AP aging (as of To)",
      reportDownloadFailed: lang === "ar" ? "تعذر التنزيل" : lang === "tr" ? "Indirme basarisiz" : "Download failed",
      trialBalanceSummaryPrefix: lang === "ar" ? "ميزان المراجعة" : lang === "tr" ? "Trial balance" : "Trial balance",
      totalDebit: lang === "ar" ? "إجمالي مدين" : lang === "tr" ? "Toplam borc" : "Total debit",
      totalCredit: lang === "ar" ? "دائن" : lang === "tr" ? "Toplam alacak" : "Total credit",
      difference: lang === "ar" ? "الفرق" : lang === "tr" ? "Fark" : "Difference",
      vatSummaryPrefix: lang === "ar" ? "ملخص الضريبة" : lang === "tr" ? "Vergi ozeti" : "Tax summary",
      apSupplierShort: lang === "ar" ? "مورد AP" : lang === "tr" ? "AP tedarikci" : "AP supplier",
      arClientShort: lang === "ar" ? "عميل AR" : lang === "tr" ? "AR musteri" : "AR client",
      glSummaryPrefix: lang === "ar" ? "دفتر الأستاذ" : lang === "tr" ? "Genel defter" : "General ledger",
      rowsLabel: lang === "ar" ? "سطر" : lang === "tr" ? "satir" : "rows",
      accountSpecific: lang === "ar" ? "حساب محدد" : lang === "tr" ? "Belirli hesap" : "specific account",
      allAccountsLabel: lang === "ar" ? "جميع الحسابات" : lang === "tr" ? "Tum hesaplar" : "All accounts",
      globalAgingSummary: lang === "ar" ? "أعمار الذمم (شامل)" : lang === "tr" ? "Aging ozeti (genel)" : "Aging summary (global)",
      receivableAging: lang === "ar" ? "ذمم عملاء" : lang === "tr" ? "Musteri alacaklari" : "Client receivables",
      payableAging: lang === "ar" ? "ذمم موردين" : lang === "tr" ? "Tedarikci borclari" : "Supplier payables",
      globalAgingDetailsTitle: lang === "ar" ? "تفصيل أعمار الذمم (شامل)" : lang === "tr" ? "Aging detayi (genel)" : "Aging details (global)",
      agingAbove90: lang === "ar" ? "أكثر من 90 يوم" : lang === "tr" ? "90+ gun" : "Over 90 days",
      trialBalanceSectionTitle: lang === "ar" ? "ميزان المراجعة (Trial Balance)" : lang === "tr" ? "Trial balance" : "Trial balance",
      trialBalanceSectionHint: lang === "ar" ? "حركات القيود داخل النطاق — مع نوع الحساب." : lang === "tr" ? "Tarih araligindaki yevmiye hareketleri ve hesap tipi." : "Journal movements within range with account type.",
      accountLabel: lang === "ar" ? "الحساب" : lang === "tr" ? "Hesap" : "Account",
      debitLabel: lang === "ar" ? "مدين" : lang === "tr" ? "Borc" : "Debit",
      creditLabel: lang === "ar" ? "دائن" : lang === "tr" ? "Alacak" : "Credit",
      totalLabel: lang === "ar" ? "إجمالي" : lang === "tr" ? "Toplam" : "Total",
      clickTrialBalanceToLoad: lang === "ar" ? "اضغط «ميزان المراجعة» لتحميل البيانات" : lang === "tr" ? "Veriyi yuklemek icin Trial balance'a basin" : "Click Trial balance to load data",
      vatFromInvoiceLinesTitle: lang === "ar" ? "ملخص الضريبة (من بنود الفواتير)" : lang === "tr" ? "Vergi ozeti (fatura satirlarindan)" : "Tax summary (from invoice lines)",
      vatByIssueRangeDocTypeHint: lang === "ar" ? "حسب نطاق الإصدار ونوع المستند." : lang === "tr" ? "Duzenleme tarihi araligi ve belge turune gore." : "By issue-date range and document type.",
      arSalesClients: lang === "ar" ? "AR — مبيعات عملاء" : lang === "tr" ? "AR — Musteri satislari" : "AR — Client sales",
      apSupplierHotelInvoices: lang === "ar" ? "AP — فواتير مورد/فندق" : lang === "tr" ? "AP — Tedarikci/otel faturalari" : "AP — Supplier/hotel invoices",
      refresh: lang === "ar" ? "تحديث" : lang === "tr" ? "Yenile" : "Refresh",
      netLines: lang === "ar" ? "الصافي (بنود)" : lang === "tr" ? "Net (satirlar)" : "Net (lines)",
      taxDetailsByCode: lang === "ar" ? "تفصيل حسب مفتاح الضريبة" : lang === "tr" ? "Vergi koduna gore detay" : "Breakdown by tax code",
      rate: lang === "ar" ? "نسبة" : lang === "tr" ? "Oran" : "Rate",
      inclusiveQ: lang === "ar" ? "شامل؟" : lang === "tr" ? "Dahil mi?" : "Inclusive?",
      noTaxDataInRange: lang === "ar" ? "لا بيانات ضريبة في النطاق" : lang === "tr" ? "Aralikta vergi verisi yok" : "No tax data in range",
      vatPrompt: lang === "ar" ? "اضغط «ملخص الضريبة» أو اختر النوع ثم تحديث" : lang === "tr" ? "Vergi ozetine basin veya tur secip yenileyin" : "Click Tax summary or choose type then refresh",
      generalLedgerSectionTitle: lang === "ar" ? "دفتر الأستاذ العام" : lang === "tr" ? "Genel defter" : "General ledger",
      generalLedgerSectionHint: lang === "ar" ? "سطور القيود حسب التاريخ (حتى 5000 سطر). اختيار حساب اختياري." : lang === "tr" ? "Yevmiye satirlari tarihe gore (5000 satira kadar). Hesap secimi opsiyonel." : "Journal lines by date (up to 5000 rows). Account filter optional.",
      load: lang === "ar" ? "تحميل" : lang === "tr" ? "Yukle" : "Load",
      clickGeneralLedgerToLoad: lang === "ar" ? "اضغط «دفتر الأستاذ العام» لتحميل الحركات" : lang === "tr" ? "Hareketleri yuklemek icin Genel deftere basin" : "Click General ledger to load entries",
    }),
    [lang],
  );
  const accountTypeLabels = useMemo(() => ACCOUNT_TYPE_LABELS[lang] || ACCOUNT_TYPE_LABELS.ar, [lang]);
  const moduleUi = useModuleUiSettings("accounting");
  const accountingPageTitle = String(moduleUi.page_title || "").trim() || t.accounting;
  const defaultAccountingTab = String(moduleUi.default_tab || "invoices");
  const { currency } = useCurrency();

  const [activeTab, setActiveTab] = useState<
    "invoices" | "payments" | "income" | "reservations" | "statements" | "reports" | "settings"
  >("invoices");
  useEffect(() => {
    const allowed = new Set(["invoices", "payments", "income", "reservations", "statements", "reports", "settings"]);
    if (allowed.has(defaultAccountingTab)) {
      setActiveTab(defaultAccountingTab as "invoices" | "payments" | "income" | "reservations" | "statements" | "reports" | "settings");
    }
  }, [defaultAccountingTab]);
  const [searchAny, setSearchAny] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [accountingDropdowns, setAccountingDropdowns] = useState<Record<string, DropdownOptionRow[]>>({});

  const [invoiceForm, setInvoiceForm] = useState({
    number: "",
    doc_type: "ar_invoice" as Invoice["doc_type"],
    client: "",
    hotel: "",
    supplier: "",
    business_sector: "" as "" | "hotels" | "aviation",
    supplier_document_ref: "",
    booking_id: "",
    flight_ticket_id: "",
    apply_booking_settlement: false,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    status: "draft" as "draft" | "sent" | "paid" | "overdue",
    currency: "TRY",
    fx_rate: 1,
    notes: "",
  });
  const [invoiceFxStatus, setInvoiceFxStatus] = useState<string>("");
  const [invoiceLinesDraft, setInvoiceLinesDraft] = useState<
    { description: string; notes: string; quantity: string; unit_price: string; tax_code: string }[]
  >([{ description: "", notes: "", quantity: "1", unit_price: "0", tax_code: "" }]);
  const [invoiceTechFilters, setInvoiceTechFilters] = useState<{
    docType: "all" | Invoice["doc_type"];
    status: "all" | "draft" | "sent" | "paid" | "overdue";
    currency: "all" | string;
    party: "all" | "ar" | "ap_hotels" | "ap_aviation";
    overdueOnly: boolean;
    sortBy: "issue_desc" | "issue_asc" | "outstanding_desc" | "total_desc";
  }>({
    docType: "all",
    status: "all",
    currency: "all",
    party: "all",
    overdueOnly: false,
    sortBy: "issue_desc",
  });

  const [paymentForm, setPaymentForm] = useState({
    direction: "payment" as Payment["direction"],
    client: "",
    hotel: "",
    payment_place: "",
    payment_date: new Date().toISOString().slice(0, 10),
    currency: "TRY",
    fx_rate: 1,
    amount: "",
  });
  const [paymentFxStatus, setPaymentFxStatus] = useState<string>("");
  const [allocationDrafts, setAllocationDrafts] = useState<{ invoice: string; amount: string }[]>([{ invoice: "", amount: "" }]);
  const [opsCarRentals, setOpsCarRentals] = useState<CarRentalLite[]>([]);
  const [opsFlightTickets, setOpsFlightTickets] = useState<FlightTicketLite[]>([]);
  const [opsExpenses, setOpsExpenses] = useState<ExpenseLite[]>([]);
  const [opsVouchers, setOpsVouchers] = useState<VoucherLite[]>([]);
  const [opsLoadError, setOpsLoadError] = useState("");
  const [hotelDueReminderStatus, setHotelDueReminderStatus] = useState("");
  const [manualIncomeForm, setManualIncomeForm] = useState({
    accountRef: "",
    partyType: "client" as "client" | "hotel" | "supplier" | "other",
    partyId: "",
    customPartyName: "",
    bookingRef: "",
    method: ui.paymentMethodCash,
    payment_date: new Date().toISOString().slice(0, 10),
    currency: "TRY",
    fx_rate: 1,
    amount: "",
    note: "",
  });
  const [manualIncomeFxStatus, setManualIncomeFxStatus] = useState<string>("");
  const [incomeSearch, setIncomeSearch] = useState("");
  const [incomeFilters, setIncomeFilters] = useState<{
    source: "all" | string;
    method: "all" | string;
    currency: "all" | string;
    from: string;
    to: string;
  }>({
    source: "all",
    method: "all",
    currency: "all",
    from: "",
    to: "",
  });
  const [outflowSearch, setOutflowSearch] = useState("");
  const [outflowFilters, setOutflowFilters] = useState<{
    source: "all" | string;
    method: "all" | string;
    currency: "all" | string;
    from: string;
    to: string;
  }>({
    source: "all",
    method: "all",
    currency: "all",
    from: "",
    to: "",
  });

  const [statementTarget, setStatementTarget] = useState({ kind: "client" as "client" | "hotel", id: "" });
  const [statementRows, setStatementRows] = useState<{ invoice_id: number; number: string; issue_date: string; due_date: string | null; outstanding_amount: number }[]>(
    []
  );
  const [statementData, setStatementData] = useState<StatementPayload | null>(null);
  const [statementDateFrom, setStatementDateFrom] = useState("");
  const [statementDateTo, setStatementDateTo] = useState("");
  const [statementLoadError, setStatementLoadError] = useState("");
  const [agingSummary, setAgingSummary] = useState<Record<string, number> | null>(null);

  const [reportRange, setReportRange] = useState(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(1);
    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    return { start: toISO(start), end: toISO(end) };
  });
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [reportGlAccountId, setReportGlAccountId] = useState("");
  const [reportVatDocType, setReportVatDocType] = useState<"ar_invoice" | "ap_bill">("ar_invoice");
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceResponse | null>(null);
  const [vatSummary, setVatSummary] = useState<VatSummaryApi | null>(null);
  const [glData, setGlData] = useState<GeneralLedgerResponse | null>(null);
  const [globalAging, setGlobalAging] = useState<GlobalAging | null>(null);
  const [settingsCategories, setSettingsCategories] = useState<SettingsCategory[]>([]);
  const [settingsOptions, setSettingsOptions] = useState<SettingsOption[]>([]);
  const [settingsAppSettings, setSettingsAppSettings] = useState<SettingsAppSetting[]>([]);
  const [settingsPdfAssets, setSettingsPdfAssets] = useState<SettingsPdfAsset[]>([]);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [editingChartAccountId, setEditingChartAccountId] = useState<number | null>(null);
  const [editingTaxCodeId, setEditingTaxCodeId] = useState<number | null>(null);
  const [editingDropdownCategoryId, setEditingDropdownCategoryId] = useState<number | null>(null);
  const [editingDropdownOptionId, setEditingDropdownOptionId] = useState<number | null>(null);
  const [editingAppSettingId, setEditingAppSettingId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    account_type: "asset" as "asset" | "liability" | "equity" | "revenue" | "expense",
    is_active: true,
  });
  const [taxForm, setTaxForm] = useState({
    code: "",
    name: "",
    ratePercent: "20",
    is_inclusive: false,
    is_active: true,
  });
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    key: "",
    sort_order: "0",
    is_active: true,
  });
  const [optionForm, setOptionForm] = useState({
    category: "",
    label: "",
    value: "",
    sort_order: "0",
    is_active: true,
  });
  const [appSettingForm, setAppSettingForm] = useState({
    section: "accounting",
    key: "",
    label: "",
    value: "",
    description: "",
  });
  const [pdfAssetForm, setPdfAssetForm] = useState<{ name: string; file: File | null }>({
    name: "",
    file: null,
  });
  const [reservationRows, setReservationRows] = useState<ReservationAccountingRow[]>([]);
  const [reservationInvoicedFilter, setReservationInvoicedFilter] = useState<"all" | "yes" | "no">("all");
  const [reservationHotelIdFilter, setReservationHotelIdFilter] = useState("");
  const [expandedReservationId, setExpandedReservationId] = useState<number | null>(null);
  const [hotelInvoiceRefDraft, setHotelInvoiceRefDraft] = useState<Record<number, string>>({});
  const [reservationPending, setReservationPending] = useState<{
    id: number;
    action: "create" | "hotel_ref";
  } | null>(null);
  const [reservationLoadError, setReservationLoadError] = useState("");
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    api.get<Client[]>("/clients/").then(setClients);
    api.get<Hotel[]>("/hotels/").then(setHotels);
    api
      .get<Supplier[]>("/suppliers/")
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
    api.get<Invoice[]>("/invoices/").then(setInvoices);
    api.get<Payment[]>("/payments/").then(setPayments);
    api.get<TaxCode[]>("/tax-codes/").then(setTaxCodes);
    api.get<ChartAccount[]>("/chart-accounts/").then(setChartAccounts).catch(() => setChartAccounts([]));
  }, []);

  useReloadOnNavigateOrTabVisible(() => {
    void fetchDropdownOptionsMap([
      DROPDOWN_CATEGORY_KEYS.accountingDocType,
      DROPDOWN_CATEGORY_KEYS.accountingPaymentDirection,
      DROPDOWN_CATEGORY_KEYS.commonCurrency,
    ]).then(setAccountingDropdowns);
  });

  useEffect(() => {
    if (activeTab !== "reservations") return;
    let cancelled = false;
    (async () => {
      try {
        setReservationLoadError("");
        const data = await api.get<{ rows: ReservationAccountingRow[] }>(
          `/voucher-reservations/accounting-overview?invoiced=${reservationInvoicedFilter}`,
        );
        if (!cancelled) setReservationRows(data.rows || []);
      } catch (e) {
        if (!cancelled) setReservationLoadError(e instanceof Error ? e.message : ui.loadReservationsFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, reservationInvoicedFilter]);

  useEffect(() => {
    if (activeTab !== "payments" && activeTab !== "income") return;
    let cancelled = false;
    (async () => {
      try {
        setOpsLoadError("");
        const [carRentals, flights, expensesRows, vouchersRows] = await Promise.all([
          api.get<CarRentalLite[]>("/car-rentals/"),
          api.get<FlightTicketLite[]>("/flight-tickets/"),
          api.get<ExpenseLite[]>("/expenses/"),
          api.get<VoucherLite[]>("/vouchers/"),
        ]);
        if (cancelled) return;
        setOpsCarRentals(carRentals || []);
        setOpsFlightTickets(flights || []);
        setOpsExpenses(expensesRows || []);
        setOpsVouchers(vouchersRows || []);
        if (activeTab === "payments") {
          await syncHotelDueReminders();
        }
      } catch (e) {
        if (!cancelled) setOpsLoadError(e instanceof Error ? e.message : ui.loadLinksFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const loadSettingsCenter = async () => {
    const [cats, opts, appRows, accountsRows, taxesRows, pdfRows] = await Promise.all([
      api.get<SettingsCategory[]>("/dropdown-categories/"),
      api.get<SettingsOption[]>("/dropdown-options/"),
      api.get<SettingsAppSetting[]>("/app-settings/"),
      api.get<ChartAccount[]>("/chart-accounts/"),
      api.get<TaxCode[]>("/tax-codes/"),
      api.get<SettingsPdfAsset[]>("/pdf-assets/"),
    ]);
    setSettingsCategories(cats || []);
    setSettingsOptions(opts || []);
    setSettingsAppSettings(appRows || []);
    setSettingsPdfAssets(pdfRows || []);
    setChartAccounts(accountsRows || []);
    setTaxCodes(taxesRows || []);
  };

  useEffect(() => {
    if (activeTab !== "settings") return;
    let cancelled = false;
    (async () => {
      try {
        setSettingsStatus("");
        await loadSettingsCenter();
        if (!cancelled) setSettingsStatus(ui.settingsLoaded);
      } catch (e) {
        if (!cancelled) setSettingsStatus(e instanceof Error ? e.message : ui.settingsLoadFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const reservationRowsFiltered = useMemo(() => {
    if (!reservationHotelIdFilter) return reservationRows;
    const hid = Number(reservationHotelIdFilter);
    if (Number.isNaN(hid)) return reservationRows;
    return reservationRows.filter((r) => r.hotel_id === hid);
  }, [reservationRows, reservationHotelIdFilter]);
  const reservationRowsSearchFiltered = useMemo(
    () => reservationRowsFiltered.filter((x) => rowMatchesQuery(x, searchAny)),
    [reservationRowsFiltered, searchAny],
  );
  const statementRowsSearchFiltered = useMemo(
    () => statementRows.filter((x) => rowMatchesQuery(x, searchAny)),
    [statementRows, searchAny],
  );

  const docTypeSelectOptions = useMemo(
    () =>
      mergeSearchOptions(accountingDropdowns[DROPDOWN_CATEGORY_KEYS.accountingDocType] || [], [
        { value: "ar_invoice", label: "AR Invoice (Client)" },
        { value: "ap_bill", label: "AP Bill (Supplier)" },
      ]),
    [accountingDropdowns],
  );

  const paymentDirectionSelectOptions = useMemo(
    () =>
      mergeSearchOptions(
        accountingDropdowns[DROPDOWN_CATEGORY_KEYS.accountingPaymentDirection] || [],
        [
          { value: "payment", label: "Payment (Hotel)" },
        ],
      ),
    [accountingDropdowns],
  );

  const accountingCurrencyOptions = useMemo(
    () =>
      mergeSearchOptions(
        accountingDropdowns[DROPDOWN_CATEGORY_KEYS.commonCurrency] || [],
        [...COMMON_CURRENCIES].map((c) => ({ value: c, label: c })),
      ),
    [accountingDropdowns],
  );

  const fetchFxRate = async (quote: string, date: string) => {
    if (!quote || quote.toUpperCase() === "TRY") {
      return { rate: 1, requested_date: date, rate_date: date };
    }
    const q = encodeURIComponent(quote.toUpperCase());
    const d = encodeURIComponent(date);
    const data = await api.get<{ rate: string; rate_date: string; requested_date: string }>(`/exchange-rates/rate?quote=${q}&date=${d}`);
    const r = Number(data.rate);
    return { rate: Number.isFinite(r) && r > 0 ? r : 1, requested_date: data.requested_date, rate_date: data.rate_date };
  };

  const syncTcmbForDate = async (date: string) => {
    const payload = date ? { date } : {};
    return api.post("/exchange-rates/sync_tcmb", payload);
  };

  const syncHotelDueReminders = async () => {
    const result = await api.post<{ created: number; reopened: number; resolved: number }>(
      "/invoices/sync-hotel-payment-reminders",
      { horizon_days: 3 },
    );
    const created = Number(result?.created || 0);
    const reopened = Number(result?.reopened || 0);
    const resolved = Number(result?.resolved || 0);
    if (!created && !reopened && !resolved) {
      setHotelDueReminderStatus(ui.syncRemindersDone);
      return;
    }
    setHotelDueReminderStatus(`${ui.syncRemindersSummary}: +${created} · ~${reopened} · -${resolved}`);
  };

  const downloadInvoicePdf = async (invoiceId: number, number: string) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf/?lang=${encodeURIComponent(lang)}&v=${Date.now()}`, {
      headers: token ? { Authorization: `Token ${token}` } : {},
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || `Failed to download PDF (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${number || invoiceId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadReportPdf = async (pathWithQuery: string, filename: string) => {
    const token = getToken();
    const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Token ${token}` } : {},
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || `${ui.pdfDownloadFailed} (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadTablePdf = async (title: string, headers: string[], rows: Array<Array<string | number>>) => {
    const token = getToken();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `${slug || "accounting-table"}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const res = await fetch(`${API_BASE}/invoices/table-export/pdf`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Token ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, headers, rows, filename: filename.replace(/\.pdf$/i, "") }),
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || `${ui.pdfDownloadFailed} (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const previewInvoicePdf = async (invoiceId: number, number?: string) => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf/?lang=${encodeURIComponent(lang)}&v=${Date.now()}`, {
      headers: token ? { Authorization: `Token ${token}` } : {},
    });
    if (!res.ok) {
      const raw = await res.text();
      throw new Error(raw || `Failed to preview PDF (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    setPdfPreview({ url, name: `invoice-${number || invoiceId}.pdf` });
  };

  useEffect(() => {
    const run = async () => {
      setInvoiceFxStatus("");
      if (!invoiceForm.issue_date) return;
      if (!invoiceForm.currency || invoiceForm.currency === "TRY") {
        setInvoiceForm((p) => ({ ...p, fx_rate: 1 }));
        return;
      }
      try {
        const data = await fetchFxRate(invoiceForm.currency, invoiceForm.issue_date);
        setInvoiceForm((p) => ({ ...p, fx_rate: data.rate }));
        if (data.rate_date && data.requested_date && data.rate_date !== data.requested_date) {
          setInvoiceFxStatus(`Fallback rate date ${data.rate_date} used instead of ${data.requested_date}`);
        }
      } catch (e: any) {
        setInvoiceFxStatus("Unable to fetch TCMB rate now. Last cached rate is used if available.");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceForm.currency, invoiceForm.issue_date]);

  useEffect(() => {
    const run = async () => {
      setPaymentFxStatus("");
      if (!paymentForm.payment_date) return;
      if (!paymentForm.currency || paymentForm.currency === "TRY") {
        setPaymentForm((p) => ({ ...p, fx_rate: 1 }));
        return;
      }
      try {
        const data = await fetchFxRate(paymentForm.currency, paymentForm.payment_date);
        setPaymentForm((p) => ({ ...p, fx_rate: data.rate }));
        if (data.rate_date && data.requested_date && data.rate_date !== data.requested_date) {
          setPaymentFxStatus(`Fallback rate date ${data.rate_date} used instead of ${data.requested_date}`);
        }
      } catch (e: any) {
        setPaymentFxStatus("Unable to fetch TCMB rate now. Last cached rate is used if available.");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentForm.currency, paymentForm.payment_date]);

  useEffect(() => {
    const run = async () => {
      setManualIncomeFxStatus("");
      if (!manualIncomeForm.payment_date) return;
      if (!manualIncomeForm.currency || manualIncomeForm.currency === "TRY") {
        setManualIncomeForm((p) => ({ ...p, fx_rate: 1 }));
        return;
      }
      try {
        const data = await fetchFxRate(manualIncomeForm.currency, manualIncomeForm.payment_date);
        setManualIncomeForm((p) => ({ ...p, fx_rate: data.rate }));
        if (data.rate_date && data.requested_date && data.rate_date !== data.requested_date) {
          setManualIncomeFxStatus(`Fallback rate date ${data.rate_date} used instead of ${data.requested_date}`);
        }
      } catch (e: any) {
        setManualIncomeFxStatus("Unable to fetch TCMB rate now. Last cached rate is used if available.");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualIncomeForm.currency, manualIncomeForm.payment_date]);

  const invoiceNetTotal = useMemo(() => {
    return invoiceLinesDraft.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
  }, [invoiceLinesDraft]);

  const invoiceTaxTotal = useMemo(() => {
    return invoiceLinesDraft.reduce((sum, line) => {
      const net = Number(line.quantity || 0) * Number(line.unit_price || 0);
      const tax = taxCodes.find((t) => t.id === Number(line.tax_code));
      if (!tax) return sum;
      const rate = Number(tax.rate || 0);
      if (tax.is_inclusive) {
        const divisor = 1 + rate;
        const netOnly = divisor ? net / divisor : net;
        return sum + (net - netOnly);
      }
      return sum + net * rate;
    }, 0);
  }, [invoiceLinesDraft, taxCodes]);

  const invoiceGrossTotal = useMemo(() => invoiceNetTotal + invoiceTaxTotal, [invoiceNetTotal, invoiceTaxTotal]);

  const invoiceRowsTech = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = invoices
      .map((inv) => {
        const totalAmount = Number(inv.total_amount || 0);
        const outstanding = Math.max(0, Number(inv.outstanding_amount ?? totalAmount));
        const allocated = Math.max(0, Number(inv.allocated_amount ?? totalAmount - outstanding));
        const paidRatio = totalAmount > 0 ? Math.min(1, Math.max(0, allocated / totalAmount)) : 0;
        const settlementState = settlementStateFromAmounts(totalAmount, allocated, outstanding);
        const dueDate = (inv.due_date || "").trim();
        const isOverdue = Boolean(dueDate) && dueDate < todayIso && outstanding > 0.01 && inv.status !== "paid";
        const ageDays = dueDate ? Math.max(0, Math.floor((Date.now() - new Date(`${dueDate}T00:00:00`).getTime()) / 86400000)) : 0;
        return {
          ...inv,
          _outstanding: outstanding,
          _allocated: allocated,
          _paidRatio: paidRatio,
          _settlementState: settlementState,
          _isOverdue: isOverdue,
          _ageDays: ageDays,
        };
      })
      .filter((row) => rowMatchesQuery(row, searchAny))
      .filter((row) => {
        if (invoiceTechFilters.docType !== "all" && row.doc_type !== invoiceTechFilters.docType) return false;
        if (invoiceTechFilters.currency !== "all" && (row.currency || "").toUpperCase() !== invoiceTechFilters.currency) return false;
        if (invoiceTechFilters.party === "ar" && row.doc_type !== "ar_invoice") return false;
        if (
          invoiceTechFilters.party === "ap_hotels" &&
          !(row.doc_type === "ap_bill" && row.business_sector === "hotels")
        ) {
          return false;
        }
        if (
          invoiceTechFilters.party === "ap_aviation" &&
          !(row.doc_type === "ap_bill" && row.business_sector === "aviation")
        ) {
          return false;
        }
        if (invoiceTechFilters.status !== "all") {
          if (invoiceTechFilters.status === "overdue") {
            if (!row._isOverdue) return false;
          } else if (row.status !== invoiceTechFilters.status) {
            return false;
          }
        }
        if (invoiceTechFilters.overdueOnly && !row._isOverdue) return false;
        return true;
      });

    rows.sort((a, b) => {
      if (invoiceTechFilters.sortBy === "issue_asc") return String(a.issue_date || "").localeCompare(String(b.issue_date || ""));
      if (invoiceTechFilters.sortBy === "outstanding_desc") return b._outstanding - a._outstanding;
      if (invoiceTechFilters.sortBy === "total_desc") return Number(b.total_amount || 0) - Number(a.total_amount || 0);
      return String(b.issue_date || "").localeCompare(String(a.issue_date || ""));
    });
    return rows;
  }, [invoices, searchAny, invoiceTechFilters]);

  const invoiceTechSummary = useMemo(() => {
    const s = {
      count: invoiceRowsTech.length,
      overdueCount: 0,
      outstandingTotal: 0,
      totalAmount: 0,
      paidCount: 0,
      draftCount: 0,
    };
    for (const row of invoiceRowsTech) {
      s.outstandingTotal += row._outstanding;
      s.totalAmount += Number(row.total_amount || 0);
      if (row._isOverdue) s.overdueCount += 1;
      if (row.status === "paid") s.paidCount += 1;
      if (row.status === "draft") s.draftCount += 1;
    }
    return s;
  }, [invoiceRowsTech]);

  const paymentRowsTech = useMemo(() => {
    return payments
      .filter((x) => rowMatchesQuery(x, searchAny))
      .map((p) => {
        const total = Number(p.amount || 0);
        const allocated = Math.max(
          0,
          (p.allocations || []).reduce((sum, a) => sum + Number(a.amount || 0), 0),
        );
        const outstanding = Math.max(0, total - allocated);
        const ratio = total > 0 ? Math.min(1, Math.max(0, allocated / total)) : 0;
        const settlementState = settlementStateFromAmounts(total, allocated, outstanding);
        return {
          ...p,
          _allocatedAmount: allocated,
          _unallocatedAmount: outstanding,
          _paidRatio: ratio,
          _settlementState: settlementState,
        };
      });
  }, [payments, searchAny]);

  const opsFlow = useMemo(() => {
    const incomingRows: OpsMoneyRow[] = [];
    const outgoingRows: OpsMoneyRow[] = [];

    for (const v of opsVouchers) {
      const partner = v.referrer_display?.name || ui.noPartner;
      for (const r of v.reservations || []) {
        const selling = Number(r.selling_price || 0);
        const buying = Number(r.buying_price || 0);
        const profit = selling - buying;
        const hotelName = hotels.find((h) => h.id === Number(r.hotel))?.name || `Hotel #${r.hotel ?? "-"}`;
        incomingRows.push({
          accountRef: `RES-${r.id}`,
          source: "Hotel profit",
          entity: hotelName,
          person: partner,
          bookingRef: `Voucher ${v.voucher_nr} · Res #${r.id}`,
          method: "Sell/Buy margin",
          paymentDate: "",
          amount: profit,
          currency: String(r.selling_currency || "USD").toUpperCase(),
          note: `Partner: ${partner} · Sell ${selling.toFixed(2)} - Buy ${buying.toFixed(2)}`,
        });
      }
      const transferSell = Number(v.transfer_fee || 0);
      const transferBuy = Number(v.transfer_buying_price || 0);
      if (transferSell || transferBuy) {
        incomingRows.push({
          accountRef: `VCH-${v.voucher_nr}`,
          source: "Transfer profit",
          entity: v.voucher_nr,
          person: partner,
          bookingRef: `Voucher ${v.voucher_nr}`,
          method: "Transfer margin",
          paymentDate: "",
          amount: transferSell - transferBuy,
          currency: String(v.transfer_currency || "USD").toUpperCase(),
          note: `Sell ${transferSell.toFixed(2)} - Buy ${transferBuy.toFixed(2)}`,
        });
      }
    }

    for (const t of opsFlightTickets) {
      const gross = Number(t.total_price || t.selling_price || 0);
      const buying = Number(t.buying_price || 0);
      const profit = gross - buying;
      incomingRows.push({
        accountRef: `FLT-${t.id}`,
        source: "Flight ticket profit",
        entity: `Ticket #${t.id}`,
        person: "Flight sales",
        bookingRef: `Ticket #${t.id}`,
        method: "Ticket margin",
        paymentDate: "",
        amount: profit,
        currency: String(t.selling_currency || t.currency || "USD").toUpperCase(),
        note: `Sell ${gross.toFixed(2)} - Buy ${buying.toFixed(2)}`,
      });
      const serviceFee = Number(t.service_fee || 0);
      if (serviceFee > 0) {
        incomingRows.push({
          accountRef: `FLT-${t.id}`,
          source: "Additional services",
          entity: `Ticket #${t.id}`,
          person: "Flight sales",
          bookingRef: `Ticket #${t.id}`,
          method: "Service Fee",
          paymentDate: "",
          amount: serviceFee,
          currency: String(t.service_fee_currency || t.selling_currency || "USD").toUpperCase(),
          note: "Service fee",
        });
      }
      if (buying > 0) {
        outgoingRows.push({
          accountRef: `FLT-${t.id}`,
          source: "Ticket purchase cost",
          entity: `Ticket #${t.id}`,
          person: "Flight department",
          bookingRef: `Ticket #${t.id}`,
          method: "Purchase",
          paymentDate: "",
          amount: buying,
          currency: String(t.buying_currency || "USD").toUpperCase(),
          note: "Ticket purchase cost",
        });
      }
    }

    for (const r of opsCarRentals) {
      incomingRows.push({
        accountRef: `CAR-${r.id}`,
        source: "Car rentals income",
        entity: `Rental #${r.id}`,
        person: "Cars department",
        bookingRef: `Rental #${r.id}`,
        method: "Car rental",
        paymentDate: "",
        amount: Number(r.total_price || 0),
        currency: String(currency || "TRY").toUpperCase(),
        note: "From cars section",
      });
    }

    for (const p of payments) {
      const manualMeta = parseManualIncomeMeta(p.notes);
      const payerName =
        manualMeta?.person?.trim() ||
        clients.find((c) => c.id === Number(p.client))?.name ||
        hotels.find((h) => h.id === Number(p.hotel))?.name ||
        suppliers.find((s) => s.id === Number(p.supplier))?.name ||
        ui.unspecifiedParty;
      if (p.direction === "receipt") {
        incomingRows.push({
          accountRef: manualMeta?.accountRef?.trim() || `PAY-${p.id}`,
          source: "Actual collections",
          entity: payerName,
          person: payerName,
          bookingRef: manualMeta?.bookingRef?.trim() || `Payment #${p.id}`,
          method: manualMeta?.method?.trim() || (p.reference || "").trim() || ui.noMethod,
          paymentDate: String(p.payment_date || ""),
          amount: Number(p.amount || 0),
          currency: String(p.currency || "USD").toUpperCase(),
          note: manualMeta?.note?.trim() ? `${manualMeta.note.trim()} · Payment #${p.id}` : `Payment #${p.id}`,
        });
      } else {
        outgoingRows.push({
          accountRef: `PAY-${p.id}`,
          source: p.hotel ? "Hotel payments" : "External payments",
          entity: payerName,
          person: payerName,
          bookingRef: `Payment #${p.id}`,
          method: (p.reference || "").trim() || ui.noMethod,
          paymentDate: String(p.payment_date || ""),
          amount: Number(p.amount || 0),
          currency: String(p.currency || "USD").toUpperCase(),
          note: `Payment #${p.id}`,
        });
      }
    }

    for (const e of opsExpenses) {
      const paid = Number(e.paid_amount || 0);
      if (paid <= 0) continue;
      outgoingRows.push({
        accountRef: `EXP-${e.id}`,
        source: "Expenses",
        entity: `Expense #${e.id}`,
        person: "Expenses department",
        bookingRef: `Expense #${e.id}`,
        method: String(e.payment_status || "expense"),
        paymentDate: "",
        amount: paid,
        currency: String(currency || "TRY").toUpperCase(),
        note: "Paid from expenses section",
      });
    }

    const incomingByCurrency: Record<string, number> = {};
    for (const r of incomingRows) addMoney(incomingByCurrency, r.currency, r.amount);
    const outgoingByCurrency: Record<string, number> = {};
    for (const r of outgoingRows) addMoney(outgoingByCurrency, r.currency, r.amount);

    const incomingTotalDisplay = incomingRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const outgoingTotalDisplay = outgoingRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return {
      incomingRows,
      outgoingRows,
      incomingByCurrency,
      outgoingByCurrency,
      incomingTotalDisplay,
      outgoingTotalDisplay,
      netDisplay: incomingTotalDisplay - outgoingTotalDisplay,
    };
  }, [payments, opsCarRentals, opsExpenses, opsFlightTickets, opsVouchers, hotels, clients, suppliers, currency]);

  const incomeFilterOptions = useMemo(() => {
    const sourceSet = new Set<string>();
    const methodSet = new Set<string>();
    const currencySet = new Set<string>();
    for (const row of opsFlow.incomingRows) {
      if (row.source) sourceSet.add(row.source);
      if (row.method) methodSet.add(row.method);
      if (row.currency) currencySet.add(row.currency);
    }
    return {
      sources: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
      methods: Array.from(methodSet).sort((a, b) => a.localeCompare(b)),
      currencies: Array.from(currencySet).sort((a, b) => a.localeCompare(b)),
    };
  }, [opsFlow.incomingRows]);

  const incomeRowsFiltered = useMemo(() => {
    const query = incomeSearch.trim().toLowerCase();
    return opsFlow.incomingRows.filter((row) => {
      if (incomeFilters.source !== "all" && row.source !== incomeFilters.source) return false;
      if (incomeFilters.method !== "all" && row.method !== incomeFilters.method) return false;
      if (incomeFilters.currency !== "all" && row.currency !== incomeFilters.currency) return false;
      if (incomeFilters.from && row.paymentDate && row.paymentDate < incomeFilters.from) return false;
      if (incomeFilters.to && row.paymentDate && row.paymentDate > incomeFilters.to) return false;
      if (!query) return true;
      const haystack = [
        row.accountRef,
        row.source,
        row.entity,
        row.person,
        row.bookingRef,
        row.method,
        row.paymentDate,
        row.note,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [opsFlow.incomingRows, incomeSearch, incomeFilters]);

  const incomeSummaryFiltered = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    for (const row of incomeRowsFiltered) addMoney(byCurrency, row.currency, row.amount);
    return {
      totalDisplay: incomeRowsFiltered.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      byCurrency,
    };
  }, [incomeRowsFiltered]);

  const outflowFilterOptions = useMemo(() => {
    const sourceSet = new Set<string>();
    const methodSet = new Set<string>();
    const currencySet = new Set<string>();
    for (const row of opsFlow.outgoingRows) {
      if (row.source) sourceSet.add(row.source);
      if (row.method) methodSet.add(row.method);
      if (row.currency) currencySet.add(row.currency);
    }
    return {
      sources: Array.from(sourceSet).sort((a, b) => a.localeCompare(b)),
      methods: Array.from(methodSet).sort((a, b) => a.localeCompare(b)),
      currencies: Array.from(currencySet).sort((a, b) => a.localeCompare(b)),
    };
  }, [opsFlow.outgoingRows]);

  const outflowRowsFiltered = useMemo(() => {
    const query = outflowSearch.trim().toLowerCase();
    return opsFlow.outgoingRows.filter((row) => {
      if (outflowFilters.source !== "all" && row.source !== outflowFilters.source) return false;
      if (outflowFilters.method !== "all" && row.method !== outflowFilters.method) return false;
      if (outflowFilters.currency !== "all" && row.currency !== outflowFilters.currency) return false;
      if (outflowFilters.from && row.paymentDate && row.paymentDate < outflowFilters.from) return false;
      if (outflowFilters.to && row.paymentDate && row.paymentDate > outflowFilters.to) return false;
      if (!query) return true;
      const haystack = [
        row.accountRef,
        row.source,
        row.entity,
        row.person,
        row.bookingRef,
        row.method,
        row.paymentDate,
        row.note,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [opsFlow.outgoingRows, outflowSearch, outflowFilters]);

  const outflowSummaryFiltered = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    for (const row of outflowRowsFiltered) addMoney(byCurrency, row.currency, row.amount);
    return {
      totalDisplay: outflowRowsFiltered.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      byCurrency,
    };
  }, [outflowRowsFiltered]);

  const manualIncomeMethodOptions = useMemo(
    () => [ui.paymentMethodCash, ui.paymentMethodBank, ui.paymentMethodCard, ui.paymentMethodCheque, ui.paymentMethodWallet, ui.paymentMethodWire, ui.paymentMethodOther],
    [ui],
  );

  const manualIncomePartyOptions = useMemo(() => {
    if (manualIncomeForm.partyType === "client") {
      return clients.map((c) => ({ value: String(c.id), label: c.name }));
    }
    if (manualIncomeForm.partyType === "hotel") {
      return hotels.map((h) => ({ value: String(h.id), label: h.name }));
    }
    if (manualIncomeForm.partyType === "supplier") {
      return suppliers.map((s) => ({ value: String(s.id), label: s.name }));
    }
    return [];
  }, [manualIncomeForm.partyType, clients, hotels, suppliers]);

  const manualIncomeBookingOptions = useMemo(() => {
    const rows: { value: string; label: string }[] = [];
    for (const v of opsVouchers) {
      rows.push({ value: `Voucher ${v.voucher_nr}`, label: `Voucher ${v.voucher_nr}` });
      for (const r of v.reservations || []) {
        rows.push({ value: `Voucher ${v.voucher_nr} · Res #${r.id}`, label: `Voucher ${v.voucher_nr} · Res #${r.id}` });
      }
    }
    const uniq = new Map<string, string>();
    for (const row of rows) {
      if (!uniq.has(row.value)) uniq.set(row.value, row.label);
    }
    return Array.from(uniq.entries()).map(([value, label]) => ({ value, label }));
  }, [opsVouchers]);

  const paymentPlaceOptions = useMemo(() => {
    const rows = chartAccounts
      .filter((acc) => acc.is_active !== false && ["asset", "liability", "equity"].includes(String(acc.account_type || "").toLowerCase()))
      .map((acc) => `${acc.code} - ${acc.name}`);
    const defaults = [ui.mainCashbox, ui.bank, ui.bankUsd, ui.bankEur];
    return Array.from(new Set([...defaults, ...rows]));
  }, [chartAccounts, ui]);
  const paymentPlaceRequiredLabel = ui.paymentPlaceRequired;

  const outstandingInvoicesForPayment = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.doc_type !== "ap_bill") return false;
      if (inv.business_sector && inv.business_sector !== "hotels") return false;
      if (paymentForm.hotel && (inv.hotel ?? null) !== Number(paymentForm.hotel)) return false;
      const outstanding = Number(inv.outstanding_amount ?? inv.total_amount);
      return outstanding > 0 && inv.status !== "paid";
    });
  }, [invoices, paymentForm.hotel]);

  const addInvoice = async (event: FormEvent) => {
    event.preventDefault();
    if (invoiceForm.doc_type === "ap_bill") {
      if (!invoiceForm.business_sector) {
        alert(ui.chooseSector);
        return;
      }
      if (invoiceForm.business_sector === "hotels" && !invoiceForm.hotel) {
        alert(ui.chooseHotelForInvoice);
        return;
      }
      if (invoiceForm.business_sector === "aviation" && !invoiceForm.supplier) {
        alert(ui.chooseSupplier);
        return;
      }
      if (invoiceForm.apply_booking_settlement) {
        if (invoiceForm.business_sector === "hotels" && !invoiceForm.booking_id.trim()) {
          alert(ui.requireBookingId);
          return;
        }
        if (invoiceForm.business_sector === "aviation" && !invoiceForm.flight_ticket_id.trim()) {
          alert(ui.requireFlightId);
          return;
        }
      }
    }
    const fxRate = invoiceForm.currency === "TRY" ? 1 : Number(invoiceForm.fx_rate || 1);
    const baseStatus = invoiceForm.doc_type === "ap_bill" ? "sent" : "draft";
    const payload: Record<string, unknown> = {
      doc_type: invoiceForm.doc_type,
      client: invoiceForm.doc_type === "ar_invoice" ? Number(invoiceForm.client) : null,
      hotel: null,
      supplier: null,
      business_sector: invoiceForm.doc_type === "ap_bill" ? invoiceForm.business_sector : "",
      supplier_document_ref: invoiceForm.doc_type === "ap_bill" ? invoiceForm.supplier_document_ref.trim() : "",
      booking_id:
        invoiceForm.doc_type === "ap_bill" && invoiceForm.business_sector === "hotels" && invoiceForm.booking_id.trim()
          ? Number(invoiceForm.booking_id)
          : null,
      flight_ticket_id:
        invoiceForm.doc_type === "ap_bill" &&
        invoiceForm.business_sector === "aviation" &&
        invoiceForm.flight_ticket_id.trim()
          ? Number(invoiceForm.flight_ticket_id)
          : null,
      issue_date: invoiceForm.issue_date,
      due_date: invoiceForm.due_date || null,
      total_amount: Number(invoiceGrossTotal),
      currency: invoiceForm.currency,
      fx_rate: fxRate,
      status: baseStatus,
      notes: invoiceForm.notes.trim(),
      apply_booking_settlement: Boolean(
        invoiceForm.doc_type === "ap_bill" && invoiceForm.apply_booking_settlement,
      ),
    };
    if (invoiceForm.doc_type === "ap_bill" && invoiceForm.business_sector === "hotels") {
      payload.hotel = Number(invoiceForm.hotel);
    }
    if (invoiceForm.doc_type === "ap_bill" && invoiceForm.business_sector === "aviation") {
      payload.supplier = Number(invoiceForm.supplier);
    }
    if (invoiceForm.number && invoiceForm.number.trim()) {
      payload.number = invoiceForm.number.trim();
    }
    const createdInvoice = await api.post<Invoice>("/invoices/", payload);
    const linesToCreate = invoiceLinesDraft
      .map((l) => ({
        invoice: createdInvoice.id,
        description: l.description.trim(),
        notes: l.notes.trim(),
        quantity: Number(l.quantity || 0),
        unit_price: Number(l.unit_price || 0),
        tax_code: l.tax_code ? Number(l.tax_code) : null,
      }))
      .filter((l) => l.description && l.quantity > 0);
    if (linesToCreate.length) {
      await Promise.all(linesToCreate.map((l) => api.post("/invoice-lines/", l)));
    }
    const refreshed = await api.get<Invoice>(`/invoices/${createdInvoice.id}/`);
    setInvoices((prev) => [refreshed, ...prev]);
    setInvoiceForm({
      number: "",
      doc_type: "ar_invoice",
      client: "",
      hotel: "",
      supplier: "",
      business_sector: "",
      supplier_document_ref: "",
      booking_id: "",
      flight_ticket_id: "",
      apply_booking_settlement: false,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: "",
      status: "draft",
      currency: "TRY",
      fx_rate: 1,
      notes: "",
    });
    setInvoiceFxStatus("");
    setInvoiceLinesDraft([{ description: "", notes: "", quantity: "1", unit_price: "0", tax_code: "" }]);
  };

  const addPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentForm.hotel) {
      alert(ui.chooseHotelPayments);
      return;
    }
    const paymentCurrency = paymentForm.currency || "TRY";
    const paymentFxRate = paymentCurrency === "TRY" ? 1 : Number(paymentForm.fx_rate || 1);
    if (!paymentForm.payment_place) {
      alert(`${ui.choose} ${paymentPlaceRequiredLabel}.`);
      return;
    }
    const payload = {
      direction: paymentForm.direction,
      client: null,
      hotel: paymentForm.hotel ? Number(paymentForm.hotel) : null,
      payment_date: paymentForm.payment_date,
      reference: paymentForm.payment_place || "",
      amount: Number(paymentForm.amount || 0),
      currency: paymentCurrency,
      fx_rate: paymentFxRate,
      status: "posted",
    };
    const created = await api.post<Payment>("/payments/", payload);
    const allocs = allocationDrafts.map((a) => ({ invoice: Number(a.invoice), amount: Number(a.amount || 0) })).filter((a) => a.invoice && a.amount > 0);
    if (allocs.length) {
      await Promise.all(allocs.map((a) => api.post("/payment-allocations/", { payment: created.id, ...a })));
    }
    const refreshed = await api.get<Payment>(`/payments/${created.id}/`);
    setPayments((prev) => [refreshed, ...prev]);
    api.get<Invoice[]>("/invoices/").then(setInvoices);
    await syncHotelDueReminders();
    setPaymentForm({
      direction: "payment",
      client: "",
      hotel: "",
      payment_place: paymentForm.payment_place || "",
      payment_date: new Date().toISOString().slice(0, 10),
      currency: "TRY",
      fx_rate: 1,
      amount: "",
    });
    setPaymentFxStatus("");
    setAllocationDrafts([{ invoice: "", amount: "" }]);
  };

  const addManualIncome = async (event: FormEvent) => {
    event.preventDefault();
    const amountValue = Number(manualIncomeForm.amount || 0);
    if (amountValue <= 0) {
      alert(ui.amountGreaterZero);
      return;
    }
    if (!manualIncomeForm.method.trim()) {
      alert(ui.enterReceiveMethod);
      return;
    }
    if (manualIncomeForm.partyType === "other" && !manualIncomeForm.customPartyName.trim()) {
      alert(ui.enterPartyName);
      return;
    }
    if (manualIncomeForm.partyType !== "other" && !manualIncomeForm.partyId) {
      alert(ui.choosePartyFromList);
      return;
    }
    const selectedPartyName =
      manualIncomeForm.partyType === "other"
        ? manualIncomeForm.customPartyName.trim()
        : (manualIncomePartyOptions.find((opt) => opt.value === manualIncomeForm.partyId)?.label ?? "");
    if (!selectedPartyName) {
      alert(ui.partyNameUnknown);
      return;
    }
    const paymentCurrency = manualIncomeForm.currency || "TRY";
    const paymentFxRate = paymentCurrency === "TRY" ? 1 : Number(manualIncomeForm.fx_rate || 1);
    const manualMeta: ManualIncomeMeta = {
      accountRef: manualIncomeForm.accountRef.trim() || undefined,
      person: selectedPartyName,
      bookingRef: manualIncomeForm.bookingRef.trim() || undefined,
      method: manualIncomeForm.method.trim(),
      note: manualIncomeForm.note.trim() || undefined,
    };
    const payload = {
      direction: "receipt" as const,
      client: null,
      hotel: null,
      payment_date: manualIncomeForm.payment_date,
      amount: amountValue,
      currency: paymentCurrency,
      fx_rate: paymentFxRate,
      status: "posted",
      reference: manualIncomeForm.method.trim(),
      notes: encodeManualIncomeMeta(manualMeta),
    };
    const created = await api.post<Payment>("/payments/", payload);
    const refreshed = await api.get<Payment>(`/payments/${created.id}/`);
    setPayments((prev) => [refreshed, ...prev]);
    setManualIncomeForm({
      accountRef: "",
      partyType: "client",
      partyId: "",
      customPartyName: "",
      bookingRef: "",
      method: ui.paymentMethodCash,
      payment_date: new Date().toISOString().slice(0, 10),
      currency: manualIncomeForm.currency || "TRY",
      fx_rate: paymentCurrency === "TRY" ? 1 : paymentFxRate,
      amount: "",
      note: "",
    });
  };

  const deleteInvoice = async (invoice: Invoice) => {
    try {
      await api.delete(`/invoices/${invoice.id}/`, {
        confirmMessage: `${ui.confirmDeleteInvoicePrefix} ${invoice.number}?`,
      });
      setInvoices((prev) => prev.filter((row) => row.id !== invoice.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      alert(err instanceof Error ? err.message : ui.deleteInvoiceFailed);
    }
  };

  const deletePayment = async (payment: Payment) => {
    try {
      await api.delete(`/payments/${payment.id}/`, {
        confirmMessage: `${ui.confirmDeletePaymentPrefix} #${payment.id}?`,
      });
      setPayments((prev) => prev.filter((row) => row.id !== payment.id));
      api.get<Invoice[]>("/invoices/").then(setInvoices);
      await syncHotelDueReminders();
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      alert(err instanceof Error ? err.message : ui.deletePaymentFailed);
    }
  };

  const cancelChartAccountEdit = () => {
    setEditingChartAccountId(null);
    setAccountForm({ code: "", name: "", account_type: "asset", is_active: true });
  };

  const saveChartAccountFromSettings = async () => {
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      setSettingsStatus("Enter account code and name.");
      return;
    }
    try {
      const payload = {
        code: accountForm.code.trim(),
        name: accountForm.name.trim(),
        account_type: accountForm.account_type,
        is_active: accountForm.is_active,
      };
      if (editingChartAccountId != null) {
        await api.patch(`/chart-accounts/${editingChartAccountId}/`, payload);
        setSettingsStatus("Account updated.");
      } else {
        await api.post("/chart-accounts/", payload);
        setSettingsStatus("New account added.");
      }
      cancelChartAccountEdit();
      await loadSettingsCenter();
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to save account.");
    }
  };

  const deleteChartAccountFromSettings = async (id: number, code: string) => {
    const accepted = await requestDeleteConfirm(`Delete account ${code}?`);
    if (!accepted) return;
    try {
      await api.delete(`/chart-accounts/${id}/`, { skipConfirm: true });
      if (editingChartAccountId === id) cancelChartAccountEdit();
      await loadSettingsCenter();
      setSettingsStatus("Account deleted.");
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to delete account.");
    }
  };

  const cancelTaxCodeEdit = () => {
    setEditingTaxCodeId(null);
    setTaxForm({ code: "", name: "", ratePercent: "20", is_inclusive: false, is_active: true });
  };

  const saveTaxCodeFromSettings = async () => {
    if (!taxForm.code.trim() || !taxForm.name.trim()) {
      setSettingsStatus("Enter tax code and name.");
      return;
    }
    const rate = Math.max(0, Number(taxForm.ratePercent || 0)) / 100;
    try {
      const payload = {
        code: taxForm.code.trim(),
        name: taxForm.name.trim(),
        rate,
        is_inclusive: taxForm.is_inclusive,
        is_active: taxForm.is_active,
      };
      if (editingTaxCodeId != null) {
        await api.patch(`/tax-codes/${editingTaxCodeId}/`, payload);
        setSettingsStatus("Tax code updated.");
      } else {
        await api.post("/tax-codes/", payload);
        setSettingsStatus("Tax code added.");
      }
      cancelTaxCodeEdit();
      await loadSettingsCenter();
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to save tax code.");
    }
  };

  const cancelDropdownCategoryEdit = () => {
    setEditingDropdownCategoryId(null);
    setCategoryForm({ name: "", key: "", sort_order: "0", is_active: true });
  };

  const saveDropdownCategoryFromSettings = async () => {
    if (!categoryForm.name.trim() || !categoryForm.key.trim()) {
      setSettingsStatus("Enter category name and key.");
      return;
    }
    try {
      const payload = {
        name: categoryForm.name.trim(),
        key: categoryForm.key.trim().toLowerCase(),
        sort_order: Number(categoryForm.sort_order || 0),
        is_active: categoryForm.is_active,
      };
      if (editingDropdownCategoryId != null) {
        await api.patch(`/dropdown-categories/${editingDropdownCategoryId}/`, payload);
        setSettingsStatus("Category updated.");
      } else {
        await api.post("/dropdown-categories/", payload);
        setSettingsStatus("Dropdown category added.");
      }
      cancelDropdownCategoryEdit();
      await loadSettingsCenter();
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to save category.");
    }
  };

  const cancelDropdownOptionEdit = () => {
    setEditingDropdownOptionId(null);
    setOptionForm({ category: "", label: "", value: "", sort_order: "0", is_active: true });
  };

  const saveDropdownOptionFromSettings = async () => {
    if (!optionForm.category || !optionForm.label.trim() || !optionForm.value.trim()) {
      setSettingsStatus("Select category and enter option label/value.");
      return;
    }
    try {
      const payload = {
        category: Number(optionForm.category),
        label: optionForm.label.trim(),
        value: optionForm.value.trim(),
        sort_order: Number(optionForm.sort_order || 0),
        is_active: optionForm.is_active,
      };
      if (editingDropdownOptionId != null) {
        await api.patch(`/dropdown-options/${editingDropdownOptionId}/`, payload);
        setSettingsStatus("Option updated.");
      } else {
        await api.post("/dropdown-options/", payload);
        setSettingsStatus("Option added.");
      }
      cancelDropdownOptionEdit();
      await loadSettingsCenter();
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to save option.");
    }
  };

  const cancelAppSettingEdit = () => {
    setEditingAppSettingId(null);
    setAppSettingForm({ section: "accounting", key: "", label: "", value: "", description: "" });
  };

  const upsertAppSettingFromSettings = async () => {
    if (!appSettingForm.section.trim() || !appSettingForm.key.trim()) {
      setSettingsStatus("Enter setting section and key.");
      return;
    }
    try {
      const payload = {
        section: appSettingForm.section.trim(),
        key: appSettingForm.key.trim(),
        label: appSettingForm.label.trim(),
        value: appSettingForm.value,
        description: appSettingForm.description,
      };
      if (editingAppSettingId != null) {
        await api.patch(`/app-settings/${editingAppSettingId}/`, payload);
        setSettingsStatus("Setting updated.");
        cancelAppSettingEdit();
      } else {
        const existing = settingsAppSettings.find(
          (x) =>
            x.section.trim().toLowerCase() === appSettingForm.section.trim().toLowerCase() &&
            x.key.trim().toLowerCase() === appSettingForm.key.trim().toLowerCase(),
        );
        if (existing) {
          await api.patch(`/app-settings/${existing.id}/`, {
            label: payload.label,
            value: payload.value,
            description: payload.description,
          });
          setSettingsStatus("Setting updated.");
        } else {
          await api.post("/app-settings/", payload);
          setSettingsStatus("New setting added.");
        }
      }
      await loadSettingsCenter();
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to save setting.");
    }
  };

  const uploadPdfAssetFromSettings = async () => {
    if (!pdfAssetForm.file) {
      setSettingsStatus("Select a file first.");
      return;
    }
    const token = getToken();
    if (!token) {
      setSettingsStatus("Session not found. Please login again.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("name", pdfAssetForm.name.trim());
      formData.append("file", pdfAssetForm.file);
      const response = await fetch(`${API_BASE}/pdf-assets/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
        },
        body: formData,
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || `Upload failed (${response.status})`);
      }
      setPdfAssetForm({ name: "", file: null });
      await loadSettingsCenter();
      setSettingsStatus("File uploaded successfully.");
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to upload file.");
    }
  };

  const deletePdfAssetFromSettings = async (id: number) => {
    const accepted = await requestDeleteConfirm("Delete file?");
    if (!accepted) return;
    try {
      await api.delete(`/pdf-assets/${id}/`, { skipConfirm: true });
      await loadSettingsCenter();
      setSettingsStatus("File deleted.");
    } catch (e) {
      setSettingsStatus(e instanceof Error ? e.message : "Unable to delete file.");
    }
  };

  const loadStatement = async () => {
    if (!statementTarget.id) {
      alert(ui.chooseClientOrHotel);
      return;
    }
    setStatementLoadError("");
    const base = statementTarget.kind === "client" ? `client=${encodeURIComponent(statementTarget.id)}` : `hotel=${encodeURIComponent(statementTarget.id)}`;
    const qs = [base];
    if (statementDateFrom) qs.push(`date_from=${encodeURIComponent(statementDateFrom)}`);
    if (statementDateTo) qs.push(`date_to=${encodeURIComponent(statementDateTo)}`);
    try {
      const data = await api.get<StatementPayload>(`/invoices/statement/?${qs.join("&")}`);
      setStatementData(data);
      setStatementRows(
        data.rows.map((r) => ({
          invoice_id: r.invoice_id,
          number: r.number,
          issue_date: r.issue_date,
          due_date: r.due_date,
          outstanding_amount: r.outstanding_amount,
        })),
      );
      setAgingSummary(data.aging);
    } catch (e) {
      setStatementData(null);
      setStatementRows([]);
      setAgingSummary(null);
      setStatementLoadError(e instanceof Error ? e.message : ui.loadStatementFailed);
    }
  };

  const loadAging = async () => {
    if (!statementTarget.id) {
      alert(ui.chooseClientOrHotel);
      return;
    }
    const docType = statementTarget.kind === "client" ? "ar_invoice" : "ap_bill";
    const party = statementTarget.kind === "client" ? `&client=${statementTarget.id}` : `&hotel=${statementTarget.id}`;
    try {
      const data = await api.get<{ summary: Record<string, number> }>(`/invoices/aging/?doc_type=${docType}${party}`);
      setAgingSummary(data.summary);
      setStatementLoadError("");
    } catch (e) {
      setAgingSummary(null);
      setStatementLoadError(e instanceof Error ? e.message : ui.loadAgingFailed);
    }
  };

  const loadTrialBalanceReport = async () => {
    const data = await api.get<TrialBalanceResponse>(
      `/journal-entries/trial_balance/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}`,
    );
    setTrialBalanceData(data);
  };

  const loadVatReport = async () => {
    const data = await api.get<VatSummaryApi>(
      `/invoices/vat_summary/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}&doc_type=${reportVatDocType}`,
    );
    setVatSummary(data);
  };

  const loadGeneralLedgerReport = async () => {
    const base = `/journal-entries/general_ledger/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}`;
    const q = reportGlAccountId ? `${base}&account=${encodeURIComponent(reportGlAccountId)}` : base;
    const data = await api.get<GeneralLedgerResponse>(q);
    setGlData(data);
  };

  const loadGlobalAgingReport = async (docType: "ar_invoice" | "ap_bill") => {
    const data = await api.get<{ as_of: string; summary: Record<string, number> }>(
      `/invoices/aging/?doc_type=${docType}&as_of=${encodeURIComponent(reportRange.end)}`,
    );
    setGlobalAging({ as_of: data.as_of, doc_type: docType, summary: data.summary });
  };

  const createHotelInvoiceForReservation = async (reservationId: number) => {
    setReservationPending({ id: reservationId, action: "create" });
    try {
      const res = await api.post<{
        detail?: string;
        already_exists?: boolean;
        number?: string;
      }>(`/voucher-reservations/${reservationId}/create-hotel-invoice`, {});
      if (res.already_exists && res.detail) {
        alert(res.detail);
      }
      setExpandedReservationId(null);
      const data = await api.get<{ rows: ReservationAccountingRow[] }>(
        `/voucher-reservations/accounting-overview?invoiced=${reservationInvoicedFilter}`,
      );
      setReservationRows(data.rows || []);
      void api.get<Invoice[]>("/invoices/").then(setInvoices);
    } catch (e) {
      alert(e instanceof Error ? e.message : ui.unableCreateHotelInvoice);
    } finally {
      setReservationPending(null);
    }
  };

  const saveHotelInvoiceRefForReservation = async (reservationId: number) => {
    const fromDraft = hotelInvoiceRefDraft[reservationId];
    const fromRow = reservationRows.find((x) => x.id === reservationId);
    const raw = fromDraft !== undefined ? fromDraft : (fromRow?.hotel_invoice_ref ?? "");
    const val = raw.trim().slice(0, 120);
    setReservationPending({ id: reservationId, action: "hotel_ref" });
    try {
      await api.post<{ id: number; hotel_invoice_ref: string }>(
        `/voucher-reservations/${reservationId}/set-hotel-invoice-ref`,
        { hotel_invoice_ref: val },
      );
      setHotelInvoiceRefDraft((p) => {
        const n = { ...p };
        delete n[reservationId];
        return n;
      });
      setExpandedReservationId(null);
      const data = await api.get<{ rows: ReservationAccountingRow[] }>(
        `/voucher-reservations/accounting-overview?invoiced=${reservationInvoicedFilter}`,
      );
      setReservationRows(data.rows || []);
    } catch (e) {
      alert(e instanceof Error ? e.message : ui.unableSaveHotelInvoiceNumber);
    } finally {
      setReservationPending(null);
    }
  };

  const clearHotelInvoiceRefForReservation = async (reservationId: number) => {
    setReservationPending({ id: reservationId, action: "hotel_ref" });
    try {
      await api.post<{ id: number; hotel_invoice_ref: string }>(
        `/voucher-reservations/${reservationId}/set-hotel-invoice-ref`,
        { hotel_invoice_ref: "" },
      );
      setHotelInvoiceRefDraft((p) => {
        const n = { ...p };
        delete n[reservationId];
        return n;
      });
      const data = await api.get<{ rows: ReservationAccountingRow[] }>(
        `/voucher-reservations/accounting-overview?invoiced=${reservationInvoicedFilter}`,
      );
      setReservationRows(data.rows || []);
    } catch (e) {
      alert(e instanceof Error ? e.message : ui.unableClearHotelInvoiceNumber);
    } finally {
      setReservationPending(null);
    }
  };

  const excelConfig = (() => {
    if (activeTab === "invoices") {
      return {
        exportUrl: `${API_BASE}/invoices/export/`,
        importUrl: `${API_BASE}/invoices/import_xlsx/`,
        onImported: () => void api.get<Invoice[]>("/invoices/").then(setInvoices),
      };
    }
    if (activeTab === "payments" || activeTab === "income") {
      return {
        exportUrl: `${API_BASE}/payments/export/`,
        importUrl: `${API_BASE}/payments/import_xlsx/`,
        onImported: () => void api.get<Payment[]>("/payments/").then(setPayments),
      };
    }
    if (activeTab === "reservations") {
      return {
        exportUrl: `${API_BASE}/voucher-reservations/export/`,
        importUrl: `${API_BASE}/voucher-reservations/import_xlsx/`,
        onImported: () =>
          void api
            .get<{ rows: ReservationAccountingRow[] }>(
              `/voucher-reservations/accounting-overview?invoiced=${reservationInvoicedFilter}`,
            )
            .then((data) => setReservationRows(data.rows || [])),
      };
    }
    if (activeTab === "statements" || activeTab === "reports") {
      return {
        exportUrl: `${API_BASE}/journal-entries/export/`,
        importUrl: `${API_BASE}/journal-entries/import_xlsx/`,
        onImported: () => {},
      };
    }
    return {
      exportUrl: `${API_BASE}/invoices/export/`,
      importUrl: `${API_BASE}/invoices/import_xlsx/`,
      onImported: () => void api.get<Invoice[]>("/invoices/").then(setInvoices),
    };
  })();

  return (
    <div className="space-y-6">
      {pdfPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <div className="text-sm font-semibold">{ui.previewTitle}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = pdfPreview.url;
                    a.download = pdfPreview.name;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs"
                >
                  {ui.download}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(pdfPreview.url);
                    setPdfPreview(null);
                  }}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white"
                >
                  {ui.close}
                </button>
              </div>
            </div>
            <div className="h-[80vh] bg-zinc-50">
              <iframe title="Invoice PDF Preview" src={pdfPreview.url} className="h-full w-full" />
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{accountingPageTitle}</h1>
          <p className="text-sm text-zinc-500">{t.accountingSubtitle}</p>
        </div>
        <ImportExportActions
          exportUrl={excelConfig.exportUrl}
          importUrl={excelConfig.importUrl}
          onImported={excelConfig.onImported}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "invoices", label: ui.tabInvoices },
          { key: "payments", label: ui.tabPayments },
          { key: "income", label: ui.tabIncome },
          { key: "reservations", label: ui.tabReservations },
          { key: "statements", label: ui.tabStatements },
          { key: "settings", label: ui.tabSettings },
          { key: "reports", label: ui.tabReports },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`rounded-md px-3 py-2 text-sm border ${activeTab === tab.key ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-800 border-zinc-200"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.globalSearch} hint={ui.globalSearchHint} />
        <input
          className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
          placeholder={ui.globalSearchPlaceholder}
          value={searchAny}
          onChange={(e) => setSearchAny(e.target.value)}
        />
      </div>

      {activeTab === "invoices" && (
        <div className="grid gap-6">
          <form
            onSubmit={addInvoice}
            className="w-full rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/25 to-sky-50/30 p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{ui.invoiceBillTitle}</h2>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-800">
                Invoice Composer
              </span>
            </div>
            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-white/90 p-3 md:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.documentType} hint="AR Invoice / AP Bill / Credit / Debit." />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={invoiceForm.doc_type}
                  onChange={(e) => {
                    const doc_type = e.target.value as Invoice["doc_type"];
                    setInvoiceForm((prev) => ({
                      ...prev,
                      doc_type,
                      status: doc_type === "ap_bill" ? "sent" : "draft",
                      business_sector: doc_type === "ap_bill" ? prev.business_sector : "",
                      supplier_document_ref: doc_type === "ap_bill" ? prev.supplier_document_ref : "",
                      booking_id: doc_type === "ap_bill" ? prev.booking_id : "",
                      flight_ticket_id: doc_type === "ap_bill" ? prev.flight_ticket_id : "",
                      apply_booking_settlement: doc_type === "ap_bill" ? prev.apply_booking_settlement : false,
                    }));
                  }}
                >
                  {docTypeSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                {ui.invoiceAutoNumber}
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.invoiceCurrency} hint={ui.invoiceCurrencyHint} />
                <TypeableSelect className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm" value={invoiceForm.currency} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, currency: e.target.value }))}>
                  {accountingCurrencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-white/90 p-3 md:grid-cols-[1fr_auto_auto] items-end">
              <div className="space-y-1">
                <div className="text-xs text-zinc-500">{ui.fxRateLabel} (TRY / 1 {invoiceForm.currency})</div>
                <input
                  type="number"
                  min={0}
                  step="0.000001"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={invoiceForm.fx_rate}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, fx_rate: Number(e.target.value || 1) }))}
                  disabled
                />
                {invoiceFxStatus && <div className="text-xs text-amber-700">{invoiceFxStatus}</div>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await syncTcmbForDate(invoiceForm.issue_date || new Date().toISOString().slice(0, 10));
                  setInvoiceFxStatus(ui.syncTcmbDone);
                }}
                className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-800"
              >
                {ui.syncTcmb}
              </button>
            </div>

            {invoiceForm.doc_type === "ar_invoice" ? (
              <div className="space-y-1 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={ui.invoiceClient} hint={ui.invoiceClientHint} />
                <TypeableSelect className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm" value={invoiceForm.client} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, client: e.target.value }))} required>
                  <option value="">{t.fleetSelectClient}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="text-sm font-semibold text-emerald-900">{t.accountingIncomingInvoices}</div>
                <label className="grid gap-1 text-xs text-zinc-600">
                  <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.accountingBusinessSector} hint={ui.sectorHint} />
                  <TypeableSelect
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={invoiceForm.business_sector}
                    onChange={(e) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        business_sector: e.target.value as "" | "hotels" | "aviation",
                        hotel: "",
                        supplier: "",
                        booking_id: "",
                        flight_ticket_id: "",
                        apply_booking_settlement: false,
                      }))
                    }
                    required
                  >
                    <option value="">{t.accountingSectorNone}</option>
                    <option value="hotels">{t.accountingSectorHotels}</option>
                    <option value="aviation">{t.accountingSectorAviation}</option>
                  </TypeableSelect>
                </label>
                {invoiceForm.business_sector === "hotels" && (
                  <div className="space-y-1">
                    <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={ui.hotel} />
                    <TypeableSelect
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={invoiceForm.hotel}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, hotel: e.target.value }))}
                      required
                    >
                      <option value="">{ui.chooseHotel}</option>
                      {hotels.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </TypeableSelect>
                  </div>
                )}
                {invoiceForm.business_sector === "aviation" && (
                  <div className="space-y-1">
                    <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={ui.aviationSupplier} />
                    <TypeableSelect
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={invoiceForm.supplier}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, supplier: e.target.value }))}
                      required
                    >
                      <option value="">{ui.chooseAviationSupplier}</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </TypeableSelect>
                  </div>
                )}
                <label className="grid gap-1 text-xs text-zinc-600">
                  <span>
                    {invoiceForm.business_sector === "hotels" ? ui.hotelInvoiceNumber : t.accountingSupplierInvoiceRef}
                  </span>
                  <div className="mt-1">
                    <FieldLabel icon={<TicketIcon className="h-4 w-4" />} text={ui.invoiceReference} hint={ui.invoiceReferenceHint} />
                  </div>
                  <input
                    className="mb-input-raised w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={invoiceForm.supplier_document_ref}
                    onChange={(e) => setInvoiceForm((prev) => ({ ...prev, supplier_document_ref: e.target.value }))}
                    placeholder={invoiceForm.business_sector === "hotels" ? ui.hotelInvoicePlaceholder : "Example: INV-9981"}
                  />
                </label>
                {invoiceForm.business_sector === "hotels" && (
                  <label className="grid gap-1 text-xs text-zinc-600">
                    <span>{t.accountingReservationId}</span>
                    <input
                      className="mb-input-raised w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                      value={invoiceForm.booking_id}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, booking_id: e.target.value }))}
                      placeholder="ID from bookings table"
                    />
                  </label>
                )}
                {invoiceForm.business_sector === "aviation" && (
                  <label className="grid gap-1 text-xs text-zinc-600">
                    <span>{t.accountingFlightTicketId}</span>
                    <input
                      className="mb-input-raised w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                      value={invoiceForm.flight_ticket_id}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, flight_ticket_id: e.target.value }))}
                      placeholder="ID from flights section"
                    />
                  </label>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={invoiceForm.apply_booking_settlement}
                    onChange={(e) => setInvoiceForm((prev) => ({ ...prev, apply_booking_settlement: e.target.checked }))}
                  />
                  <span>{t.accountingSettleWithBooking}</span>
                </label>
              </div>
            )}

            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-white/90 p-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.issueDate} />
                <PopupYmdDatePicker
                  value={invoiceForm.issue_date}
                  onChange={(nextIso) => setInvoiceForm((prev) => ({ ...prev, issue_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  name="invoice_issue_date"
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.dueDateOptional} />
                <PopupYmdDatePicker
                  value={invoiceForm.due_date}
                  onChange={(nextIso) => setInvoiceForm((prev) => ({ ...prev, due_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  name="invoice_due_date"
                />
              </div>
            </div>

            <label className="grid gap-1 rounded-xl border border-zinc-100 bg-white/90 p-3 text-xs text-zinc-600">
              <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.accountingInvoiceHeaderNotes} hint={ui.invoiceNotesHint} />
              <textarea
                className="mb-input-raised min-h-[72px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </label>

            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{ui.invoiceLines}</div>
                <button
                  type="button"
                  onClick={() => setInvoiceLinesDraft((prev) => [...prev, { description: "", notes: "", quantity: "1", unit_price: "0", tax_code: "" }])}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs"
                >
                  {t.commonAdd}
                </button>
              </div>
              <div className="hidden md:grid grid-cols-[1.2fr_1.1fr_0.5fr_0.55fr_1fr_auto] gap-2 text-[11px] text-zinc-500">
                <div className="px-1">{ui.description}</div>
                <div className="px-1">{t.accountingLineNotes}</div>
                <div className="px-1">{ui.quantity}</div>
                <div className="px-1">{ui.unitPrice}</div>
                <div className="px-1">{ui.tax}</div>
                <div className="px-1 text-left">{ui.action}</div>
              </div>
              {invoiceLinesDraft.map((line, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-[1.2fr_1.1fr_0.5fr_0.55fr_1fr_auto]">
                  <input className="rounded-md border border-zinc-200 px-3 py-2 text-sm" placeholder={ui.description} value={line.description} onChange={(e) => setInvoiceLinesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} />
                  <input
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    placeholder={t.accountingLineNotes}
                    value={line.notes}
                    onChange={(e) => setInvoiceLinesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))}
                  />
                  <input type="number" min={0} step="0.01" className="rounded-md border border-zinc-200 px-3 py-2 text-sm" placeholder={ui.quantity} value={line.quantity} onChange={(e) => setInvoiceLinesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                  <input type="number" min={0} step="0.01" className="rounded-md border border-zinc-200 px-3 py-2 text-sm" placeholder={ui.unitPrice} value={line.unit_price} onChange={(e) => setInvoiceLinesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x)))} />
                  <TypeableSelect
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={line.tax_code}
                    onChange={(e) => setInvoiceLinesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, tax_code: e.target.value } : x)))}
                  >
                    <option value="">{ui.noTax}</option>
                    {taxCodes.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.code} ({Number(tc.rate) * 100}%)
                      </option>
                    ))}
                  </TypeableSelect>
                  <button
                    type="button"
                    disabled={invoiceLinesDraft.length === 1}
                    onClick={async () => {
                      const accepted = await requestDeleteConfirm(ui.confirmDelete);
                      if (!accepted) return;
                      setInvoiceLinesDraft((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs text-red-600 disabled:opacity-50"
                    aria-label={t.commonDelete}
                    title={t.commonDelete}
                  >
                    <TrashGlyph />
                  </button>
                </div>
              ))}
              <div className="text-xs text-zinc-500">
                  <span className="font-medium">{ui.noteLabel}:</span> {ui.totalFormula}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">{ui.net}</span>
                <span className="font-semibold">{formatCurrency(invoiceNetTotal, invoiceForm.currency as any, lang)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">{ui.vatTax}</span>
                <span className="font-semibold">{formatCurrency(invoiceTaxTotal, invoiceForm.currency as any, lang)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">{t.commonTotal}</span>
                <span className="font-semibold">{formatCurrency(invoiceGrossTotal, invoiceForm.currency as any, lang)}</span>
              </div>
              {invoiceForm.currency !== "TRY" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{ui.tryEquivalent}</span>
                  <span className="font-semibold">{formatCurrency(invoiceGrossTotal * Number(invoiceForm.fx_rate || 1), "TRY" as any, lang)}</span>
                </div>
              )}
            </div>

            <button className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-800">
              {t.commonSave}
            </button>
          </form>

          <div className="w-full rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/30 to-cyan-50/30 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{t.accountingInvoices}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadTablePdf(
                      ui.invoicesAccounting,
                      [ui.number, ui.type, ui.status, ui.issueDate, ui.dueDate, t.commonTotal, ui.outstanding],
                      invoiceRowsTech.map((invoice) => [
                        invoice.number || invoice.id,
                        invoice.doc_type || "—",
                        invoice.status || "—",
                        invoice.issue_date ? formatYmdSlash(invoice.issue_date) : "—",
                        invoice.due_date ? formatYmdSlash(invoice.due_date) : "—",
                        formatCurrency(invoice.total_amount, toSupportedCurrency(invoice.currency || currency), lang),
                        formatCurrency(invoice._outstanding, toSupportedCurrency(invoice.currency || currency), lang),
                      ]),
                    )
                  }
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                >
                  {ui.tablePdf}
                </button>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">{ui.smartInvoiceMonitor}</span>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm"
                value={invoiceTechFilters.docType}
                onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, docType: e.target.value as typeof p.docType }))}
              >
                <option value="all">{ui.allTypes}</option>
                <option value="ar_invoice">{ui.arInvoice}</option>
                <option value="ap_bill">{ui.apBill}</option>
                <option value="credit_note">{ui.creditNote}</option>
                <option value="debit_note">{ui.debitNote}</option>
              </TypeableSelect>
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm"
                value={invoiceTechFilters.status}
                onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, status: e.target.value as typeof p.status }))}
              >
                <option value="all">{ui.allStatuses}</option>
                <option value="draft">{ui.draft}</option>
                <option value="sent">{ui.sent}</option>
                <option value="paid">{ui.paid}</option>
                <option value="overdue">{ui.overdue}</option>
              </TypeableSelect>
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm"
                value={invoiceTechFilters.party}
                onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, party: e.target.value as typeof p.party }))}
              >
                <option value="all">{ui.allParties}</option>
                <option value="ar">{ui.arClients}</option>
                <option value="ap_hotels">{ui.apHotels}</option>
                <option value="ap_aviation">{ui.apAviation}</option>
              </TypeableSelect>
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm"
                value={invoiceTechFilters.currency}
                onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, currency: e.target.value }))}
              >
                <option value="all">{ui.allCurrencies}</option>
                {Array.from(new Set(invoices.map((x) => String(x.currency || "").toUpperCase()).filter(Boolean)))
                  .sort((a, b) => a.localeCompare(b))
                  .map((ccy) => (
                    <option key={ccy} value={ccy}>
                      {ccy}
                    </option>
                  ))}
              </TypeableSelect>
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm"
                value={invoiceTechFilters.sortBy}
                onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, sortBy: e.target.value as typeof p.sortBy }))}
              >
                <option value="issue_desc">{ui.newestFirst}</option>
                <option value="issue_asc">{ui.oldestFirst}</option>
                <option value="outstanding_desc">{ui.highestOutstanding}</option>
                <option value="total_desc">{ui.highestTotal}</option>
              </TypeableSelect>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm">
                <input
                  type="checkbox"
                  checked={invoiceTechFilters.overdueOnly}
                  onChange={(e) => setInvoiceTechFilters((p) => ({ ...p, overdueOnly: e.target.checked }))}
                />
                {ui.overdueOnly}
              </label>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                onClick={() =>
                  setInvoiceTechFilters({
                    docType: "all",
                    status: "all",
                    currency: "all",
                    party: "all",
                    overdueOnly: false,
                    sortBy: "issue_desc",
                  })
                }
              >
                {ui.resetFilters}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-zinc-100 bg-white px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.invoiceCount}</div>
                <div className="font-semibold text-zinc-900">{invoiceTechSummary.count}</div>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.overdue}</div>
                <div className="font-semibold text-rose-700">{invoiceTechSummary.overdueCount}</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.outstanding}</div>
                <div className="font-semibold text-amber-700">
                  {formatCurrency(invoiceTechSummary.outstandingTotal, toSupportedCurrency(currency), lang)}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.paidDraft}</div>
                <div className="font-semibold text-emerald-700">
                  {invoiceTechSummary.paidCount} / {invoiceTechSummary.draftCount}
                </div>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {invoiceRowsTech.map((invoice) => (
                <div
                  key={invoice.id}
                  className={`rounded-xl border bg-white p-3 shadow-sm ${
                    invoice._settlementState === "paid"
                      ? "border-emerald-200"
                      : invoice._settlementState === "partial"
                        ? "border-orange-200"
                        : "border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-zinc-900">{invoice.number}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          invoice._settlementState === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : invoice._settlementState === "partial"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {invoice._settlementState === "paid" ? ui.paidFull : invoice._settlementState === "partial" ? ui.paidPartial : ui.unpaid}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => previewInvoicePdf(invoice.id, invoice.number)}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
                      >
                        {ui.preview}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadInvoicePdf(invoice.id, invoice.number)}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
                      >
                        {ui.download}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteInvoice(invoice)}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                      <span className="whitespace-nowrap text-xs font-semibold text-zinc-800">
                        {formatCurrency(invoice.total_amount, toSupportedCurrency(invoice.currency || currency), lang)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>
                      {invoice.doc_type}
                      {invoice.business_sector === "hotels" ? ` · ${ui.sectorHotels}` : invoice.business_sector === "aviation" ? ` · ${ui.sectorAviation}` : ""}
                      {invoice._isOverdue ? ` · ${ui.overdue}` : ""}
                    </span>
                    <span>
                      {ui.outstanding}: {formatCurrency(invoice._outstanding, toSupportedCurrency(invoice.currency || currency), lang)}
                      {invoice.due_date ? ` · ${ui.due} ${formatYmdSlash(invoice.due_date)}` : ""}
                      {invoice._isOverdue ? ` · ${ui.delayDays} ${invoice._ageDays}d` : ""}
                    </span>
                  </div>
                  <div className="mt-1">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>{ui.paymentRatio}</span>
                      <span className="font-semibold">{Math.round(invoice._paidRatio * 100)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          invoice._settlementState === "paid"
                            ? "bg-emerald-500"
                            : invoice._settlementState === "partial"
                              ? "bg-orange-500"
                              : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(3, Math.round(invoice._paidRatio * 100))}%` }}
                      />
                    </div>
                  </div>
                  {(invoice.supplier_document_ref || invoice.booking_id || invoice.flight_ticket_id) && (
                    <div className="mt-1 text-[11px] text-zinc-600">
                      {invoice.supplier_document_ref ? <>{ui.incomingRef}: {invoice.supplier_document_ref} · </> : null}
                      {invoice.booking_id ? <>{ui.bookingRefShort} #{invoice.booking_id} · </> : null}
                      {invoice.flight_ticket_id ? <>{ui.ticketRefShort} #{invoice.flight_ticket_id}</> : null}
                    </div>
                  )}
                </div>
              ))}
              {!invoiceRowsTech.length && <p className="text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "income" && (
        <div className="grid gap-6">
          <div className="w-full rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/20 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{ui.incomeSection}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadTablePdf(
                      ui.incomingPaymentsAccounting,
                      [ui.account, ui.source, ui.party, ui.reference, ui.method, ui.date, ui.amount, ui.note],
                      incomeRowsFiltered.map((row) => [
                        row.accountRef || "—",
                        row.source,
                        row.person || row.entity || "—",
                        row.bookingRef || "—",
                        row.method,
                        row.paymentDate ? formatYmdSlash(row.paymentDate) : "—",
                        `${Number(row.amount || 0).toLocaleString()} ${row.currency}`,
                        row.note || "—",
                      ]),
                    )
                  }
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                >
                  {ui.tablePdf}
                </button>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-800">
                  {ui.incomeCenter}
                </span>
              </div>
            </div>
            {opsLoadError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{opsLoadError}</div> : null}
            <form onSubmit={addManualIncome} className="grid gap-3 rounded-xl border border-emerald-100 bg-white p-4 md:grid-cols-4">
              <div className="md:col-span-4">
                <div className="text-xs font-semibold text-emerald-900">{ui.incomeManualEntry}</div>
                <div className="text-[11px] text-zinc-500">{ui.incomeManualHint}</div>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.accountRef} />
                <TypeableSelect
                  value={manualIncomeForm.accountRef}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, accountRef: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                >
                  <option value="">{ui.noAccountSpecified}</option>
                  {chartAccounts.map((acc) => (
                    <option key={acc.id} value={acc.code}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={ui.partyType} />
                <TypeableSelect
                  value={manualIncomeForm.partyType}
                  onChange={(e) =>
                    setManualIncomeForm((prev) => ({
                      ...prev,
                      partyType: e.target.value as "client" | "hotel" | "supplier" | "other",
                      partyId: "",
                      customPartyName: "",
                    }))
                  }
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                >
                  <option value="client">{ui.partyTypeClient}</option>
                  <option value="hotel">{ui.partyTypeHotel}</option>
                  <option value="supplier">{ui.partyTypeSupplier}</option>
                  <option value="other">{ui.partyTypeOther}</option>
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={ui.partyOrPerson} />
                {manualIncomeForm.partyType === "other" ? (
                  <input
                    value={manualIncomeForm.customPartyName}
                    onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, customPartyName: e.target.value }))}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                    placeholder={ui.partyNamePlaceholder}
                    required
                  />
                ) : (
                  <TypeableSelect
                    value={manualIncomeForm.partyId}
                    onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, partyId: e.target.value }))}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                    required
                  >
                    <option value="">{ui.chooseParty}</option>
                    {manualIncomePartyOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </TypeableSelect>
                )}
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TicketIcon className="h-4 w-4" />} text={ui.bookingRef} />
                <TypeableSelect
                  value={manualIncomeForm.bookingRef}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, bookingRef: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                >
                  <option value="">{ui.noBookingRef}</option>
                  {manualIncomeBookingOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.receiveMethod} />
                <TypeableSelect
                  value={manualIncomeForm.method}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, method: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  required
                >
                  {manualIncomeMethodOptions.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.collectionDate} />
                <PopupYmdDatePicker
                  value={manualIncomeForm.payment_date}
                  onChange={(nextIso) => setManualIncomeForm((prev) => ({ ...prev, payment_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  name="manual_income_date"
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.invoiceCurrency} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  value={manualIncomeForm.currency}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, currency: e.target.value }))}
                >
                  {accountingCurrencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.fxRateLabel} />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={manualIncomeForm.currency === "TRY" ? "1" : String(manualIncomeForm.fx_rate || 1)}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, fx_rate: Number(e.target.value || 1) }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  disabled
                />
                {manualIncomeFxStatus ? <div className="text-[11px] text-amber-700">{manualIncomeFxStatus}</div> : null}
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.receivedAmount} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualIncomeForm.amount}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={ui.noteLabel} />
                <input
                  value={manualIncomeForm.note}
                  onChange={(e) => setManualIncomeForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  placeholder={ui.incomeNotePlaceholder}
                />
              </div>
              <div className="md:col-span-1 flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {ui.addManualCollection}
                </button>
              </div>
            </form>
            <div className="grid gap-2 rounded-xl border border-emerald-100 bg-white/80 p-3 md:grid-cols-5">
              <input
                value={incomeSearch}
                onChange={(e) => setIncomeSearch(e.target.value)}
                placeholder={ui.incomeSearchPlaceholder}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs md:col-span-2"
              />
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={incomeFilters.source}
                onChange={(e) => setIncomeFilters((prev) => ({ ...prev, source: e.target.value }))}
              >
                <option value="all">{ui.allSources}</option>
                {incomeFilterOptions.sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </TypeableSelect>
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={incomeFilters.method}
                onChange={(e) => setIncomeFilters((prev) => ({ ...prev, method: e.target.value }))}
              >
                <option value="all">{ui.allCollectionMethods}</option>
                {incomeFilterOptions.methods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </TypeableSelect>
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={incomeFilters.currency}
                onChange={(e) => setIncomeFilters((prev) => ({ ...prev, currency: e.target.value }))}
              >
                <option value="all">{ui.allCurrencies}</option>
                {incomeFilterOptions.currencies.map((ccy) => (
                  <option key={ccy} value={ccy}>
                    {ccy}
                  </option>
                ))}
              </TypeableSelect>
              <PopupYmdDatePicker
                value={incomeFilters.from}
                onChange={(nextIso) => setIncomeFilters((prev) => ({ ...prev, from: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                name="income_from_date"
              />
              <PopupYmdDatePicker
                value={incomeFilters.to}
                onChange={(nextIso) => setIncomeFilters((prev) => ({ ...prev, to: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                name="income_to_date"
              />
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                onClick={() =>
                  setIncomeFilters({
                    source: "all",
                    method: "all",
                    currency: "all",
                    from: "",
                    to: "",
                  })
                }
              >
                {ui.resetFilters}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.incomeTotalFiltered}</div>
                <div className="font-semibold text-emerald-700">
                  {formatCurrency(incomeSummaryFiltered.totalDisplay, toSupportedCurrency(currency), lang)}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.incomeByCurrencyFiltered}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(incomeSummaryFiltered.byCurrency).map(([ccy, amount]) => (
                    <span key={ccy} className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-emerald-900">
                      {amount.toLocaleString()} {ccy}
                    </span>
                  ))}
                  {!Object.keys(incomeSummaryFiltered.byCurrency).length ? <span className="text-zinc-500">—</span> : null}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-emerald-900">{ui.incomeDetailsTitle}</div>
              <div className="max-h-[26rem] overflow-auto rounded-md border border-emerald-100">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="sticky top-0 bg-emerald-50 text-right text-emerald-900">
                    <tr>
                      <th className="p-2">{ui.accountRef}</th>
                      <th className="p-2">{ui.source}</th>
                      <th className="p-2">{ui.partyOrPerson}</th>
                      <th className="p-2">{ui.bookingRef}</th>
                      <th className="p-2">{ui.collectionMethod}</th>
                      <th className="p-2">{ui.collectionDate}</th>
                      <th className="p-2">{ui.amount}</th>
                      <th className="p-2">{ui.note}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomeRowsFiltered.map((row, i) => (
                      <tr key={`in-${i}`} className="border-t border-emerald-100">
                        <td className="p-2 font-mono text-zinc-700">{row.accountRef || "—"}</td>
                        <td className="p-2">{row.source}</td>
                        <td className="p-2">{row.person || row.entity || "—"}</td>
                        <td className="p-2">{row.bookingRef || "—"}</td>
                        <td className="p-2">{row.method}</td>
                        <td className="p-2">{row.paymentDate ? formatYmdSlash(row.paymentDate) : "—"}</td>
                        <td className="p-2 font-mono">
                          {row.amount.toLocaleString()} {row.currency}
                        </td>
                        <td className="p-2 text-zinc-500">{row.note || "—"}</td>
                      </tr>
                    ))}
                    {!incomeRowsFiltered.length ? (
                      <tr>
                        <td colSpan={8} className="p-3 text-center text-zinc-400">
                          {ui.noIncomeData}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="grid gap-6">
          <div className="w-full rounded-2xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/20 to-cyan-50/20 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{ui.outgoingSection}</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadTablePdf(
                      ui.outgoingPaymentsAccounting,
                      [ui.account, ui.source, ui.party, ui.reference, ui.method, ui.date, ui.amount, ui.note],
                      outflowRowsFiltered.map((row) => [
                        row.accountRef || "—",
                        row.source,
                        row.person || row.entity || "—",
                        row.bookingRef || "—",
                        row.method,
                        row.paymentDate ? formatYmdSlash(row.paymentDate) : "—",
                        `${Number(row.amount || 0).toLocaleString()} ${row.currency}`,
                        row.note || "—",
                      ]),
                    )
                  }
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                >
                  {ui.tablePdf}
                </button>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-medium text-teal-800">
                  {ui.outflowCenter}
                </span>
              </div>
            </div>
            {opsLoadError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{opsLoadError}</div> : null}
            {hotelDueReminderStatus ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{hotelDueReminderStatus}</div> : null}
            <div className="grid gap-2 rounded-xl border border-red-100 bg-white/80 p-3 md:grid-cols-5">
              <input
                value={outflowSearch}
                onChange={(e) => setOutflowSearch(e.target.value)}
                placeholder={ui.outflowSearchPlaceholder}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs md:col-span-2"
              />
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={outflowFilters.source}
                onChange={(e) => setOutflowFilters((prev) => ({ ...prev, source: e.target.value }))}
              >
                <option value="all">{ui.allSources}</option>
                {outflowFilterOptions.sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </TypeableSelect>
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={outflowFilters.method}
                onChange={(e) => setOutflowFilters((prev) => ({ ...prev, method: e.target.value }))}
              >
                <option value="all">{ui.allPaymentMethods}</option>
                {outflowFilterOptions.methods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </TypeableSelect>
              <TypeableSelect
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                value={outflowFilters.currency}
                onChange={(e) => setOutflowFilters((prev) => ({ ...prev, currency: e.target.value }))}
              >
                <option value="all">{ui.allCurrencies}</option>
                {outflowFilterOptions.currencies.map((ccy) => (
                  <option key={ccy} value={ccy}>
                    {ccy}
                  </option>
                ))}
              </TypeableSelect>
              <PopupYmdDatePicker
                value={outflowFilters.from}
                onChange={(nextIso) => setOutflowFilters((prev) => ({ ...prev, from: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                name="outflow_from_date"
              />
              <PopupYmdDatePicker
                value={outflowFilters.to}
                onChange={(nextIso) => setOutflowFilters((prev) => ({ ...prev, to: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                name="outflow_to_date"
              />
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                onClick={() =>
                  setOutflowFilters({
                    source: "all",
                    method: "all",
                    currency: "all",
                    from: "",
                    to: "",
                  })
                }
              >
                {ui.resetFilters}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.outflowTotalFiltered}</div>
                <div className="font-semibold text-red-700">
                  {formatCurrency(outflowSummaryFiltered.totalDisplay, toSupportedCurrency(currency), lang)}
                </div>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs shadow-sm">
                <div className="text-zinc-500">{ui.outflowByCurrencyFiltered}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(outflowSummaryFiltered.byCurrency).map(([ccy, amount]) => (
                    <span key={ccy} className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-red-900">
                      {amount.toLocaleString()} {ccy}
                    </span>
                  ))}
                  {!Object.keys(outflowSummaryFiltered.byCurrency).length ? <span className="text-zinc-500">—</span> : null}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-red-100 bg-white p-3 shadow-sm">
              <div className="mb-2 text-sm font-semibold text-red-900">{ui.outflowDetailsTitle}</div>
              <div className="max-h-[26rem] overflow-auto rounded-md border border-red-100">
                <table className="w-full min-w-[1100px] text-xs">
                  <thead className="sticky top-0 bg-red-50 text-right text-red-900">
                    <tr>
                      <th className="p-2">{ui.accountRef}</th>
                      <th className="p-2">{ui.source}</th>
                      <th className="p-2">{ui.partyOrPerson}</th>
                      <th className="p-2">{ui.bookingRef}</th>
                      <th className="p-2">{ui.receiveMethod}</th>
                      <th className="p-2">{ui.paymentDate}</th>
                      <th className="p-2">{ui.amount}</th>
                      <th className="p-2">{ui.note}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outflowRowsFiltered.map((row, i) => (
                      <tr key={`out-${i}`} className="border-t border-red-100">
                        <td className="p-2 font-mono text-zinc-700">{row.accountRef || "—"}</td>
                        <td className="p-2">{row.source}</td>
                        <td className="p-2">{row.person || row.entity || "—"}</td>
                        <td className="p-2">{row.bookingRef || "—"}</td>
                        <td className="p-2">{row.method}</td>
                        <td className="p-2">{row.paymentDate ? formatYmdSlash(row.paymentDate) : "—"}</td>
                        <td className="p-2 font-mono">
                          {row.amount.toLocaleString()} {row.currency}
                        </td>
                        <td className="p-2 text-zinc-500">{row.note || "—"}</td>
                      </tr>
                    ))}
                    {!outflowRowsFiltered.length ? (
                      <tr>
                        <td colSpan={8} className="p-3 text-center text-zinc-400">
                          {ui.noOutflowData}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <form
            onSubmit={addPayment}
            className="w-full rounded-2xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/25 to-cyan-50/30 p-6 shadow-sm space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{ui.paymentTitle}</h2>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-medium text-teal-800">
                {ui.paymentComposer}
              </span>
            </div>
            <div className="grid gap-3 rounded-xl border border-teal-100 bg-white p-4 md:grid-cols-4">
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.paymentType} hint={ui.paymentTypeHint} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                  value={paymentForm.direction}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, direction: e.target.value as any }))}
                  disabled
                >
                  {paymentDirectionSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={ui.hotel} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={paymentForm.hotel}
                  onChange={(e) =>
                    setPaymentForm((prev) => {
                      const hotelId = e.target.value;
                      return {
                        ...prev,
                        hotel: hotelId,
                      };
                    })
                  }
                  required
                >
                  <option value="">{ui.chooseHotel}</option>
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={paymentPlaceRequiredLabel} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={paymentForm.payment_place}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_place: e.target.value }))}
                  required
                >
                  <option value="">{ui.choose} {paymentPlaceRequiredLabel}</option>
                  {paymentPlaceOptions.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.paymentDate} />
                <PopupYmdDatePicker
                  value={paymentForm.payment_date}
                  onChange={(nextIso) => setPaymentForm((prev) => ({ ...prev, payment_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  name="payment_date"
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.invoiceCurrency} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={paymentForm.currency}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, currency: e.target.value }))}
                >
                  {accountingCurrencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.fxRateLabel} />
                <input
                  type="number"
                  min={0}
                  step="0.000001"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  value={paymentForm.fx_rate}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, fx_rate: Number(e.target.value || 1) }))}
                  disabled
                />
                {paymentFxStatus && <div className="text-xs text-amber-700">{paymentFxStatus}</div>}
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.commonAmount} />
                <input
                  type="number"
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  placeholder={t.commonAmount}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="md:col-span-1 flex items-end">
                <button
                  type="button"
                  onClick={async () => {
                    await syncTcmbForDate(paymentForm.payment_date || new Date().toISOString().slice(0, 10));
                    setPaymentFxStatus(ui.syncTcmbDone);
                  }}
                  className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800"
                >
                  {ui.syncTcmb}
                </button>
              </div>
            </div>
            {paymentForm.currency !== "TRY" && (
              <div className="flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2 text-sm">
                  <span className="text-zinc-500">{ui.tryEquivalent}</span>
                <span className="font-semibold">{formatCurrency(Number(paymentForm.amount || 0) * Number(paymentForm.fx_rate || 1), "TRY", lang)}</span>
              </div>
            )}

            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{ui.paymentAllocation}</div>
                <button type="button" onClick={() => setAllocationDrafts((prev) => [...prev, { invoice: "", amount: "" }])} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs">
                  {t.commonAdd}
                </button>
              </div>
              {allocationDrafts.map((a, idx) => (
                <div key={idx} className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
                  <div className="space-y-1">
                    <FieldLabel icon={<TicketIcon className="h-4 w-4" />} text={ui.invoiceLabel} hint={ui.invoiceOutstandingHint} />
                    <TypeableSelect className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm" value={a.invoice} onChange={(e) => setAllocationDrafts((prev) => prev.map((x, i) => (i === idx ? { ...x, invoice: e.target.value } : x)))}>
                    <option value="">{ui.chooseInvoice}</option>
                    {outstandingInvoicesForPayment.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number} ({ui.outstandingShort} {Number(inv.outstanding_amount ?? inv.total_amount)})
                      </option>
                    ))}
                  </TypeableSelect>
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.amount} />
                    <input type="number" className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm" placeholder={ui.amount} value={a.amount} onChange={(e) => setAllocationDrafts((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))} />
                  </div>
                  <button
                    type="button"
                    disabled={allocationDrafts.length === 1}
                    onClick={async () => {
                      const accepted = await requestDeleteConfirm(ui.confirmDelete);
                      if (!accepted) return;
                      setAllocationDrafts((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs text-red-600 disabled:opacity-50"
                    aria-label={t.commonDelete}
                    title={t.commonDelete}
                  >
                    <TrashGlyph />
                  </button>
                </div>
              ))}
            </div>

            <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800">{t.commonSave}</button>
          </form>

          <div className="w-full rounded-2xl border border-teal-100 bg-gradient-to-br from-white via-teal-50/20 to-cyan-50/20 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">{ui.paymentsListTitle}</h2>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-medium text-teal-800">
                {ui.paymentLedgerView}
              </span>
            </div>
            <div className="space-y-3 text-sm">
              {paymentRowsTech.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-xl border bg-white p-3 shadow-sm ${
                    p._settlementState === "paid"
                      ? "border-emerald-200"
                      : p._settlementState === "partial"
                        ? "border-orange-200"
                        : "border-red-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-semibold text-zinc-900">#{p.id}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p._settlementState === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : p._settlementState === "partial"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p._settlementState === "paid" ? ui.paidFull : p._settlementState === "partial" ? ui.paidPartial : ui.unpaid}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-800">
                        {formatCurrency(p.amount, toSupportedCurrency(p.currency || currency), lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void deletePayment(p)}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatYmdSlash(p.payment_date)} • {ui.allocationsCount}: {(p.allocations || []).length} • {String(p.currency || "").toUpperCase()}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {ui.allocated}: {formatCurrency(p._allocatedAmount, toSupportedCurrency(p.currency || currency), lang)} • {ui.unallocated}:{" "}
                    <span
                      className={
                        p._settlementState === "paid"
                          ? "text-emerald-700"
                          : p._settlementState === "partial"
                            ? "text-orange-700"
                            : "text-red-700"
                      }
                    >
                      {formatCurrency(p._unallocatedAmount, toSupportedCurrency(p.currency || currency), lang)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-zinc-100">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        p._settlementState === "paid"
                          ? "bg-emerald-500"
                          : p._settlementState === "partial"
                            ? "bg-orange-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${Math.max(3, Math.round(p._paidRatio * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
              {!payments.length && <p className="text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "reservations" && (
        <div className="grid gap-6">
          <div className="w-full rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{ui.reservationsSupplierApTitle}</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  <strong className="font-medium text-zinc-700">{ui.saveHotelInvoiceRefStrong}</strong> {ui.reservationsApHintTail}{" "}
                  <strong className="font-medium text-zinc-700">{ui.createApVoucherStrong}</strong> {ui.reservationsApHintTail2}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadTablePdf(
                    ui.hotelReservationsApAccounting,
                    [ui.voucher, ui.hotel, ui.checkIn, ui.checkOut, ui.hotelRef, ui.linkedApInvoice],
                    reservationRowsSearchFiltered.map((r) => [
                      r.voucher_nr,
                      r.hotel_name,
                      r.check_in ? formatYmdSlash(r.check_in) : "—",
                      r.check_out ? formatYmdSlash(r.check_out) : "—",
                      r.hotel_invoice_ref || "—",
                      r.linked_invoice?.number || "—",
                    ]),
                  )
                }
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-zinc-50"
              >
                {ui.tablePdf}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">{ui.show}:</span>
              {(
                [
                  { v: "all" as const, label: ui.all },
                  { v: "yes" as const, label: ui.invoicedOnly },
                  { v: "no" as const, label: ui.uninvoiced },
                ]
              ).map((x) => (
                <button
                  key={x.v}
                  type="button"
                  onClick={() => setReservationInvoicedFilter(x.v)}
                  className={`rounded-full px-3 py-1 text-xs border ${
                    reservationInvoicedFilter === x.v ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-700"
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">{ui.hotelFilter}:</span>
              <TypeableSelect
                className="min-w-[220px] max-w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={reservationHotelIdFilter}
                onChange={(e) => setReservationHotelIdFilter(e.target.value)}
                aria-label={ui.filterByHotel}
              >
                <option value="">{ui.allHotels}</option>
                {hotels
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, lang))
                  .map((h) => (
                    <option key={h.id} value={String(h.id)}>
                      {h.name}
                    </option>
                  ))}
              </TypeableSelect>
            </div>
            <div className="flex flex-wrap gap-4 text-[11px] text-zinc-600 border border-zinc-100 rounded-md p-2">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
                {ui.apVoucherCreated}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-orange-500" />
                {ui.hotelInvoiceRefSavedOnly}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-rose-500" />
                {ui.noRecord}
              </span>
            </div>
            {reservationLoadError && <div className="text-sm text-red-600">{reservationLoadError}</div>}
            <div className="space-y-2">
              {reservationRowsSearchFiltered.map((r) => {
                const li = r.linked_invoice;
                const hasInv = !!li;
                const hotelRef = (r.hotel_invoice_ref ?? "").trim();
                const hasHotelRefOnly = !hasInv && hotelRef.length > 0;
                const borderClass = hasInv
                  ? "border-r-4 border-emerald-600 bg-emerald-50/70"
                  : hasHotelRefOnly
                    ? "border-r-4 border-orange-500 bg-orange-50/70"
                    : "border-r-4 border-rose-600 bg-rose-50/70";
                const penClass = hasInv ? "text-emerald-600" : hasHotelRefOnly ? "text-orange-600" : "text-rose-600";
                const open = expandedReservationId === r.id;
                return (
                  <div key={r.id} className={`rounded-lg border border-zinc-100 ${borderClass}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedReservationId(open ? null : r.id)}
                      className="w-full text-right p-3 flex flex-wrap items-start justify-between gap-2"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <svg className={`h-4 w-4 shrink-0 ${penClass}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                          </svg>
                          <span className="font-mono text-sm font-semibold">{r.voucher_nr}</span>
                          <span className="text-zinc-500">· {r.hotel_name}</span>
                        </div>
                        <div className="text-xs text-zinc-600">
                          {formatYmdSlash(r.check_in)} → {formatYmdSlash(r.check_out)}
                          {r.confirmation_number ? ` · ${ui.confirmation}: ${r.confirmation_number}` : ""}
                        </div>
                        {li ? (
                          <div className="text-xs">
                            {ui.apVoucherLabel}: <span className="font-mono font-medium">{li.number}</span> — {li.status} — {ui.issuedOn}{" "}
                            {formatYmdSlash(li.issue_date)}
                            {typeof li.outstanding_amount === "number" && li.outstanding_amount > 0.01 ? (
                              <span className="text-orange-700"> — {ui.outstanding} {formatCurrency(li.outstanding_amount, currency, lang)}</span>
                            ) : null}
                            {hotelRef ? <span className="text-zinc-600"> — {ui.hotelInvoiceNumber}: {hotelRef}</span> : null}
                          </div>
                        ) : hasHotelRefOnly ? (
                          <div className="text-xs text-orange-900">
                            {ui.savedCreateApWhenReady} <span className="font-mono font-medium">{hotelRef}</span> {ui.savedCreateApWhenReadyTail}
                          </div>
                        ) : (
                          <div className="text-xs text-rose-800">{ui.registerHotelInvoiceFirst}</div>
                        )}
                      </div>
                      <div className="text-sm font-medium whitespace-nowrap">
                        {r.selling_price.toLocaleString()} {r.selling_currency}
                      </div>
                    </button>
                    {open && (
                      <div
                        className="px-3 pb-3 border-t border-zinc-200/60 bg-white/50 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void saveHotelInvoiceRefForReservation(r.id);
                          }}
                        >
                          <p className="text-xs text-zinc-600 mt-2 mb-2 font-medium">{ui.hotelInvoiceNumber}</p>
                          <p className="text-xs text-zinc-500 mb-2">{ui.hotelInvoiceNumberHelp}</p>
                          <div className="flex flex-wrap gap-2 items-end">
                            <div className="flex-1 min-w-[200px]">
                              <input
                                name="hotel_invoice_ref"
                                autoComplete="off"
                                className="mt-0.5 w-full rounded-md border border-orange-200 bg-orange-50/30 px-2 py-1.5 text-sm font-mono"
                                value={
                                  hotelInvoiceRefDraft[r.id] !== undefined
                                    ? hotelInvoiceRefDraft[r.id]!
                                    : (r.hotel_invoice_ref || "")
                                }
                                onChange={(e) => setHotelInvoiceRefDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                                placeholder={ui.hotelInvoiceNumber}
                                disabled={reservationPending?.id === r.id}
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={reservationPending?.id === r.id}
                              className="rounded-md bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-60"
                            >
                              {reservationPending?.id === r.id && reservationPending.action === "hotel_ref" ? ui.saving : t.commonSave}
                            </button>
                            {hotelRef || hotelInvoiceRefDraft[r.id] ? (
                              <button
                                type="button"
                                disabled={reservationPending?.id === r.id}
                                onClick={() => void clearHotelInvoiceRefForReservation(r.id)}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs text-zinc-600 disabled:opacity-60"
                              >
                                {ui.clearRecord}
                              </button>
                            ) : null}
                          </div>
                        </form>
                        <div>
                          <p className="text-xs text-zinc-500 mt-2 mb-2">{ui.afterSaveApHelp}</p>
                          <button
                            type="button"
                            disabled={!hotelRef || reservationPending?.id === r.id}
                            title={!hotelRef ? ui.saveHotelInvoiceFirstTitle : undefined}
                            onClick={() => void createHotelInvoiceForReservation(r.id)}
                            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reservationPending?.id === r.id && reservationPending.action === "create"
                              ? ui.creating
                              : ui.createApVoucher}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!reservationRowsSearchFiltered.length && !reservationLoadError && (
                <p className="text-sm text-zinc-400">
                  {reservationRows.length && reservationHotelIdFilter
                    ? ui.noReservationsForHotelFilter
                    : ui.noReservationsInCurrentFilter}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "statements" && (
        <div className="grid gap-6">
          <details className="w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/35 to-cyan-50/30 p-4 open:shadow-sm" open>
            <summary className="cursor-pointer text-sm font-semibold text-sky-950">{ui.statementGuideTitle}</summary>
            <ol className="mt-3 list-decimal pr-5 space-y-2 text-sm leading-relaxed text-zinc-800">
              <li>{ui.statementGuideItem1}</li>
              <li>{ui.statementGuideItem2}</li>
              <li>{ui.statementGuideItem3}</li>
              <li>{ui.statementGuideItem4}</li>
              <li>{ui.statementGuideItem5}</li>
            </ol>
            <p className="mt-2 text-xs text-sky-900/80">
              {ui.statementGuideNote}
            </p>
          </details>

          <div className="w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/25 to-cyan-50/25 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{ui.statementPartyTitle}</h2>
              <p className="text-xs text-zinc-500 mt-1">
                {ui.statementPartySubtitle}
              </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadTablePdf(
                      ui.statementInvoicesAccounting,
                      ["Invoice #", ui.type, ui.status, ui.invoiceCurrency, ui.issueDate, ui.dueDate, t.commonTotal, ui.allocated, ui.outstanding],
                      statementRowsSearchFiltered.map((r) => {
                        const det = statementData?.rows?.find((x) => x.invoice_id === r.invoice_id);
                        const allocated = det != null && typeof det.allocated_amount === "number" ? det.allocated_amount : null;
                        return [
                          r.number,
                          det?.doc_type || "—",
                          det?.status || "—",
                          det?.currency || "—",
                          r.issue_date ? formatYmdSlash(r.issue_date) : "—",
                          r.due_date ? formatYmdSlash(r.due_date) : "—",
                          det ? formatCurrency(det.total_amount, currency, lang) : "—",
                          allocated != null ? formatCurrency(allocated, currency, lang) : "—",
                          formatCurrency(r.outstanding_amount, currency, lang),
                        ];
                      }),
                    )
                  }
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs shadow-sm hover:bg-zinc-50"
                >
                  {ui.tablePdf}
                </button>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-800">
                  {ui.statementStudio}
                </span>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-white/90 p-3 md:grid-cols-2 lg:grid-cols-4">
              <TypeableSelect
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                value={statementTarget.kind}
                onChange={(e) => {
                  setStatementTarget({ kind: e.target.value as "client" | "hotel", id: "" });
                  setStatementData(null);
                  setStatementLoadError("");
                }}
              >
                <option value="client">{ui.statementTargetClient}</option>
                <option value="hotel">{ui.statementTargetHotel}</option>
              </TypeableSelect>
              <TypeableSelect
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                value={statementTarget.id}
                onChange={(e) => {
                  setStatementTarget((prev) => ({ ...prev, id: e.target.value }));
                  setStatementLoadError("");
                }}
              >
                <option value="">{ui.chooseTargetParty}</option>
                {statementTarget.kind === "client"
                  ? clients
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, lang))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                  : hotels
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, lang))
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
              </TypeableSelect>
              <label className="grid gap-0.5 text-xs text-zinc-500">
                {ui.expensesPdfFrom}
                <PopupYmdDatePicker
                  value={statementDateFrom}
                  onChange={(nextIso) => setStatementDateFrom(nextIso)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                  name="statement_date_from"
                />
              </label>
              <label className="grid gap-0.5 text-xs text-zinc-500">
                {ui.expensesPdfTo}
                <PopupYmdDatePicker
                  value={statementDateTo}
                  onChange={(nextIso) => setStatementDateTo(nextIso)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                  name="statement_date_to"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-100 bg-white/90 p-3">
              <span className="text-xs text-zinc-500">{ui.quickRange}:</span>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                onClick={() => {
                  const t = new Date();
                  const from = new Date(t.getFullYear(), t.getMonth(), 1);
                  setStatementDateFrom(from.toISOString().slice(0, 10));
                  setStatementDateTo(t.toISOString().slice(0, 10));
                }}
              >
                {ui.thisMonth}
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                onClick={() => {
                  const t = new Date();
                  const q = Math.floor(t.getMonth() / 3) * 3;
                  const from = new Date(t.getFullYear(), q, 1);
                  setStatementDateFrom(from.toISOString().slice(0, 10));
                  setStatementDateTo(t.toISOString().slice(0, 10));
                }}
              >
                {ui.thisQuarter}
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                onClick={() => {
                  const t = new Date();
                  const from = new Date(t.getFullYear(), 0, 1);
                  setStatementDateFrom(from.toISOString().slice(0, 10));
                  setStatementDateTo(t.toISOString().slice(0, 10));
                }}
              >
                {ui.yearToDate}
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
                onClick={() => {
                  setStatementDateFrom("");
                  setStatementDateTo("");
                }}
              >
                {ui.allDates}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadStatement()} className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-800">
                {ui.refreshFullStatement}
              </button>
              <button type="button" onClick={() => void loadAging()} className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm hover:bg-zinc-50">
                {ui.refreshAgingOnly}
              </button>
            </div>
            {statementLoadError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{statementLoadError}</div>}

            {statementData && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-2 text-sm shadow-sm">
                  <div className="font-semibold text-emerald-900">
                    {statementData.party.name}{" "}
                    <span className="font-mono text-xs text-emerald-700">({statementData.party.code})</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 text-xs text-zinc-600">
                    <span>{ui.asOf}: {statementData.as_of}</span>
                    {statementData.date_from && <span>{ui.movementRangeFrom} {statementData.date_from}</span>}
                    {statementData.date_to && <span>{ui.expensesPdfTo} {statementData.date_to}</span>}
                    {statementData.opening_balance != null && (
                      <span>{ui.openingBalance}: {formatCurrency(statementData.opening_balance, currency, lang)}</span>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-xs text-zinc-600">
                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2 shadow-sm">
                    <div className="text-zinc-500">{ui.outstandingInvoicesInTable}</div>
                    <div className="font-mono font-semibold text-amber-950">
                      {formatCurrency(statementData.outstanding_total ?? 0, currency, lang)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-2 shadow-sm">
                    <div className="text-zinc-500">{ui.totalExposure}</div>
                    <div className="font-mono font-semibold text-zinc-900">
                      {formatCurrency(statementData.outstanding_all_invoices ?? 0, currency, lang)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {statementData?.summary && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {statementTarget.kind === "client" ? (
                  <>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.totalSalesAr}</div>
                      <div className="text-lg font-semibold">{formatCurrency(statementData.summary.gross_sales_ar ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.creditDebitNotes}</div>
                      <div className="text-sm">
                        − {formatCurrency(statementData.summary.credit_notes_total ?? 0, currency, lang)} / +{" "}
                        {formatCurrency(statementData.summary.debit_notes_total ?? 0, currency, lang)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.netBilling}</div>
                      <div className="text-lg font-semibold">{formatCurrency(statementData.summary.net_billed ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.totalReceipts}</div>
                      <div className="text-lg font-semibold text-emerald-800">{formatCurrency(statementData.summary.total_receipts ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <div className="text-xs text-amber-900">{ui.outstandingReceivablesAll}</div>
                      <div className="text-lg font-bold text-amber-950">{formatCurrency(statementData.summary.outstanding_receivable ?? 0, currency, lang)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.totalPurchasesAp}</div>
                      <div className="text-lg font-semibold">{formatCurrency(statementData.summary.gross_purchases_ap ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.creditDebitNotes}</div>
                      <div className="text-sm">
                        − {formatCurrency(statementData.summary.credit_notes_total ?? 0, currency, lang)} / +{" "}
                        {formatCurrency(statementData.summary.debit_notes_total ?? 0, currency, lang)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.netPayable}</div>
                      <div className="text-lg font-semibold">{formatCurrency(statementData.summary.net_billed ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-zinc-100 bg-white p-3">
                      <div className="text-xs text-zinc-500">{ui.totalPaidToSupplierHotel}</div>
                      <div className="text-lg font-semibold text-emerald-800">{formatCurrency(statementData.summary.total_payments_made ?? 0, currency, lang)}</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                      <div className="text-xs text-amber-900">{ui.outstandingPayables}</div>
                      <div className="text-lg font-bold text-amber-950">{formatCurrency(statementData.summary.outstanding_payable ?? 0, currency, lang)}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {statementData?.by_currency && Object.keys(statementData.by_currency).length > 0 && (
              <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="text-sm font-semibold mb-2">{ui.byCurrencyInRange}</div>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 text-xs">
                  {Object.entries(statementData.by_currency).map(([ccy, v]) => (
                    <div key={ccy} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2">
                      <div className="font-mono font-semibold">{ccy}</div>
                      <div>
                        {ui.invoiced}: {v.invoiced.toLocaleString()} {ccy}
                      </div>
                      <div>
                        {ui.settled}: {v.allocated.toLocaleString()} {ccy}
                      </div>
                      <div className="text-amber-900">
                        {ui.outstanding}: {v.outstanding.toLocaleString()} {ccy}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full">
              <h3 className="text-sm font-semibold mb-1">{ui.movementLedgerTitle}</h3>
              <p className="text-xs text-zinc-500 mb-2">{ui.movementLedgerHint}</p>
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50/95 text-left text-zinc-600 backdrop-blur">
                    <tr>
                      <th className="p-2">{t.commonDate}</th>
                      <th className="p-2">{ui.reference}</th>
                      <th className="p-2">{ui.type}</th>
                      <th className="p-2">{ui.status}</th>
                      <th className="p-2 min-w-[160px]">{ui.descriptionLabel}</th>
                      <th className="p-2">{ui.increase}</th>
                      <th className="p-2">{ui.decrease}</th>
                      <th className="p-2">{ui.movement}</th>
                      <th className="p-2">{ui.balanceLabel}</th>
                      <th className="p-2">{ui.currencyShort}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statementData?.ledger || []).map((row, i) => (
                      <tr key={`${row.ref}-${i}`} className="border-t border-zinc-100">
                        <td className="p-2 whitespace-nowrap">{row.date}</td>
                        <td className="p-2 font-mono">{row.ref}</td>
                        <td className="p-2 font-mono text-[10px]">{row.doc_type || row.row_kind || "—"}</td>
                        <td className="p-2 text-[10px]">{row.status || "—"}</td>
                        <td className="p-2 max-w-[220px]">{row.description}</td>
                        <td className="p-2">{row.increase > 0 ? formatCurrency(row.increase, currency, lang) : "—"}</td>
                        <td className="p-2">{row.decrease > 0 ? formatCurrency(row.decrease, currency, lang) : "—"}</td>
                        <td className="p-2 text-[10px]">
                          {row.signed_movement != null && Math.abs(row.signed_movement) > 0.0001
                            ? formatCurrency(row.signed_movement, currency, lang)
                            : "—"}
                        </td>
                        <td className="p-2 font-medium">{formatCurrency(row.balance, currency, lang)}</td>
                        <td className="p-2">{row.currency}</td>
                      </tr>
                    ))}
                    {!statementData?.ledger?.length && (
                      <tr>
                        <td colSpan={10} className="p-4 text-center text-zinc-400">
                          {ui.choosePartyAndRefresh}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {statementData?.labels?.balance && <p className="text-xs text-zinc-500 mt-1">{statementData.labels.balance}</p>}
            </div>
          </div>

          <div className="w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/15 to-cyan-50/15 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">{ui.settlementsTitle}</h2>
            <p className="text-xs text-zinc-500">{ui.settlementsHint}</p>
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50/95 text-left text-zinc-600 backdrop-blur">
                  <tr>
                    <th className="p-2">{ui.paymentTitle}</th>
                    <th className="p-2">{ui.paymentRef}</th>
                    <th className="p-2">{t.commonDate}</th>
                    <th className="p-2">{ui.paymentCurrency}</th>
                    <th className="p-2">{ui.invoiceLabel}</th>
                    <th className="p-2">{ui.allocatedToInvoice}</th>
                    <th className="p-2">{ui.paymentAmountLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {(statementData?.settlements || []).map((s) => (
                    <tr key={s.id} className="border-t border-zinc-100">
                      <td className="p-2 font-mono">#{s.payment_id}</td>
                      <td className="p-2 font-mono text-[10px]">{s.payment_ref || "—"}</td>
                      <td className="p-2">{formatYmdSlash(s.payment_date)}</td>
                      <td className="p-2">{s.payment_currency || "—"}</td>
                      <td className="p-2 font-mono">{s.invoice_number}</td>
                      <td className="p-2 font-medium">{formatCurrency(s.allocated_amount, currency, lang)}</td>
                      <td className="p-2 text-zinc-500">
                        {formatCurrency(s.payment_amount, currency, lang)}{" "}
                        <span className="text-[10px]">{s.payment_currency || ""}</span>
                      </td>
                    </tr>
                  ))}
                  {!statementData?.settlements?.length && (
                    <tr>
                      <td colSpan={7} className="p-3 text-center text-zinc-400">
                        {statementData ? ui.noSettlementsInRange : t.commonNoData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/15 to-cyan-50/15 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">{ui.invoicesWithLinesTitle}</h2>
            <p className="text-xs text-zinc-500">
              {ui.invoicesWithLinesHint}
            </p>
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-zinc-50/95 text-left text-zinc-500 backdrop-blur">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">{ui.doc}</th>
                    <th className="p-2">{ui.type}</th>
                    <th className="p-2">{ui.status}</th>
                    <th className="p-2">{ui.currencyShort}</th>
                    <th className="p-2">{ui.issueDate}</th>
                    <th className="p-2">{ui.dueDate}</th>
                    <th className="p-2">{t.commonTotal}</th>
                    <th className="p-2">{ui.settled}</th>
                    <th className="p-2">{ui.outstanding}</th>
                    <th className="p-2 min-w-[100px]">{ui.notesDocument}</th>
                    <th className="p-2">{ui.pdfAndLines}</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRowsSearchFiltered.map((r) => {
                    const det = statementData?.rows?.find((x) => x.invoice_id === r.invoice_id);
                    const allocated =
                      det != null && typeof det.allocated_amount === "number" ? det.allocated_amount : null;
                    return (
                      <tr key={r.invoice_id} className="border-t border-zinc-100 align-top">
                        <td className="p-2 text-zinc-500">{r.invoice_id}</td>
                        <td className="p-2 font-mono">{r.number}</td>
                        <td className="p-2 text-xs">{det?.doc_type || "—"}</td>
                        <td className="p-2 text-xs">{det?.status || "—"}</td>
                        <td className="p-2 text-xs">{det?.currency || "—"}</td>
                        <td className="p-2">{formatYmdSlash(r.issue_date)}</td>
                        <td className="p-2">{r.due_date ? formatYmdSlash(r.due_date) : "—"}</td>
                        <td className="p-2">{det ? formatCurrency(det.total_amount, currency, lang) : "—"}</td>
                        <td className="p-2 text-xs">
                          {allocated != null ? formatCurrency(allocated, currency, lang) : "—"}
                        </td>
                        <td className="p-2">{formatCurrency(r.outstanding_amount, currency, lang)}</td>
                        <td className="p-2 text-[10px] text-zinc-600 max-w-[140px] break-words">
                          {det?.notes ? (
                            <span className="line-clamp-2" title={det.notes}>
                              {det.notes}
                            </span>
                          ) : null}
                          {det?.supplier_document_ref ? (
                            <div className="mt-0.5 font-mono text-zinc-500">{ui.documentLabel}: {det.supplier_document_ref}</div>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => previewInvoicePdf(r.invoice_id, r.number)}
                                className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-zinc-50"
                              >
                                {ui.preview}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadInvoicePdf(r.invoice_id, r.number)}
                                className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] hover:bg-zinc-50"
                              >
                                {ui.download}
                              </button>
                            </div>
                            {det?.line_preview?.length ? (
                              <ul className="text-[10px] text-zinc-500 list-disc pr-3 max-w-[240px]">
                                {det.line_preview.slice(0, 12).map((ln, li) => (
                                  <li key={li}>
                                    {ln.description} — {formatCurrency(ln.line_total, currency, lang)}
                                  </li>
                                ))}
                                {(det.line_count as number) > 12 && (
                                  <li>… +{(det.line_count as number) - 12} {ui.moreLinesSuffix}</li>
                                )}
                              </ul>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!statementRowsSearchFiltered.length && (
                    <tr>
                      <td colSpan={12} className="py-4 text-center text-zinc-400">
                        {t.commonNoData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/15 to-cyan-50/15 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">{ui.agingTitle}</h2>
            {!agingSummary ? (
              <div className="text-sm text-zinc-500">{ui.agingAutoHint}</div>
            ) : (
              <div className="space-y-2 text-sm">
                {(
                  [
                    ["current", ui.agingCurrent],
                    ["1_30", ui.aging1To30],
                    ["31_60", "31–60"],
                    ["61_90", "61–90"],
                    ["91_plus", ui.aging91Plus],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <span>{label}</span>
                    <span className="font-mono">{formatCurrency(agingSummary[k] ?? 0, currency, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="grid gap-6">
          <div className="w-full rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/25 to-indigo-50/25 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{ui.reportsTitle}</h2>
              <p className="text-xs text-zinc-500 mt-1">
                {ui.reportsSubtitle}
              </p>
              </div>
              <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-medium text-fuchsia-800">
                {ui.reportsHub}
              </span>
            </div>
            <div className="grid gap-3 rounded-xl border border-zinc-100 bg-white/90 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-xs text-zinc-500">{ui.expensesPdfFrom}</span>
                <PopupYmdDatePicker
                  value={reportRange.start}
                  onChange={(nextIso) => setReportRange((p) => ({ ...p, start: nextIso }))}
                  className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                  name="report_range_start"
                />
              </div>
              <div>
                <span className="text-xs text-zinc-500">{ui.expensesPdfTo}</span>
                <PopupYmdDatePicker
                  value={reportRange.end}
                  onChange={(nextIso) => setReportRange((p) => ({ ...p, end: nextIso }))}
                  className="mt-0.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm"
                  name="report_range_end"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void loadTrialBalanceReport()} className="rounded-md bg-fuchsia-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-fuchsia-800">
                {ui.trialBalanceBtn}
              </button>
              <button type="button" onClick={() => void loadVatReport()} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-zinc-50">
                {ui.vatSummaryBtn}
              </button>
              <button type="button" onClick={() => void loadGeneralLedgerReport()} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-zinc-50">
                {ui.generalLedgerBtn}
              </button>
              <button type="button" onClick={() => void loadGlobalAgingReport("ar_invoice")} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-sm hover:bg-amber-100">
                {ui.agingClientsArBtn}
              </button>
              <button type="button" onClick={() => void loadGlobalAgingReport("ap_bill")} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-sm hover:bg-amber-100">
                {ui.agingSuppliersApBtn}
              </button>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 shadow-sm space-y-2">
              <div className="text-xs font-medium text-violet-900">{ui.pdfDownloadSameRange}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadReportPdf(
                      `/journal-entries/trial-balance/pdf/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}`,
                      `trial-balance-${reportRange.start}-${reportRange.end}.pdf`,
                    ).catch((e) => alert(e instanceof Error ? e.message : ui.reportDownloadFailed))
                  }
                  className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs text-violet-900 shadow-sm hover:bg-violet-50"
                >
                  {ui.pdfTrialBalance}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadReportPdf(
                      `/invoices/vat-summary/pdf/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}&doc_type=${encodeURIComponent(reportVatDocType)}`,
                      `vat-${reportVatDocType}-${reportRange.start}-${reportRange.end}.pdf`,
                    ).catch((e) => alert(e instanceof Error ? e.message : ui.reportDownloadFailed))
                  }
                  className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs text-violet-900 shadow-sm hover:bg-violet-50"
                >
                  {ui.pdfVatSummary} ({reportVatDocType})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadReportPdf(
                      `/journal-entries/general-ledger/pdf/?start=${encodeURIComponent(reportRange.start)}&end=${encodeURIComponent(reportRange.end)}${reportGlAccountId ? `&account=${encodeURIComponent(reportGlAccountId)}` : ""}`,
                      `gl-${reportRange.start}-${reportRange.end}.pdf`,
                    ).catch((e) => alert(e instanceof Error ? e.message : ui.reportDownloadFailed))
                  }
                  className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs text-violet-900 shadow-sm hover:bg-violet-50"
                >
                  {ui.pdfGeneralLedger}{reportGlAccountId ? ` (${ui.accountSpecific})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadReportPdf(
                      `/invoices/aging/pdf/?doc_type=${encodeURIComponent("ar_invoice")}&as_of=${encodeURIComponent(reportRange.end)}`,
                      `aging-ar-${reportRange.end}.pdf`,
                    ).catch((e) => alert(e instanceof Error ? e.message : ui.reportDownloadFailed))
                  }
                  className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs text-amber-900 shadow-sm hover:bg-violet-50"
                >
                  {ui.pdfAgingAr}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadReportPdf(
                      `/invoices/aging/pdf/?doc_type=${encodeURIComponent("ap_bill")}&as_of=${encodeURIComponent(reportRange.end)}`,
                      `aging-ap-${reportRange.end}.pdf`,
                    ).catch((e) => alert(e instanceof Error ? e.message : ui.reportDownloadFailed))
                  }
                  className="rounded-md border border-violet-200 bg-white px-3 py-1.5 text-xs text-amber-900 shadow-sm hover:bg-violet-50"
                >
                  {ui.pdfAgingAp}
                </button>
              </div>
            </div>
            {trialBalanceData && (
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs text-zinc-600 shadow-sm">
                {ui.trialBalanceSummaryPrefix}: {trialBalanceData.start} → {trialBalanceData.end} — {ui.totalDebit}{" "}
                {formatCurrency(trialBalanceData.totals.debit, currency, lang)} / {ui.totalCredit} {formatCurrency(trialBalanceData.totals.credit, currency, lang)} — {ui.difference}{" "}
                {formatCurrency(trialBalanceData.totals.debit - trialBalanceData.totals.credit, currency, lang)}
              </div>
            )}
            {vatSummary && (
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs text-zinc-600 shadow-sm">
                {ui.vatSummaryPrefix}: {vatSummary.start} → {vatSummary.end} — {vatSummary.doc_type === "ap_bill" ? ui.apSupplierShort : ui.arClientShort}
              </div>
            )}
            {glData && (
              <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs text-zinc-600 shadow-sm">
                {ui.glSummaryPrefix}: {glData.start} → {glData.end} — {glData.count} {ui.rowsLabel}
                {reportGlAccountId ? ` — ${ui.accountLabel} #${reportGlAccountId}` : ` — ${ui.allAccountsLabel}`}
              </div>
            )}
            {globalAging && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-950 shadow-sm">
                {ui.globalAgingSummary}: {ui.asOf} {globalAging.as_of} — {globalAging.doc_type === "ar_invoice" ? ui.receivableAging : ui.payableAging}
              </div>
            )}
          </div>

          {globalAging && (
            <div className="w-full rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/15 to-indigo-50/15 p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-3">{ui.globalAgingDetailsTitle}</h3>
              <div className="space-y-2 text-sm max-w-md">
                {(
                  [
                    ["current", ui.agingCurrent],
                    ["1_30", ui.aging1To30],
                    ["31_60", "31–60"],
                    ["61_90", "61–90"],
                    ["91_plus", ui.agingAbove90],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between border-b border-zinc-100 pb-2">
                    <span>{label}</span>
                    <span className="font-mono">{formatCurrency(globalAging.summary[k] ?? 0, currency, lang)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="w-full rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/15 to-indigo-50/15 p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">{ui.trialBalanceSectionTitle}</h3>
                <p className="text-xs text-zinc-500">{ui.trialBalanceSectionHint}</p>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
                  <tr className="text-xs text-zinc-600">
                    <th className="p-2 text-right">{ui.codeLabel}</th>
                    <th className="p-2 text-right">{ui.accountLabel}</th>
                    <th className="p-2 text-right">{ui.type}</th>
                    <th className="p-2 text-right">{ui.debitLabel}</th>
                    <th className="p-2 text-right">{ui.creditLabel}</th>
                    <th className="p-2 text-right">{ui.balanceLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {(trialBalanceData?.rows || []).map((r) => (
                    <tr key={r.account_code} className="border-t border-zinc-100">
                      <td className="p-2 text-right font-mono text-xs">{r.account_code}</td>
                      <td className="p-2 text-right">{r.account_name}</td>
                      <td className="p-2 text-right text-xs text-zinc-500">{accountTypeLabels[r.account_type || ""] || r.account_type || "—"}</td>
                      <td className="p-2 text-right">{formatCurrency(r.debit, currency, lang)}</td>
                      <td className="p-2 text-right">{formatCurrency(r.credit, currency, lang)}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(r.balance, currency, lang)}</td>
                    </tr>
                  ))}
                  {trialBalanceData?.rows?.length ? (
                    <tr className="bg-zinc-50 font-semibold">
                      <td colSpan={3} className="p-2 text-right text-xs">
                        {ui.totalLabel}
                      </td>
                      <td className="p-2 text-right">{formatCurrency(trialBalanceData.totals.debit, currency, lang)}</td>
                      <td className="p-2 text-right">{formatCurrency(trialBalanceData.totals.credit, currency, lang)}</td>
                      <td className="p-2 text-right">{formatCurrency(trialBalanceData.totals.debit - trialBalanceData.totals.credit, currency, lang)}</td>
                    </tr>
                  ) : null}
                  {!trialBalanceData?.rows?.length && (
                    <tr>
                      <td className="p-4 text-center text-zinc-400" colSpan={6}>
                        {ui.clickTrialBalanceToLoad}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/15 to-indigo-50/15 p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">{ui.vatFromInvoiceLinesTitle}</h3>
                <p className="text-xs text-zinc-500">{ui.vatByIssueRangeDocTypeHint}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TypeableSelect
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-sm"
                  value={reportVatDocType}
                  onChange={(e) => setReportVatDocType(e.target.value as "ar_invoice" | "ap_bill")}
                >
                  <option value="ar_invoice">{ui.arSalesClients}</option>
                  <option value="ap_bill">{ui.apSupplierHotelInvoices}</option>
                </TypeableSelect>
                <button type="button" onClick={() => void loadVatReport()} className="rounded-md bg-fuchsia-700 px-2 py-1.5 text-xs text-white shadow-sm hover:bg-fuchsia-800">
                  {ui.refresh}
                </button>
              </div>
            </div>
            {vatSummary ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-zinc-100 bg-white p-3 shadow-sm">
                    <div className="text-xs text-zinc-500">{ui.netLines}</div>
                    <div className="text-lg font-semibold">{formatCurrency(vatSummary.totals.net_total, currency, lang)}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-white p-3 shadow-sm">
                    <div className="text-xs text-zinc-500">{ui.tax}</div>
                    <div className="text-lg font-semibold">{formatCurrency(vatSummary.totals.tax_total, currency, lang)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-600 mb-2">{ui.taxDetailsByCode}</div>
                  <div className="max-h-[40vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
                        <tr>
                          <th className="p-2 text-right">{ui.codeLabel}</th>
                          <th className="p-2 text-right">{ui.rate}</th>
                          <th className="p-2 text-right">{ui.inclusiveQ}</th>
                          <th className="p-2 text-right">{ui.net}</th>
                          <th className="p-2 text-right">{ui.tax}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(vatSummary.by_tax_code || {}).map(([code, v]) => (
                          <tr key={code} className="border-t border-zinc-100">
                            <td className="p-2 font-mono">{code}</td>
                            <td className="p-2">{(v.rate * 100).toFixed(2)}%</td>
                            <td className="p-2">{v.is_inclusive ? ui.yes : ui.no}</td>
                            <td className="p-2">{formatCurrency(v.net_total, currency, lang)}</td>
                            <td className="p-2">{formatCurrency(v.tax_total, currency, lang)}</td>
                          </tr>
                        ))}
                        {!Object.keys(vatSummary.by_tax_code || {}).length && (
                          <tr>
                            <td colSpan={5} className="p-3 text-center text-zinc-400">
                              {ui.noTaxDataInRange}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">{ui.vatPrompt}</div>
            )}
          </div>

          <div className="w-full rounded-2xl border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/15 to-indigo-50/15 p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold">{ui.generalLedgerSectionTitle}</h3>
                <p className="text-xs text-zinc-500">{ui.generalLedgerSectionHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <TypeableSelect
                  className="min-w-[200px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-sm"
                  value={reportGlAccountId}
                  onChange={(e) => setReportGlAccountId(e.target.value)}
                >
                  <option value="">{ui.allAccountsLabel}</option>
                  {chartAccounts
                    .filter((a) => a.is_active !== false)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                </TypeableSelect>
                <button type="button" onClick={() => void loadGeneralLedgerReport()} className="rounded-md bg-fuchsia-700 px-3 py-1.5 text-xs text-white shadow-sm hover:bg-fuchsia-800">
                  {ui.load}
                </button>
              </div>
            </div>
            <div className="max-h-[55vh] overflow-auto rounded-xl border border-zinc-100 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
                  <tr>
                    <th className="p-2 text-right">{t.commonDate}</th>
                    <th className="p-2 text-right">{ui.accountLabel}</th>
                    <th className="p-2 text-right">{ui.descriptionLabel}</th>
                    <th className="p-2 text-right">{ui.debitLabel}</th>
                    <th className="p-2 text-right">{ui.creditLabel}</th>
                    <th className="p-2 text-right">{ui.currencyShort}</th>
                    <th className="p-2 text-right">{ui.reference}</th>
                  </tr>
                </thead>
                <tbody>
                  {(glData?.rows || []).map((r, i) => (
                    <tr key={`${r.entry_id}-${i}`} className="border-t border-zinc-100">
                      <td className="p-2 whitespace-nowrap">{r.entry_date}</td>
                      <td className="p-2 text-right max-w-[140px]">
                        <span className="font-mono">{r.account_code}</span>
                        <br />
                        <span className="text-zinc-500">{r.account_name}</span>
                      </td>
                      <td className="p-2 max-w-[200px]">{r.description}</td>
                      <td className="p-2 text-right">{r.debit > 0 ? formatCurrency(r.debit, currency, lang) : "—"}</td>
                      <td className="p-2 text-right">{r.credit > 0 ? formatCurrency(r.credit, currency, lang) : "—"}</td>
                      <td className="p-2">{r.currency}</td>
                      <td className="p-2 text-zinc-500">
                        {r.reference_type} #{r.reference_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {!glData?.rows?.length && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-zinc-400">
                        {ui.clickGeneralLedgerToLoad}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="grid gap-6">
          <div className="w-full rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/20 to-fuchsia-50/20 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{ui.settingsTitle}</h2>
                <p className="text-xs text-zinc-500 mt-1">{ui.settingsSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadSettingsCenter().then(() => setSettingsStatus(ui.settingsUpdated)).catch((e) => setSettingsStatus(e instanceof Error ? e.message : ui.settingsUpdateFailed))}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50"
              >
                {ui.refreshData}
              </button>
            </div>
            {settingsStatus ? (
              <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">{settingsStatus}</div>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold">{ui.chartOfAccounts}</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.codeLabel} value={accountForm.code} onChange={(e) => setAccountForm((p) => ({ ...p, code: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={t.commonName} value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} />
                <TypeableSelect className="rounded-md border border-zinc-200 px-3 py-2 text-xs" value={accountForm.account_type} onChange={(e) => setAccountForm((p) => ({ ...p, account_type: e.target.value as typeof p.account_type }))}>
                  <option value="asset">asset</option>
                  <option value="liability">liability</option>
                  <option value="equity">equity</option>
                  <option value="revenue">revenue</option>
                  <option value="expense">expense</option>
                </TypeableSelect>
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs">
                <input type="checkbox" checked={accountForm.is_active} onChange={(e) => setAccountForm((p) => ({ ...p, is_active: e.target.checked }))} />
                {ui.active}
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveChartAccountFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                  {editingChartAccountId != null ? ui.saveChanges : ui.addAccount}
                </button>
                {editingChartAccountId != null ? (
                  <button type="button" onClick={cancelChartAccountEdit} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50">
                    {t.commonCancel}
                  </button>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="p-2 text-right">{ui.codeLabel}</th>
                      <th className="p-2 text-right">{t.commonName}</th>
                      <th className="p-2 text-right">{ui.type}</th>
                      <th className="p-2 text-right">{ui.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartAccounts
                      .filter((x) => rowMatchesQuery(x, searchAny))
                      .map((a) => (
                        <tr
                          key={a.id}
                          className={`border-t border-zinc-100 ${editingChartAccountId === a.id ? "bg-violet-50/80" : ""}`}
                        >
                          <td className="p-2 font-mono">{a.code}</td>
                          <td className="p-2">{a.name}</td>
                          <td className="p-2">{accountTypeLabels[a.account_type] || a.account_type}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                title={ui.editRow}
                                aria-label={ui.editRow}
                                onClick={() => {
                                  setEditingChartAccountId(a.id);
                                  setAccountForm({
                                    code: a.code,
                                    name: a.name,
                                    account_type: a.account_type as (typeof accountForm)["account_type"],
                                    is_active: a.is_active !== false,
                                  });
                                }}
                                className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                              >
                                <PencilGlyph />
                              </button>
                              <button type="button" onClick={() => void deleteChartAccountFromSettings(a.id, a.code)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700">
                                {t.commonDelete}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold">{ui.taxCodes}</h3>
              <div className="grid gap-2 sm:grid-cols-4">
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.codeLabel} value={taxForm.code} onChange={(e) => setTaxForm((p) => ({ ...p, code: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={t.commonName} value={taxForm.name} onChange={(e) => setTaxForm((p) => ({ ...p, name: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder="Rate %" value={taxForm.ratePercent} onChange={(e) => setTaxForm((p) => ({ ...p, ratePercent: e.target.value }))} />
                <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-2 text-xs">
                  <input type="checkbox" checked={taxForm.is_inclusive} onChange={(e) => setTaxForm((p) => ({ ...p, is_inclusive: e.target.checked }))} />
                  {ui.inclusive}
                </label>
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs">
                <input type="checkbox" checked={taxForm.is_active} onChange={(e) => setTaxForm((p) => ({ ...p, is_active: e.target.checked }))} />
                {ui.active}
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveTaxCodeFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                  {editingTaxCodeId != null ? ui.saveChanges : ui.addTax}
                </button>
                {editingTaxCodeId != null ? (
                  <button type="button" onClick={cancelTaxCodeEdit} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50">
                    {t.commonCancel}
                  </button>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="p-2 text-right">{ui.codeLabel}</th>
                      <th className="p-2 text-right">{t.commonName}</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">{ui.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxCodes
                      .filter((x) => rowMatchesQuery(x, searchAny))
                      .map((tc) => (
                        <tr key={tc.id} className={`border-t border-zinc-100 ${editingTaxCodeId === tc.id ? "bg-violet-50/80" : ""}`}>
                          <td className="p-2 font-mono">{tc.code}</td>
                          <td className="p-2">{tc.name}</td>
                          <td className="p-2">{(Number(tc.rate || 0) * 100).toFixed(2)}%</td>
                          <td className="p-2">
                            <button
                              type="button"
                              title={ui.editRow}
                              aria-label={ui.editRow}
                              onClick={() => {
                                setEditingTaxCodeId(tc.id);
                                setTaxForm({
                                  code: tc.code,
                                  name: tc.name,
                                  ratePercent: (Number(tc.rate || 0) * 100).toFixed(2),
                                  is_inclusive: tc.is_inclusive,
                                  is_active: tc.is_active !== false,
                                });
                              }}
                              className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                            >
                              <PencilGlyph />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold">{ui.dropdownCategories}</h3>
              <div className="grid gap-2 sm:grid-cols-4">
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={t.commonName} value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder="key_example" value={categoryForm.key} onChange={(e) => setCategoryForm((p) => ({ ...p, key: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder="Sort" value={categoryForm.sort_order} onChange={(e) => setCategoryForm((p) => ({ ...p, sort_order: e.target.value }))} />
                <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-2 text-xs">
                  <input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm((p) => ({ ...p, is_active: e.target.checked }))} />
                  {ui.active}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveDropdownCategoryFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                  {editingDropdownCategoryId != null ? ui.saveChanges : ui.addCategory}
                </button>
                {editingDropdownCategoryId != null ? (
                  <button type="button" onClick={cancelDropdownCategoryEdit} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50">
                    {t.commonCancel}
                  </button>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="p-2 text-right">Key</th>
                      <th className="p-2 text-right">{t.commonName}</th>
                      <th className="p-2 text-right">{ui.active}</th>
                      <th className="p-2 text-right">{ui.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settingsCategories
                      .filter((x) => rowMatchesQuery(x, searchAny))
                      .map((c) => (
                        <tr key={c.id} className={`border-t border-zinc-100 ${editingDropdownCategoryId === c.id ? "bg-violet-50/80" : ""}`}>
                          <td className="p-2 font-mono">{c.key}</td>
                          <td className="p-2">{c.name}</td>
                          <td className="p-2">{c.is_active ? ui.yes : ui.no}</td>
                          <td className="p-2">
                            <button
                              type="button"
                              title={ui.editRow}
                              aria-label={ui.editRow}
                              onClick={() => {
                                setEditingDropdownCategoryId(c.id);
                                setCategoryForm({
                                  name: c.name,
                                  key: c.key,
                                  sort_order: String(c.sort_order ?? 0),
                                  is_active: c.is_active,
                                });
                              }}
                              className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                            >
                              <PencilGlyph />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold">{ui.dropdownOptionsCurrencies}</h3>
              <div className="grid gap-2 sm:grid-cols-5">
                <TypeableSelect className="rounded-md border border-zinc-200 px-3 py-2 text-xs" value={optionForm.category} onChange={(e) => setOptionForm((p) => ({ ...p, category: e.target.value }))}>
                  <option value="">{ui.expensesCategory}</option>
                  {settingsCategories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.key}
                    </option>
                  ))}
                </TypeableSelect>
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.label} value={optionForm.label} onChange={(e) => setOptionForm((p) => ({ ...p, label: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.value} value={optionForm.value} onChange={(e) => setOptionForm((p) => ({ ...p, value: e.target.value }))} />
                <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder="Sort" value={optionForm.sort_order} onChange={(e) => setOptionForm((p) => ({ ...p, sort_order: e.target.value }))} />
                <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-2 text-xs">
                  <input type="checkbox" checked={optionForm.is_active} onChange={(e) => setOptionForm((p) => ({ ...p, is_active: e.target.checked }))} />
                  {ui.active}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveDropdownOptionFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                  {editingDropdownOptionId != null ? ui.saveChanges : ui.addOption}
                </button>
                {editingDropdownOptionId != null ? (
                  <button type="button" onClick={cancelDropdownOptionEdit} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50">
                    {t.commonCancel}
                  </button>
                ) : null}
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50">
                    <tr>
                      <th className="p-2 text-right">{ui.expensesCategory}</th>
                      <th className="p-2 text-right">{ui.label}</th>
                      <th className="p-2 text-right">{ui.value}</th>
                      <th className="p-2 text-right">{ui.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settingsOptions
                      .filter((x) => rowMatchesQuery(x, searchAny))
                      .map((o) => {
                        const cat = settingsCategories.find((c) => c.id === o.category);
                        return (
                          <tr key={o.id} className={`border-t border-zinc-100 ${editingDropdownOptionId === o.id ? "bg-violet-50/80" : ""}`}>
                            <td className="p-2 font-mono">{cat?.key || o.category}</td>
                            <td className="p-2">{o.label}</td>
                            <td className="p-2 font-mono">{o.value}</td>
                            <td className="p-2">
                              <button
                                type="button"
                                title={ui.editRow}
                                aria-label={ui.editRow}
                                onClick={() => {
                                  setEditingDropdownOptionId(o.id);
                                  setOptionForm({
                                    category: String(o.category),
                                    label: o.label,
                                    value: o.value,
                                    sort_order: String(o.sort_order ?? 0),
                                    is_active: o.is_active,
                                  });
                                }}
                                className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                              >
                                <PencilGlyph />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold">{ui.appSettingsTitle}</h3>
            <div className="grid gap-2 lg:grid-cols-5">
              <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.section} value={appSettingForm.section} onChange={(e) => setAppSettingForm((p) => ({ ...p, section: e.target.value }))} />
              <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.key} value={appSettingForm.key} onChange={(e) => setAppSettingForm((p) => ({ ...p, key: e.target.value }))} />
              <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs" placeholder={ui.label} value={appSettingForm.label} onChange={(e) => setAppSettingForm((p) => ({ ...p, label: e.target.value }))} />
              <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs lg:col-span-2" placeholder={ui.value} value={appSettingForm.value} onChange={(e) => setAppSettingForm((p) => ({ ...p, value: e.target.value }))} />
              <input className="rounded-md border border-zinc-200 px-3 py-2 text-xs lg:col-span-5" placeholder={ui.descriptionOptional} value={appSettingForm.description} onChange={(e) => setAppSettingForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void upsertAppSettingFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                {editingAppSettingId != null ? ui.saveChanges : ui.saveUpdateSetting}
              </button>
              {editingAppSettingId != null ? (
                <button type="button" onClick={cancelAppSettingEdit} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm hover:bg-zinc-50">
                  {t.commonCancel}
                </button>
              ) : null}
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr>
                    <th className="p-2 text-right">{ui.section}</th>
                    <th className="p-2 text-right">{ui.key}</th>
                    <th className="p-2 text-right">{ui.label}</th>
                    <th className="p-2 text-right">{ui.value}</th>
                    <th className="p-2 text-right">{ui.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsAppSettings
                    .filter((x) => rowMatchesQuery(x, searchAny))
                    .map((s) => (
                      <tr key={s.id} className={`border-t border-zinc-100 ${editingAppSettingId === s.id ? "bg-violet-50/80" : ""}`}>
                        <td className="p-2 font-mono">{s.section}</td>
                        <td className="p-2 font-mono">{s.key}</td>
                        <td className="p-2">{s.label || "—"}</td>
                        <td className="p-2 max-w-[400px] truncate" title={s.value}>
                          {s.value}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            title={ui.editRow}
                            aria-label={ui.editRow}
                            onClick={() => {
                              setEditingAppSettingId(s.id);
                              setAppSettingForm({
                                section: s.section,
                                key: s.key,
                                label: s.label || "",
                                value: s.value,
                                description: s.description || "",
                              });
                            }}
                            className="inline-flex items-center justify-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                          >
                            <PencilGlyph />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold">{ui.pdfAssets}</h3>
            <div className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
              <input
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                placeholder={ui.fileNameOptional}
                value={pdfAssetForm.name}
                onChange={(e) => setPdfAssetForm((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                type="file"
                accept="image/*"
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                onChange={(e) =>
                  setPdfAssetForm((p) => ({ ...p, file: e.target.files && e.target.files.length ? e.target.files[0] : null }))
                }
              />
              <button type="button" onClick={() => void uploadPdfAssetFromSettings()} className="rounded-md bg-violet-700 px-3 py-2 text-xs text-white hover:bg-violet-800">
                {ui.upload}
              </button>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-zinc-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr>
                    <th className="p-2 text-right">ID</th>
                    <th className="p-2 text-right">{t.commonName}</th>
                    <th className="p-2 text-right">{ui.link}</th>
                    <th className="p-2 text-right">{ui.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsPdfAssets
                    .filter((x) => rowMatchesQuery(x, searchAny))
                    .map((f) => (
                      <tr key={f.id} className="border-t border-zinc-100">
                        <td className="p-2 font-mono">{f.id}</td>
                        <td className="p-2">{f.name || "—"}</td>
                        <td className="p-2">
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                              {ui.open}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2">
                          <button type="button" onClick={() => void deletePdfAssetFromSettings(f.id)} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700">
                            {t.commonDelete}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



