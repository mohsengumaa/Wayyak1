"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import { CalendarIcon, MailIcon, NotesIcon, PhoneIcon, SearchIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import {
  PdfBedIcon,
  PdfContrastIcon,
  PdfCreditCardIcon,
  PdfDocIcon,
  PdfDropletIcon,
  PdfEyeIcon,
  PdfFooterIcon,
  PdfHotelIcon,
  PdfImageIcon,
  PdfInfoIcon,
  PdfLangIcon,
  PdfLayersIcon,
  PdfPlusLineIcon,
  PdfRulerIcon,
  PdfSigmaIcon,
  PdfSparklesIcon,
  PdfShieldIcon,
  PdfTextLinesIcon,
  PdfTypeIcon,
  PdfUploadIcon,
  PdfUserIcon,
  PdfUsersIcon,
} from "@/components/PdfSettingsIcons";
import { DROPDOWN_CATEGORY_KEYS } from "@/lib/dropdownOptions";
import { NAV_LINK_CONFIG } from "@/lib/modulePermissions";
import { invalidateModuleSettingsCache } from "@/lib/moduleSettings";
import { MODULE_SETTINGS_REGISTRY, MODULE_UI_SECTIONS, moduleSettingKey, type SettingValueType } from "@/lib/moduleSettingsRegistry";
import type { NavKey } from "@/lib/modulePermissions";
import { openPdfBlobWithFallback } from "@/lib/pdfOpen";

function SettingsFieldLabel({
  htmlFor,
  icon,
  hint,
  children,
}: {
  htmlFor?: string;
  icon?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-1">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
        {icon ? (
          <span className="inline-flex shrink-0 text-zinc-600 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:stroke-current [&>svg]:text-current">
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
      </label>
      {hint ? <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function PdfFieldLabel({ htmlFor, icon, children }: { htmlFor?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-700">
      {icon ? (
        <span className="inline-flex shrink-0 text-zinc-600 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:stroke-current [&>svg]:text-current">
          {icon}
        </span>
      ) : null}
      {children}
    </label>
  );
}

const PDF_SECTION_TOGGLE_ICONS: Record<string, ReactNode> = {
  logo: <PdfImageIcon />,
  bill_to: <PdfUserIcon />,
  payment_details: <PdfCreditCardIcon />,
  reservation_blocks: <PdfBedIcon />,
  cancellation: <PdfShieldIcon />,
  guest_list: <PdfUsersIcon />,
  extras_fees: <PdfSparklesIcon />,
  details_card: <PdfInfoIcon />,
  summary: <PdfSigmaIcon />,
  footer: <PdfFooterIcon />,
  booking_meta: <PdfHotelIcon />,
};

type Category = {
  id: number;
  name: string;
  key: string;
  description: string;
  is_active: boolean;
  sort_order: number;
  options?: Option[];
};
type Option = {
  id: number;
  category: number;
  label: string;
  value: string;
  description: string;
  color: string;
  sort_order: number;
  meta: Record<string, unknown>;
  is_active: boolean;
};
type AppSettingRow = {
  id: number;
  section: string;
  key: string;
  label: string;
  value: string;
  description: string;
  updated_at: string;
};

type PdfDocumentScope = "global" | "voucher_customer" | "voucher_hotel" | "invoice";

type PdfCfgState = {
  version: number;
  logo_asset_id: number | null;
  watermark: { enabled: boolean; opacity: number; scale: number };
  extras_fields?: {
    extra_bed: boolean;
    promotion_room: boolean;
    honey_moons: boolean;
    free_of_charge: boolean;
    package_splitting: boolean;
    bubble: boolean;
    passive: boolean;
    free_sale: boolean;
  };
  payment_box?: {
    enabled: boolean;
    title: string;
    bank: string;
    iban: string;
    account: string;
    info_text: string;
    payment_url: string;
  };
  typography: {
    base: number;
    title: number;
    small: number;
    primary_darkness?: number;
    secondary_darkness?: number;
  };
  sections: Record<string, boolean>;
  texts?: {
    ar?: Record<string, string>;
    en?: Record<string, string>;
    tr?: Record<string, string>;
  };
  text_lines?: {
    ar?: Array<{ id: string; text: string; enabled: boolean }>;
    en?: Array<{ id: string; text: string; enabled: boolean }>;
    tr?: Array<{ id: string; text: string; enabled: boolean }>;
  };
  layout?: {
    card_h_cm?: number;
    reservation_block_h_cm?: number;
    cancellation_h_cm?: number;
    guests_extras_h_cm?: number;
    summary_h_cm?: number;
    details_h_cm?: number;
    card_opacity?: number;
  };
};
type Referrer = {
  id: number;
  referrer_code: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  is_active: boolean;
};

type CategoryForm = {
  name: string;
  key: string;
  description: string;
  is_active: boolean;
  sort_order: number;
};
type OptionForm = {
  category: string;
  label: string;
  value: string;
  description: string;
  color: string;
  sort_order: number;
  meta_text: string;
  meta_details_text: string;
  max_guests: string;
  department_code: string;
  department_manager: string;
  position_grade: string;
  default_salary: string;
  is_active: boolean;
};

const SETTINGS_CATEGORY_PRESETS: Array<{
  key: string;
  name: string;
  description: string;
  sort_order: number;
}> = [
  {
    key: DROPDOWN_CATEGORY_KEYS.hotelRoomKind,
    name: "أنواع الغرف",
    description: "أنواع الغرف المستخدمة في صفحات الفنادق والغرف.",
    sort_order: 10,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.hrDepartment,
    name: "الأقسام",
    description: "أقسام الموظفين في الموارد البشرية.",
    sort_order: 20,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.hrPosition,
    name: "الوظائف",
    description: "المسميات الوظيفية في الموارد البشرية.",
    sort_order: 30,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.hrTaskType,
    name: "أنواع المهام",
    description: "تصنيفات مهام الموظفين في الموارد البشرية.",
    sort_order: 40,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.hrSalaryType,
    name: "أنواع الرواتب/الاستحقاقات",
    description: "أنواع المسيرات والبدلات والخصومات للموظفين.",
    sort_order: 50,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.hrExpenseType,
    name: "أنواع مصاريف الموظفين",
    description: "تصنيفات عهد/مصاريف وتعويضات الموظفين.",
    sort_order: 60,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingRoomCode,
    name: "حجوزات — حجم الغرفة",
    description: "DBL / SNG وما شابه في شاشات الحجز والقسائم.",
    sort_order: 70,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingRoomTypeCode,
    name: "حجوزات — نوع الغرفة",
    description: "GUES / DLX وما شابه.",
    sort_order: 71,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingBoardCode,
    name: "حجوزات — الوجبة",
    description: "BB / RO وما شابه.",
    sort_order: 72,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingConfirmation,
    name: "حجوزات — حالة التأكيد",
    description: "Unsent / Sent / Confirmed.",
    sort_order: 73,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingReservationStatus,
    name: "حجوزات — حالة الحجز",
    description: "On Request / Confirmed / Cancelled.",
    sort_order: 74,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingReservationType,
    name: "حجوزات — نوع الحجز",
    description: "New / Option / Release.",
    sort_order: 75,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras,
    name: "حجوزات — Extras & fees",
    description: "الخانات التي تظهر ضمن Extras & fees في شاشة الحجز وملف PDF.",
    sort_order: 76,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.accountingDocType,
    name: "محاسبة — نوع المستند",
    description: "أنواع المستندات في المحاسبة.",
    sort_order: 80,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.accountingPaymentDirection,
    name: "محاسبة — اتجاه الدفع",
    description: "استلام / صرف وما يقابله.",
    sort_order: 81,
  },
  {
    key: DROPDOWN_CATEGORY_KEYS.commonCurrency,
    name: "عام — العملات",
    description: "عملات النظام الظاهرة في القوائم.",
    sort_order: 90,
  },
];

const SETTINGS_OPTION_PRESETS: Record<
  string,
  Array<{ label: string; value: string; description?: string; meta?: Record<string, unknown> }>
> = {
  [DROPDOWN_CATEGORY_KEYS.hotelRoomKind]: [
    { label: "Single", value: "SNG", meta: { max_guests: 1 } },
    { label: "Double", value: "DBL", meta: { max_guests: 2 } },
    { label: "Twin", value: "TWN", meta: { max_guests: 2 } },
    { label: "Triple", value: "TPL", meta: { max_guests: 3 } },
    { label: "Family", value: "FAM", meta: { max_guests: 4 } },
    { label: "Suite", value: "STE", meta: { max_guests: 2 } },
    { label: "Deluxe", value: "DLX", meta: { max_guests: 2 } },
  ],
  [DROPDOWN_CATEGORY_KEYS.hrDepartment]: [
    { label: "المبيعات", value: "sales", meta: { department_code: "HR-SALES", department_manager: "—" } },
    { label: "الحجوزات", value: "booking", meta: { department_code: "HR-BOOK", department_manager: "—" } },
    { label: "المحاسبة", value: "accounting", meta: { department_code: "HR-ACC", department_manager: "—" } },
    { label: "الموارد البشرية", value: "hr", meta: { department_code: "HR-HR", department_manager: "—" } },
  ],
  [DROPDOWN_CATEGORY_KEYS.hrPosition]: [
    { label: "موظف مبيعات", value: "sales_agent", meta: { position_grade: "G3", default_salary: 3500 } },
    { label: "مشرف مبيعات", value: "sales_supervisor", meta: { position_grade: "G4", default_salary: 5000 } },
    { label: "موظف حجوزات", value: "booking_agent", meta: { position_grade: "G2", default_salary: 3200 } },
    { label: "محاسب", value: "accountant", meta: { position_grade: "G4", default_salary: 5500 } },
  ],
  [DROPDOWN_CATEGORY_KEYS.hrTaskType]: [
    { label: "متابعة عميل", value: "client_follow_up" },
    { label: "تأكيد حجز", value: "booking_confirmation" },
    { label: "تحصيل دفعة", value: "payment_collection" },
    { label: "عمل إداري", value: "admin_work" },
  ],
  [DROPDOWN_CATEGORY_KEYS.hrSalaryType]: [
    { label: "راتب أساسي", value: "base_salary" },
    { label: "حافز", value: "bonus" },
    { label: "عمولة", value: "commission" },
    { label: "خصم", value: "deduction" },
  ],
  [DROPDOWN_CATEGORY_KEYS.hrExpenseType]: [
    { label: "مواصلات", value: "transport" },
    { label: "اتصالات", value: "communication" },
    { label: "ضيافة", value: "hospitality" },
    { label: "عهدة", value: "advance" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingRoomCode]: [
    { label: "Double (DBL)", value: "DBL" },
    { label: "Single (SNG)", value: "SNG" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingRoomTypeCode]: [
    { label: "Guest (GUES)", value: "GUES" },
    { label: "Deluxe (DLX)", value: "DLX" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingBoardCode]: [
    { label: "Bed & Breakfast (BB)", value: "BB" },
    { label: "Room Only (RO)", value: "RO" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingConfirmation]: [
    { label: "Unsent", value: "Unsent" },
    { label: "Sent", value: "Sent" },
    { label: "Confirmed", value: "Confirmed" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingReservationStatus]: [
    { label: "On Request", value: "On Request" },
    { label: "Confirmed", value: "Confirmed" },
    { label: "Cancelled", value: "Cancelled" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingReservationType]: [
    { label: "New", value: "New" },
    { label: "Option", value: "Option" },
    { label: "Release", value: "Release" },
  ],
  [DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras]: [
    { label: "Extra bed", value: "extra_bed", meta: { field_key: "extra_bed" } },
    { label: "Promotion room", value: "promotion_room", meta: { field_key: "promotion_room" } },
    { label: "Honey moons", value: "honey_moons", meta: { field_key: "honey_moons" } },
    { label: "Free of charge", value: "free_of_charge", meta: { field_key: "free_of_charge" } },
    { label: "Package splitting", value: "package_splitting", meta: { field_key: "package_splitting" } },
    { label: "Bubble", value: "bubble", meta: { field_key: "bubble" } },
    { label: "Passive", value: "passive", meta: { field_key: "passive" } },
    { label: "Free sale", value: "free_sale", meta: { field_key: "free_sale" } },
  ],
  [DROPDOWN_CATEGORY_KEYS.accountingDocType]: [
    { label: "فاتورة مبيعات", value: "ar_invoice" },
    { label: "فاتورة شراء", value: "ap_bill" },
  ],
  [DROPDOWN_CATEGORY_KEYS.accountingPaymentDirection]: [
    { label: "وارد", value: "in" },
    { label: "صادر", value: "out" },
  ],
  [DROPDOWN_CATEGORY_KEYS.commonCurrency]: [
    { label: "يورو", value: "EUR" },
    { label: "دولار", value: "USD" },
    { label: "ليرة تركية", value: "TRY" },
  ],
};

export default function SettingsPage() {
  useRequireAuth();
  const { t, lang } = useI18n();
  const l = (ar: string, tr: string, en: string) => (lang === "ar" ? ar : lang === "tr" ? tr : en);
  const uiWords = useMemo(
    () => ({
      storedValueLabel: lang === "ar" ? "القيمة المخزّنة" : lang === "tr" ? "Kayıtlı değer" : "Stored value",
      storedValueHint:
        lang === "ar"
          ? "القيمة المخزنة في قاعدة البيانات (فريدة داخل الفئة)."
          : lang === "tr"
            ? "Veritabanında saklanan değer (kategori içinde benzersiz)."
            : "Value stored in database (unique within category).",
      storedValuePlaceholder:
        lang === "ar"
          ? "القيمة المحفوظة في قاعدة البيانات"
          : lang === "tr"
            ? "Veritabanında saklanan değer"
            : "Value stored in database",
      sortOptionLabel:
        lang === "ar"
          ? "ترتيب الخيار داخل الفئة"
          : lang === "tr"
            ? "Kategori içindeki seçenek sırası"
            : "Option order within category",
      sortOptionHint:
        lang === "ar" ? "0 يعني يظهر أولاً." : lang === "tr" ? "0 ilk sırada gösterilir." : "0 means shown first.",
    }),
    [lang],
  );
  const [tab, setTab] = useState<"dropdowns" | "referrers" | "app" | "modules" | "pdf">("dropdowns");
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentScope>("global");
  const [pdfAssets, setPdfAssets] = useState<Array<{ id: number; name: string; url: string }>>([]);
  const [pdfLogoAssetId, setPdfLogoAssetId] = useState<string>("");
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfCfg, setPdfCfg] = useState<PdfCfgState>({
    version: 1,
    logo_asset_id: null,
    watermark: { enabled: false, opacity: 0.08, scale: 0.9 },
    extras_fields: {
      extra_bed: true,
      promotion_room: true,
      honey_moons: true,
      free_of_charge: true,
      package_splitting: true,
      bubble: true,
      passive: true,
      free_sale: true,
    },
    payment_box: {
      enabled: false,
      title: "Payment info",
      bank: "",
      iban: "",
      account: "",
      info_text: "",
      payment_url: "",
    },
    typography: { base: 8, title: 15, small: 7, primary_darkness: 1, secondary_darkness: 0.75 },
    sections: {
      bill_to: true,
      payment_details: true,
      reservation_blocks: true,
      cancellation: true,
      guest_list: true,
      extras_fees: true,
      details_card: true,
      summary: true,
      footer: true,
      logo: true,
      booking_meta: true,
    },
    texts: {
      ar: {
        header_title: "فاتورة الحجز الفندقي",
        header_subtitle: "صادرة من نظام MB‑Tourism للسياحة والفنادق",
        bill_to_title: "بيانات العميل",
        payment_title: "تفاصيل السداد",
        cancellation_title: "سياسة الإلغاء",
        guest_list_title: "قائمة الأسماء",
        extras_title: "إضافات ورسوم",
        details_title: "معلومات إضافية",
        summary_title: "ملخص الحساب",
      },
      en: {
        header_title: "Hotel Booking Voucher",
        header_subtitle: "Issued from MB‑Tourism system",
        bill_to_title: "Bill To",
        payment_title: "Payment details",
        cancellation_title: "Cancellation policy",
        guest_list_title: "Customer name list",
        extras_title: "Extras & fees",
        details_title: "Details",
        summary_title: "Summary",
      },
    },
    text_lines: {
      ar: [],
      en: [],
    },
    layout: {
      card_h_cm: 2.6,
      reservation_block_h_cm: 6.2,
      cancellation_h_cm: 3.2,
      guests_extras_h_cm: 3.6,
      summary_h_cm: 4.3,
      details_h_cm: 4.3,
      card_opacity: 1,
    },
  });
  const [pdfTextLang, setPdfTextLang] = useState<"ar" | "en">("ar");
  const [pdfAutoSaveState, setPdfAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pdfAutoSaveError, setPdfAutoSaveError] = useState<string>("");
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettingRow[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "new" | null>(null);
  const [categoryPanelDraft, setCategoryPanelDraft] = useState<CategoryForm>({
    name: "",
    key: "",
    description: "",
    is_active: true,
    sort_order: 0,
  });
  const [optionForm, setOptionForm] = useState<OptionForm>({
    category: "",
    label: "",
    value: "",
    description: "",
    color: "",
    sort_order: 0,
    meta_text: "{}",
    meta_details_text: "",
    max_guests: "",
    department_code: "",
    department_manager: "",
    position_grade: "",
    default_salary: "",
    is_active: true,
  });
  const [referrerForm, setReferrerForm] = useState({
    referrer_code: "",
    name: "",
    phone: "",
    email: "",
    notes: "",
    is_active: true,
  });
  const [appForm, setAppForm] = useState({ section: "general", key: "", label: "", value: "", description: "" });
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [optionEditForm, setOptionEditForm] = useState<OptionForm | null>(null);
  const [editingReferrerId, setEditingReferrerId] = useState<number | null>(null);
  const [editingAppId, setEditingAppId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [dropdownScope, setDropdownScope] = useState<
    "all" | "core" | "hotels" | "hr" | "bookings" | "accounting" | "common"
  >("all");
  const [appSectionFocus, setAppSectionFocus] = useState<string | null>(null);
  const [appSectionListSearch, setAppSectionListSearch] = useState("");
  const [appSearch, setAppSearch] = useState("");
  const [referrerSearch, setReferrerSearch] = useState("");
  const [moduleFocus, setModuleFocus] = useState<NavKey>("bookings");
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleSettingsDraft, setModuleSettingsDraft] = useState<Record<string, string>>({});
  const [moduleCustomForm, setModuleCustomForm] = useState({
    key: "",
    label: "",
    value: "",
    description: "",
  });

  const loadDropdowns = async (): Promise<void> => {
    const [cats, opts] = await Promise.all([
      api.get<Category[]>("/dropdown-categories/"),
      api.get<Option[]>("/dropdown-options/"),
    ]);
    setCategories(cats);
    setOptions(opts);
    setError("");
  };

  const ensureVoucherExtrasDropdownPreset = async (): Promise<void> => {
    const [cats, opts] = await Promise.all([
      api.get<Category[]>("/dropdown-categories/"),
      api.get<Option[]>("/dropdown-options/"),
    ]);

    let category = cats.find((c) => c.key === DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras);
    let createdCategory = false;
    if (!category) {
      category = await api.post<Category>("/dropdown-categories/", {
        name: "حجوزات — Extras & fees",
        key: DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras,
        description: "الخانات التي تظهر ضمن Extras & fees في شاشة الحجز وملف PDF.",
        sort_order: 76,
        is_active: true,
      });
      createdCategory = true;
    }

    const defaults = SETTINGS_OPTION_PRESETS[DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras] || [];
    const knownExtraKeys = new Set(defaults.map((d) => String(d.value)));
    const normalizeAlias = (raw: string) =>
      String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const aliasToKey = new Map<string, string>();
    for (const row of defaults) {
      const key = String(row.value);
      aliasToKey.set(normalizeAlias(key), key);
      aliasToKey.set(normalizeAlias(String(row.label)), key);
    }
    const extrasRows = opts.filter((o) => Number(o.category) === Number(category.id));
    const existingValues = new Set(
      extrasRows.map((o) => String(o.value).toLowerCase())
    );

    // Important: do NOT recreate deleted rows on every refresh.
    // Seed defaults only once when the category itself is first created.
    const shouldSeedDefaults = createdCategory && extrasRows.length === 0;
    const createQueue = (shouldSeedDefaults ? defaults : [])
      .filter((preset) => !existingValues.has(preset.value.toLowerCase()))
      .map((preset) =>
        api.post<Option>("/dropdown-options/", {
          category: category!.id,
          label: preset.label,
          value: preset.value,
          description: preset.description || "",
          color: "",
          sort_order: 0,
          meta: { ...(preset.meta || {}), field_key: String(preset.value) },
          is_active: true,
        })
      );

    if (createQueue.length > 0) {
      await Promise.all(createQueue);
    }

    // Backfill stable field key mapping so UI/PDF keeps working even if `value` was edited.
    const patchQueue = extrasRows
      .map((row) => {
        const meta = (row.meta || {}) as Record<string, unknown>;
        const currentFieldKey = typeof meta.field_key === "string" ? String(meta.field_key) : "";
        const val = String(row.value || "");
        const inferredKey =
          (knownExtraKeys.has(val) ? val : "") ||
          (knownExtraKeys.has(currentFieldKey) ? currentFieldKey : "") ||
          aliasToKey.get(normalizeAlias(val)) ||
          aliasToKey.get(normalizeAlias(String(row.label || ""))) ||
          "";
        return { row, currentFieldKey, inferredKey };
      })
      .filter((x) => Boolean(x.inferredKey) && x.currentFieldKey !== x.inferredKey)
      .map((x) => api.patch<Option>(`/dropdown-options/${x.row.id}/`, { meta: { ...(x.row.meta || {}), field_key: x.inferredKey } }));
    if (patchQueue.length > 0) {
      await Promise.all(patchQueue);
    }
  };

  const loadReferrers = () => api.get<Referrer[]>("/referrers/").then(setReferrers);

  const loadAppSettings = () => api.get<AppSettingRow[]>("/app-settings/").then(setAppSettings);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      let lastErr = "";
      for (let i = 0; i < 3; i += 1) {
        try {
          await ensureVoucherExtrasDropdownPreset();
          await loadDropdowns();
          return;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : "";
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
      if (!cancelled) {
        setError(
          lastErr
            ? l(
                `تعذر تحميل إعدادات القوائم المنسدلة. (${lastErr})`,
                `Acilir liste ayarlari yuklenemedi. (${lastErr})`,
                `Unable to load dropdown settings. (${lastErr})`,
              )
            : l("تعذر تحميل إعدادات القوائم المنسدلة.", "Acilir liste ayarlari yuklenemedi.", "Unable to load dropdown settings."),
        );
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab === "referrers") loadReferrers().catch(() => setReferrers([]));
    if (tab === "app" || tab === "modules") loadAppSettings().catch(() => setAppSettings([]));
  }, [tab]);

  const closeOptionModal = () => {
    setEditingOptionId(null);
    setOptionEditForm(null);
  };

  const categoryById = new Map(categories.map((item) => [String(item.id), item]));
  const getCategoryKey = (categoryId: string) => categoryById.get(String(categoryId))?.key || "";

  const composeMetaPayload = (draft: OptionForm): Record<string, unknown> => {
    let meta: Record<string, unknown> = {};
    if (draft.meta_text.trim()) {
      meta = JSON.parse(draft.meta_text) as Record<string, unknown>;
    }
    const categoryKey = getCategoryKey(draft.category);
    if (categoryKey === DROPDOWN_CATEGORY_KEYS.hotelRoomKind) {
      const guests = Number(draft.max_guests || 0);
      if (Number.isFinite(guests) && guests > 0) meta.max_guests = Math.floor(guests);
    }
    if (categoryKey === DROPDOWN_CATEGORY_KEYS.hrDepartment) {
      if (draft.department_code.trim()) meta.department_code = draft.department_code.trim();
      if (draft.department_manager.trim()) meta.department_manager = draft.department_manager.trim();
    }
    if (categoryKey === DROPDOWN_CATEGORY_KEYS.hrPosition) {
      if (draft.position_grade.trim()) meta.position_grade = draft.position_grade.trim();
      const salary = Number(draft.default_salary || 0);
      if (Number.isFinite(salary) && salary > 0) meta.default_salary = salary;
    }
    const details = String(draft.meta_details_text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of details) {
      const eq = line.includes("=") ? line.indexOf("=") : line.indexOf(":");
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      const raw = line.slice(eq + 1).trim();
      if (!k) continue;
      if (raw === "true" || raw === "false") {
        meta[k] = raw === "true";
        continue;
      }
      const n = Number(raw);
      if (raw !== "" && Number.isFinite(n)) {
        meta[k] = n;
        continue;
      }
      meta[k] = raw;
    }
    return meta;
  };

  const metaToDetailsText = (meta?: Record<string, unknown>): string => {
    if (!meta) return "";
    return Object.entries(meta)
      .filter(
        ([k]) =>
          !["max_guests", "department_code", "department_manager", "position_grade", "default_salary"].includes(k)
      )
      .map(([k, v]) => `${k}=${String(v)}`)
      .join("\n");
  };

  useEffect(() => {
    if (selectedCategoryId === "new") {
      setCategoryPanelDraft({
        name: "",
        key: "",
        description: "",
        is_active: true,
        sort_order: 0,
      });
      return;
    }
    if (typeof selectedCategoryId === "number") {
      const c = categories.find((x) => x.id === selectedCategoryId);
      if (c) {
        setCategoryPanelDraft({
          name: c.name,
          key: c.key,
          description: c.description || "",
          is_active: c.is_active,
          sort_order: c.sort_order || 0,
        });
      }
    }
  }, [selectedCategoryId, categories]);

  useEffect(() => {
    if (typeof selectedCategoryId === "number") {
      setOptionForm((prev) => ({ ...prev, category: String(selectedCategoryId) }));
    }
  }, [selectedCategoryId]);

  const appSectionRows = useMemo(() => {
    const preset = NAV_LINK_CONFIG.map((item) => {
      const label = String((t as Record<string, string>)[item.key] ?? item.key);
      return { section: item.key, label, preset: true as const };
    });
    const presetKeys = new Set<string>(preset.map((p) => p.section));
    const extra = [...new Set(appSettings.map((r) => r.section))]
      .filter((s) => !presetKeys.has(s))
      .sort()
      .map((section) => ({ section, label: section, preset: false as const }));
    return [...preset, ...extra];
  }, [t, appSettings]);

  useEffect(() => {
    if (tab !== "app") return;
    const known = new Set(appSectionRows.map((r) => r.section));
    setAppSectionFocus((prev) => {
      if (prev !== null && known.has(prev)) return prev;
      return NAV_LINK_CONFIG[0]?.key ?? "dashboard";
    });
  }, [tab, appSectionRows]);

  const saveCategoryPanel = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedCategoryId === null) return;
    setError("");
    setStatus("");
    const payload = {
      ...categoryPanelDraft,
      key: categoryPanelDraft.key.trim().toLowerCase().replace(/\s+/g, "_"),
    };
    try {
      if (selectedCategoryId === "new") {
        const row = await api.post<Category>("/dropdown-categories/", payload);
        setCategories((prev) => [row, ...prev]);
        setSelectedCategoryId(row.id);
        setStatus(l("تمت إضافة الفئة.", "Kategori eklendi.", "Category added."));
      } else {
        const row = await api.patch<Category>(`/dropdown-categories/${selectedCategoryId}/`, payload);
        setCategories((prev) => prev.map((item) => (item.id === row.id ? row : item)));
        setStatus(l("تم تحديث الفئة.", "Kategori guncellendi.", "Category updated."));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حفظ الفئة.", "Kategori kaydedilemedi.", "Unable to save category."));
    }
  };

  const addOrUpdateOption = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    let parsedMeta: Record<string, unknown> = {};
    try {
      parsedMeta = composeMetaPayload(optionForm);
    } catch {
      setError(l("حقل meta يجب أن يكون JSON صالحًا.", "meta alani gecerli JSON olmali.", "Meta field must be valid JSON."));
      return;
    }
    const categoryKey = getCategoryKey(optionForm.category);
    if (categoryKey === DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras) {
      const rawValue = String(optionForm.value || "").trim();
      const known = new Set(
        (SETTINGS_OPTION_PRESETS[DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras] || []).map((x) => String(x.value)),
      );
      if (known.has(rawValue)) {
        parsedMeta = { ...parsedMeta, field_key: rawValue };
      }
    }
    const payload = {
      category: Number(optionForm.category),
      label: optionForm.label,
      value: optionForm.value,
      description: optionForm.description,
      color: optionForm.color,
      sort_order: Number(optionForm.sort_order || 0),
      meta: parsedMeta,
      is_active: optionForm.is_active,
    };
    try {
      const row = await api.post<Option>("/dropdown-options/", payload);
      setOptions((prev) => [row, ...prev]);
      setStatus(l("تمت إضافة الخيار.", "Secenek eklendi.", "Option added."));
      setOptionForm({
        category: optionForm.category,
        label: "",
        value: "",
        description: "",
        color: "",
        sort_order: 0,
        meta_text: "{}",
        meta_details_text: "",
        max_guests: "",
        department_code: "",
        department_manager: "",
        position_grade: "",
        default_salary: "",
        is_active: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حفظ الخيار.", "Secenek kaydedilemedi.", "Unable to save option."));
    }
  };

  const saveOptionEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingOptionId || !optionEditForm) return;
    setError("");
    setStatus("");
    let parsedMeta: Record<string, unknown> = {};
    try {
      parsedMeta = composeMetaPayload(optionEditForm);
    } catch {
      setError(l("حقل meta يجب أن يكون JSON صالحًا.", "meta alani gecerli JSON olmali.", "Meta field must be valid JSON."));
      return;
    }
    const categoryKey = getCategoryKey(optionEditForm.category);
    if (categoryKey === DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras) {
      const rawValue = String(optionEditForm.value || "").trim();
      const known = new Set(
        (SETTINGS_OPTION_PRESETS[DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras] || []).map((x) => String(x.value)),
      );
      if (known.has(rawValue)) {
        parsedMeta = { ...parsedMeta, field_key: rawValue };
      } else if (typeof parsedMeta.field_key !== "string") {
        // Preserve previous field mapping when only display value/label was edited.
        const old = options.find((item) => item.id === editingOptionId);
        const oldFieldKey =
          old && typeof (old.meta || {}).field_key === "string" ? String((old.meta || {}).field_key) : "";
        if (oldFieldKey) parsedMeta = { ...parsedMeta, field_key: oldFieldKey };
      }
    }
    try {
      const row = await api.patch<Option>(`/dropdown-options/${editingOptionId}/`, {
        category: Number(optionEditForm.category),
        label: optionEditForm.label,
        value: optionEditForm.value,
        description: optionEditForm.description,
        color: optionEditForm.color,
        sort_order: Number(optionEditForm.sort_order || 0),
        meta: parsedMeta,
        is_active: optionEditForm.is_active,
      });
      setOptions((prev) => prev.map((item) => (item.id === row.id ? row : item)));
      closeOptionModal();
      setStatus(l("تم تحديث الخيار.", "Secenek guncellendi.", "Option updated."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر تحديث الخيار.", "Secenek guncellenemedi.", "Unable to update option."));
    }
  };

  const addOrUpdateReferrer = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      if (editingReferrerId) {
        const row = await api.patch<Referrer>(`/referrers/${editingReferrerId}/`, referrerForm);
        setReferrers((prev) => prev.map((item) => (item.id === row.id ? row : item)));
        setStatus(l("تم تحديث المُحيل.", "Yonlendiren guncellendi.", "Referrer updated."));
      } else {
        const row = await api.post<Referrer>("/referrers/", referrerForm);
        setReferrers((prev) => [row, ...prev]);
        setStatus(l("تمت إضافة المُحيل.", "Yonlendiren eklendi.", "Referrer added."));
      }
      setReferrerForm({ referrer_code: "", name: "", phone: "", email: "", notes: "", is_active: true });
      setEditingReferrerId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حفظ بيانات المُحيل.", "Yonlendiren verileri kaydedilemedi.", "Unable to save referrer data."));
    }
  };

  const addOrUpdateAppSetting = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    try {
      if (editingAppId) {
        const row = await api.patch<AppSettingRow>(`/app-settings/${editingAppId}/`, appForm);
        setAppSettings((prev) => prev.map((item) => (item.id === row.id ? row : item)));
        setStatus(l("تم تحديث الإعداد.", "Ayar guncellendi.", "Setting updated."));
      } else {
        const row = await api.post<AppSettingRow>("/app-settings/", appForm);
        setAppSettings((prev) => [row, ...prev]);
        setStatus(l("تمت إضافة الإعداد.", "Ayar eklendi.", "Setting added."));
      }
      setAppForm({ section: appForm.section, key: "", label: "", value: "", description: "" });
      setEditingAppId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حفظ إعداد التطبيق.", "Uygulama ayari kaydedilemedi.", "Unable to save app setting."));
    }
  };

  const deleteRow = async (resource: string, id: number, onDone: () => void) => {
    setError("");
    setStatus("");
    try {
      await api.delete(`/` + resource + `/${id}/`, {
        confirmMessage: l("هل تريد تأكيد الحذف؟", "Silmeyi onayliyor musunuz?", "Confirm deletion?"),
      });
      onDone();
      setStatus(l("تم الحذف بنجاح.", "Basariyla silindi.", "Deleted successfully."));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر تنفيذ الحذف.", "Silme islemi yapilamadi.", "Unable to perform delete."));
    }
  };

  const ensurePresetCategories = async () => {
    setError("");
    setStatus("");
    try {
      const existingKeys = new Set(categories.map((c) => c.key));
      const missing = SETTINGS_CATEGORY_PRESETS.filter((row) => !existingKeys.has(row.key));
      if (!missing.length) {
        setStatus(l("الفئات الأساسية موجودة مسبقًا.", "Temel kategoriler zaten mevcut.", "Base categories already exist."));
        return;
      }
      const created = await Promise.all(
        missing.map((row) =>
          api.post<Category>("/dropdown-categories/", {
            name: row.name,
            key: row.key,
            description: row.description,
            sort_order: row.sort_order,
            is_active: true,
          })
        )
      );
      setCategories((prev) => [...created, ...prev]);
      setStatus(
        l(
          "تم تجهيز فئات النظام (فنادق، HR، حجوزات، محاسبة، عملات…).",
          "Sistem kategorileri hazirlandi (oteller, IK, rezervasyonlar, muhasebe, para birimleri...).",
          "System categories prepared (hotels, HR, bookings, accounting, currencies...).",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر تجهيز الفئات الأساسية.", "Temel kategoriler hazirlanamadi.", "Unable to prepare base categories."));
    }
  };

  const ensurePresetOptions = async () => {
    setError("");
    setStatus("");
    try {
      let currentCategories = categories;
      if (!currentCategories.length) {
        const loaded = await api.get<Category[]>("/dropdown-categories/");
        setCategories(loaded);
        currentCategories = loaded;
      }
      const categoryByKey = new Map(currentCategories.map((c) => [c.key, c]));
      const missingCategories = SETTINGS_CATEGORY_PRESETS.filter((row) => !categoryByKey.has(row.key));
      if (missingCategories.length) {
        const createdCats = await Promise.all(
          missingCategories.map((row) =>
            api.post<Category>("/dropdown-categories/", {
              name: row.name,
              key: row.key,
              description: row.description,
              sort_order: row.sort_order,
              is_active: true,
            })
          )
        );
        const merged = [...createdCats, ...currentCategories];
        setCategories(merged);
        currentCategories = merged;
      }

      let currentOptions = options;
      if (!currentOptions.length) {
        const loadedOptions = await api.get<Option[]>("/dropdown-options/");
        setOptions(loadedOptions);
        currentOptions = loadedOptions;
      }

      const createQueue: Array<Promise<Option>> = [];
      for (const [categoryKey, presetOptions] of Object.entries(SETTINGS_OPTION_PRESETS)) {
        const category = currentCategories.find((c) => c.key === categoryKey);
        if (!category) continue;
        for (const preset of presetOptions) {
          const exists = currentOptions.some(
            (row) => row.category === category.id && row.value.toLowerCase() === preset.value.toLowerCase()
          );
          if (exists) continue;
          createQueue.push(
            api.post<Option>("/dropdown-options/", {
              category: category.id,
              label: preset.label,
              value: preset.value,
              description: preset.description || "",
              color: "",
              sort_order: 0,
              meta: preset.meta || {},
              is_active: true,
            })
          );
        }
      }

      if (!createQueue.length) {
        setStatus(l("الخيارات الافتراضية موجودة مسبقًا.", "Varsayilan secenekler zaten mevcut.", "Default options already exist."));
        return;
      }
      const created = await Promise.all(createQueue);
      setOptions((prev) => [...created, ...prev]);
      setStatus(
        l(
          "تم تجهيز خيارات كل الفئات (فنادق، HR، حجوزات، محاسبة، عام…).",
          "Tum kategori secenekleri hazirlandi (oteller, IK, rezervasyonlar, muhasebe, genel...).",
          "All category options prepared (hotels, HR, bookings, accounting, common...).",
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر تجهيز الخيارات الافتراضية.", "Varsayilan secenekler hazirlanamadi.", "Unable to prepare default options."));
    }
  };

  const selectedCategoryName =
    typeof selectedCategoryId === "number"
      ? categories.find((c) => c.id === selectedCategoryId)?.name || ""
      : "";

  const tabBtn = (id: typeof tab, label: string, icon?: ReactNode) => (
    <button
      type="button"
      onClick={() => {
        setTab(id);
        if (id !== "dropdowns") setSelectedCategoryId(null);
      }}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        tab === id
          ? "bg-[#0f766e] text-white shadow"
          : "bg-white/80 text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      {icon ? (
        <span className="inline-flex items-center gap-2">
          <span
            className={
              tab === id
                ? "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-white [&>svg]:text-white"
                : "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:stroke-zinc-600 [&>svg]:text-zinc-600"
            }
          >
            {icon}
          </span>
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );

  const loadPdfSettings = async () => {
    const key = pdfDoc === "global" ? "doc.global.config" : `doc.${pdfDoc}.config`;
    const rows = await api.get<AppSettingRow[]>(`/app-settings/?section=pdf&key=${encodeURIComponent(key)}`);
    const row = rows[0];
    try {
      const parsed: Partial<PdfCfgState> = row?.value ? JSON.parse(row.value) : {};
      setPdfCfg((prev) => ({
        ...prev,
        ...parsed,
        watermark: { ...prev.watermark, ...(parsed?.watermark || {}) },
        extras_fields: { ...prev.extras_fields, ...(parsed?.extras_fields || {}) },
        payment_box: {
          ...(prev.payment_box || {
            enabled: false,
            title: "Payment info",
            bank: "",
            iban: "",
            account: "",
            info_text: "",
            payment_url: "",
          }),
          ...(((parsed as any)?.payment_box || {}) as any),
        },
        typography: { ...prev.typography, ...(parsed?.typography || {}) },
        sections: { ...prev.sections, ...(parsed?.sections || {}) },
      }));
      setPdfLogoAssetId(typeof parsed?.logo_asset_id === "number" ? String(parsed.logo_asset_id) : "");
    } catch {
      setPdfLogoAssetId("");
    }
  };

  const loadPdfAssets = async () => {
    const rows = await api.get<Array<{ id: number; name: string; url: string }>>("/pdf-assets/");
    setPdfAssets(rows);
  };

  const savePdfSettings = async () => {
    const key = pdfDoc === "global" ? "doc.global.config" : `doc.${pdfDoc}.config`;
    const payload: PdfCfgState = {
      ...pdfCfg,
      logo_asset_id: pdfLogoAssetId ? Number(pdfLogoAssetId) : null,
      version: 1,
    };
    const rows = await api.get<AppSettingRow[]>(`/app-settings/?section=pdf&key=${encodeURIComponent(key)}`);
    const row = rows[0];
    if (row?.id) {
      await api.patch(`/app-settings/${row.id}`, {
        section: "pdf",
        key,
        label: `PDF config: ${pdfDoc}`,
        value: JSON.stringify(payload),
        description: "PDF settings per document",
      });
    } else {
      await api.post("/app-settings", {
        section: "pdf",
        key,
        label: `PDF config: ${pdfDoc}`,
        value: JSON.stringify(payload),
        description: "PDF settings per document",
      });
    }
    setStatus(l("تم حفظ إعدادات PDF.", "PDF ayarlari kaydedildi.", "PDF settings saved."));
  };

  const uploadPdfLogo = async (file: File) => {
    setPdfUploading(true);
    try {
      const token = getToken() || "";
      const form = new FormData();
      form.append("name", file.name);
      form.append("file", file);
      const res = await fetch(`${API_BASE}/pdf-assets/`, {
        method: "POST",
        headers: token ? { Authorization: `Token ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        const raw = await res.text();
        throw new Error(raw || l("تعذر رفع اللوغو.", "Logo yuklenemedi.", "Unable to upload logo."));
      }
      await loadPdfAssets();
      setStatus(l("تم رفع اللوغو بنجاح.", "Logo basariyla yuklendi.", "Logo uploaded successfully."));
    } finally {
      setPdfUploading(false);
    }
  };

  const openPdfSettingsPreview = async () => {
    setError("");
    const token = getToken();
    if (!token) {
      setError(l("سجّل الدخول لمعاينة PDF.", "PDF onizleme icin giris yapin.", "Sign in to preview PDF."));
      return;
    }
    const kind = pdfDoc === "global" ? "voucher_customer" : pdfDoc;
    setPdfPreviewLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/pdf-settings/preview/?kind=${encodeURIComponent(kind)}&lang=${encodeURIComponent(lang)}`,
        { headers: { Authorization: `Token ${token}` } }
      );
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw.slice(0, 280) || l(`خطأ ${response.status}`, `Hata ${response.status}`, `Error ${response.status}`));
      }
      const blob = await response.blob();
      openPdfBlobWithFallback(blob, { mode: "preview", downloadFileName: `pdf-preview-${kind}.pdf` });
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر فتح المعاينة.", "Onizleme acilamadi.", "Unable to open preview."));
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== "pdf") return;
    void loadPdfAssets();
    void loadPdfSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pdfDoc]);

  // Auto-save PDF settings (applies immediately)
  useEffect(() => {
    if (tab !== "pdf") return;
    // debounce to avoid saving on every keystroke/slider tick
    setPdfAutoSaveState("saving");
    setPdfAutoSaveError("");
    const handle = window.setTimeout(() => {
      void savePdfSettings()
        .then(() => {
          setPdfAutoSaveState("saved");
          window.setTimeout(() => setPdfAutoSaveState("idle"), 1200);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "";
          setPdfAutoSaveError(msg || l("تعذر حفظ إعدادات PDF تلقائياً.", "PDF ayarlari otomatik kaydedilemedi.", "Unable to auto-save PDF settings."));
          setPdfAutoSaveState("error");
        });
    }, 650);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pdfDoc, pdfLogoAssetId, pdfCfg]);

  const inScope = (key: string) => {
    if (dropdownScope === "all") return true;
    if (dropdownScope === "hotels") return key.startsWith("hotel_");
    if (dropdownScope === "hr") return key.startsWith("hr_");
    if (dropdownScope === "bookings") return key.startsWith("booking_");
    if (dropdownScope === "accounting") return key.startsWith("accounting_");
    if (dropdownScope === "common") return key.startsWith("common_");
    return (
      !key.startsWith("hotel_") &&
      !key.startsWith("hr_") &&
      !key.startsWith("booking_") &&
      !key.startsWith("accounting_") &&
      !key.startsWith("common_")
    );
  };
  const filteredCategories = categories.filter((item) =>
    inScope(item.key) &&
    `${item.name} ${item.key} ${item.description}`.toLowerCase().includes(dropdownSearch.toLowerCase())
  );
  const optionsForSelectedCategory = useMemo(() => {
    if (typeof selectedCategoryId !== "number") return [];
    return options.filter((o) => o.category === selectedCategoryId);
  }, [options, selectedCategoryId]);

  const filteredAppSectionRows = appSectionRows.filter((row) =>
    `${row.label} ${row.section}`.toLowerCase().includes(appSectionListSearch.toLowerCase()),
  );
  const moduleSectionLabelFor = (key: NavKey): string =>
    String((t as Record<string, string>)[key] ?? MODULE_UI_SECTIONS.find((s) => s.key === key)?.label ?? key);
  const moduleSettingTextFor = (row: (typeof MODULE_SETTINGS_REGISTRY)[number]): { label: string; description: string } => {
    const id = `${row.module}.${row.key}`;
    const map: Record<string, { label: string; description: string }> = {
      "bookings.page_title": {
        label: l("عنوان صفحة الحجوزات", "Rezervasyon sayfasi basligi", "Bookings page title"),
        description: l(
          "العنوان الرئيسي الظاهر أعلى صفحة الحجوزات.",
          "Rezervasyon sayfasinin ustunde gorunen ana baslik.",
          "Main title shown at the top of bookings page.",
        ),
      },
      "bookings.show_guest_list": {
        label: l("إظهار قسم قائمة النزلاء", "Misafir listesi bolumunu goster", "Show guest list section"),
        description: l(
          "إظهار/إخفاء بطاقة النزلاء في واجهة الحجوزات.",
          "Rezervasyon arayuzunde misafir kartini goster/gizle.",
          "Show/Hide guest card in bookings UI.",
        ),
      },
      "hotels.page_title": {
        label: l("عنوان صفحة الفنادق", "Oteller sayfasi basligi", "Hotels page title"),
        description: l(
          "العنوان الرئيسي الظاهر أعلى صفحة الفنادق.",
          "Oteller sayfasinin ustunde gorunen ana baslik.",
          "Main title shown at the top of hotels page.",
        ),
      },
      "hotels.show_booking_filters": {
        label: l("إظهار فلاتر الحجوزات", "Rezervasyon filtrelerini goster", "Show booking filters"),
        description: l(
          "إظهار/إخفاء قسم فلاتر وإحصائيات حجوزات الفنادق.",
          "Oteller rezervasyon filtreleri ve istatistikleri bolumunu goster/gizle.",
          "Show/Hide hotels booking filters and stats section.",
        ),
      },
      "flights.page_title": {
        label: l("عنوان صفحة الطيران", "Ucus sayfasi basligi", "Flights page title"),
        description: l("عنوان صفحة تذاكر الطيران.", "Ucus biletleri sayfasinin basligi.", "Title of flights tickets page."),
      },
      "flights.default_status": {
        label: l("الحالة الافتراضية للتذكرة", "Varsayilan bilet durumu", "Default ticket status"),
        description: l(
          "القيمة الافتراضية لحالة التذكرة الجديدة.",
          "Yeni bilet durumunun varsayilan degeri.",
          "Default value for new ticket status.",
        ),
      },
      "expenses.page_title": {
        label: l("عنوان صفحة المصاريف", "Giderler sayfasi basligi", "Expenses page title"),
        description: l(
          "العنوان الرئيسي الظاهر أعلى صفحة المصاريف.",
          "Giderler sayfasinin ustunde gorunen ana baslik.",
          "Main title shown at the top of expenses page.",
        ),
      },
      "expenses.default_payment_status": {
        label: l("حالة السداد الافتراضية", "Varsayilan odeme durumu", "Default payment status"),
        description: l(
          "الحالة الافتراضية لسداد المصروف عند الإنشاء.",
          "Gider olustururken varsayilan odeme durumu.",
          "Default expense payment status on creation.",
        ),
      },
      "accounting.page_title": {
        label: l("عنوان صفحة المحاسبة", "Muhasebe sayfasi basligi", "Accounting page title"),
        description: l(
          "العنوان الرئيسي الظاهر أعلى صفحة المحاسبة.",
          "Muhasebe sayfasinin ustunde gorunen ana baslik.",
          "Main title shown at the top of accounting page.",
        ),
      },
      "accounting.default_tab": {
        label: l("التبويب الافتراضي", "Varsayilan sekme", "Default tab"),
        description: l(
          "التبويب الافتراضي عند فتح صفحة المحاسبة.",
          "Muhasebe sayfasi acildiginda varsayilan sekme.",
          "Default tab when opening accounting page.",
        ),
      },
    };
    return map[id] || { label: row.label, description: row.description };
  };
  const filteredReferrers = referrers.filter((item) =>
    `${item.referrer_code} ${item.name} ${item.phone} ${item.email} ${item.notes}`
      .toLowerCase()
      .includes(referrerSearch.toLowerCase())
  );
  const filteredAppSettings = appSettings
    .filter((item) => {
      if (appSectionFocus !== null && item.section !== appSectionFocus) return false;
      return `${item.section} ${item.key} ${item.label} ${item.description} ${item.value}`
        .toLowerCase()
        .includes(appSearch.toLowerCase());
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const moduleRows = MODULE_SETTINGS_REGISTRY.filter((row) => row.module === moduleFocus).filter((row) => {
    const tx = moduleSettingTextFor(row);
    return `${tx.label} ${row.key} ${tx.description}`.toLowerCase().includes(moduleSearch.toLowerCase());
  });

  const parseModuleDefault = (valueType: SettingValueType, raw: string): string => {
    if (valueType === "boolean") {
      const v = String(raw || "").trim().toLowerCase();
      return ["1", "true", "yes", "on"].includes(v) ? "true" : "false";
    }
    if (valueType === "number") {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : "0";
    }
    if (valueType === "json") {
      try {
        return raw ? JSON.stringify(JSON.parse(raw)) : "{}";
      } catch {
        return "{}";
      }
    }
    return String(raw || "");
  };

  const loadModuleDraft = (moduleName: NavKey) => {
    const next: Record<string, string> = {};
    const rows = MODULE_SETTINGS_REGISTRY.filter((row) => row.module === moduleName);
    for (const row of rows) {
      const fullKey = moduleSettingKey(moduleName, row.key);
      const existing = appSettings.find((x) => x.section === "ui" && x.key === fullKey);
      next[row.key] = existing?.value ?? parseModuleDefault(row.valueType, row.defaultValue);
    }
    setModuleSettingsDraft(next);
  };

  const saveModuleSettings = async () => {
    try {
      let changed = 0;
      for (const row of MODULE_SETTINGS_REGISTRY.filter((x) => x.module === moduleFocus)) {
        const tx = moduleSettingTextFor(row);
        const key = moduleSettingKey(moduleFocus, row.key);
        const value = parseModuleDefault(row.valueType, moduleSettingsDraft[row.key] ?? row.defaultValue);
        const existing = appSettings.find((x) => x.section === "ui" && x.key === key);
        if (existing) {
          await api.patch(`/app-settings/${existing.id}`, {
            section: "ui",
            key,
            label: tx.label,
            value,
            description: `${tx.description} (type=${row.valueType})`,
          });
        } else {
          await api.post("/app-settings", {
            section: "ui",
            key,
            label: tx.label,
            value,
            description: `${tx.description} (type=${row.valueType})`,
          });
        }
        changed += 1;
      }
      await loadAppSettings();
      invalidateModuleSettingsCache();
      setStatus(
        l(
          `تم حفظ إعدادات واجهة قسم ${moduleFocus}. (${changed})`,
          `${moduleFocus} bolumu arayuz ayarlari kaydedildi. (${changed})`,
          `${moduleFocus} module UI settings saved. (${changed})`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حفظ إعدادات الأقسام.", "Bolum ayarlari kaydedilemedi.", "Unable to save module settings."));
    }
  };

  const customModuleRows = appSettings
    .filter(
      (row) =>
        row.section === "ui" &&
        row.key.startsWith(`${moduleFocus}.ui.`) &&
        !MODULE_SETTINGS_REGISTRY.some((def) => moduleSettingKey(def.module, def.key) === row.key),
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  const addCustomModuleKey = async () => {
    const suffix = moduleCustomForm.key.trim().toLowerCase();
    if (!suffix) {
      setError(l("أدخل اسم المفتاح.", "Anahtar adini girin.", "Enter key name."));
      return;
    }
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(suffix)) {
      setError(
        l(
          "صيغة المفتاح غير صحيحة. استخدم a-z 0-9 مع . _ -",
          "Anahtar formati gecersiz. a-z 0-9 ve . _ - kullanin.",
          "Invalid key format. Use a-z 0-9 with . _ -",
        ),
      );
      return;
    }
    try {
      const fullKey = `${moduleFocus}.ui.${suffix}`;
      await api.post("/app-settings", {
        section: "ui",
        key: fullKey,
        label: moduleCustomForm.label.trim(),
        value: moduleCustomForm.value,
        description: moduleCustomForm.description.trim(),
      });
      await loadAppSettings();
      invalidateModuleSettingsCache();
      setModuleCustomForm({ key: "", label: "", value: "", description: "" });
      setStatus(l(`تمت إضافة المفتاح ${fullKey}`, `${fullKey} anahtari eklendi`, `Added key ${fullKey}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إضافة المفتاح.", "Anahtar eklenemedi.", "Unable to add key."));
    }
  };

  const deleteCustomModuleKey = async (id: number) => {
    try {
      await api.delete(`/app-settings/${id}`);
      await loadAppSettings();
      invalidateModuleSettingsCache();
      setStatus(l("تم حذف المفتاح.", "Anahtar silindi.", "Key deleted."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر حذف المفتاح.", "Anahtar silinemedi.", "Unable to delete key."));
    }
  };

  const resetModuleSettings = async () => {
    try {
      const sectionRows = appSettings.filter(
        (row) => row.section === "ui" && row.key.startsWith(`${moduleFocus}.ui.`),
      );
      await Promise.all(sectionRows.map((row) => api.delete(`/app-settings/${row.id}`)));
      await loadAppSettings();
      loadModuleDraft(moduleFocus);
      invalidateModuleSettingsCache();
      setStatus(
        l(
          `تمت إعادة تعيين إعدادات قسم ${moduleFocus} إلى الافتراضي.`,
          `${moduleFocus} bolumu ayarlari varsayilana sifirlandi.`,
          `${moduleFocus} module settings reset to default.`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إعادة تعيين إعدادات القسم.", "Bolum ayarlari sifirlanamadi.", "Unable to reset module settings."));
    }
  };

  const exportModuleSnapshot = () => {
    const rows = MODULE_SETTINGS_REGISTRY.filter((row) => row.module === moduleFocus).map((row) => ({
      ...moduleSettingTextFor(row),
      key: moduleSettingKey(moduleFocus, row.key),
      value: parseModuleDefault(row.valueType, moduleSettingsDraft[row.key] ?? row.defaultValue),
      valueType: row.valueType,
    }));
    const payload = {
      section: "ui",
      module: moduleFocus,
      exported_at: new Date().toISOString(),
      rows,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `settings-${moduleFocus}.snapshot.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const importModuleSnapshot = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as {
        section?: string;
        module?: string;
        rows?: Array<{ key?: string; value?: string; label?: string; description?: string }>;
      };
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      await api.post("/app-settings/snapshot-import", {
        mode: "upsert",
        section: "ui",
        rows: rows.map((row) => ({
          section: "ui",
          key: row.key || "",
          value: row.value || "",
          label: row.label || "",
          description: row.description || "",
        })),
      });
      await loadAppSettings();
      invalidateModuleSettingsCache();
      setStatus(l("تم استيراد Snapshot الإعدادات بنجاح.", "Ayar Snapshot basariyla ice aktarildi.", "Settings snapshot imported successfully."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر استيراد ملف Snapshot.", "Snapshot dosyasi ice aktarilamadi.", "Unable to import snapshot file."));
    }
  };

  useEffect(() => {
    if (tab !== "modules") return;
    loadModuleDraft(moduleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, moduleFocus, appSettings.length]);
  const optionCategoryKey = getCategoryKey(optionForm.category);
  const optionIsHotelKinds = optionCategoryKey === DROPDOWN_CATEGORY_KEYS.hotelRoomKind;
  const optionIsHrDepartment = optionCategoryKey === DROPDOWN_CATEGORY_KEYS.hrDepartment;
  const optionIsHrPosition = optionCategoryKey === DROPDOWN_CATEGORY_KEYS.hrPosition;
  const optionEditCategoryKey = getCategoryKey(optionEditForm?.category || "");
  const optionEditIsHotelKinds = optionEditCategoryKey === DROPDOWN_CATEGORY_KEYS.hotelRoomKind;
  const optionEditIsHrDepartment = optionEditCategoryKey === DROPDOWN_CATEGORY_KEYS.hrDepartment;
  const optionEditIsHrPosition = optionEditCategoryKey === DROPDOWN_CATEGORY_KEYS.hrPosition;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.settings}</h1>
          <p className="text-sm text-zinc-500">{t.settingsSubtitle}</p>
        </div>
        <ImportExportActions
          exportUrl={`${API_BASE}/dropdown-options/export/`}
          importUrl={`${API_BASE}/dropdown-options/import_xlsx/`}
          onImported={loadDropdowns}
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-emerald-100 bg-[#f0fdf4]/80 p-3 mb-card-ai">
        {tabBtn("dropdowns", t.settingsTabDropdowns)}
        {tabBtn("app", t.settingsTabApp)}
        {tabBtn("modules", l("مركز إعدادات الأقسام", "Bolum ayarlari merkezi", "Module settings center"))}
        {tabBtn("pdf", t.settingsTabPdf, <PdfDocIcon />)}
      </div>
      {status && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{status}</div>}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
            onClick={() => {
              setError("");
              void loadDropdowns().catch((err) => {
                const msg = err instanceof Error ? err.message : "";
                setError(
                  msg
                    ? l(
                        `تعذر تحميل إعدادات القوائم المنسدلة. (${msg})`,
                        `Acilir liste ayarlari yuklenemedi. (${msg})`,
                        `Unable to load dropdown settings. (${msg})`,
                      )
                    : l("تعذر تحميل إعدادات القوائم المنسدلة.", "Acilir liste ayarlari yuklenemedi.", "Unable to load dropdown settings."),
                );
              });
            }}
          >
            {l("إعادة المحاولة", "Tekrar dene", "Retry")}
          </button>
        </div>
      )}

      {tab === "dropdowns" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-[#ecfdf5] px-4 py-3 text-sm text-emerald-950">
            <p className="font-semibold text-emerald-900">
              {l("مسار بسيط: قسم → فئة → كل التفاصيل", "Basit akis: bolum -> kategori -> tum detaylar", "Simple flow: section -> category -> all details")}
            </p>
            <ol className="mt-2 list-decimal list-inside space-y-1 text-emerald-900/90">
              <li>
                <strong>{l("القسم الأعلى:", "Ust seviye:", "Top level:")}</strong>{" "}
                {l("التبويبات أعلاه (قوائم / مُحيلون / تطبيق).", "Yukaridaki sekmeler (listeler / yonlendirenler / uygulama).", "The tabs above (lists / referrers / app).")}
              </li>
              <li>
                <strong>{l("الفئة:", "Kategori:", "Category:")}</strong>{" "}
                {l("العمود الأوسط — كل قائمة منسدلة في النظام.", "Orta sutun - sistemdeki her acilir liste.", "Middle column - every dropdown list in the system.")}
              </li>
              <li>
                <strong>{l("التفاصيل:", "Detaylar:", "Details:")}</strong>{" "}
                {l(
                  "اليمين — تعديل الفئة بالكامل ثم كل خياراتها (بدون استثناء).",
                  "Sag taraf - kategoriyi tamamen, sonra tum seceneklerini duzenleyin.",
                  "Right side - edit the full category, then all its options.",
                )}
              </li>
            </ol>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <aside className="lg:col-span-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <SettingsFieldLabel htmlFor="settings-dropdown-search" icon={<SearchIcon />} hint={l("تصفية الفئات حسب الاسم أو المفتاح.", "Kategorileri ad veya anahtara gore filtrele.", "Filter categories by name or key.")}>
                {l("بحث في الفئات والمفاتيح", "Kategori ve anahtarlarda ara", "Search categories and keys")}
              </SettingsFieldLabel>
              <input
                id="settings-dropdown-search"
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={l("اكتب للتصفية...", "Filtrelemek icin yazin...", "Type to filter...")}
                value={dropdownSearch}
                onChange={(e) => setDropdownSearch(e.target.value)}
              />
              <SettingsFieldLabel htmlFor="settings-dropdown-scope" icon={<TagIcon />} hint={l("اختر أي جزء من النظام تريد ضبط قوائمه.", "Listelerini ayarlamak istediginiz sistem kismini secin.", "Choose which system area you want to configure.")}>
                {l("نطاق العرض (فرع النظام)", "Gorunum kapsami (sistem alani)", "Display scope (system area)")}
              </SettingsFieldLabel>
              <TypeableSelect
                id="settings-dropdown-scope"
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={l("اختر النطاق", "Kapsam secin", "Select scope")}
                value={dropdownScope}
                onChange={(e) =>
                  setDropdownScope(
                    e.target.value as
                      | "all"
                      | "core"
                      | "hotels"
                      | "hr"
                      | "bookings"
                      | "accounting"
                      | "common",
                  )
                }
              >
                <option value="all">{l("كل الفروع", "Tum alanlar", "All areas")}</option>
                <option value="hotels">{l("فنادق وغرف", "Oteller ve odalar", "Hotels & rooms")}</option>
                <option value="hr">{l("موارد بشرية", "Insan kaynaklari", "Human resources")}</option>
                <option value="bookings">{l("حجوزات", "Rezervasyonlar", "Bookings")}</option>
                <option value="accounting">{l("محاسبة", "Muhasebe", "Accounting")}</option>
                <option value="common">{l("عام (common_)", "Genel (common_)", "Common (common_)")}</option>
                <option value="core">{l("عام بدون البادئات أعلاه", "Yukaridaki on ekler olmadan genel", "Core without above prefixes")}</option>
              </TypeableSelect>
              <button
                type="button"
                className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
                onClick={ensurePresetCategories}
              >
                {l("تجهيز الفئات الافتراضية", "Varsayilan kategorileri hazirla", "Prepare default categories")}
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
                onClick={ensurePresetOptions}
              >
                {l("تجهيز خيارات كل الفئات", "Tum kategori seceneklerini hazirla", "Prepare options for all categories")}
              </button>
              <button
                type="button"
                className="w-full rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-800"
                onClick={() => setSelectedCategoryId("new")}
              >
                {l("+ فئة قائمة جديدة", "+ Yeni liste kategorisi", "+ New list category")}
              </button>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {l("استيراد/تصدير Excel من أعلى الصفحة.", "Excel ice/disa aktarma ust kisimdadir.", "Excel import/export is at the top of the page.")}
              </p>
            </aside>

            <section className="lg:col-span-4 flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
                {l("الفئات", "Kategoriler", "Categories")} <span className="font-normal text-zinc-500">({filteredCategories.length})</span>
              </div>
              <div className="min-h-[360px] max-h-[620px] overflow-y-auto p-2 space-y-1">
                {filteredCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-right text-sm transition ${
                      selectedCategoryId === category.id
                        ? "border-emerald-500 bg-emerald-50 shadow-sm"
                        : "border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="font-medium text-zinc-900">{category.name}</div>
                    <div className="truncate text-[11px] text-zinc-500">{category.key}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-400">
                      {l("ترتيب", "Sira", "Order")} {category.sort_order} ·{" "}
                      {category.is_active ? l("نشط", "Aktif", "Active") : l("موقوف", "Pasif", "Inactive")}
                    </div>
                  </button>
                ))}
                {!filteredCategories.length && <p className="p-4 text-center text-sm text-zinc-400">{t.commonNoData}</p>}
              </div>
            </section>

            <section className="lg:col-span-5 space-y-4">
              {selectedCategoryId === null && (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-8 text-center text-sm text-zinc-500">
                  {l("اختر فئة من الوسط لعرض كل حقولها وخياراتها هنا.", "Tum alanlari ve secenekleri gormek icin ortadan bir kategori secin.", "Select a category from the middle to view all its fields and options here.")}
                </div>
              )}

              {(selectedCategoryId === "new" || typeof selectedCategoryId === "number") && (
                <form
                  onSubmit={saveCategoryPanel}
                  className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {selectedCategoryId === "new" ? t.settingsNewCategory : l("بيانات الفئة (كل الحقول)", "Kategori bilgileri (tum alanlar)", "Category data (all fields)")}
                  </h3>
                  <SettingsFieldLabel htmlFor="settings-cat-name" icon={<TagIcon />} hint={l("الاسم الظاهر للمستخدمين في الواجهات.", "Arayuzde kullanicilara gorunen ad.", "Name shown to users in the UI.")}>
                    {t.settingsCategoryName}
                  </SettingsFieldLabel>
                  <input
                    id="settings-cat-name"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("مثال: أنواع الغرف", "Ornek: Oda turleri", "Example: Room types")}
                    value={categoryPanelDraft.name}
                    onChange={(e) =>
                      setCategoryPanelDraft((prev) => ({ ...prev, name: e.target.value }))
                    }
                    required
                  />
                  <SettingsFieldLabel htmlFor="settings-cat-key" icon={<TagIcon />} hint={l("مفتاح فريد (slug) يستخدمه النظام داخليًا.", "Sistemde dahili kullanilan benzersiz anahtar (slug).", "Unique key (slug) used internally by the system.")}>
                    {t.settingsCategoryKey}
                  </SettingsFieldLabel>
                  <input
                    id="settings-cat-key"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("مثال: hotel_room_type", "Ornek: hotel_room_type", "Example: hotel_room_type")}
                    value={categoryPanelDraft.key}
                    onChange={(e) =>
                      setCategoryPanelDraft((prev) => ({ ...prev, key: e.target.value }))
                    }
                    required
                  />
                  <SettingsFieldLabel htmlFor="settings-cat-desc" icon={<NotesIcon />} hint={l("شرح مختصر لاستخدام هذه القائمة (اختياري).", "Bu listenin kullanimi icin kisa aciklama (istege bagli).", "Short description of this list usage (optional).")}>
                    {l("وصف الفئة (اختياري)", "Kategori aciklamasi (istege bagli)", "Category description (optional)")}
                  </SettingsFieldLabel>
                  <textarea
                    id="settings-cat-desc"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("شرح مختصر لاستخدام هذه القائمة في النظام", "Bu listenin sistemde kullanimina dair kisa aciklama", "Short explanation of this list usage in the system")}
                    value={categoryPanelDraft.description}
                    onChange={(e) =>
                      setCategoryPanelDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={2}
                  />
                  <SettingsFieldLabel htmlFor="settings-cat-sort" icon={<TagIcon />} hint={l("0 يعني أعلى القائمة.", "0 listenin en ustudur.", "0 means top of the list.")}>
                    {l("ترتيب الظهور بين الفئات", "Kategoriler arasi gorunum sirasi", "Display order between categories")}
                  </SettingsFieldLabel>
                  <input
                    id="settings-cat-sort"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    type="number"
                    placeholder={l("0 = أعلى القائمة", "0 = listenin ustu", "0 = top of list")}
                    value={categoryPanelDraft.sort_order}
                    onChange={(e) =>
                      setCategoryPanelDraft((prev) => ({
                        ...prev,
                        sort_order: Number(e.target.value || 0),
                      }))
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryPanelDraft.is_active}
                      onChange={(e) =>
                        setCategoryPanelDraft((prev) => ({
                          ...prev,
                          is_active: e.target.checked,
                        }))
                      }
                    />
                    {l("فئة نشطة", "Aktif kategori", "Active category")}
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="submit"
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
                    >
                      {t.commonSave}
                    </button>
                    {typeof selectedCategoryId === "number" && (
                      <button
                        type="button"
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 inline-flex items-center justify-center gap-1"
                        aria-label={t.settingsDeleteCategory}
                        title={t.settingsDeleteCategory}
                        onClick={() =>
                          deleteRow("dropdown-categories", selectedCategoryId, () => {
                            setCategories((prev) =>
                              prev.filter((item) => item.id !== selectedCategoryId),
                            );
                            setSelectedCategoryId(null);
                          })
                        }
                      >
                        <TrashGlyph />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 px-4 py-2 text-sm"
                      onClick={() => setSelectedCategoryId(null)}
                    >
                      {l("إلغاء التحديد", "Secimi kaldir", "Clear selection")}
                    </button>
                  </div>
                </form>
              )}

              {typeof selectedCategoryId === "number" && (
                <>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <h4 className="text-sm font-semibold text-zinc-800">
                      {l("خيارات الفئة", "Kategori secenekleri", "Category options")} ({optionsForSelectedCategory.length})
                    </h4>
                    <div className="mt-2 max-h-44 space-y-2 overflow-y-auto text-sm">
                      {optionsForSelectedCategory.map((option) => (
                        <div
                          key={option.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50/80 px-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{option.label}</div>
                            <div className="text-[11px] text-zinc-500">{option.value}</div>
                            {!option.is_active && (
                              <span className="text-[10px] text-orange-700">{l("موقوف", "Pasif", "Inactive")}</span>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-emerald-200 p-1.5 text-emerald-800"
                              aria-label={t.settingsEditOption}
                              title={t.settingsEditOption}
                              onClick={() => {
                                setEditingOptionId(option.id);
                                setOptionEditForm({
                                  category: String(option.category),
                                  label: option.label,
                                  value: option.value,
                                  description: option.description || "",
                                  color: option.color || "",
                                  sort_order: option.sort_order || 0,
                                  meta_text: JSON.stringify(option.meta || {}, null, 2),
                                  meta_details_text: metaToDetailsText(option.meta),
                                  max_guests: String((option.meta || {}).max_guests || ""),
                                  department_code: String(
                                    (option.meta || {}).department_code || "",
                                  ),
                                  department_manager: String(
                                    (option.meta || {}).department_manager || "",
                                  ),
                                  position_grade: String((option.meta || {}).position_grade || ""),
                                  default_salary: String((option.meta || {}).default_salary || ""),
                                  is_active: option.is_active,
                                });
                              }}
                            >
                              <PencilGlyph className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-red-200 p-1.5 text-red-700"
                              aria-label={t.commonDelete}
                              title={t.commonDelete}
                              onClick={() =>
                                deleteRow("dropdown-options", option.id, () =>
                                  setOptions((prev) =>
                                    prev.filter((item) => item.id !== option.id),
                                  ),
                                )
                              }
                            >
                              <TrashGlyph className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!optionsForSelectedCategory.length && (
                        <p className="text-xs text-zinc-400">{l("لا خيارات بعد لهذه الفئة.", "Bu kategori icin henuz secenek yok.", "No options yet for this category.")}</p>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={addOrUpdateOption}
                    className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <h4 className="text-sm font-semibold">{t.settingsNewOption}</h4>
                    <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
                      {l("الفئة الحالية", "Mevcut kategori", "Current category")}: <span className="font-semibold">{selectedCategoryName}</span> (#
                      {selectedCategoryId})
                    </div>
                    <SettingsFieldLabel htmlFor="settings-opt-label" icon={<TagIcon />} hint={l("النص الظاهر في القوائم المنسدلة.", "Acilir listelerde gorunen metin.", "Text shown in dropdowns.")}>
                      {t.settingsOptionLabel}
                    </SettingsFieldLabel>
                    <input
                      id="settings-opt-label"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("النص الظاهر في الواجهات", "Arayuzde gorunen metin", "Visible text in interfaces")}
                      value={optionForm.label}
                      onChange={(e) => setOptionForm((prev) => ({ ...prev, label: e.target.value }))}
                      required
                    />
                    <SettingsFieldLabel htmlFor="settings-opt-value" icon={<TagIcon />} hint={uiWords.storedValueHint}>
                      {t.settingsOptionValue}
                    </SettingsFieldLabel>
                    <input
                      id="settings-opt-value"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={uiWords.storedValuePlaceholder}
                      value={optionForm.value}
                      onChange={(e) => setOptionForm((prev) => ({ ...prev, value: e.target.value }))}
                      required
                    />
                    <SettingsFieldLabel htmlFor="settings-opt-desc" icon={<NotesIcon />} hint={l("شرح اختياري يظهر للموظفين.", "Personel icin gorunen istege bagli aciklama.", "Optional description shown to staff.")}>
                      {l("وصف الخيار", "Secenek aciklamasi", "Option description")}
                    </SettingsFieldLabel>
                    <textarea
                      id="settings-opt-desc"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("تفسير اختياري للموظفين", "Personel icin istege bagli aciklama", "Optional explanation for staff")}
                      value={optionForm.description}
                      onChange={(e) =>
                        setOptionForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={2}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="min-w-0">
                        <SettingsFieldLabel htmlFor="settings-opt-color" icon={<TagIcon />} hint={l("مثال: #22c55e (اختياري).", "Ornek: #22c55e (istege bagli).", "Example: #22c55e (optional).")}>
                          {l("لون مرتبط (HEX أو قيمة نصية)", "Ilgili renk (HEX veya metin)", "Associated color (HEX or text value)")}
                        </SettingsFieldLabel>
                        <input
                          id="settings-opt-color"
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          placeholder="#22c55e"
                          value={optionForm.color}
                          onChange={(e) => setOptionForm((prev) => ({ ...prev, color: e.target.value }))}
                        />
                      </div>
                      <div className="min-w-0">
                        <SettingsFieldLabel htmlFor="settings-opt-sort" icon={<TagIcon />} hint={uiWords.sortOptionHint}>
                          {uiWords.sortOptionLabel}
                        </SettingsFieldLabel>
                        <input
                          id="settings-opt-sort"
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          type="number"
                          placeholder="0"
                          value={optionForm.sort_order}
                          onChange={(e) =>
                            setOptionForm((prev) => ({
                              ...prev,
                              sort_order: Number(e.target.value || 0),
                            }))
                          }
                        />
                      </div>
                    </div>
                    {optionIsHotelKinds && (
                      <>
                        <SettingsFieldLabel htmlFor="settings-opt-max-guests">{l("سعة النوع (عدد الأشخاص)", "Tur kapasitesi (kisi sayisi)", "Type capacity (number of people)")}</SettingsFieldLabel>
                        <input
                          id="settings-opt-max-guests"
                          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                          type="number"
                          min={1}
                          max={99}
                          placeholder="2"
                        value={optionForm.max_guests}
                        onChange={(e) =>
                          setOptionForm((prev) => ({ ...prev, max_guests: e.target.value }))
                        }
                      />
                      </>
                    )}
                    {optionIsHrDepartment && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="min-w-0">
                          <SettingsFieldLabel htmlFor="settings-opt-dept-code">{l("كود القسم", "Bolum kodu", "Department code")}</SettingsFieldLabel>
                          <input
                            id="settings-opt-dept-code"
                            className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                            placeholder={l("مثال: FIN", "Ornek: FIN", "Example: FIN")}
                            value={optionForm.department_code}
                            onChange={(e) =>
                              setOptionForm((prev) => ({
                                ...prev,
                                department_code: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <SettingsFieldLabel htmlFor="settings-opt-dept-mgr">{l("اسم مدير القسم", "Bolum yoneticisi adi", "Department manager name")}</SettingsFieldLabel>
                          <input
                            id="settings-opt-dept-mgr"
                            className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                            placeholder={l("اختياري", "Istege bagli", "Optional")}
                            value={optionForm.department_manager}
                            onChange={(e) =>
                              setOptionForm((prev) => ({
                                ...prev,
                                department_manager: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    {optionIsHrPosition && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="min-w-0">
                          <SettingsFieldLabel htmlFor="settings-opt-grade">{l("درجة / مستوى الوظيفة", "Pozisyon seviyesi / derecesi", "Job level / grade")}</SettingsFieldLabel>
                          <input
                            id="settings-opt-grade"
                            className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                            placeholder={l("مثال: L2", "Ornek: L2", "Example: L2")}
                            value={optionForm.position_grade}
                            onChange={(e) =>
                              setOptionForm((prev) => ({
                                ...prev,
                                position_grade: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <SettingsFieldLabel htmlFor="settings-opt-default-salary">{l("راتب افتراضي للمنصب", "Pozisyon icin varsayilan maas", "Default salary for position")}</SettingsFieldLabel>
                          <input
                            id="settings-opt-default-salary"
                            className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                            type="number"
                            min={0}
                            placeholder="0"
                            value={optionForm.default_salary}
                            onChange={(e) =>
                              setOptionForm((prev) => ({
                                ...prev,
                                default_salary: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    <SettingsFieldLabel htmlFor="settings-opt-meta-lines">{l("حقول إضافية (كل سطر: مفتاح=قيمة)", "Ek alanlar (her satir: anahtar=deger)", "Additional fields (each line: key=value)")}</SettingsFieldLabel>
                    <textarea
                      id="settings-opt-meta-lines"
                      className="w-full rounded-md mb-input-raised px-3 py-2 font-mono text-xs"
                      placeholder="department_floor=3"
                      value={optionForm.meta_details_text}
                      onChange={(e) =>
                        setOptionForm((prev) => ({
                          ...prev,
                          meta_details_text: e.target.value,
                        }))
                      }
                      rows={3}
                    />
                    <SettingsFieldLabel htmlFor="settings-opt-meta-json">{l("ميتا JSON (متقدم)", "Meta JSON (ileri)", "Meta JSON (advanced)")}</SettingsFieldLabel>
                    <textarea
                      id="settings-opt-meta-json"
                      className="w-full rounded-md mb-input-raised px-3 py-2 font-mono text-xs"
                      placeholder='{"icon":"star"}'
                      value={optionForm.meta_text}
                      onChange={(e) =>
                        setOptionForm((prev) => ({ ...prev, meta_text: e.target.value }))
                      }
                      rows={3}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={optionForm.is_active}
                        onChange={(e) =>
                          setOptionForm((prev) => ({ ...prev, is_active: e.target.checked }))
                        }
                      />
                      {l("خيار نشط", "Aktif secenek", "Active option")}
                    </label>
                    <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white" type="submit">
                      {t.commonSave}
                    </button>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "pdf" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                  <span className="text-zinc-500 [&>svg]:h-5 [&>svg]:w-5">
                    <PdfDocIcon />
                  </span>
                  PDF
                </h2>
                <p className="text-xs text-zinc-500">
                  {l(
                    "تحكم بإظهار/إخفاء الخانات والمربعات، الخطوط، اللوغو، وWatermark لكل ملف.",
                    "Her belge icin alanlari, kutulari, yazilari, logoyu ve filigrani goster/gizle ayarlari.",
                    "Control show/hide for fields, blocks, fonts, logo, and watermark per document.",
                  )}
                </p>
                <div className="mt-2 text-xs">
                  {pdfAutoSaveState === "saving" ? (
                    <span className="text-zinc-500">{l("جاري تطبيق التعديلات…", "Degisiklikler uygulaniyor...", "Applying changes...")}</span>
                  ) : pdfAutoSaveState === "saved" ? (
                    <span className="text-emerald-700">{l("تم تطبيق التعديلات.", "Degisiklikler uygulandi.", "Changes applied.")}</span>
                  ) : pdfAutoSaveState === "error" ? (
                    <span className="text-red-700">{pdfAutoSaveError || l("تعذر تطبيق التعديلات.", "Degisiklikler uygulanamadi.", "Unable to apply changes.")}</span>
                  ) : (
                    <span className="text-zinc-500">{l("أي تعديل هنا يطبق مباشرة على ملفات PDF.", "Buradaki her degisiklik PDF dosyalarina dogrudan uygulanir.", "Any change here is applied directly to PDF files.")}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  disabled={pdfPreviewLoading}
                  onClick={() => void openPdfSettingsPreview()}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pdfPreviewLoading ? l("جاري فتح المعاينة…", "Onizleme aciliyor...", "Opening preview...") : l("معاينة PDF", "PDF Onizleme", "PDF Preview")}
                </button>
                <div className="max-w-[220px] text-end text-[11px] leading-snug text-zinc-500">
                  {l(
                    "صفحة تجريبية بالإعدادات الحالية (انتظر ثانية بعد التعديل حتى يكتمل الحفظ التلقائي).",
                    "Mevcut ayarlarla test sayfasi (degisiklikten sonra otomatik kaydin tamamlanmasi icin 1 saniye bekleyin).",
                    "Test page with current settings (wait a second after changes for auto-save to complete).",
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <PdfDocIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  {l("لا حاجة للحفظ اليدوي", "Manuel kaydetmeye gerek yok", "No manual save needed")}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <PdfFieldLabel icon={<PdfLayersIcon />}>{l("نوع الملف", "Belge tipi", "Document type")}</PdfFieldLabel>
                <select
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={pdfDoc}
                  onChange={(e) => setPdfDoc(e.target.value as PdfDocumentScope)}
                >
                  <option value="global">{l("كل ملفات PDF (Global)", "Tum PDF dosyalari (Global)", "All PDF files (Global)")}</option>
                  <option value="voucher_customer">Voucher (Customer)</option>
                  <option value="voucher_hotel">Voucher (Hotel)</option>
                  <option value="invoice">Invoice</option>
                </select>
              </div>
              <div>
                <PdfFieldLabel icon={<PdfImageIcon />}>{l("اللوغو", "Logo", "Logo")}</PdfFieldLabel>
                <select
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={pdfLogoAssetId}
                  onChange={(e) => setPdfLogoAssetId(e.target.value)}
                >
                  <option value="">{l("(افتراضي)", "(Varsayilan)", "(Default)")}</option>
                  {pdfAssets.map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name || `Asset #${a.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <PdfFieldLabel icon={<PdfUploadIcon />}>{l("رفع لوغو جديد", "Yeni logo yukle", "Upload new logo")}</PdfFieldLabel>
                <input
                  type="file"
                  accept="image/*"
                  disabled={pdfUploading}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void uploadPdfLogo(file).catch((err) => {
                      const msg = err instanceof Error ? err.message : "";
                      setError(msg || l("تعذر رفع اللوغو.", "Logo yuklenemedi.", "Unable to upload logo."));
                    });
                  }}
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfEyeIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {l("إظهار/إخفاء أقسام", "Bolumleri goster/gizle", "Show/Hide sections")}
                  </div>
                  <div className="mt-2 space-y-2 text-sm">
                    {[
                      ["logo", l("اللوغو", "Logo", "Logo")],
                      ["bill_to", "Bill To"],
                      ["payment_details", l("تفاصيل الدفع", "Odeme detaylari", "Payment details")],
                      ["reservation_blocks", l("تفاصيل الحجز", "Rezervasyon detaylari", "Reservation details")],
                      ["cancellation", l("سياسة الإلغاء", "Iptal politikasi", "Cancellation policy")],
                      ["guest_list", l("قائمة الأسماء", "Isim listesi", "Name list")],
                      ["extras_fees", l("إضافات ورسوم", "Ekler ve ucretler", "Extras & fees")],
                      ["details_card", l("معلومات إضافية", "Ek bilgiler", "Additional details")],
                      ["summary", l("الملخص", "Ozet", "Summary")],
                      ["footer", "Footer"],
                      ["booking_meta", "Hotel booking meta"],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-zinc-700">
                          <span className="text-zinc-400 [&>svg]:h-3.5 [&>svg]:w-3.5">
                            {PDF_SECTION_TOGGLE_ICONS[k] ?? <PdfDocIcon />}
                          </span>
                          {label}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(pdfCfg.sections[k])}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              sections: { ...p.sections, [k]: e.target.checked },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfEyeIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    Extras & fees fields
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {l(
                      "تحكم بخانات صندوق Extras & fees. التعديل يطبق حسب نوع ملف PDF المختار.",
                      "Extras & fees alanlarini yonetin. Degisiklik secilen PDF turune gore uygulanir.",
                      "Control Extras & fees fields. Changes apply by selected PDF type.",
                    )}
                  </p>
                  <div className="mt-2 space-y-2 text-sm">
                    {[
                      ["extra_bed", "Extra bed"],
                      ["promotion_room", "Promotion room"],
                      ["honey_moons", "Honey moons"],
                      ["free_of_charge", "Free of charge"],
                      ["package_splitting", "Package splitting"],
                      ["bubble", "Bubble"],
                      ["passive", "Passive"],
                      ["free_sale", "Free sale"],
                    ].map(([k, label]) => (
                      <label key={k} className="flex items-center justify-between gap-2">
                        <span className="text-zinc-700">{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(pdfCfg.extras_fields?.[k as keyof NonNullable<PdfCfgState["extras_fields"]>])}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              extras_fields: {
                                extra_bed: p.extras_fields?.extra_bed ?? true,
                                promotion_room: p.extras_fields?.promotion_room ?? true,
                                honey_moons: p.extras_fields?.honey_moons ?? true,
                                free_of_charge: p.extras_fields?.free_of_charge ?? true,
                                package_splitting: p.extras_fields?.package_splitting ?? true,
                                bubble: p.extras_fields?.bubble ?? true,
                                passive: p.extras_fields?.passive ?? true,
                                free_sale: p.extras_fields?.free_sale ?? true,
                                ...(k === "extra_bed" ? { extra_bed: e.target.checked } : {}),
                                ...(k === "promotion_room" ? { promotion_room: e.target.checked } : {}),
                                ...(k === "honey_moons" ? { honey_moons: e.target.checked } : {}),
                                ...(k === "free_of_charge" ? { free_of_charge: e.target.checked } : {}),
                                ...(k === "package_splitting" ? { package_splitting: e.target.checked } : {}),
                                ...(k === "bubble" ? { bubble: e.target.checked } : {}),
                                ...(k === "passive" ? { passive: e.target.checked } : {}),
                                ...(k === "free_sale" ? { free_sale: e.target.checked } : {}),
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfDocIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {l("مستطيل معلومات الدفع (Voucher/Invoice)", "Odeme bilgi kutusu (Voucher/Invoice)", "Payment info box (Voucher/Invoice)")}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {l(
                      "هذا المستطيل يظهر داخل ملف PDF ويعرض معلومات الدفع ورابط الدفع حسب الإعدادات هنا.",
                      "Bu kutu PDF icinde gorunur ve buradaki ayarlara gore odeme bilgisi ve baglantisini gosterir.",
                      "This box appears in PDF and shows payment info/link based on these settings.",
                    )}
                  </p>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-700">{l("إظهار المستطيل", "Kutuyu goster", "Show box")}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(pdfCfg.payment_box?.enabled)}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            payment_box: {
                              enabled: e.target.checked,
                              title: p.payment_box?.title || "Payment info",
                              bank: p.payment_box?.bank || "",
                              iban: p.payment_box?.iban || "",
                              account: p.payment_box?.account || "",
                              info_text: p.payment_box?.info_text || "",
                              payment_url: p.payment_box?.payment_url || "",
                            },
                          }))
                        }
                      />
                    </label>

                    <div>
                      <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("العنوان", "Baslik", "Title")}</PdfFieldLabel>
                      <input
                        type="text"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={pdfCfg.payment_box?.title || ""}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            payment_box: {
                              enabled: Boolean(p.payment_box?.enabled),
                              title: e.target.value,
                              bank: p.payment_box?.bank || "",
                              iban: p.payment_box?.iban || "",
                              account: p.payment_box?.account || "",
                              info_text: p.payment_box?.info_text || "",
                              payment_url: p.payment_box?.payment_url || "",
                            },
                          }))
                        }
                        placeholder="Payment information"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("البنك", "Banka", "Bank")}</PdfFieldLabel>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={pdfCfg.payment_box?.bank || ""}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              payment_box: {
                                enabled: Boolean(p.payment_box?.enabled),
                                title: p.payment_box?.title || "Payment info",
                                bank: e.target.value,
                                iban: p.payment_box?.iban || "",
                                account: p.payment_box?.account || "",
                                info_text: p.payment_box?.info_text || "",
                                payment_url: p.payment_box?.payment_url || "",
                              },
                            }))
                          }
                          placeholder={l("اسم البنك", "Banka adi", "Bank name")}
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("الإيبان (IBAN)", "IBAN", "IBAN")}</PdfFieldLabel>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                          value={pdfCfg.payment_box?.iban || ""}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              payment_box: {
                                enabled: Boolean(p.payment_box?.enabled),
                                title: p.payment_box?.title || "Payment info",
                                bank: p.payment_box?.bank || "",
                                iban: e.target.value,
                                account: p.payment_box?.account || "",
                                info_text: p.payment_box?.info_text || "",
                                payment_url: p.payment_box?.payment_url || "",
                              },
                            }))
                          }
                          placeholder="TR…"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("رقم الحساب", "Hesap numarasi", "Account number")}</PdfFieldLabel>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={pdfCfg.payment_box?.account || ""}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              payment_box: {
                                enabled: Boolean(p.payment_box?.enabled),
                                title: p.payment_box?.title || "Payment info",
                                bank: p.payment_box?.bank || "",
                                iban: p.payment_box?.iban || "",
                                account: e.target.value,
                                info_text: p.payment_box?.info_text || "",
                                payment_url: p.payment_box?.payment_url || "",
                              },
                            }))
                          }
                          placeholder={l("رقم الحساب", "Hesap numarasi", "Account number")}
                        />
                      </div>
                    </div>

                    <div>
                      <PdfFieldLabel icon={<PdfDocIcon />}>{l("رابط الدفع", "Odeme baglantisi", "Payment link")}</PdfFieldLabel>
                      <input
                        type="url"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={pdfCfg.payment_box?.payment_url || ""}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            payment_box: {
                              enabled: Boolean(p.payment_box?.enabled),
                              title: p.payment_box?.title || "Payment info",
                              bank: p.payment_box?.bank || "",
                              iban: p.payment_box?.iban || "",
                              account: p.payment_box?.account || "",
                              info_text: p.payment_box?.info_text || "",
                              payment_url: e.target.value,
                            },
                          }))
                        }
                        placeholder="https://..."
                      />
                    </div>

                    <div>
                      <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("ملاحظات إضافية (اختياري)", "Ek notlar (istege bagli)", "Additional notes (optional)")}</PdfFieldLabel>
                      <textarea
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        rows={3}
                        value={pdfCfg.payment_box?.info_text || ""}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            payment_box: {
                              enabled: Boolean(p.payment_box?.enabled),
                              title: p.payment_box?.title || "Payment info",
                              bank: p.payment_box?.bank || "",
                              iban: p.payment_box?.iban || "",
                              account: p.payment_box?.account || "",
                              info_text: e.target.value,
                              payment_url: p.payment_box?.payment_url || "",
                            },
                          }))
                        }
                        placeholder={l("نص حر إن لزم", "Gerekirse serbest metin", "Free text if needed")}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfTypeIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {l("الخطوط (Typography)", "Yazi tipleri (Typography)", "Typography")}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <PdfFieldLabel icon={<PdfTypeIcon />}>{l("حجم العنوان", "Baslik boyutu", "Title size")}</PdfFieldLabel>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={pdfCfg.typography.title}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            typography: { ...p.typography, title: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("حجم النص", "Metin boyutu", "Text size")}</PdfFieldLabel>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={pdfCfg.typography.base}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            typography: { ...p.typography, base: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("حجم النص الصغير", "Kucuk metin boyutu", "Small text size")}</PdfFieldLabel>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={pdfCfg.typography.small}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            typography: { ...p.typography, small: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3">
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                          <PdfContrastIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                          {l("غماقة النص الأساسي", "Ana metin koyulugu", "Primary text darkness")}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {Number(pdfCfg.typography.primary_darkness ?? 1).toFixed(2)}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={1}
                        step={0.05}
                        value={Number(pdfCfg.typography.primary_darkness ?? 1)}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            typography: { ...p.typography, primary_darkness: Number(e.target.value) },
                          }))
                        }
                        className="mt-2 w-full"
                      />
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                          <PdfContrastIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                          {l("غماقة النص الثانوي (الخفيف)", "Ikincil metin koyulugu (hafif)", "Secondary text darkness (lighter)")}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {Number(pdfCfg.typography.secondary_darkness ?? 0.75).toFixed(2)}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={0.9}
                        step={0.05}
                        value={Number(pdfCfg.typography.secondary_darkness ?? 0.75)}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            typography: { ...p.typography, secondary_darkness: Number(e.target.value) },
                          }))
                        }
                        className="mt-2 w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfDropletIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {l("لوغو بالخلفية (Watermark)", "Arka plan logosu (Watermark)", "Background logo (Watermark)")}
                  </div>
                  <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-zinc-700">
                      <PdfImageIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      {l("تفعيل", "Etkinlestir", "Enable")}
                    </span>
                    <input
                      type="checkbox"
                      checked={pdfCfg.watermark.enabled}
                      onChange={(e) =>
                        setPdfCfg((p) => ({
                          ...p,
                          watermark: { ...p.watermark, enabled: e.target.checked },
                        }))
                      }
                    />
                  </label>
                  <div className="mt-3">
                    <PdfFieldLabel icon={<PdfDropletIcon />}>{l("الشفافية (Opacity)", "Opaklik (Opacity)", "Opacity")}</PdfFieldLabel>
                    <input
                      type="range"
                      min={0.02}
                      max={0.25}
                      step={0.01}
                      value={pdfCfg.watermark.opacity}
                      onChange={(e) =>
                        setPdfCfg((p) => ({
                          ...p,
                          watermark: { ...p.watermark, opacity: Number(e.target.value) },
                        }))
                      }
                      className="w-full"
                    />
                    <div className="text-xs text-zinc-500">{pdfCfg.watermark.opacity.toFixed(2)}</div>
                  </div>
                  <div className="mt-3">
                    <PdfFieldLabel icon={<PdfRulerIcon />}>{l("الحجم (Scale)", "Olcek (Scale)", "Scale")}</PdfFieldLabel>
                    <input
                      type="range"
                      min={0.3}
                      max={1.2}
                      step={0.05}
                      value={pdfCfg.watermark.scale}
                      onChange={(e) =>
                        setPdfCfg((p) => ({
                          ...p,
                          watermark: { ...p.watermark, scale: Number(e.target.value) },
                        }))
                      }
                      className="w-full"
                    />
                    <div className="text-xs text-zinc-500">{pdfCfg.watermark.scale.toFixed(2)}</div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{l("يستخدم اللوغو المختار بالأعلى.", "Yukarida secilen logo kullanilir.", "Uses the logo selected above.")}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <PdfTextLinesIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                      {l("النصوص (Texts)", "Metinler (Texts)", "Texts")}
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1">
                      <PdfLangIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                      <select
                        className="border-0 bg-transparent py-0 text-xs outline-none"
                        value={pdfTextLang}
                        onChange={(e) => setPdfTextLang(e.target.value as "ar" | "en")}
                      >
                        <option value="ar">Arabic</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div>
                      <PdfFieldLabel icon={<PdfDocIcon />}>{l("عنوان الهيدر", "Header basligi", "Header title")}</PdfFieldLabel>
                      <input
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={(pdfCfg.texts?.[pdfTextLang]?.header_title ?? "").toString()}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            texts: {
                              ...(p.texts || {}),
                              [pdfTextLang]: {
                                ...((p.texts || {})[pdfTextLang] || {}),
                                header_title: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <PdfFieldLabel icon={<PdfTextLinesIcon />}>{l("سطر الهيدر الثاني", "Ikinci header satiri", "Header second line")}</PdfFieldLabel>
                      <input
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={(pdfCfg.texts?.[pdfTextLang]?.header_subtitle ?? "").toString()}
                        onChange={(e) =>
                          setPdfCfg((p) => ({
                            ...p,
                            texts: {
                              ...(p.texts || {}),
                              [pdfTextLang]: {
                                ...((p.texts || {})[pdfTextLang] || {}),
                                header_subtitle: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <PdfFieldLabel icon={<PdfUserIcon />}>{l("عنوان Bill To", "Bill To basligi", "Bill To title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.bill_to_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  bill_to_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfCreditCardIcon />}>{l("عنوان الدفع", "Odeme basligi", "Payment title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.payment_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  payment_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfShieldIcon />}>{l("عنوان الإلغاء", "Iptal basligi", "Cancellation title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.cancellation_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  cancellation_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfUsersIcon />}>{l("عنوان قائمة الأسماء", "Isim listesi basligi", "Name list title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.guest_list_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  guest_list_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfSparklesIcon />}>{l("عنوان الإضافات", "Ekler basligi", "Extras title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.extras_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  extras_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <PdfFieldLabel icon={<PdfInfoIcon />}>{l("عنوان Details", "Details basligi", "Details title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.details_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  details_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <PdfFieldLabel icon={<PdfSigmaIcon />}>{l("عنوان Summary", "Summary basligi", "Summary title")}</PdfFieldLabel>
                        <input
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={(pdfCfg.texts?.[pdfTextLang]?.summary_title ?? "").toString()}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              texts: {
                                ...(p.texts || {}),
                                [pdfTextLang]: {
                                  ...((p.texts || {})[pdfTextLang] || {}),
                                  summary_title: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                        <PdfPlusLineIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                        {l("أسطر إضافية", "Ek satirlar", "Additional lines")}
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
                        onClick={() => {
                          const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                          setPdfCfg((p) => {
                            const arr = (p.text_lines?.[pdfTextLang] || []).slice();
                            arr.push({ id, text: "", enabled: true });
                            return {
                              ...p,
                              text_lines: { ...(p.text_lines || {}), [pdfTextLang]: arr },
                            };
                          });
                        }}
                      >
                        <PdfPlusLineIcon className="h-3 w-3 shrink-0 text-zinc-500" />
                        {l("إضافة سطر", "Satir ekle", "Add line")}
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {(pdfCfg.text_lines?.[pdfTextLang] || []).map((ln) => (
                        <div key={ln.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={ln.enabled}
                            onChange={(e) =>
                              setPdfCfg((p) => ({
                                ...p,
                                text_lines: {
                                  ...(p.text_lines || {}),
                                  [pdfTextLang]: (p.text_lines?.[pdfTextLang] || []).map((x) =>
                                    x.id === ln.id ? { ...x, enabled: e.target.checked } : x,
                                  ),
                                },
                              }))
                            }
                          />
                          <input
                            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                            value={ln.text}
                            onChange={(e) =>
                              setPdfCfg((p) => ({
                                ...p,
                                text_lines: {
                                  ...(p.text_lines || {}),
                                  [pdfTextLang]: (p.text_lines?.[pdfTextLang] || []).map((x) =>
                                    x.id === ln.id ? { ...x, text: e.target.value } : x,
                                  ),
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                            onClick={() =>
                              setPdfCfg((p) => ({
                                ...p,
                                text_lines: {
                                  ...(p.text_lines || {}),
                                  [pdfTextLang]: (p.text_lines?.[pdfTextLang] || []).filter((x) => x.id !== ln.id),
                                },
                              }))
                            }
                          >
                            {l("حذف", "Sil", "Delete")}
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      {l("هذه الأسطر تُطبع تحت الهيدر (للـ Voucher حالياً).", "Bu satirlar su an header altinda yazdirilir (Voucher icin).", "These lines are printed below the header (currently for Voucher).")}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                    <PdfRulerIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {l("أحجام المربعات (Layout)", "Kutucuk boyutlari (Layout)", "Block sizes (Layout)")}
                  </div>
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                        <PdfContrastIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                        {l("شفافية المربعات", "Kutucuk opakligi", "Block opacity")}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {Number(pdfCfg.layout?.card_opacity ?? 1).toFixed(2)}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.05}
                      value={Number(pdfCfg.layout?.card_opacity ?? 1)}
                      onChange={(e) =>
                        setPdfCfg((p) => ({
                          ...p,
                          layout: { ...(p.layout || {}), card_opacity: Number(e.target.value) },
                        }))
                      }
                      className="mt-2 w-full"
                    />
                    <p className="mt-1 text-xs text-zinc-500">{l("0.50 = شفاف، 1.00 = كامل", "0.50 = yari seffaf, 1.00 = tam", "0.50 = transparent, 1.00 = full")}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(
                      [
                        ["card_h_cm", "ارتفاع BillTo/Payment (cm)", PdfUserIcon],
                        ["reservation_block_h_cm", l("ارتفاع تفاصيل الحجز (cm)", "Rezervasyon detaylari yuksekligi (cm)", "Reservation details height (cm)"), PdfBedIcon],
                        ["cancellation_h_cm", l("ارتفاع سياسة الإلغاء (cm)", "Iptal politikasi yuksekligi (cm)", "Cancellation policy height (cm)"), PdfShieldIcon],
                        ["guests_extras_h_cm", l("ارتفاع ضيوف/Extras (cm)", "Misafirler/Extras yuksekligi (cm)", "Guests/Extras height (cm)"), PdfUsersIcon],
                        ["details_h_cm", "ارتفاع Details (cm)", PdfInfoIcon],
                        ["summary_h_cm", "ارتفاع Summary (cm)", PdfSigmaIcon],
                      ] as const
                    ).map(([k, label, IconComp]) => (
                      <div key={k}>
                        <PdfFieldLabel icon={<IconComp />}>{label}</PdfFieldLabel>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={Number(
                            pdfCfg.layout?.[k as keyof NonNullable<PdfCfgState["layout"]>] ?? 0,
                          )}
                          onChange={(e) =>
                            setPdfCfg((p) => ({
                              ...p,
                              layout: { ...(p.layout || {}), [k]: Number(e.target.value || 0) },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {l("هذه الأحجام مطبّقة على تصميم الـ Voucher حالياً.", "Bu boyutlar su an Voucher tasarimina uygulanir.", "These sizes are currently applied to the Voucher layout.")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "referrers" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-100 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold text-amber-900">{l("المُحيلون — قائمة ثم كل التفاصيل", "Yonlendirenler - liste ve tum detaylar", "Referrers - list then full details")}</p>
            <p className="mt-1 text-amber-900/85">
              {l(
                "يميناً: اختر مُحيلاً لتعبئة النموذج بكل الحقول. اليسار: نموذج واحد لجميع البيانات (الرمز، الاسم، الهاتف، البريد، الملاحظات، النشاط).",
                "Sagda: tum alanlarla formu doldurmak icin bir yonlendiren secin. Solda: tum veriler icin tek form (kod, ad, telefon, e-posta, notlar, durum).",
                "Right: select a referrer to populate the full form. Left: one form for all data (code, name, phone, email, notes, status).",
              )}
            </p>
          </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <form
            onSubmit={addOrUpdateReferrer}
            className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3 h-fit"
          >
            <h2 className="text-sm font-semibold">
              {editingReferrerId ? l("تعديل مُحيل", "Yonlendiren duzenle", "Edit referrer") : t.settingsTabReferrers}
            </h2>
            <p className="text-xs text-zinc-500">{l("يتطلب صلاحية مسؤول لإضافة أو تعديل المُحيلين.", "Yonlendiren ekleme/duzenleme icin yonetici izni gerekir.", "Admin permission is required to add or edit referrers.")}</p>
            <SettingsFieldLabel htmlFor="settings-ref-code" icon={<TagIcon />} hint={l("كود فريد لتتبع المُحيل داخل النظام.", "Sistemde yonlendiren takibi icin benzersiz kod.", "Unique code to track referrer in the system.")}>
              {l("رمز المُحيل (فريد)", "Yonlendiren kodu (benzersiz)", "Referrer code (unique)")}
            </SettingsFieldLabel>
            <input
              id="settings-ref-code"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("مثال YSR0001", "Ornek YSR0001", "Example YSR0001")}
              value={referrerForm.referrer_code}
              onChange={(e) => setReferrerForm((p) => ({ ...p, referrer_code: e.target.value }))}
              required
            />
            <SettingsFieldLabel htmlFor="settings-ref-name" icon={<UserIcon />} hint={l("الاسم الظاهر في القوائم والتقارير.", "Listelerde ve raporlarda gorunen ad.", "Name shown in lists and reports.")}>
              {t.commonName}
            </SettingsFieldLabel>
            <input
              id="settings-ref-name"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("الاسم الظاهر", "Gorunen ad", "Displayed name")}
              value={referrerForm.name}
              onChange={(e) => setReferrerForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <SettingsFieldLabel htmlFor="settings-ref-phone" icon={<PhoneIcon />} hint={l("اختياري.", "Istege bagli.", "Optional.")}>
              {l("هاتف", "Telefon", "Phone")}
            </SettingsFieldLabel>
            <input
              id="settings-ref-phone"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("اختياري", "Istege bagli", "Optional")}
              value={referrerForm.phone}
              onChange={(e) => setReferrerForm((p) => ({ ...p, phone: e.target.value }))}
            />
            <SettingsFieldLabel htmlFor="settings-ref-email" icon={<MailIcon />} hint={l("اختياري.", "Istege bagli.", "Optional.")}>
              {l("بريد إلكتروني", "E-posta", "Email")}
            </SettingsFieldLabel>
            <input
              id="settings-ref-email"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("اختياري", "Istege bagli", "Optional")}
              type="email"
              value={referrerForm.email}
              onChange={(e) => setReferrerForm((p) => ({ ...p, email: e.target.value }))}
            />
            <SettingsFieldLabel htmlFor="settings-ref-notes" icon={<NotesIcon />} hint={l("ملاحظات داخلية للفريق.", "Ekip icin dahili notlar.", "Internal notes for the team.")}>
              {t.commonNotes}
            </SettingsFieldLabel>
            <textarea
              id="settings-ref-notes"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("ملاحظات داخلية", "Dahili notlar", "Internal notes")}
              value={referrerForm.notes}
              onChange={(e) => setReferrerForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={referrerForm.is_active}
                onChange={(e) => setReferrerForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              {t.commonStatus}
            </label>
            <div className="flex gap-2">
              <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                {editingReferrerId ? l("تحديث", "Guncelle", "Update") : t.commonSave}
              </button>
              {editingReferrerId && (
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm"
                  onClick={() => {
                    setEditingReferrerId(null);
                    setReferrerForm({
                      referrer_code: "",
                      name: "",
                      phone: "",
                      email: "",
                      notes: "",
                      is_active: true,
                    });
                  }}
                >
                  {l("إلغاء", "Iptal", "Cancel")}
                </button>
              )}
            </div>
          </form>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <SettingsFieldLabel htmlFor="settings-ref-list-search" icon={<SearchIcon />} hint={l("ابحث بالرمز أو الاسم أو الهاتف.", "Kod, ad veya telefon ile ara.", "Search by code, name, or phone.")}>
              {l("بحث في قائمة المُحيلين", "Yonlendiren listesinde ara", "Search referrer list")}
            </SettingsFieldLabel>
            <input
              id="settings-ref-list-search"
              className="mb-3 w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("رمز، اسم، هاتف…", "Kod, ad, telefon...", "Code, name, phone...")}
              value={referrerSearch}
              onChange={(e) => setReferrerSearch(e.target.value)}
            />
            <div className="space-y-2 text-sm max-h-[520px] overflow-y-auto">
              {filteredReferrers.map((r) => (
                <div key={r.id} className="rounded-lg border border-zinc-100 bg-white px-3 py-2 shadow-sm">
                  <div className="font-medium">
                    {r.referrer_code} — {r.name}
                  </div>
                  <div className="text-xs text-zinc-500">{r.phone || r.email || "—"}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-xs inline-flex items-center justify-center"
                      aria-label={t.settingsEditReferrer}
                      title={t.settingsEditReferrer}
                      onClick={() => {
                        setEditingReferrerId(r.id);
                        setReferrerForm({
                          referrer_code: r.referrer_code,
                          name: r.name,
                          phone: r.phone || "",
                          email: r.email || "",
                          notes: r.notes || "",
                          is_active: r.is_active,
                        });
                      }}
                    >
                      <PencilGlyph className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 inline-flex items-center justify-center"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                      onClick={() =>
                        deleteRow("referrers", r.id, () =>
                          setReferrers((prev) => prev.filter((item) => item.id !== r.id))
                        )
                      }
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {!filteredReferrers.length && <p className="text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>
        </div>
        </div>
      )}

      {tab === "modules" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-cyan-100 bg-cyan-50/80 px-4 py-3 text-sm text-cyan-950">
            <p className="font-semibold text-cyan-900">{l("مركز إعدادات الأقسام", "Bolum ayarlari merkezi", "Module settings center")}</p>
            <p className="mt-1 text-cyan-900/90">
              {l(
                "تعديل منسق لواجهات الأقسام (تسميات، إظهار/إخفاء، قيم افتراضية) مع حفظ مركزي داخل section=`ui`.",
                "Bolum arayuzlerini duzenli sekilde yonetin (etiketler, goster/gizle, varsayilanlar) ve merkezi olarak section=`ui` altinda saklayin.",
                "Manage module UIs in an organized way (labels, visibility, defaults) with centralized storage in section=`ui`.",
              )}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <aside className="lg:col-span-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <SettingsFieldLabel htmlFor="settings-module-focus" icon={<TagIcon />} hint={l("اختر القسم الذي تريد تخصيصه.", "Ozellestirmek istediginiz bolumu secin.", "Choose the module you want to customize.")}>
                {l("القسم", "Bolum", "Module")}
              </SettingsFieldLabel>
              <TypeableSelect
                id="settings-module-focus"
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={moduleFocus}
                onChange={(e) => setModuleFocus(e.target.value as NavKey)}
              >
                {MODULE_UI_SECTIONS.map((section) => (
                  <option key={section.key} value={section.key}>
                    {moduleSectionLabelFor(section.key)}
                  </option>
                ))}
              </TypeableSelect>

              <SettingsFieldLabel htmlFor="settings-module-search" icon={<SearchIcon />} hint={l("بحث داخل مفاتيح إعدادات القسم.", "Bolum ayar anahtarlarinda ara.", "Search within module setting keys.")}>
                {l("بحث", "Ara", "Search")}
              </SettingsFieldLabel>
              <input
                id="settings-module-search"
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={l("ابحث بالمفتاح أو الوصف...", "Anahtar veya aciklamaya gore ara...", "Search by key or description...")}
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
              />

              <button
                type="button"
                className="w-full rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900"
                onClick={exportModuleSnapshot}
              >
                {l("تصدير Snapshot للقسم", "Bolum Snapshot disa aktar", "Export module snapshot")}
              </button>
              <label className="block w-full cursor-pointer rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs text-blue-900">
                {l("استيراد Snapshot للقسم", "Bolum Snapshot ice aktar", "Import module snapshot")}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void importModuleSnapshot(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="w-full rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900"
                onClick={resetModuleSettings}
              >
                {l("إعادة تعيين افتراضيات القسم", "Bolum varsayilanlarini sifirla", "Reset module defaults")}
              </button>
            </aside>

            <section className="lg:col-span-9 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-zinc-900">
                  {l("إعدادات واجهة قسم", "Bolum arayuz ayarlari", "Module UI settings")} {moduleFocus}
                </h4>
                <button
                  type="button"
                  className="rounded-md bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800"
                  onClick={saveModuleSettings}
                >
                  {l("حفظ إعدادات القسم", "Bolum ayarlarini kaydet", "Save module settings")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {moduleRows.map((row) => {
                  const tx = moduleSettingTextFor(row);
                  return (
                  <div key={row.key} className="rounded-lg border border-zinc-200 p-3">
                    <div className="mb-1 text-xs font-semibold text-zinc-800">{tx.label}</div>
                    <div className="mb-2 text-[11px] text-zinc-500">{tx.description}</div>
                    {row.valueType === "boolean" ? (
                      <TypeableSelect
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        value={String(moduleSettingsDraft[row.key] || "false")}
                        onChange={(e) =>
                          setModuleSettingsDraft((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                      >
                        <option value="true">{l("نعم (true)", "Evet (true)", "Yes (true)")}</option>
                        <option value="false">{l("لا (false)", "Hayir (false)", "No (false)")}</option>
                      </TypeableSelect>
                    ) : row.valueType === "json" ? (
                      <textarea
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm font-mono"
                        rows={4}
                        value={moduleSettingsDraft[row.key] || "{}"}
                        onChange={(e) =>
                          setModuleSettingsDraft((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                        type={row.valueType === "number" ? "number" : "text"}
                        value={moduleSettingsDraft[row.key] || ""}
                        onChange={(e) =>
                          setModuleSettingsDraft((prev) => ({ ...prev, [row.key]: e.target.value }))
                        }
                      />
                    )}
                    <div className="mt-1 text-[10px] text-zinc-400 font-mono">
                      {l("المفتاح", "Anahtar", "Key")}: {moduleSettingKey(row.module, row.key)}
                    </div>
                  </div>
                  );
                })}
                {!moduleRows.length ? <div className="text-sm text-zinc-400">{l("لا توجد مفاتيح مطابقة.", "Eslesen anahtar yok.", "No matching keys.")}</div> : null}
              </div>

              <div className="mt-5 rounded-lg border border-zinc-200 p-3">
                <div className="mb-2 text-sm font-semibold text-zinc-800">
                  {l("مفاتيح مخصصة للقسم (إضافة / حذف)", "Bolume ozel anahtarlar (ekle / sil)", "Custom module keys (add / delete)")}
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <input
                    className="rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l(
                      "لاحقة المفتاح (مثال: card_title)",
                      "Anahtar son eki (ornek: card_title)",
                      "Key suffix (example: card_title)",
                    )}
                    value={moduleCustomForm.key}
                    onChange={(e) => setModuleCustomForm((prev) => ({ ...prev, key: e.target.value }))}
                  />
                  <input
                    className="rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("العنوان", "Etiket", "Label")}
                    value={moduleCustomForm.label}
                    onChange={(e) => setModuleCustomForm((prev) => ({ ...prev, label: e.target.value }))}
                  />
                  <input
                    className="rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("القيمة", "Deger", "Value")}
                    value={moduleCustomForm.value}
                    onChange={(e) => setModuleCustomForm((prev) => ({ ...prev, value: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                    onClick={addCustomModuleKey}
                  >
                    {l("إضافة مفتاح", "Anahtar ekle", "Add key")}
                  </button>
                </div>
                <textarea
                  className="mt-2 w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  rows={2}
                  placeholder={l("الوصف", "Aciklama", "Description")}
                  value={moduleCustomForm.description}
                  onChange={(e) => setModuleCustomForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <div className="mt-3 space-y-2">
                  {customModuleRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-mono text-zinc-800">{row.key}</div>
                        <div className="truncate text-zinc-500">{row.value || "—"}</div>
                      </div>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-red-700"
                        onClick={() => void deleteCustomModuleKey(row.id)}
                      >
                        {l("حذف", "Sil", "Delete")}
                      </button>
                    </div>
                  ))}
                  {!customModuleRows.length ? <div className="text-xs text-zinc-400">{l("لا توجد مفاتيح مخصصة بعد.", "Henuz ozel anahtar yok.", "No custom keys yet.")}</div> : null}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === "app" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-violet-100 bg-violet-50/80 px-4 py-3 text-sm text-violet-950">
            <p className="font-semibold text-violet-900">
              {l("إعدادات عامة — نفس ترتيب القوائم المنسدلة", "Genel ayarlar - acilir listelerle ayni duzen", "General settings - same order as dropdowns")}
            </p>
            <ol className="mt-2 list-decimal list-inside space-y-1 text-violet-900/90">
              <li>
                <strong>{l("يسار:", "Sol:", "Left:")}</strong> {l("تصفية أسماء الأقسام.", "Bolum adlarini filtrele.", "Filter module names.")}
              </li>
              <li>
                <strong>{l("وسط:", "Orta:", "Middle:")}</strong>{" "}
                {l(
                  "كل أقسام النظام بترتيب القائمة الجانبية (لوحة، عملاء، قسائم، حجوزات…)، زائد أي قسم مخصص موجود في قاعدة البيانات.",
                  "Yan menudeki sirayla tum sistem bolumleri ve veritabanindaki ozel bolumler.",
                  "All system sections in sidebar order, plus any custom sections from the database.",
                )}
              </li>
              <li>
                <strong>{l("يمين:", "Sag:", "Right:")}</strong>{" "}
                {l(
                  "مفاتيح القسم ثم نموذج كامل لكل حقل (قسم، مفتاح، عنوان، قيمة، وصف).",
                  "Bolum anahtarlari ve her alan icin tam form (bolum, anahtar, baslik, deger, aciklama).",
                  "Module keys then a full form for each field (section, key, label, value, description).",
                )}
              </li>
            </ol>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <aside className="lg:col-span-3 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <SettingsFieldLabel htmlFor="settings-app-section-filter" icon={<SearchIcon />} hint={l("تصفية حسب اسم القسم أو slug.", "Bolum adina veya slug'a gore filtrele.", "Filter by section name or slug.")}>
                {l("تصفية أقسام الإعدادات", "Ayar bolumlerini filtrele", "Filter settings sections")}
              </SettingsFieldLabel>
              <input
                id="settings-app-section-filter"
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={l("جزء من اسم القسم أو slug…", "Bolum adinin bir kismi veya slug...", "Part of section name or slug...")}
                value={appSectionListSearch}
                onChange={(e) => setAppSectionListSearch(e.target.value)}
              />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {l("الترتيب يطابق الشريط الجانبي. الأقسام الإضافية تظهر تحت الفاصل إن وُجدت في البيانات.", "Siralama yan menuyla aynidir. Ek bolumler varsa ayiricinin altinda gorunur.", "Order matches the sidebar. Extra sections appear under the divider if present in data.")}
              </p>
            </aside>

            <section className="lg:col-span-4 flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800">
                {l("الأقسام", "Bolumler", "Sections")} <span className="font-normal text-zinc-500">({filteredAppSectionRows.length})</span>
              </div>
              <div className="min-h-[360px] max-h-[620px] space-y-1 overflow-y-auto p-2">
                {(() => {
                  const presets = filteredAppSectionRows.filter((r) => r.preset);
                  const extras = filteredAppSectionRows.filter((r) => !r.preset);
                  return (
                    <>
                      {presets.map((row) => (
                        <button
                          key={row.section}
                          type="button"
                          onClick={() => {
                            setAppSectionFocus(row.section);
                            setEditingAppId(null);
                            setAppForm((pRef) => ({
                              ...pRef,
                              section: row.section,
                              key: "",
                              label: "",
                              value: "",
                              description: "",
                            }));
                          }}
                          className={`w-full rounded-lg border px-3 py-2.5 text-right text-sm transition ${
                            appSectionFocus === row.section
                              ? "border-violet-500 bg-violet-50 shadow-sm"
                              : "border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          <div className="font-medium text-zinc-900">{row.label}</div>
                          <div className="truncate font-mono text-[11px] text-zinc-500">{row.section}</div>
                        </button>
                      ))}
                      {extras.length > 0 && (
                        <div className="border-t border-zinc-200 pt-2 mt-2 text-[10px] font-semibold uppercase text-zinc-400">
                          {l("من قاعدة البيانات", "Veritabanindan", "From database")}
                        </div>
                      )}
                      {extras.map((row) => (
                        <button
                          key={row.section}
                          type="button"
                          onClick={() => {
                            setAppSectionFocus(row.section);
                            setEditingAppId(null);
                            setAppForm((pRef) => ({
                              ...pRef,
                              section: row.section,
                              key: "",
                              label: "",
                              value: "",
                              description: "",
                            }));
                          }}
                          className={`w-full rounded-lg border px-3 py-2.5 text-right text-sm transition ${
                            appSectionFocus === row.section
                              ? "border-amber-500 bg-amber-50 shadow-sm"
                              : "border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          <div className="font-medium text-zinc-900">{row.label}</div>
                          <div className="truncate font-mono text-[11px] text-zinc-500">{row.section}</div>
                        </button>
                      ))}
                    </>
                  );
                })()}
                {!filteredAppSectionRows.length && (
                  <p className="p-4 text-center text-sm text-zinc-400">{l("لا توجد أقسام مطابقة للبحث.", "Aramayla eslesen bolum yok.", "No matching sections for search.")}</p>
                )}
              </div>
            </section>

            <section className="lg:col-span-5 space-y-4">
              {appSectionFocus === null ? (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-8 text-center text-sm text-zinc-500">
                  {l("اختر قسماً من الوسط.", "Ortadan bir bolum secin.", "Select a section from the middle.")}
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-zinc-800">
                        {l("مفاتيح القسم", "Bolum anahtarlari", "Section keys")} ({filteredAppSettings.length})
                      </h4>
                      <button
                        type="button"
                        className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-800"
                        onClick={() => {
                          setEditingAppId(null);
                          setAppForm({
                            section: appSectionFocus,
                            key: "",
                            label: "",
                            value: "",
                            description: "",
                          });
                        }}
                      >
                        {l("+ مفتاح جديد", "+ Yeni anahtar", "+ New key")}
                      </button>
                    </div>
                    <input
                      className="mb-3 mt-2 w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("بحث داخل المفاتيح والقيم...", "Anahtar ve degerlerde ara...", "Search within keys and values...")}
                      value={appSearch}
                      onChange={(e) => setAppSearch(e.target.value)}
                    />
                    <div className="max-h-48 space-y-2 overflow-y-auto text-sm">
                      {filteredAppSettings.map((row) => (
                        <div
                          key={row.id}
                          className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 ${
                            editingAppId === row.id
                              ? "border-violet-300 bg-violet-50/60"
                              : "border-zinc-100 bg-zinc-50/60"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-emerald-800">{row.key}</div>
                            {row.label && <div className="text-xs text-zinc-500">{row.label}</div>}
                            <div className="line-clamp-2 text-xs text-zinc-600">{row.value || "—"}</div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-zinc-200 p-1.5 text-[11px]"
                              aria-label={t.bookingEdit}
                              title={t.bookingEdit}
                              onClick={() => {
                                setEditingAppId(row.id);
                                setAppForm({
                                  section: row.section,
                                  key: row.key,
                                  label: row.label,
                                  value: row.value,
                                  description: row.description,
                                });
                              }}
                            >
                              <PencilGlyph className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded border border-red-200 p-1.5 text-[11px] text-red-700"
                              aria-label={t.commonDelete}
                              title={t.commonDelete}
                              onClick={() =>
                                deleteRow("app-settings", row.id, () =>
                                  setAppSettings((prev) => prev.filter((item) => item.id !== row.id)),
                                )
                              }
                            >
                              <TrashGlyph className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {!filteredAppSettings.length && (
                        <p className="text-xs text-zinc-400">{l("لا مفاتيح بعد — أضف مفتاحاً من الأسفل.", "Henuz anahtar yok - asagidan bir anahtar ekleyin.", "No keys yet - add one below.")}</p>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={addOrUpdateAppSetting}
                    className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {editingAppId ? l("تعديل المفتاح (كل الحقول)", "Anahtari duzenle (tum alanlar)", "Edit key (all fields)") : l("إضافة مفتاح", "Anahtar ekle", "Add key")}
                    </h3>
                    <p className="text-xs text-zinc-500">{t.settingsAppSettingsHint}</p>
                    <SettingsFieldLabel htmlFor="settings-app-section">{l("مفتاح القسم (بالإنجليزية، بدون مسافات)", "Bolum anahtari (Ingilizce, bosluksuz)", "Section key (English, no spaces)")}</SettingsFieldLabel>
                    <input
                      id="settings-app-section"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm font-mono"
                      placeholder={l("dashboard، bookings، …", "dashboard, bookings, ...", "dashboard, bookings, ...")}
                      value={appForm.section}
                      onChange={(e) => setAppForm((p) => ({ ...p, section: e.target.value }))}
                      required
                    />
                    <SettingsFieldLabel htmlFor="settings-app-key">{l("مفتاح الإعداد", "Ayar anahtari", "Setting key")}</SettingsFieldLabel>
                    <input
                      id="settings-app-key"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("مثال: default_currency", "Ornek: default_currency", "Example: default_currency")}
                      value={appForm.key}
                      onChange={(e) => setAppForm((p) => ({ ...p, key: e.target.value }))}
                      required
                    />
                    <SettingsFieldLabel htmlFor="settings-app-label">{l("عنوان للعرض في الواجهة", "Arayuzde gosterilecek baslik", "Label shown in the UI")}</SettingsFieldLabel>
                    <input
                      id="settings-app-label"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("اختياري", "Istege bagli", "Optional")}
                      value={appForm.label}
                      onChange={(e) => setAppForm((p) => ({ ...p, label: e.target.value }))}
                    />
                    <SettingsFieldLabel htmlFor="settings-app-value">{uiWords.storedValueLabel}</SettingsFieldLabel>
                    <textarea
                      id="settings-app-value"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("نص، رقم، JSON، …", "Metin, sayi, JSON, ...", "Text, number, JSON, ...")}
                      value={appForm.value}
                      onChange={(e) => setAppForm((p) => ({ ...p, value: e.target.value }))}
                      rows={4}
                    />
                    <SettingsFieldLabel htmlFor="settings-app-desc">{t.commonNotes}</SettingsFieldLabel>
                    <textarea
                      id="settings-app-desc"
                      className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                      placeholder={l("شرح معنى هذا الإعداد", "Bu ayarin anlamini aciklayin", "Explain what this setting means")}
                      value={appForm.description}
                      onChange={(e) => setAppForm((p) => ({ ...p, description: e.target.value }))}
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white" type="submit">
                        {editingAppId ? l("تحديث", "Guncelle", "Update") : t.commonSave}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 px-4 py-2 text-sm"
                        onClick={() => {
                          setEditingAppId(null);
                          setAppForm({
                            section: appSectionFocus,
                            key: "",
                            label: "",
                            value: "",
                            description: "",
                          });
                        }}
                      >
                        {l("إلغاء / جديد", "Iptal / Yeni", "Cancel / New")}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {editingOptionId && optionEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveOptionEdit} className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{t.settingsEditOption}</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={closeOptionModal}>
                {t.commonClose}
              </button>
            </div>
            <TypeableSelect
              id="settings-modal-opt-category"
              label={t.expensesSelectCategory}
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.expensesSelectCategory}
              value={optionEditForm.category}
              onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
              required
            >
              <option value="">{t.expensesSelectCategory}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </TypeableSelect>
            <SettingsFieldLabel htmlFor="settings-modal-opt-label">{t.settingsOptionLabel}</SettingsFieldLabel>
            <input
              id="settings-modal-opt-label"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("النص الظاهر", "Gorunen metin", "Visible text")}
              value={optionEditForm.label}
              onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, label: e.target.value } : prev))}
              required
            />
            <SettingsFieldLabel htmlFor="settings-modal-opt-value">{t.settingsOptionValue}</SettingsFieldLabel>
            <input
              id="settings-modal-opt-value"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={uiWords.storedValuePlaceholder}
              value={optionEditForm.value}
              onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              required
            />
            <SettingsFieldLabel htmlFor="settings-modal-opt-desc">{l("وصف الخيار", "Secenek aciklamasi", "Option description")}</SettingsFieldLabel>
            <textarea
              id="settings-modal-opt-desc"
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={l("اختياري", "Istege bagli", "Optional")}
              value={optionEditForm.description}
              onChange={(e) =>
                setOptionEditForm((prev) => (prev ? { ...prev, description: e.target.value } : prev))
              }
              rows={2}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <SettingsFieldLabel htmlFor="settings-modal-opt-color">{l("لون", "Renk", "Color")}</SettingsFieldLabel>
                <input
                  id="settings-modal-opt-color"
                  className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  value={optionEditForm.color}
                  onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, color: e.target.value } : prev))}
                  placeholder="#22c55e"
                />
              </div>
              <div className="min-w-0">
                <SettingsFieldLabel htmlFor="settings-modal-opt-sort">{l("ترتيب العرض", "Gorunum sirasi", "Display order")}</SettingsFieldLabel>
                <input
                  id="settings-modal-opt-sort"
                  className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  type="number"
                  value={optionEditForm.sort_order}
                  onChange={(e) =>
                    setOptionEditForm((prev) => (prev ? { ...prev, sort_order: Number(e.target.value || 0) } : prev))
                  }
                  placeholder="0"
                />
              </div>
            </div>
            {optionEditIsHotelKinds && (
              <>
                <SettingsFieldLabel htmlFor="settings-modal-opt-max">{l("سعة النوع (أشخاص)", "Tur kapasitesi (kisi)", "Type capacity (people)")}</SettingsFieldLabel>
                <input
                  id="settings-modal-opt-max"
                  className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  max={99}
                  placeholder="2"
                  value={optionEditForm.max_guests}
                  onChange={(e) =>
                    setOptionEditForm((prev) => (prev ? { ...prev, max_guests: e.target.value } : prev))
                  }
                />
              </>
            )}
            {optionEditIsHrDepartment && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <SettingsFieldLabel htmlFor="settings-modal-dept-code">{l("كود القسم", "Bolum kodu", "Department code")}</SettingsFieldLabel>
                  <input
                    id="settings-modal-dept-code"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder="FIN"
                    value={optionEditForm.department_code}
                    onChange={(e) =>
                      setOptionEditForm((prev) => (prev ? { ...prev, department_code: e.target.value } : prev))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <SettingsFieldLabel htmlFor="settings-modal-dept-mgr">{l("مدير القسم", "Bolum yoneticisi", "Department manager")}</SettingsFieldLabel>
                  <input
                    id="settings-modal-dept-mgr"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder={l("اختياري", "Istege bagli", "Optional")}
                    value={optionEditForm.department_manager}
                    onChange={(e) =>
                      setOptionEditForm((prev) => (prev ? { ...prev, department_manager: e.target.value } : prev))
                    }
                  />
                </div>
              </div>
            )}
            {optionEditIsHrPosition && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <SettingsFieldLabel htmlFor="settings-modal-grade">{l("درجة الوظيفة", "Pozisyon seviyesi", "Position grade")}</SettingsFieldLabel>
                  <input
                    id="settings-modal-grade"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    placeholder="L2"
                    value={optionEditForm.position_grade}
                    onChange={(e) =>
                      setOptionEditForm((prev) => (prev ? { ...prev, position_grade: e.target.value } : prev))
                    }
                  />
                </div>
                <div className="min-w-0">
                  <SettingsFieldLabel htmlFor="settings-modal-salary">{l("راتب افتراضي", "Varsayilan maas", "Default salary")}</SettingsFieldLabel>
                  <input
                    id="settings-modal-salary"
                    className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={optionEditForm.default_salary}
                    onChange={(e) =>
                      setOptionEditForm((prev) => (prev ? { ...prev, default_salary: e.target.value } : prev))
                    }
                  />
                </div>
              </div>
            )}
            <SettingsFieldLabel htmlFor="settings-modal-meta-lines">{l("تفاصيل إضافية (كل سطر key=value)", "Ek detaylar (her satir key=value)", "Additional details (each line key=value)")}</SettingsFieldLabel>
            <textarea
              id="settings-modal-meta-lines"
              className="w-full rounded-md mb-input-raised px-3 py-2 font-mono text-xs"
              placeholder={"department_floor=2"}
              value={optionEditForm.meta_details_text}
              onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, meta_details_text: e.target.value } : prev))}
              rows={3}
            />
            <SettingsFieldLabel htmlFor="settings-modal-meta-json">{l("ميتا JSON", "Meta JSON", "Meta JSON")}</SettingsFieldLabel>
            <textarea
              id="settings-modal-meta-json"
              className="w-full rounded-md mb-input-raised px-3 py-2 font-mono text-xs"
              placeholder='{"icon":"star"}'
              value={optionEditForm.meta_text}
              onChange={(e) => setOptionEditForm((prev) => (prev ? { ...prev, meta_text: e.target.value } : prev))}
              rows={3}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={optionEditForm.is_active}
                onChange={(e) =>
                  setOptionEditForm((prev) => (prev ? { ...prev, is_active: e.target.checked } : prev))
                }
              />
              {l("خيار نشط", "Aktif secenek", "Active option")}
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={closeOptionModal}>
                {t.commonCancel}
              </button>
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                {l("تحديث", "Guncelle", "Update")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
