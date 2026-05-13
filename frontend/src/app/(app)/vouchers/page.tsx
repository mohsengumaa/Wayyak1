"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { requestDeleteConfirm } from "@/lib/deleteConfirm";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { stayNightsBetween } from "@/lib/stayNights";
import { formatYmdSlash } from "@/lib/dateFormat";
import { useI18n } from "@/lib/useI18n";
import TypeableSelect from "@/components/TypeableSelect";
import { TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, IdCardIcon, MoneyIcon, SearchIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import { HotelIcon } from "@/components/NavIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import {
  DROPDOWN_CATEGORY_KEYS,
  fetchDropdownOptionsMap,
  type DropdownOptionRow,
} from "@/lib/dropdownOptions";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import { openPdfBlobWithFallback, openPdfUrlWithFallback } from "@/lib/pdfOpen";

type Hotel = { id: number; name: string; contact_info?: string };
type RoomType = { id: number; hotel: number; name: string };
type CurrentUser = { is_staff: boolean };
type Client = { id: number; name: string; email: string };
type Invoice = { id: number; number: string; client: number; total_amount: number };
type Referrer = { id: number; referrer_code: string; name: string };

type Guest = {
  salutation?: string;
  full_name: string;
  is_leader: boolean;
  passport_number?: string;
  /** Years; only used when salutation is `chd` */
  child_age?: number | "" | null;
};
type SearchOption = { value: string; label: string };
type Reservation = {
  hotel: string;
  room_type: string;
  room_type_code: string;
  board_code: string;
  room_code: string;
  room_count: number;
  selling_date: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  extra_bed: boolean;
  extra_bed_service_price: number;
  extra_bed_service_currency: string;
  extra_bed_service_free: boolean;
  promotion_room: boolean;
  promotion_room_service_price: number;
  promotion_room_service_currency: string;
  promotion_room_service_free: boolean;
  honey_moons: boolean;
  honey_moons_service_price: number;
  honey_moons_service_currency: string;
  honey_moons_service_free: boolean;
  free_of_charge: boolean;
  check_in: string;
  check_out: string;
  confirmation_number: string;
  room_nr: string;
  external_voucher_no: string;
  buying_price: number;
  buying_currency: string;
  selling_price: number;
  selling_currency: string;
  reservation_notes: string;
  hotel_note: string;
  internal_note: string;
  transfer_note: string;
  operator_note: string;
  allotment_type: string;
  hotel_confirmation: string;
  operator_confirmation: string;
  reservation_status: string;
  reservation_type: string;
  print_option: string;
  special_code: string;
  code_2: string;
  code_3: string;
  code_4: string;
  spo_spec_code: string;
  package_splitting: boolean;
  index_nr: string;
  bubble: boolean;
  passive: boolean;
  free_sale: boolean;
  local_service: boolean;
  local_service_price: number;
  local_service_currency: string;
  local_service_free: boolean;
  transfer_service_type: string;
  transfer_service_price_per_day: number;
  transfer_service_currency: string;
  transfer_service_days: number;
  transfer_pickup_date: string;
  transfer_dropoff_date: string;
  airport_to_hotel: boolean;
  airport_to_hotel_price: number;
  airport_to_hotel_currency: string;
  hotel_to_airport: boolean;
  hotel_to_airport_price: number;
  hotel_to_airport_currency: string;
  voucher_form_printing: string;
  confirmation_form_print: string;
  arrival_transfer: boolean;
  arrival_transfer_date: string;
  arrival_transfer_type: string;
  departure_transfer: boolean;
  departure_transfer_date: string;
  departure_transfer_type: string;
  handling_fee_type: string;
  extras_prices?: Record<string, { buying_price?: number; selling_price?: number; enabled?: boolean }>;
};

const TRANSFER_TYPES = ["Private", "Shared", "None"] as const;
const EXTRAS_FIELD_DEFAULTS = [
  { value: "extra_bed", label: "Extra bed" },
  { value: "promotion_room", label: "Promotion room" },
  { value: "honey_moons", label: "Honey moons" },
  { value: "free_of_charge", label: "Free of charge" },
  { value: "package_splitting", label: "Package splitting" },
  { value: "bubble", label: "Bubble" },
  { value: "passive", label: "Passive" },
  { value: "free_sale", label: "Free sale" },
] as const;
const EXTRAS_FIELD_KEYS = new Set(EXTRAS_FIELD_DEFAULTS.map((x) => x.value));
const EXTRAS_FIELD_LABEL_BY_KEY = Object.fromEntries(EXTRAS_FIELD_DEFAULTS.map((x) => [x.value, x.label])) as Record<string, string>;
// Keep these 5 fields on one line (compact):
// room_count | buying_price | buying_currency | selling_price | selling_currency
// We model them as 5 separate columns, each RES_UNIT wide.
const RES_UNIT = 112;
const DEFAULT_RESERVATION_COLS = [
  200, // hotel
  200, // room type
  120, // room code
  120, // room type code
  140, // board
  RES_UNIT, // room_count
  RES_UNIT, // buying_price
  RES_UNIT, // buying_currency
  RES_UNIT, // selling_price
  RES_UNIT, // selling_currency
];
const VOUCHER_DRAFT_STORAGE_KEY = "mbtourism:voucherDraft:v1";

const COMPACT_FIELD_CLASS =
  "mb-input-raised mb-input-raised-compact rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs h-9";
const COMPACT_SELECT_CLASS =
  "w-full mb-input-raised mb-input-raised-compact rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs h-9";

function pad5(n: number) {
  const v = Math.max(0, Math.trunc(n));
  return String(v).padStart(5, "0");
}

function yearYY(fromDate?: string | null) {
  const d = fromDate ? new Date(fromDate) : new Date();
  const y = Number.isFinite(d.getTime()) ? d.getFullYear() : new Date().getFullYear();
  return String(y).slice(-2);
}

function suggestRoomCodeFromPax(pax: number): string {
  return pax <= 1 ? "SNG" : "DBL";
}

function suggestRoomCountFromPax(pax: number, roomCode: string): number {
  const safePax = Math.max(0, Math.trunc(pax || 0));
  if (safePax <= 0) return 1;
  if (roomCode === "SNG") return Math.max(1, safePax);
  // DBL: 2 pax per room
  return Math.max(1, Math.ceil(safePax / 2));
}

function upgradeReservationCols(cols: number[] | null | undefined): number[] {
  if (!Array.isArray(cols) || !cols.length) return DEFAULT_RESERVATION_COLS;

  // Old format (8 cols): ... , room_count, buying(2), selling(2)
  if (cols.length === 8) {
    const next = DEFAULT_RESERVATION_COLS.slice();
    next[0] = cols[0] ?? next[0];
    next[1] = cols[1] ?? next[1];
    next[2] = cols[2] ?? next[2];
    next[3] = cols[3] ?? next[3];
    next[4] = cols[4] ?? next[4];

    const roomCountW = Math.max(cols[5] ?? RES_UNIT, RES_UNIT);
    const buyingW = Math.max(cols[6] ?? RES_UNIT * 2, RES_UNIT * 2);
    const sellingW = Math.max(cols[7] ?? RES_UNIT * 2, RES_UNIT * 2);

    // Split group widths into two equal columns
    next[5] = roomCountW;
    next[6] = Math.max(Math.floor(buyingW / 2), RES_UNIT); // buying_price
    next[7] = Math.max(Math.floor(buyingW / 2), RES_UNIT); // buying_currency
    next[8] = Math.max(Math.floor(sellingW / 2), RES_UNIT); // selling_price
    next[9] = Math.max(Math.floor(sellingW / 2), RES_UNIT); // selling_currency
    return next;
  }

  if (cols.length !== DEFAULT_RESERVATION_COLS.length) return DEFAULT_RESERVATION_COLS;

  const next = cols.slice();
  for (let i = 0; i < next.length; i += 1) {
    next[i] = Math.max(next[i] ?? 0, DEFAULT_RESERVATION_COLS[i] ?? RES_UNIT);
  }
  return next;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Merge PDF JSON configs like backend `load_pdf_config` (global + per-doc). */
function deepMergePdfConfig(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      out[k] &&
      typeof out[k] === "object" &&
      !Array.isArray(out[k])
    ) {
      out[k] = deepMergePdfConfig(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function paymentUrlHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function truncateSummary(s: string, maxLen: number) {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

type VoucherPaymentBoxState = {
  enabled: boolean;
  title: string;
  bank: string;
  iban: string;
  account: string;
  info_text: string;
  payment_url: string;
};

const EMPTY_VOUCHER_PAYMENT_BOX: VoucherPaymentBoxState = {
  enabled: false,
  title: "Payment info",
  bank: "",
  iban: "",
  account: "",
  info_text: "",
  payment_url: "",
};

function normalizePaymentDraft(raw: unknown): VoucherPaymentBoxState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_VOUCHER_PAYMENT_BOX };
  const o = raw as Record<string, unknown>;
  return {
    enabled: Boolean(o.enabled),
    title: typeof o.title === "string" ? o.title : EMPTY_VOUCHER_PAYMENT_BOX.title,
    bank: typeof o.bank === "string" ? o.bank : "",
    iban: typeof o.iban === "string" ? o.iban : "",
    account: typeof o.account === "string" ? o.account : "",
    info_text: typeof o.info_text === "string" ? o.info_text : "",
    payment_url: typeof o.payment_url === "string" ? o.payment_url : "",
  };
}

function SearchableSelect({
  listId,
  value,
  options,
  placeholder,
  className = "w-full rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm shadow-sm",
  onChange,
  label,
  labelClassName = "mb-1 block text-xs font-semibold text-zinc-700",
  clearSearchOnOpen = true,
  emptyWhenUnselected = true,
  id,
}: {
  listId: string;
  value: string | undefined | null;
  options: SearchOption[];
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  clearSearchOnOpen?: boolean;
  emptyWhenUnselected?: boolean;
  id?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");
  const safeValue = value ?? "";
  const selectedOption = options.find((option) => option.value === safeValue);
  const selectedLabel = selectedOption?.label ?? safeValue;
  const closedDisplay =
    safeValue === "" ? (emptyWhenUnselected ? "" : selectedLabel) : selectedLabel;
  const inputValue = isOpen ? draftValue : closedDisplay;
  const inputId = id ?? listId;

  const filteredOptions = useMemo(() => {
    const searchRaw = String(draftValue || "").trim();
    if (!searchRaw) {
      return options;
    }
    const ns = searchRaw.toLowerCase();
    const byPrefix = options.filter(
      (option) =>
        option.label.toLowerCase().startsWith(ns) || option.value.toLowerCase().startsWith(ns),
    );
    return byPrefix.length > 0 ? byPrefix : options;
  }, [draftValue, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setDraftValue("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (nextValue: string) => {
    setDraftValue(nextValue);
    setIsOpen(true);
    const normalized = nextValue.trim().toLowerCase();
    const matchedOption = options.find(
      (option) =>
        option.label.toLowerCase() === normalized || option.value.toLowerCase() === normalized,
    );
    onChange(matchedOption ? matchedOption.value : nextValue);
  };

  const control = (
    <div className="relative w-full min-w-0">
      <input
        id={inputId}
        value={inputValue}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={label}
        className={`${className} min-w-0 truncate pr-10`}
        onFocus={() => {
          if (clearSearchOnOpen) {
            setDraftValue("");
          } else {
            setDraftValue(closedDisplay);
          }
          setIsOpen(true);
        }}
        onChange={(e) => handleChange(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`toggle-${listId}`}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg border-l border-emerald-100 bg-emerald-50 text-emerald-700"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              if (clearSearchOnOpen) {
                setDraftValue("");
              } else {
                setDraftValue(closedDisplay);
              }
            } else {
              setDraftValue("");
            }
            return next;
          });
        }}
      >
        <span className="text-xs leading-none">&#9662;</span>
      </button>
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}
      {control}
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute inset-x-0 z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-emerald-100 bg-white py-1 text-sm shadow-md">
          {filteredOptions.map((option) => (
            <button
              key={`${listId}-${option.value}`}
              type="button"
              className="block w-full truncate px-3 py-2 text-left hover:bg-zinc-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setDraftValue("");
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PrintPreviewModal({
  t,
  lang,
  open,
  onClose,
  template,
  onTemplateChange,
  loading,
  previewUrl,
  hotelFields,
  setHotelFields,
  clientFields,
  setClientFields,
  toggleField,
}: {
  t: Record<string, string>;
  lang: "ar" | "en" | "tr";
  open: boolean;
  onClose: () => void;
  template: "hotel" | "customer";
  onTemplateChange: (value: "hotel" | "customer") => void;
  loading: boolean;
  previewUrl: string;
  hotelFields: string[];
  setHotelFields: React.Dispatch<React.SetStateAction<string[]>>;
  clientFields: string[];
  setClientFields: React.Dispatch<React.SetStateAction<string[]>>;
  toggleField: (fields: string[], field: string) => string[];
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  if (!open) return null;
  const tx = {
    title: lang === "ar" ? "معاينة وطباعة PDF" : lang === "tr" ? "PDF onizleme ve yazdirma" : "PDF preview and print",
    openTab: lang === "ar" ? "فتح في تبويب" : lang === "tr" ? "Sekmede ac" : "Open in tab",
  };

  const choices =
    template === "hotel"
      ? [
          ["hotel_info", t.printHotelInfo],
          ["reservation_info", t.printReservationInfo],
          ["status_info", t.printStatusInfo],
          ["room_summary", t.printRoomSummary],
          ["voucher_note", t.printVoucherNote],
          ["buying_price", t.printBuyingPrice],
          ["buying_price_total", t.printBuyingPriceTotal],
        ]
      : [
          ["customer_info", t.printCustomerInfo],
          ["pax_info", t.printPaxInfo],
          ["reservation_info", t.printReservationInfo],
          ["guest_list", t.printGuestList],
          ["fees", t.printFees],
          ["voucher_note", t.printVoucherNote],
          ["prices", t.printPrices],
        ];

  const fields = template === "hotel" ? hotelFields : clientFields;
  const setFields = template === "hotel" ? setHotelFields : setClientFields;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{tx.title}</h3>
          <button type="button" className="text-sm text-zinc-500" onClick={onClose}>
            {t.commonClose}
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              template === "hotel"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-zinc-200"
            }`}
            onClick={() => onTemplateChange("hotel")}
          >
            {t.printHotel}
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              template === "customer"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-zinc-200"
            }`}
            onClick={() => onTemplateChange("customer")}
          >
            {t.printCustomer}
          </button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {choices.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fields.includes(key)}
                onChange={() => setFields((prev) => toggleField(prev, key))}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50">
          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">{t.commonLoading}</div>
          ) : previewUrl ? (
            <iframe
              ref={iframeRef}
              title="print-preview"
              src={previewUrl}
              className="h-[520px] w-full rounded-md"
            />
          ) : (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">{t.commonNoData}</div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              if (!previewUrl) return;
              openPdfUrlWithFallback(previewUrl, { mode: "preview" });
            }}
            disabled={!previewUrl}
            className={`rounded-md border px-3 py-2 text-sm ${
              previewUrl ? "border-zinc-200 text-zinc-700" : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
            }`}
          >
            {tx.openTab}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          >
            {t.commonCancel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!previewUrl) return;
              const win = iframeRef.current?.contentWindow;
              if (win) {
                win.focus();
                win.print();
              } else {
                openPdfUrlWithFallback(previewUrl, { mode: "print" });
              }
            }}
            disabled={!previewUrl}
            className={`rounded-md px-4 py-2 text-sm text-white ${
              previewUrl ? "bg-zinc-900" : "cursor-not-allowed bg-zinc-300"
            }`}
          >
            {t.commonPrint}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VouchersPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.vouchers]);
  const { lang, t } = useI18n();
  const ui = useMemo(
    () => ({
      paymentInfoTitle: lang === "ar" ? "معلومات الدفع" : lang === "tr" ? "Odeme bilgileri" : "Payment info",
      draftRestored:
        lang === "ar"
          ? "تم استرجاع آخر بيانات محفوظة للنموذج بعد التحديث."
          : lang === "tr"
            ? "Guncellemeden sonra forma kaydedilen son veriler geri yuklendi."
            : "Last saved draft data has been restored after refresh.",
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      noHotel: lang === "ar" ? "بدون فندق" : lang === "tr" ? "Otelsiz" : "No hotel",
      bookingWord: lang === "ar" ? "حجز" : lang === "tr" ? "Rezervasyon" : "Booking",
      nights: lang === "ar" ? "ليالٍ" : lang === "tr" ? "gece" : "nights",
      saveBeforePrint:
        lang === "ar"
          ? "احفظ القسيمة أولًا ليعمل زر الطباعة."
          : lang === "tr"
            ? "Yazdirma dugmesinin calismasi icin once kaydedin."
            : "Save first to enable printing.",
      printOpenFailed:
        lang === "ar" ? "تعذر فتح ملف الطباعة." : lang === "tr" ? "Yazdirma dosyasi acilamadi." : "Unable to open print file.",
      invoiceOpenFailed:
        lang === "ar" ? "تعذر فتح ملف الفاتورة." : lang === "tr" ? "Fatura dosyasi acilamadi." : "Unable to open invoice file.",
      saveBeforeGuestList:
        lang === "ar"
          ? "احفظ القسيمة أولًا لتنزيل قائمة النزلاء."
          : lang === "tr"
            ? "Misafir listesi indirmek icin once kaydedin."
            : "Save first to download guest list.",
      guestListDownloadFailed:
        lang === "ar" ? "تعذر تنزيل قائمة النزلاء." : lang === "tr" ? "Misafir listesi indirilemedi." : "Unable to download guest list.",
      reservationList: lang === "ar" ? "قائمة الحجوزات" : lang === "tr" ? "Rezervasyon listesi" : "Bookings list",
      clear: lang === "ar" ? "مسح" : lang === "tr" ? "Temizle" : "Clear",
      reservationSearchPlaceholder:
        lang === "ar"
          ? "بحث بالحجوزات… (فندق، رقم، تاريخ، حالة)"
          : lang === "tr"
            ? "Rezervasyonlarda ara... (otel, no, tarih, durum)"
            : "Search bookings... (hotel, number, date, status)",
      actionEdit: lang === "ar" ? "1. تعديل الحجز" : lang === "tr" ? "1. Rezervasyonu duzenle" : "1. Edit booking",
      actionCancel: lang === "ar" ? "2. إلغاء الحجز" : lang === "tr" ? "2. Rezervasyonu iptal et" : "2. Cancel booking",
      actionDelete: lang === "ar" ? "3. حذف الحجز" : lang === "tr" ? "3. Rezervasyonu sil" : "3. Delete booking",
      actionHotel: lang === "ar" ? "4. إرسال إلى الأوتيل" : lang === "tr" ? "4. Otele gonder" : "4. Send to hotel",
      actionClient: lang === "ar" ? "5. إرسال إلى العميل" : lang === "tr" ? "5. Musteriye gonder" : "5. Send to client",
      actionInvoice: lang === "ar" ? "6. الفوترة للمحاسبة" : lang === "tr" ? "6. Muhasebe faturalama" : "6. Invoice to accounting",
      editBooking: lang === "ar" ? "التعديل على الحجز" : lang === "tr" ? "Rezervasyonu duzenle" : "Edit booking",
      selectBooking: lang === "ar" ? "حدد الحجز المطلوب" : lang === "tr" ? "Rezervasyonu secin" : "Select booking",
      jumpToForm:
        lang === "ar" ? "الانتقال إلى نموذج الحجز" : lang === "tr" ? "Rezervasyon formuna git" : "Go to booking form",
      cancelWithNote:
        lang === "ar" ? "إلغاء الحجز مع ملاحظة" : lang === "tr" ? "Not ile rezervasyon iptali" : "Cancel booking with note",
      selectCancelBooking:
        lang === "ar" ? "حدد الحجز المراد إلغاؤه" : lang === "tr" ? "Iptal edilecek rezervasyonu secin" : "Select booking to cancel",
      noSavedHotelEmail:
        lang === "ar"
          ? "لا يوجد إيميل محفوظ لهذا الفندق"
          : lang === "tr"
            ? "Bu otel icin kayitli e-posta yok"
            : "No saved email for this hotel",
      cancelNotePlaceholder:
        lang === "ar" ? "اكتب ملاحظة الإلغاء" : lang === "tr" ? "Iptal notu yazin" : "Write cancellation note",
      cancelConfirm:
        lang === "ar" ? "تأكيد الإلغاء" : lang === "tr" ? "Iptali onayla" : "Confirm cancellation",
      printPreview: lang === "ar" ? "طباعة / معاينة PDF" : lang === "tr" ? "PDF yazdir / onizle" : "Print / Preview PDF",
      addHotelEmailHint:
        lang === "ar"
          ? "أضف إيميلًا للفندق ليعمل زر الإرسال."
          : lang === "tr"
            ? "Gonder butonu icin otel e-postasi ekleyin."
            : "Add hotel email to enable sending.",
      saveVoucherFirstPrint:
        lang === "ar"
          ? "احفظ القسيمة أولًا ليعمل زر طباعة ومعاينة الـ PDF."
          : lang === "tr"
            ? "PDF yazdirma/onizleme icin once kaydedin."
            : "Save first to enable PDF print/preview.",
      cannotPrintBeforeSave:
        lang === "ar"
          ? "لا يمكن معاينة/طباعة الـ PDF قبل حفظ القسيمة (حتى نحصل على رقم القسيمة)."
          : lang === "tr"
            ? "Kupon kaydetmeden PDF onizleme/yazdirma yapilamaz."
            : "Cannot preview/print PDF before saving (to get voucher number).",
      useSavedEmail:
        lang === "ar" ? "استخدام الإيميل المحفوظ" : lang === "tr" ? "Kayitli e-postayi kullan" : "Use saved email",
      useSavedClientEmail:
        lang === "ar" ? "استخدام إيميل العميل المحفوظ" : lang === "tr" ? "Musterinin kayitli e-postasini kullan" : "Use saved client email",
      useManualEmail:
        lang === "ar" ? "إدخال إيميل يدوي" : lang === "tr" ? "Elle e-posta gir" : "Enter email manually",
      noSavedHotelEmailShort:
        lang === "ar" ? "لا يوجد إيميل محفوظ للفندق" : lang === "tr" ? "Otel icin kayitli e-posta yok" : "No saved hotel email",
      noSavedClientEmail:
        lang === "ar" ? "لا يوجد إيميل محفوظ للعميل" : lang === "tr" ? "Musteri icin kayitli e-posta yok" : "No saved client email",
      deletedCurrentBooking:
        lang === "ar"
          ? "تم حذف بيانات الحجز الحالية من النموذج."
          : lang === "tr"
            ? "Mevcut rezervasyon verisi formdan silindi."
            : "Current booking data was removed from the form.",
      markedCancelled:
        lang === "ar"
          ? "تم تعليم الحجز المحدد كملغى وإضافة الملاحظة."
          : lang === "tr"
            ? "Secilen rezervasyon iptal olarak isaretlendi ve not eklendi."
            : "Selected booking marked cancelled and note added.",
      salutation: lang === "ar" ? "اللقب" : lang === "tr" ? "Hitap" : "Salutation",
      guestNameHint: lang === "ar" ? "الاسم كما هو في الجواز." : lang === "tr" ? "Pasaporttaki adla ayni." : "Name exactly as in passport.",
      optionalHint: lang === "ar" ? "اختياري." : lang === "tr" ? "Opsiyonel." : "Optional.",
      childAgeExample: lang === "ar" ? "مثال: 7" : lang === "tr" ? "Ornek: 7" : "Example: 7",
      noGuestsForBooking:
        lang === "ar"
          ? "لا يوجد نزلاء مسجّلون لهذا الحجز. اضغط «إضافة نزيل» أو استخدم «توزيع تلقائي» أعلى الصفحة."
          : lang === "tr"
            ? "Bu rezervasyon icin kayitli misafir yok. \"Misafir ekle\" veya yukaridaki \"otomatik dagitim\" secenegini kullanin."
            : "No guests registered for this booking. Click \"Add guest\" or use \"Auto-assign\" above.",
      addGuest: lang === "ar" ? "إضافة نزيل" : lang === "tr" ? "Misafir ekle" : "Add guest",
      roomCodeType: lang === "ar" ? "نوع الغرفة (سنغل/دبل)" : lang === "tr" ? "Oda tipi kodu (SNG/DBL)" : "Room code type (SNG/DBL)",
      roomCodeHint:
        lang === "ar"
          ? "يتغير تلقائيًا إذا كان فارغ (حسب عدد الأشخاص)، ويمكنك تعديله يدويًا."
          : lang === "tr"
            ? "Bosken kisi sayisina gore otomatik belirlenir; elle de degistirebilirsiniz."
            : "Auto-fills when empty based on pax count; you can edit manually.",
      selected: lang === "ar" ? "المحدد" : lang === "tr" ? "Secilen" : "Selected",
      board: lang === "ar" ? "الوجبة" : lang === "tr" ? "Pansiyon" : "Board",
      roomCount: lang === "ar" ? "عدد الغرف" : lang === "tr" ? "Oda sayisi" : "Room count",
      buyPrice: lang === "ar" ? "سعر الشراء" : lang === "tr" ? "Alis fiyati" : "Buying price",
      buyCurrency: lang === "ar" ? "عملة الشراء" : lang === "tr" ? "Alis para birimi" : "Buying currency",
      sellPrice: lang === "ar" ? "سعر المبيع" : lang === "tr" ? "Satis fiyati" : "Selling price",
      sellCurrency: lang === "ar" ? "عملة المبيع" : lang === "tr" ? "Satis para birimi" : "Selling currency",
      checkIn: lang === "ar" ? "تاريخ الدخول" : lang === "tr" ? "Giris tarihi" : "Check-in date",
      checkOut: lang === "ar" ? "تاريخ الخروج" : lang === "tr" ? "Cikis tarihi" : "Check-out date",
      nightsCount: lang === "ar" ? "عدد الليالي" : lang === "tr" ? "Gece sayisi" : "Nights count",
      current: lang === "ar" ? "الحالي" : lang === "tr" ? "Mevcut" : "Current",
      noneShort: lang === "ar" ? "بدون" : lang === "tr" ? "Yok" : "None",
      transferService: lang === "ar" ? "خدمة الترنسفير" : lang === "tr" ? "Transfer hizmeti" : "Transfer service",
      transferServicePricePerDay:
        lang === "ar" ? "سعر الخدمة باليوم" : lang === "tr" ? "Gunluk hizmet ucreti" : "Service price per day",
      daysCount: lang === "ar" ? "عدد الأيام" : lang === "tr" ? "Gun sayisi" : "Days count",
      paymentDetails: lang === "ar" ? "تفاصيل الدفع" : lang === "tr" ? "Odeme detaylari" : "Payment details",
      showPaymentBox:
        lang === "ar"
          ? "إظهار مستطيل الدفع على PDF قسيمة العميل"
          : lang === "tr"
            ? "Musteri PDF kuponunda odeme kutusunu goster"
            : "Show payment box on customer voucher PDF",
      paymentHelp:
        lang === "ar"
          ? "عند التفعيل يُرسل الطلب مع ملف PDF للعميل؛ عند الإيقاف يُخفى المستطيل حتى لو كان مفعّلاً في الإعدادات العامة. القيم النصية هنا تُحفظ مع مسودة القسيمة؛ محتوى الصندوق في الملف يأتي من إعدادات الخادم (إعدادات ← PDF)."
          : lang === "tr"
            ? "Etkinlestirince musteriye PDF ile gonderilir; kapatinca genel ayarlarda acik olsa bile kutu gizlenir. Buradaki metinler taslakla kaydedilir; dosyadaki kutu icerigi sunucu ayarlarindan gelir (Ayarlar -> PDF)."
            : "When enabled, it is sent with the customer PDF; when disabled, the box is hidden even if global settings enable it. Text here is saved with the voucher draft; final box content in PDF is loaded from server settings (Settings -> PDF).",
      titleLabel: lang === "ar" ? "العنوان" : lang === "tr" ? "Baslik" : "Title",
      titlePlaceholder:
        lang === "ar" ? "يظهر في أعلى صندوق الدفع في PDF" : lang === "tr" ? "PDF odeme kutusunun ustunde gorunur" : "Shown at the top of payment box in PDF",
      bankLabel: lang === "ar" ? "البنك" : lang === "tr" ? "Banka" : "Bank",
      bankPlaceholder: lang === "ar" ? "أدخل اسم البنك" : lang === "tr" ? "Banka adini girin" : "Enter bank name",
      accountLabel: lang === "ar" ? "الحساب" : lang === "tr" ? "Hesap" : "Account",
      accountPlaceholder: lang === "ar" ? "رقم الحساب" : lang === "tr" ? "Hesap numarasi" : "Account number",
      paymentLink: lang === "ar" ? "رابط الدفع" : lang === "tr" ? "Odeme baglantisi" : "Payment link",
      openLink: lang === "ar" ? "فتح الرابط" : lang === "tr" ? "Baglantiyi ac" : "Open link",
      extraNotes: lang === "ar" ? "ملاحظات إضافية" : lang === "tr" ? "Ek notlar" : "Additional notes",
      extraNotesPlaceholder:
        lang === "ar" ? "نص يظهر في PDF ضمن الملاحظات إن وُجد" : lang === "tr" ? "Varsa PDF notlarinda gorunen metin" : "Text shown in PDF notes if provided",
      notesSection: lang === "ar" ? "الملاحظات" : lang === "tr" ? "Notlar" : "Notes",
      hotelNotePlaceholder: lang === "ar" ? "ملاحظة للفندق" : lang === "tr" ? "Otel notu" : "Note for hotel",
      clientNotePlaceholder: lang === "ar" ? "ملاحظة للعميل" : lang === "tr" ? "Musteri notu" : "Note for client",
      generalNotePlaceholder: lang === "ar" ? "ملاحظة عامة" : lang === "tr" ? "Genel not" : "General note",
      deleteBooking: lang === "ar" ? "حذف الحجز" : lang === "tr" ? "Rezervasyonu sil" : "Delete booking",
      deleteBookingWarn:
        lang === "ar"
          ? "سيؤدي هذا إلى حذف جميع أسطر الحجز الحالية من النموذج."
          : lang === "tr"
            ? "Bu, formdaki tum mevcut rezervasyon satirlarini siler."
            : "This will remove all current booking lines from the form.",
      hotelEmailNoteLabel: lang === "ar" ? "ملاحظة الإيميل للأوتيل" : lang === "tr" ? "Otel e-posta notu" : "Hotel email note",
      clientEmailNoteLabel: lang === "ar" ? "ملاحظة الإيميل للعميل" : lang === "tr" ? "Musteri e-posta notu" : "Client email note",
      emailNotePlaceholder:
        lang === "ar" ? "اكتب ملاحظة تُرسل مع الإيميل..." : lang === "tr" ? "E-posta ile gonderilecek notu yazin..." : "Write a note to send with the email...",
      invoiceToAccounting:
        lang === "ar" ? "الفوترة للإرسال للمحاسبة" : lang === "tr" ? "Muhasebeye gonderim icin faturalama" : "Invoice for accounting",
      selectClient: lang === "ar" ? "اختر العميل" : lang === "tr" ? "Musteri secin" : "Select client",
      invoiceNumberPlaceholder: lang === "ar" ? "رقم الفاتورة" : lang === "tr" ? "Fatura numarasi" : "Invoice number",
      invoiceAmountPlaceholder: lang === "ar" ? "المبلغ الإجمالي" : lang === "tr" ? "Toplam tutar" : "Total amount",
      sendToClientHint:
        lang === "ar"
          ? "أضف إيميلًا للعميل أو اختر الإدخال اليدوي ليعمل زر الإرسال."
          : lang === "tr"
            ? "Gonder butonu icin musteri e-postasi ekleyin veya manuel giris secin."
            : "Add client email or choose manual input to enable sending.",
      saveIncompleteBooking:
        lang === "ar"
          ? "تعذر حفظ القسيمة: أكمل بيانات الحجز رقم {n} (اختر الفندق ونوع الغرفة)."
          : lang === "tr"
            ? "Kayit basarisiz: {n}. rezervasyon satirini tamamlayin (otel ve oda turu secin)."
            : "Unable to save: complete booking row {n} (select hotel and room type).",
      bookingSerial: lang === "ar" ? "رقم تسلسلي للحجز" : lang === "tr" ? "Rezervasyon seri no" : "Booking serial",
      serialHintNew:
        lang === "ar"
          ? "اختر محيل ثم أضف حجز جديد، أو ولّد رقم لهذا الحجز."
          : lang === "tr"
            ? "Yonlendiren secin, yeni rezervasyon ekleyin veya bu rezervasyona numara uretin."
            : "Choose referrer then add booking, or generate number for this booking.",
      generate: lang === "ar" ? "توليد" : lang === "tr" ? "Uret" : "Generate",
      serialFixedHint:
        lang === "ar"
          ? "ثابت لهذا الحجز (لا يتغير عند تغيير المحيل)."
          : lang === "tr"
            ? "Bu rezervasyon icin sabittir (yonlendiren degisse de degismez)."
            : "Fixed for this booking (doesn't change when referrer changes).",
      peopleForBooking: lang === "ar" ? "الأشخاص لهذا الحجز" : lang === "tr" ? "Bu rezervasyonun kisileri" : "People for this booking",
      totalPeople: lang === "ar" ? "الإجمالي" : lang === "tr" ? "Toplam" : "Total",
      persons: lang === "ar" ? "شخصًا" : lang === "tr" ? "kisi" : "persons",
      adults: lang === "ar" ? "بالغون" : lang === "tr" ? "Yetiskin" : "Adults",
      children: lang === "ar" ? "أطفال" : lang === "tr" ? "Cocuk" : "Children",
      infants: lang === "ar" ? "رضع" : lang === "tr" ? "Bebek" : "Infants",
      roomType: lang === "ar" ? "نوع الغرفة" : lang === "tr" ? "Oda tipi" : "Room type",
      reservationStatus: lang === "ar" ? "حالة الحجز" : lang === "tr" ? "Rezervasyon durumu" : "Reservation status",
      reservationType: lang === "ar" ? "نوع الحجز" : lang === "tr" ? "Rezervasyon tipi" : "Reservation type",
      confirmationNo: lang === "ar" ? "رقم التأكيد" : lang === "tr" ? "Onay numarasi" : "Confirmation number",
      sendToAccounting: lang === "ar" ? "إرسال للمحاسبة" : lang === "tr" ? "Muhasebeye gonder" : "Send to accounting",
      printInvoice: lang === "ar" ? "طباعة الفاتورة" : lang === "tr" ? "Faturayi yazdir" : "Print invoice",
    }),
    [lang],
  );
  const reservationsSectionRef = useRef<HTMLDivElement | null>(null);
  const draftHydratedRef = useRef(false);
  const paymentHydratedFromDraftRef = useRef(false);
  const persistDraftTimeoutRef = useRef<number | null>(null);
  const [nightsDraftByIndex, setNightsDraftByIndex] = useState<Record<number, string>>({});
  const [reservationListSearch, setReservationListSearch] = useState("");
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [nextVoucherPreview, setNextVoucherPreview] = useState<{
    voucher_nr: string;
    sequence_number: number;
    destination_code: string;
  } | null>(null);
  const [localSeqByReferrerId, setLocalSeqByReferrerId] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("");
  const [createdVoucher, setCreatedVoucher] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeAdminAction, setActiveAdminAction] = useState<string | null>(null);
  const [selectedReservationIndex, setSelectedReservationIndex] = useState("0");
  const [openReservationIndex, setOpenReservationIndex] = useState<number>(0);
  const [reservationTabByIndex, setReservationTabByIndex] = useState<Record<number, "main" | "dates" | "notes" | "transfer">>({});
  const [cancellationNote, setCancellationNote] = useState("");
  const [hotelDeliveryMode, setHotelDeliveryMode] = useState<"saved" | "manual">("saved");
  const [hotelEmailManual, setHotelEmailManual] = useState("");
  const [hotelEmailNote, setHotelEmailNote] = useState("");
  const [clientDeliveryMode, setClientDeliveryMode] = useState<"saved" | "manual">("manual");
  const [clientEmailManual, setClientEmailManual] = useState("");
  const [clientEmailNote, setClientEmailNote] = useState("");
  const [hotelVisibleFields, setHotelVisibleFields] = useState<string[]>([
    "hotel_info",
    "reservation_info",
    "status_info",
    "room_summary",
    "voucher_note",
  ]);
  const [clientVisibleFields, setClientVisibleFields] = useState<string[]>([
    "customer_info",
    "pax_info",
    "reservation_info",
    "guest_list",
    "prices",
  ]);
  const [invoiceForm, setInvoiceForm] = useState({
    clientId: "",
    number: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    totalAmount: 0,
  });
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printTemplate, setPrintTemplate] = useState<"hotel" | "customer">("hotel");
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string>("");
  const [printLoading, setPrintLoading] = useState(false);
  /** Payment section (editable); seeded from PDF settings unless مسودة تحتوي قيمًا */
  const [voucherPdfPaymentBox, setVoucherPdfPaymentBox] = useState<VoucherPaymentBoxState>({
    ...EMPTY_VOUCHER_PAYMENT_BOX,
  });
  const [voucherDropdowns, setVoucherDropdowns] = useState<Record<string, DropdownOptionRow[]>>({});
  const [reservationCols, setReservationCols] = useState<number[]>(DEFAULT_RESERVATION_COLS);
  const getReservationTab = (idx: number) => reservationTabByIndex[idx] || "main";

  useReloadOnNavigateOrTabVisible(() => {
    void fetchDropdownOptionsMap([
      DROPDOWN_CATEGORY_KEYS.bookingRoomCode,
      DROPDOWN_CATEGORY_KEYS.bookingBoardCode,
      DROPDOWN_CATEGORY_KEYS.bookingReservationStatus,
      DROPDOWN_CATEGORY_KEYS.bookingReservationType,
      DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras,
      DROPDOWN_CATEGORY_KEYS.commonCurrency,
    ]).then(setVoucherDropdowns);
  });

  const roomCodeSelectOptions = useMemo(
    () => voucherDropdowns[DROPDOWN_CATEGORY_KEYS.bookingRoomCode] || [],
    [voucherDropdowns],
  );
  const boardCodeSelectOptions = useMemo(
    () => voucherDropdowns[DROPDOWN_CATEGORY_KEYS.bookingBoardCode] || [],
    [voucherDropdowns],
  );
  const reservationStatusSelectOptions = useMemo(
    () => voucherDropdowns[DROPDOWN_CATEGORY_KEYS.bookingReservationStatus] || [],
    [voucherDropdowns],
  );
  const reservationTypeSelectOptions = useMemo(
    () => voucherDropdowns[DROPDOWN_CATEGORY_KEYS.bookingReservationType] || [],
    [voucherDropdowns],
  );
  const currencySelectOptions = useMemo(
    () => voucherDropdowns[DROPDOWN_CATEGORY_KEYS.commonCurrency] || [],
    [voucherDropdowns],
  );
  const extrasFieldOptions = useMemo(() => {
    const seen = new Set<string>();
    const apiRows = (voucherDropdowns[DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras] || [])
      .map((row) => {
        const key = String(row.fieldKey || row.value || "").trim();
        if (!key) return null;
        return { value: key, label: String(row.label || EXTRAS_FIELD_LABEL_BY_KEY[key] || key) };
      })
      .filter((row): row is { value: string; label: string } => Boolean(row))
      .filter((row) => {
        if (seen.has(row.value)) return false;
        seen.add(row.value);
        return true;
      });
    if (apiRows.length) return apiRows;
    return EXTRAS_FIELD_DEFAULTS.map((x) => ({ value: x.value, label: x.label }));
  }, [voucherDropdowns]);
  const guestSalutationOptions = useMemo(
    () => [
      { value: "", label: "—" },
      { value: "mr", label: "Mr" },
      { value: "ms", label: "Ms" },
      { value: "chd", label: ui.children },
      { value: "inf", label: ui.infants },
    ],
    [ui.children, ui.infants],
  );

  const [voucher, setVoucher] = useState({
    voucher_nr: "",
    destination_code: "",
    sequence_number: 1,
    sale_date: "",
    referrer: "",
    client_title: "" as "" | "mr" | "ms",
    client_name: "",
    adult_count: 0,
    child_count: 0,
    infant_count: 0,
    extra_bed_count: 0,
    transfer_fee: 0,
    transfer_buying_price: 0,
    transfer_currency: "USD",
    selling_currency: "USD",
    handling_fee_per_pax: 0,
    handling_currency: "USD",
    exchange_rate_eur_to_usd: 1,
    notes: "",
    flight_details: "",
    data_entry_confirmed: false,
    voucher_issued: false,
    client_confirmed: false,
  });

  const [guests, setGuests] = useState<
    (Guest & { passport_number: string; reservation_index: number | null; room_number: number | null })[]
  >([
    {
      salutation: "",
      full_name: "",
      is_leader: true,
      passport_number: "",
      child_age: "",
      reservation_index: null,
      room_number: null,
    },
  ]);
  const [reservations, setReservations] = useState<Reservation[]>([
    {
      hotel: "",
      room_type: "",
      room_type_code: "GUES",
      board_code: "BB",
      room_code: "DBL",
      room_count: 1,
      selling_date: "",
      adult_count: 0,
      child_count: 0,
      infant_count: 0,
      extra_bed: false,
      extra_bed_service_price: 0,
      extra_bed_service_currency: "USD",
      extra_bed_service_free: false,
      promotion_room: false,
      promotion_room_service_price: 0,
      promotion_room_service_currency: "USD",
      promotion_room_service_free: false,
      honey_moons: false,
      honey_moons_service_price: 0,
      honey_moons_service_currency: "USD",
      honey_moons_service_free: false,
      free_of_charge: false,
      check_in: "",
      check_out: "",
      confirmation_number: "",
      room_nr: "",
      external_voucher_no: "",
      buying_price: 0,
      buying_currency: "EUR",
      selling_price: 0,
      selling_currency: "USD",
      reservation_notes: "",
      hotel_note: "",
      internal_note: "",
      transfer_note: "",
      operator_note: "",
      allotment_type: "",
      hotel_confirmation: "",
      operator_confirmation: "",
      reservation_status: "",
      reservation_type: "",
      print_option: "",
      special_code: "",
      code_2: "",
      code_3: "",
      code_4: "",
      spo_spec_code: "",
      package_splitting: false,
      index_nr: "",
      bubble: false,
      passive: false,
      free_sale: false,
      local_service: false,
      local_service_price: 0,
      local_service_currency: "USD",
      local_service_free: false,
      transfer_service_type: "",
      transfer_service_price_per_day: 0,
      transfer_service_currency: "USD",
      transfer_service_days: 1,
      transfer_pickup_date: "",
      transfer_dropoff_date: "",
      airport_to_hotel: false,
      airport_to_hotel_price: 0,
      airport_to_hotel_currency: "USD",
      hotel_to_airport: false,
      hotel_to_airport_price: 0,
      hotel_to_airport_currency: "USD",
      voucher_form_printing: "",
      confirmation_form_print: "",
      arrival_transfer: false,
      arrival_transfer_date: "",
      arrival_transfer_type: "",
      departure_transfer: false,
      departure_transfer_date: "",
      departure_transfer_type: "",
      handling_fee_type: "",
      extras_prices: {},
    },
  ]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [hotelsRes, roomTypesRes, clientsRes, referrersRes, meRes] = await Promise.allSettled([
        api.get<Hotel[]>("/hotels/"),
        api.get<RoomType[]>("/room-types/"),
        api.get<Client[]>("/clients/"),
        api.get<Referrer[]>("/referrers/"),
        api.get<CurrentUser>("/auth/me/"),
      ]);

      if (!active) return;

      if (hotelsRes.status === "fulfilled") setHotels(hotelsRes.value);
      if (roomTypesRes.status === "fulfilled") setRoomTypes(roomTypesRes.value);
      if (clientsRes.status === "fulfilled") setClients(clientsRes.value);
      if (referrersRes.status === "fulfilled") setReferrers(referrersRes.value);

      if (meRes.status === "fulfilled") {
        setIsAdmin(Boolean(meRes.value.is_staff));
      } else {
        setIsAdmin(false);
      }
    };

    load().catch(() => {
      if (active) {
        setIsAdmin(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [globalRows, voucherRows] = await Promise.all([
          api.get<Array<{ value?: string }>>(
            `/app-settings/?section=pdf&key=${encodeURIComponent("doc.global.config")}`
          ),
          api.get<Array<{ value?: string }>>(
            `/app-settings/?section=pdf&key=${encodeURIComponent("doc.voucher.config")}`
          ),
        ]);
        let cfg: Record<string, unknown> = {};
        const g = globalRows[0]?.value;
        const v = voucherRows[0]?.value;
        try {
          if (g) cfg = deepMergePdfConfig(cfg, JSON.parse(g) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        try {
          if (v) cfg = deepMergePdfConfig(cfg, JSON.parse(v) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
        const pb = cfg.payment_box as Record<string, unknown> | undefined;
        const str = (k: string) => {
          const v = pb?.[k];
          return typeof v === "string" ? v : String(v ?? "");
        };
        if (!cancelled && !paymentHydratedFromDraftRef.current) {
          setVoucherPdfPaymentBox({
            enabled: Boolean(pb?.enabled),
            title: str("title").trim() || ui.paymentInfoTitle,
            bank: str("bank"),
            iban: str("iban"),
            account: str("account"),
            info_text: str("info_text"),
            payment_url: str("payment_url").trim(),
          });
        }
      } catch {
        if (!cancelled && !paymentHydratedFromDraftRef.current) {
          setVoucherPdfPaymentBox((prev) => ({ ...prev, enabled: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ui.paymentInfoTitle]);

  // Restore last draft after refresh so data isn't lost.
  useEffect(() => {
    if (draftHydratedRef.current) return;
    if (typeof window === "undefined") return;

    const draft = safeJsonParse<{
      voucher: typeof voucher;
      reservations: Reservation[];
      guests: typeof guests;
      reservationCols: number[];
      selectedReservationIndex: string;
      cancellationNote: string;
      hotelVisibleFields: string[];
      clientVisibleFields: string[];
      hotelDeliveryMode: "saved" | "manual";
      hotelEmailManual: string;
      hotelEmailNote: string;
      clientDeliveryMode: "saved" | "manual";
      clientEmailManual: string;
      clientEmailNote: string;
      voucherPdfPaymentBox?: unknown;
    }>(window.localStorage.getItem(VOUCHER_DRAFT_STORAGE_KEY));

    if (draft) {
      if (draft.voucher) setVoucher(draft.voucher);
      if (Array.isArray(draft.reservations) && draft.reservations.length) setReservations(draft.reservations);
      if (Array.isArray(draft.guests) && draft.guests.length) setGuests(draft.guests);
      if (Array.isArray(draft.reservationCols) && draft.reservationCols.length) {
        setReservationCols(upgradeReservationCols(draft.reservationCols));
      }
      if (typeof draft.selectedReservationIndex === "string") setSelectedReservationIndex(draft.selectedReservationIndex);
      if (typeof draft.cancellationNote === "string") setCancellationNote(draft.cancellationNote);
      if (Array.isArray(draft.hotelVisibleFields)) setHotelVisibleFields(draft.hotelVisibleFields);
      if (Array.isArray(draft.clientVisibleFields)) setClientVisibleFields(draft.clientVisibleFields);
      if (draft.hotelDeliveryMode) setHotelDeliveryMode(draft.hotelDeliveryMode === "manual" ? "manual" : "saved");
      if (typeof draft.hotelEmailManual === "string") setHotelEmailManual(draft.hotelEmailManual);
      if (typeof draft.hotelEmailNote === "string") setHotelEmailNote(draft.hotelEmailNote);
      if (draft.clientDeliveryMode) setClientDeliveryMode(draft.clientDeliveryMode === "saved" ? "saved" : "manual");
      if (typeof draft.clientEmailManual === "string") setClientEmailManual(draft.clientEmailManual);
      if (typeof draft.clientEmailNote === "string") setClientEmailNote(draft.clientEmailNote);
      if (draft.voucherPdfPaymentBox != null) {
        setVoucherPdfPaymentBox(normalizePaymentDraft(draft.voucherPdfPaymentBox));
        paymentHydratedFromDraftRef.current = true;
      }
      setStatus(ui.draftRestored);
    }

    draftHydratedRef.current = true;
  }, [ui.draftRestored]);

  // Persist draft on changes (debounced) to prevent data loss on refresh.
  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (typeof window === "undefined") return;

    if (persistDraftTimeoutRef.current) {
      window.clearTimeout(persistDraftTimeoutRef.current);
    }

    persistDraftTimeoutRef.current = window.setTimeout(() => {
      const draft = {
        voucher,
        reservations,
        guests,
        reservationCols,
        selectedReservationIndex,
        cancellationNote,
        hotelVisibleFields,
        clientVisibleFields,
        hotelDeliveryMode,
        hotelEmailManual,
        hotelEmailNote,
        clientDeliveryMode,
        clientEmailManual,
        clientEmailNote,
        voucherPdfPaymentBox,
      };
      window.localStorage.setItem(VOUCHER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }, 250);

    return () => {
      if (persistDraftTimeoutRef.current) {
        window.clearTimeout(persistDraftTimeoutRef.current);
      }
    };
  }, [
    voucher,
    reservations,
    guests,
    reservationCols,
    selectedReservationIndex,
    cancellationNote,
    hotelVisibleFields,
    clientVisibleFields,
    hotelDeliveryMode,
    hotelEmailManual,
    hotelEmailNote,
    clientDeliveryMode,
    clientEmailManual,
    clientEmailNote,
    voucherPdfPaymentBox,
  ]);

  const firstCheckIn = reservations
    .map((row) => row.check_in)
    .filter(Boolean)
    .sort()[0];
  const effectiveSaleDate = firstCheckIn || voucher.sale_date;
  /** Preview only — رقم القسيمة الفعلي يُنشأ على الخادم عند الحفظ */
  const voucherNumber = nextVoucherPreview?.voucher_nr || "";

  const getReferrerCodeForVoucher = () => {
    const ref = referrers.find((r) => String(r.id) === String(voucher.referrer));
    return (ref?.referrer_code || "sr000").toLowerCase();
  };

  const makeBookingSerial = (baseSeq: number, reservationOffset: number) => {
    const refCode = getReferrerCodeForVoucher();
    const yy = yearYY(effectiveSaleDate);
    const seq = baseSeq + reservationOffset;
    return `${refCode}-${yy}-${pad5(seq)}`;
  };

  useEffect(() => {
    const id = String(voucher.referrer || "").trim();
    if (!id) {
      setNextVoucherPreview(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ voucher_nr: string; sequence_number: number; destination_code: string }>(
        `/vouchers/next-number-preview/?referrer=${encodeURIComponent(id)}&sale_date=${encodeURIComponent(
          effectiveSaleDate || ""
        )}`
      )
      .then((data) => {
        if (!cancelled) setNextVoucherPreview(data);
      })
      .catch(() => {
        if (!cancelled) setNextVoucherPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [voucher.referrer, effectiveSaleDate]);

  // Keep a local per-referrer sequence for NEW reservations only.
  // This avoids changing old reservations when referrer changes.
  useEffect(() => {
    const refId = String(voucher.referrer || "").trim();
    const baseSeq = nextVoucherPreview?.sequence_number;
    if (!refId || baseSeq == null) return;
    setLocalSeqByReferrerId((prev) => {
      const current = prev[refId];
      if (current != null && current >= baseSeq) return prev;
      return { ...prev, [refId]: baseSeq };
    });
  }, [voucher.referrer, nextVoucherPreview?.sequence_number]);

  const aggregatedReservationPax = useMemo(() => {
    let adults = 0;
    let children = 0;
    let infants = 0;
    for (const r of reservations) {
      adults += Number(r.adult_count) || 0;
      children += Number(r.child_count) || 0;
      infants += Number(r.infant_count) || 0;
    }
    return { adults, children, infants, total: adults + children + infants };
  }, [reservations]);

  const voucherPaxTotal =
    Number(voucher.adult_count) + Number(voucher.child_count) + Number(voucher.infant_count);
  const totalPax =
    aggregatedReservationPax.total > 0 ? aggregatedReservationPax.total : voucherPaxTotal;
  const handlingTotal = totalPax * voucher.handling_fee_per_pax;
  const reservationTotal = reservations.reduce(
    (sum, reservation) => sum + (reservation.selling_price || 0),
    0
  );
  const grandTotal = reservationTotal + voucher.transfer_fee + handlingTotal;

  const autoAssignGuests = () => {
    const roomSlots: { reservationIndex: number; roomNumber: number }[] = [];
    reservations.forEach((reservation, reservationIndex) => {
      for (let roomNumber = 1; roomNumber <= reservation.room_count; roomNumber += 1) {
        roomSlots.push({ reservationIndex, roomNumber });
      }
    });
    setGuests((prev) =>
      prev.map((guest, index) => {
        const slot = roomSlots[index % roomSlots.length];
        return {
          ...guest,
          reservation_index: slot ? slot.reservationIndex : null,
          room_number: slot ? slot.roomNumber : null,
        };
      })
    );
  };

  const updateReservation = (index: number, next: Partial<Reservation>) => {
    setReservations((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...next } : item))
    );
  };

  /** عند ربط نزلاء بحجز، تعبئة بالغ/طفل/رضيع من عمود اللقب */
  useEffect(() => {
    setReservations((prev) => {
      let changed = false;
      const next = prev.map((r, idx) => {
        const linked = guests.filter((g) => g.reservation_index === idx);
        if (!linked.length) return r;
        let adults = 0;
        let children = 0;
        let infants = 0;
        for (const g of linked) {
          const s = (g.salutation || "").trim();
          if (s === "inf") infants += 1;
          else if (s === "chd") children += 1;
          else adults += 1;
        }
        const ra = Number(r.adult_count) || 0;
        const rc = Number(r.child_count) || 0;
        const ri = Number(r.infant_count) || 0;
        if (adults === ra && children === rc && infants === ri) return r;
        changed = true;
        return { ...r, adult_count: adults, child_count: children, infant_count: infants };
      });
      return changed ? next : prev;
    });
  }, [guests]);

  // Auto-suggest room_code / room_count from pax, unless user already set custom values.
  // (We only have DBL/SNG for now.)
  useEffect(() => {
    setReservations((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        const paxFromRow = (Number(r.adult_count) || 0) + (Number(r.child_count) || 0) + (Number(r.infant_count) || 0);
        const pax = paxFromRow > 0 ? paxFromRow : totalPax;
        const suggestedCode = suggestRoomCodeFromPax(pax);
        const nextRoomCode = !r.room_code ? suggestedCode : r.room_code;

        // Conservative room_count update: only adjust when still in default-ish state.
        const suggestedCount = suggestRoomCountFromPax(pax, nextRoomCode);
        const currentCount = Number(r.room_count) || 0;
        const nextRoomCount =
          currentCount <= 0 ? 1 : currentCount;

        if (nextRoomCode !== r.room_code || nextRoomCount !== r.room_count) {
          changed = true;
          return { ...r, room_code: nextRoomCode, room_count: nextRoomCount };
        }
        return r;
      });
      return changed ? next : prev;
    });
  }, [totalPax]);

  const addReservation = () => {
    const refId = String(voucher.referrer || "").trim();
    const baseSeq = nextVoucherPreview?.sequence_number;
    const nextSeq = refId && baseSeq != null ? (localSeqByReferrerId[refId] ?? baseSeq) : null;
    if (refId && nextSeq != null) setLocalSeqByReferrerId((p) => ({ ...p, [refId]: nextSeq + 1 }));
    setReservations((prev) => [
      ...prev,
      {
        hotel: "",
        room_type: "",
        room_type_code: "GUES",
        board_code: "BB",
        room_code: "DBL",
        room_count: 1,
        selling_date: "",
        adult_count: 0,
        child_count: 0,
        infant_count: 0,
        extra_bed: false,
        extra_bed_service_price: 0,
        extra_bed_service_currency: "USD",
        extra_bed_service_free: false,
        promotion_room: false,
        promotion_room_service_price: 0,
        promotion_room_service_currency: "USD",
        promotion_room_service_free: false,
        honey_moons: false,
        honey_moons_service_price: 0,
        honey_moons_service_currency: "USD",
        honey_moons_service_free: false,
        free_of_charge: false,
        check_in: "",
        check_out: "",
        confirmation_number: "",
        room_nr: "",
        external_voucher_no: "",
        buying_price: 0,
        buying_currency: "EUR",
        selling_price: 0,
        selling_currency: "USD",
        reservation_notes: "",
        hotel_note: "",
        internal_note: "",
        transfer_note: "",
        operator_note: "",
        allotment_type: "",
        hotel_confirmation: "",
        operator_confirmation: "",
        reservation_status: "",
        reservation_type: "",
        print_option: "",
        special_code: "",
        code_2: "",
        code_3: "",
        code_4: "",
        spo_spec_code: "",
        package_splitting: false,
        // Do NOT generate booking serial unless a referrer is selected AND we have the server-provided base sequence.
        index_nr: nextSeq != null ? makeBookingSerial(nextSeq, 0) : "",
        bubble: false,
        passive: false,
        free_sale: false,
        local_service: false,
        local_service_price: 0,
        local_service_currency: "USD",
        local_service_free: false,
        transfer_service_type: "",
        transfer_service_price_per_day: 0,
        transfer_service_currency: "USD",
        transfer_service_days: 1,
        transfer_pickup_date: "",
        transfer_dropoff_date: "",
        airport_to_hotel: false,
        airport_to_hotel_price: 0,
        airport_to_hotel_currency: "USD",
        hotel_to_airport: false,
        hotel_to_airport_price: 0,
        hotel_to_airport_currency: "USD",
        voucher_form_printing: "",
        confirmation_form_print: "",
        arrival_transfer: false,
        arrival_transfer_date: "",
        arrival_transfer_type: "",
        departure_transfer: false,
        departure_transfer_date: "",
        departure_transfer_type: "",
        handling_fee_type: "",
        extras_prices: {},
      },
    ]);
  };

  const removeReservation = async (index: number) => {
    const accepted = await requestDeleteConfirm(ui.deleteConfirm);
    if (!accepted) return;
    setGuests((prev) =>
      prev.map((g) => {
        const ri = g.reservation_index;
        if (ri === index) return { ...g, reservation_index: null };
        if (typeof ri === "number" && ri > index) return { ...g, reservation_index: ri - 1 };
        return g;
      })
    );
    setReservations((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setSelectedReservationIndex((cur) => {
        const ci = Number(cur);
        if (next.length === 0) return "0";
        if (ci === index) return String(Math.max(0, next.length - 1));
        if (ci > index) return String(ci - 1);
        return cur;
      });
      return next;
    });
  };

  const addNightsToIsoDate = (checkIn: string, nights: number): string | null => {
    const base = (checkIn || "").trim();
    if (!base || !Number.isFinite(nights) || nights < 0) return null;
    const d = new Date(`${base}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + Math.round(nights));
    return d.toISOString().slice(0, 10);
  };

  const adjustReservationCol = (index: number, delta: number) => {
    setReservationCols((prev) =>
      prev.map((value, idx) => (idx === index ? Math.max(80, value + delta) : value))
    );
  };

  const getHotelName = (hotelId: string) =>
    hotels.find((hotel) => hotel.id === Number(hotelId))?.name || "";
  const getHotelEmail = (hotelId: string) => {
    const hotel = hotels.find((item) => item.id === Number(hotelId));
    const direct = (hotel as unknown as { email_1?: string } | undefined)?.email_1;
    if (direct) return direct;
    const contactInfo = hotel?.contact_info || "";
    const matchedEmail = contactInfo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return matchedEmail?.[0] || "";
  };
  const getRoomTypeName = (roomTypeId: string) =>
    roomTypes.find((room) => room.id === Number(roomTypeId))?.name || "";
  const toggleVisibleField = (fields: string[], field: string) =>
    fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field];
  const buildTransferSummary = (reservation: Reservation) => {
    const parts = [
      reservation.transfer_service_type
        ? `${lang === "ar" ? "نوع الخدمة" : lang === "tr" ? "Hizmet tipi" : "Service type"}: ${reservation.transfer_service_type}`
        : "",
      reservation.transfer_service_price_per_day
        ? `${lang === "ar" ? "سعر الخدمة اليومي" : lang === "tr" ? "Gunluk hizmet ucreti" : "Service daily price"}: ${reservation.transfer_service_price_per_day} ${reservation.transfer_service_currency}`
        : "",
      reservation.transfer_service_days
        ? `${lang === "ar" ? "عدد الأيام" : lang === "tr" ? "Gun sayisi" : "Days"}: ${reservation.transfer_service_days}`
        : "",
      reservation.transfer_pickup_date
        ? `${lang === "ar" ? "تاريخ الاستلام" : lang === "tr" ? "Teslim alma tarihi" : "Pickup date"}: ${formatYmdSlash(reservation.transfer_pickup_date)}`
        : "",
      reservation.transfer_dropoff_date
        ? `${lang === "ar" ? "تاريخ التسليم" : lang === "tr" ? "Teslim tarihi" : "Dropoff date"}: ${formatYmdSlash(reservation.transfer_dropoff_date)}`
        : "",
      reservation.airport_to_hotel
        ? `${lang === "ar" ? "استلام من المطار إلى الفندق" : lang === "tr" ? "Havalimanindan otele alim" : "Airport to hotel pickup"}: ${reservation.airport_to_hotel_price || 0} ${reservation.airport_to_hotel_currency}`
        : "",
      reservation.hotel_to_airport
        ? `${lang === "ar" ? "توصيل من الفندق إلى المطار" : lang === "tr" ? "Otelden havalimanina birakma" : "Hotel to airport dropoff"}: ${reservation.hotel_to_airport_price || 0} ${reservation.hotel_to_airport_currency}`
        : "",
    ].filter(Boolean);

    const header =
      lang === "ar" ? "تفاصيل الترنسفير" : lang === "tr" ? "Transfer detaylari" : "Transfer details";
    return parts.length ? `${header}:\n${parts.join("\n")}` : "";
  };
  const currentVoucherId = createdVoucher || "";
  const selectedReservation =
    reservations[Number(selectedReservationIndex)] || reservations[0] || null;
  const selectedReservationLabel = selectedReservation
    ? `${selectedReservation.index_nr || `${ui.bookingWord} ${Number(selectedReservationIndex) + 1}`} - ${
        getHotelName(selectedReservation.hotel) || ui.noHotel
      }`
    : "";
  const selectedReservationHotelEmail = selectedReservation
    ? getHotelEmail(selectedReservation.hotel)
    : "";
  const firstHotelEmail = reservations.map((row) => getHotelEmail(row.hotel)).find(Boolean) || "";
  const leaderGuest = guests.find((g) => g.is_leader) || guests[0];
  const leaderName = (leaderGuest?.full_name || "").trim();
  const matchedClient = clients.find(
    (client) => client.name.trim().toLowerCase() === leaderName.toLowerCase()
  );
  const effectiveClientEmail =
    clientDeliveryMode === "saved" ? matchedClient?.email || "" : clientEmailManual;
  const effectiveHotelEmail =
    hotelDeliveryMode === "saved" ? firstHotelEmail : hotelEmailManual;
  const hotelPdfUrl = currentVoucherId
    ? `${API_BASE}/vouchers/${currentVoucherId}/pdf/hotel/?show=${encodeURIComponent(
        hotelVisibleFields.join(",")
      )}&lang=${encodeURIComponent(lang)}`
    : "";
  const customerPdfUrl = currentVoucherId
    ? `${API_BASE}/vouchers/${currentVoucherId}/pdf/customer/?show=${encodeURIComponent(
        clientVisibleFields.join(",")
      )}&lang=${encodeURIComponent(lang)}&payment_box=${voucherPdfPaymentBox.enabled ? "1" : "0"}`
    : "";
  const hotelEmailBody = [hotelEmailNote.trim(), hotelPdfUrl].filter(Boolean).join("\n\n");
  const clientEmailBody = [clientEmailNote.trim(), customerPdfUrl].filter(Boolean).join("\n\n");
  const hotelMailto = effectiveHotelEmail
    ? `mailto:${effectiveHotelEmail}?subject=${encodeURIComponent(`Voucher ${currentVoucherId || ""}`)}&body=${encodeURIComponent(hotelEmailBody)}`
    : "";
  const clientMailto = effectiveClientEmail
    ? `mailto:${effectiveClientEmail}?subject=${encodeURIComponent(`Voucher ${currentVoucherId || ""}`)}&body=${encodeURIComponent(clientEmailBody)}`
    : "";
  const cancellationMailto = selectedReservationHotelEmail
    ? `mailto:${selectedReservationHotelEmail}?subject=${encodeURIComponent(
        `Cancellation ${currentVoucherId || voucherNumber || ""} / ${selectedReservation?.index_nr || ""}`
      )}&body=${encodeURIComponent(
        [
          `Voucher: ${currentVoucherId || voucherNumber || "-"}`,
          `Booking: ${selectedReservationLabel || "-"}`,
          "Status: Cancelled",
          cancellationNote.trim() ? `Note: ${cancellationNote.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )}`
    : "";

  const printSelectedFields = printTemplate === "hotel" ? hotelVisibleFields : clientVisibleFields;
  const printPreviewFetchUrl = useMemo(() => {
    if (!printModalOpen || !currentVoucherId) {
      return "";
    }
    const params = new URLSearchParams();
    if (printSelectedFields.length) {
      params.set("show", printSelectedFields.join(","));
    }
    params.set("lang", lang);
    params.set("v", String(Date.now()));
    if (printTemplate === "customer") {
      params.set("payment_box", voucherPdfPaymentBox.enabled ? "1" : "0");
    }
    return `${API_BASE}/vouchers/${currentVoucherId}/pdf/${printTemplate}/?${params.toString()}`;
  }, [currentVoucherId, printModalOpen, printSelectedFields, printTemplate, voucherPdfPaymentBox.enabled]);

  useEffect(() => {
    if (!printPreviewFetchUrl) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    const token = getToken();

    if (!token) {
      setPrintPreviewUrl("");
      return () => controller.abort();
    }

    setPrintLoading(true);
    fetch(printPreviewFetchUrl, {
      headers: { Authorization: `Token ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load preview");
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        const objectUrl = URL.createObjectURL(blob);
        setPrintPreviewUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return objectUrl;
        });
      })
      .catch(() => {
        if (active) {
          setPrintPreviewUrl("");
        }
      })
      .finally(() => {
        if (active) {
          setPrintLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [printPreviewFetchUrl]);

  const closePrintModal = () => {
    setPrintModalOpen(false);
    setPrintLoading(false);
    setPrintPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return "";
    });
  };

  const openVoucherPdf = async (template: "hotel" | "customer") => {
    if (!currentVoucherId) {
      setStatus(ui.saveBeforePrint);
      return;
    }
    const fields = template === "hotel" ? hotelVisibleFields : clientVisibleFields;
    const params = new URLSearchParams();
    if (fields.length) params.set("show", fields.join(","));
    params.set("lang", lang);
    params.set("v", String(Date.now()));
    if (template === "customer") {
      params.set("payment_box", voucherPdfPaymentBox.enabled ? "1" : "0");
    }
    const show = `?${params.toString()}`;
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/vouchers/${currentVoucherId}/pdf/${template}/${show}`, {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(ui.printOpenFailed);
      }
      const blob = await response.blob();
      openPdfBlobWithFallback(blob, { mode: "preview", downloadFileName: `voucher-${currentVoucherId}-${template}.pdf` });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : ui.printOpenFailed);
    }
  };

  const openInvoicePdf = async (invoiceId: number) => {
    const token = getToken();
    try {
      const response = await fetch(`${API_BASE}/invoices/${invoiceId}/pdf?v=${Date.now()}&lang=${encodeURIComponent(lang)}`, {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(ui.invoiceOpenFailed);
      }
      const blob = await response.blob();
      openPdfBlobWithFallback(blob, { mode: "preview", downloadFileName: `invoice-${invoiceId}.pdf` });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : ui.invoiceOpenFailed);
    }
  };

  const downloadGuestListPdf = async () => {
    if (!currentVoucherId) {
      setStatus(ui.saveBeforeGuestList);
      return;
    }
    const token = getToken();
    try {
      const response = await fetch(
        `${API_BASE}/vouchers/${encodeURIComponent(currentVoucherId)}/guests/pdf?lang=${encodeURIComponent(lang)}`,
        {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
        }
      );
      if (!response.ok) {
        throw new Error(ui.guestListDownloadFailed);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guests-${currentVoucherId}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : ui.guestListDownloadFailed);
    }
  };

  const updateGuest = (index: number, next: Partial<Guest>) => {
    setGuests((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, ...next };
        }
        if (next.is_leader) {
          return { ...item, is_leader: false };
        }
        return item;
      })
    );
  };

  const addGuestForReservation = (reservationIndex: number) => {
    setGuests((prev) => [
      ...prev,
      {
        salutation: "",
        full_name: "",
        is_leader: false,
        passport_number: "",
        child_age: "",
        reservation_index: reservationIndex,
        room_number: 1,
      },
    ]);
  };

  const removeGuest = async (index: number) => {
    const accepted = await requestDeleteConfirm(ui.deleteConfirm);
    if (!accepted) return;
    setGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    try {
      const invalidIndex = reservations.findIndex(
        (row) => !row.hotel || !String(row.hotel).trim() || !row.room_type || !String(row.room_type).trim()
      );
      if (invalidIndex !== -1) {
        const rowNumber = invalidIndex + 1;
        setStatus(ui.saveIncompleteBooking.replace("{n}", String(rowNumber)));
        reservationsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
        return;
      }

      const {
        voucher_nr: _voucherNr,
        destination_code: _destinationCode,
        sequence_number: _sequenceNumber,
        client_name: _clientNameField,
        referrer: referrerField,
        ...voucherPayload
      } = voucher;
      const leaderForSave = guests.find((g) => g.is_leader) || guests[0];
      const leaderNm = (leaderForSave?.full_name || "").trim();
      const leaderSalRaw = (leaderForSave?.salutation || "").trim();
      const leaderTitleFallback =
        leaderSalRaw === "mr" || leaderSalRaw === "ms" ? leaderSalRaw : "";
      const payload = {
        ...voucherPayload,
        sale_date: effectiveSaleDate,
        referrer: referrerField ? Number(referrerField) : null,
        client_name: (voucher.client_name || "").trim() || leaderNm,
        client_title:
          (voucher.client_title as "" | "mr" | "ms") || leaderTitleFallback || "",
        adult_count:
          aggregatedReservationPax.total > 0
            ? aggregatedReservationPax.adults
            : Number(voucher.adult_count),
        child_count:
          aggregatedReservationPax.total > 0
            ? aggregatedReservationPax.children
            : Number(voucher.child_count),
        infant_count:
          aggregatedReservationPax.total > 0
            ? aggregatedReservationPax.infants
            : Number(voucher.infant_count),
        extra_bed_count: Number(voucher.extra_bed_count),
        transfer_fee: Number(voucher.transfer_fee),
        transfer_buying_price: Number(voucher.transfer_buying_price),
        handling_fee_per_pax: Number(voucher.handling_fee_per_pax),
        exchange_rate_eur_to_usd: Number(voucher.exchange_rate_eur_to_usd),
        reservations: reservations.map((row) => {
          const {
            extra_bed_service_price: _extraBedServicePrice,
            extra_bed_service_currency: _extraBedServiceCurrency,
            extra_bed_service_free: _extraBedServiceFree,
            promotion_room_service_price: _promotionRoomServicePrice,
            promotion_room_service_currency: _promotionRoomServiceCurrency,
            promotion_room_service_free: _promotionRoomServiceFree,
            honey_moons_service_price: _honeyMoonsServicePrice,
            honey_moons_service_currency: _honeyMoonsServiceCurrency,
            honey_moons_service_free: _honeyMoonsServiceFree,
            local_service_price: _localServicePrice,
            local_service_currency: _localServiceCurrency,
            local_service_free: _localServiceFree,
            transfer_service_type: _transferServiceType,
            transfer_service_price_per_day: _transferServicePricePerDay,
            transfer_service_currency: _transferServiceCurrency,
            transfer_service_days: _transferServiceDays,
            transfer_pickup_date: _transferPickupDate,
            transfer_dropoff_date: _transferDropoffDate,
            airport_to_hotel: _airportToHotel,
            airport_to_hotel_price: _airportToHotelPrice,
            airport_to_hotel_currency: _airportToHotelCurrency,
            hotel_to_airport: _hotelToAirport,
            hotel_to_airport_price: _hotelToAirportPrice,
            hotel_to_airport_currency: _hotelToAirportCurrency,
            ...reservationPayload
          } = row;

          const normalizedExtrasPrices = Object.fromEntries(
            Object.entries(row.extras_prices || {}).map(([key, priceRow]) => [
              key,
              {
                buying_price: Number((priceRow as { buying_price?: number })?.buying_price || 0),
                selling_price: Number((priceRow as { selling_price?: number })?.selling_price || 0),
                enabled: Boolean((priceRow as { enabled?: boolean })?.enabled),
              },
            ]),
          );

          return {
            ...reservationPayload,
            hotel: row.hotel ? Number(row.hotel) : null,
            room_type: row.room_type ? Number(row.room_type) : null,
            room_count: Number(row.room_count),
            adult_count: Number(row.adult_count),
            child_count: Number(row.child_count),
            infant_count: Number(row.infant_count),
            buying_price: Number(row.buying_price),
            selling_price: Number(row.selling_price),
            selling_date: row.selling_date || null,
            arrival_transfer: row.airport_to_hotel,
            arrival_transfer_date:
              row.transfer_pickup_date || row.arrival_transfer_date || null,
            arrival_transfer_type: row.transfer_service_type || row.arrival_transfer_type,
            departure_transfer: row.hotel_to_airport,
            departure_transfer_date:
              row.transfer_dropoff_date || row.departure_transfer_date || null,
            departure_transfer_type: row.transfer_service_type || row.departure_transfer_type,
            transfer_note: [row.transfer_note?.trim(), buildTransferSummary(row)]
              .filter(Boolean)
              .join("\n\n"),
            extras_prices: normalizedExtrasPrices,
          };
        }),
        guests: guests
          .filter((guest) => guest.full_name.trim().length > 0)
          .map((guest) => ({
            salutation: guest.salutation || "",
            full_name: guest.full_name,
            is_leader: guest.is_leader,
            passport_number: guest.passport_number,
            child_age:
              guest.salutation === "chd" &&
              guest.child_age !== "" &&
              guest.child_age != null &&
              Number.isFinite(Number(guest.child_age))
                ? Math.max(0, Math.min(120, Math.floor(Number(guest.child_age))))
                : null,
            reservation_index: guest.reservation_index ?? undefined,
            room_number: guest.room_number ?? undefined,
          })),
      };
      const existingNr = (createdVoucher || voucher.voucher_nr || "").trim();
      let serverVoucherNr = existingNr;
      if (existingNr) {
        const updated = await api.patch<{ voucher_nr?: string }>(
          `/vouchers/${encodeURIComponent(existingNr)}/`,
          payload
        );
        serverVoucherNr = (updated?.voucher_nr || existingNr).trim();
      } else {
        const created = await api.post<{ voucher_nr?: string }>("/vouchers/", payload);
        serverVoucherNr = (created?.voucher_nr || "").trim();
      }
      setStatus(t.vouchersSaved);
      setCreatedVoucher(serverVoucherNr || null);
      setVoucher((prev) => ({ ...prev, voucher_nr: serverVoucherNr }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setStatus(message ? `${t.vouchersFailed} ${message}` : t.vouchersFailed);
    }
  };

  return (
    <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-[#0f766e]/15 via-[#ecfdf5] to-[#f59e0b]/10 p-6 shadow-sm">
        <h1 className="text-3xl font-semibold text-[#0f4c81]">{t.vouchers}</h1>
        <p className="text-sm text-zinc-600">{t.vouchersSubtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div
          ref={reservationsSectionRef}
          className="rounded-2xl border border-emerald-100 bg-[#f0fdf4] p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t.voucherReservations}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={autoAssignGuests} className="text-xs text-emerald-700 hover:underline">
                {t.voucherAutoAssign}
              </button>
              <button type="button" onClick={addReservation} className="text-xs text-blue-600">
                {t.commonAdd}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
            <aside className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-zinc-700">{ui.reservationList}</div>
                <button
                  type="button"
                  onClick={() => setReservationListSearch("")}
                  className="text-[11px] text-zinc-500 hover:text-zinc-700"
                >
                  {ui.clear}
                </button>
              </div>
              <div className="mt-2">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-zinc-400">
                    <SearchIcon className="h-4 w-4" />
                  </span>
                  <input
                    value={reservationListSearch}
                    onChange={(e) => setReservationListSearch(e.target.value)}
                    placeholder={ui.reservationSearchPlaceholder}
                    className="w-full rounded-md border border-zinc-200 bg-white py-2 ps-8 pe-3 text-sm"
                  />
                </div>
              </div>
              <div className="mt-2 space-y-2 max-h-[740px] overflow-y-auto">
                {reservations
                  .map((r, idx) => ({ r, idx }))
                  .filter(({ r, idx }) => {
                    const q = reservationListSearch.trim().toLowerCase();
                    if (!q) return true;
                    const hotelName =
                      hotels.find((h) => h.id === Number(r.hotel))?.name || t.voucherSelectHotel;
                    const hay = [
                      r.index_nr,
                      String(idx + 1),
                      hotelName,
                      r.room_code,
                      r.board_code,
                      r.reservation_status,
                      r.reservation_type,
                      r.confirmation_number,
                      r.check_in ? formatYmdSlash(r.check_in) : "",
                      r.check_out ? formatYmdSlash(r.check_out) : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                      .toLowerCase();
                    return hay.includes(q);
                  })
                  .map(({ r, idx }) => {
                  const hotelName =
                    hotels.find((h) => h.id === Number(r.hotel))?.name || t.voucherSelectHotel;
                  const nights = stayNightsBetween(r.check_in, r.check_out);
                  const selected = String(idx) === selectedReservationIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedReservationIndex(String(idx));
                        setOpenReservationIndex(idx);
                      }}
                      className={`w-full rounded-xl border px-3 py-2 text-right transition ${
                        selected
                          ? "border-emerald-500 bg-emerald-50 shadow-sm"
                          : "border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">
                            {r.index_nr || `#${idx + 1}`} · {hotelName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {r.check_in ? formatYmdSlash(r.check_in) : "—"} →{" "}
                            {r.check_out ? formatYmdSlash(r.check_out) : "—"}
                            {nights != null ? ` · ${nights} ${ui.nights}` : ""}
                          </div>
                        </div>
                        <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
                          {(Number(r.selling_price) || 0).toFixed(0)}{" "}
                          {(r.selling_currency || "").toUpperCase() || ""}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-zinc-600">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5">{r.room_code || "—"}</span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5">{r.board_code || "—"}</span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5">{r.reservation_status || "—"}</span>
                      </div>
                    </button>
                  );
                })}
                {!reservations.length ? (
                  <div className="text-xs text-zinc-400">{t.commonNoData}</div>
                ) : null}
              </div>
            </aside>

            <div className="min-w-0">
          {reservations.map((reservation, index) => {
            if (String(index) !== selectedReservationIndex) return null;
            return (
            <details
              key={index}
              open
              className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"
            >
              <summary className="hidden">Reservation</summary>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex text-zinc-500 [&>svg]:h-4 [&>svg]:w-4">
                        <HotelIcon />
                      </span>
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {hotels.find((h) => h.id === Number(reservation.hotel))?.name || t.voucherSelectHotel}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {reservation.check_in ? formatYmdSlash(reservation.check_in) : "—"} →{" "}
                      {reservation.check_out ? formatYmdSlash(reservation.check_out) : "—"}{" "}
                      {stayNightsBetween(reservation.check_in, reservation.check_out) != null
                        ? `· ${stayNightsBetween(reservation.check_in, reservation.check_out)} ${ui.nights}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                      {reservation.room_code || "—"} · {reservation.board_code || "—"}
                    </span>
                    <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                      {(Number(reservation.selling_price) || 0).toFixed(2)}{" "}
                      {(reservation.selling_currency || "").toUpperCase() || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setSelectedReservationIndex(String(index));
                        setOpenReservationIndex(index);
                      }}
                      className="rounded-md border border-emerald-200 px-3 py-2 text-xs text-emerald-700 mb-input-raised"
                    >
                      {t.voucherSelectThisReservation}
                    </button>
                  </div>
                </div>
              <div className="mt-4 space-y-3">
                {(() => {
                  const bookingSerial = String(reservation.index_nr || "").trim();
                  const hotelName =
                    hotels.find((h) => h.id === Number(reservation.hotel))?.name || t.voucherSelectHotel;
                  const roomTypeName =
                    roomTypes.find((rt) => rt.id === Number(reservation.room_type))?.name || "—";
                  const nightsNow = stayNightsBetween(reservation.check_in, reservation.check_out);
                  return (
                    <>
                      {/* سطر 1: معلومات الحجز */}
                      <div className="grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 lg:grid-cols-[220px_240px_1fr_auto] lg:items-end">
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.bookingSerial}</span>
                          <div className={`${COMPACT_FIELD_CLASS} flex items-center font-mono font-semibold`}>
                            {bookingSerial || "—"}
                          </div>
                          {!bookingSerial ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="hidden lg:inline text-[11px] text-zinc-500">
                                {ui.serialHintNew}
                              </span>
                              <button
                                type="button"
                                className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-700"
                                onClick={() => {
                                  const refId = String(voucher.referrer || "").trim();
                                  const baseSeq = nextVoucherPreview?.sequence_number ?? 1;
                                  const nextSeq = refId ? (localSeqByReferrerId[refId] ?? baseSeq) : null;
                                  if (!refId || nextSeq == null) return;
                                  setLocalSeqByReferrerId((p) => ({ ...p, [refId]: nextSeq + 1 }));
                                  updateReservation(index, { index_nr: makeBookingSerial(nextSeq, 0) });
                                }}
                              >
                                {ui.generate}
                              </button>
                            </div>
                          ) : (
                            <div className="hidden lg:block text-[11px] text-zinc-500">
                              {ui.serialFixedHint}
                            </div>
                          )}
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.voucherReferrer} />
                          <SearchableSelect
                            listId={`voucher-referrer-inline-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={voucher.referrer}
                            placeholder={t.commonSelect}
                            options={referrers.map((r) => ({
                              value: String(r.id),
                              label: `${r.referrer_code} — ${r.name}`,
                            }))}
                            onChange={(next) => setVoucher((prev) => ({ ...prev, referrer: next }))}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={t.voucherSelectHotel} />
                          <SearchableSelect
                            listId={`hotel-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.hotel}
                            placeholder={t.commonSelect}
                            options={hotels.map((h) => ({ value: String(h.id), label: h.name }))}
                            onChange={(nextValue) => updateReservation(index, { hotel: nextValue, room_type: "" })}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeReservation(index)}
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                        >
                          {t.voucherRemove}
                        </button>
                      </div>

                      {/* بالغين / أطفال / رضع + نزلاء هذا الحجز */}
                      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-sky-950">{ui.peopleForBooking}</div>
                          <div className="text-[11px] text-sky-900/85 tabular-nums">
                            {ui.totalPeople}:{" "}
                            {(Number(reservation.adult_count) || 0) +
                              (Number(reservation.child_count) || 0) +
                              (Number(reservation.infant_count) || 0)}{" "}
                            {ui.persons}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="grid gap-1 text-xs text-zinc-600">
                            <span>{ui.adults}</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={COMPACT_FIELD_CLASS}
                              value={reservation.adult_count}
                              onChange={(e) =>
                                updateReservation(index, {
                                  adult_count: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs text-zinc-600">
                            <span>{ui.children}</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={COMPACT_FIELD_CLASS}
                              value={reservation.child_count}
                              onChange={(e) =>
                                updateReservation(index, {
                                  child_count: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </label>
                          <label className="grid gap-1 text-xs text-zinc-600">
                            <span>{ui.infants}</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={COMPACT_FIELD_CLASS}
                              value={reservation.infant_count}
                              onChange={(e) =>
                                updateReservation(index, {
                                  infant_count: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="border-t border-sky-100 pt-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-sky-950">{t.voucherGuests}</span>
                            <button
                              type="button"
                              onClick={() => addGuestForReservation(index)}
                              className="text-xs font-medium text-blue-600 hover:underline"
                            >
                              {ui.addGuest}
                            </button>
                          </div>
                          {guests
                            .map((guest, gi) => ({ guest, gi }))
                            .filter(({ guest }) => guest.reservation_index === index)
                            .map(({ guest, gi }) => (
                              <div
                                key={gi}
                                className="space-y-2 rounded-lg border border-zinc-200 bg-white p-2"
                              >
                                <div className="grid gap-2 md:grid-cols-[100px_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                                  <div className="space-y-1">
                                    <span className="text-[11px] text-zinc-500">{ui.salutation}</span>
                                    <TypeableSelect
                                      className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm mb-input-raised"
                                      value={guest.salutation || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateGuest(gi, {
                                          salutation: val,
                                          ...(val !== "chd" ? { child_age: "" } : {}),
                                        });
                                      }}
                                      aria-label="Salutation"
                                    >
                                      {guestSalutationOptions.map((opt) => (
                                        <option key={opt.value || "none"} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </TypeableSelect>
                                  </div>
                                  <div className="space-y-1">
                                    <FieldLabel
                                      icon={<UserIcon className="h-4 w-4" />}
                                      text={t.voucherGuestName}
                                      hint={ui.guestNameHint}
                                    />
                                    <input
                                      className="w-full min-w-0 rounded-md border border-zinc-200 px-3 py-2 text-sm mb-input-raised"
                                      placeholder={t.voucherGuestName}
                                      value={guest.full_name}
                                      onChange={(e) => updateGuest(gi, { full_name: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <FieldLabel
                                      icon={<IdCardIcon className="h-4 w-4" />}
                                      text={t.voucherGuestPassport}
                                      hint={ui.optionalHint}
                                    />
                                    <input
                                      className="w-full min-w-0 rounded-md border border-zinc-200 px-3 py-2 text-sm mb-input-raised"
                                      placeholder={t.voucherGuestPassport}
                                      value={guest.passport_number}
                                      onChange={(e) => updateGuest(gi, { passport_number: e.target.value })}
                                    />
                                  </div>
                                  <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                                    <input
                                      type="checkbox"
                                      checked={guest.is_leader}
                                      onChange={(e) => updateGuest(gi, { is_leader: e.target.checked })}
                                    />
                                    {t.voucherGuestLeader}
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeGuest(gi)}
                                    className="self-center text-xs text-red-500"
                                  >
                                    {t.voucherRemove}
                                  </button>
                                </div>
                                {guest.salutation === "chd" ? (
                                  <label className="grid max-w-xs gap-1 text-xs text-zinc-600">
                                    <span>{t.voucherGuestChildAge}</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      max={120}
                                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm mb-input-raised"
                                      placeholder={ui.childAgeExample}
                                      value={
                                        guest.child_age === "" || guest.child_age == null
                                          ? ""
                                          : String(guest.child_age)
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === "") {
                                          updateGuest(gi, { child_age: "" });
                                          return;
                                        }
                                        const n = Math.floor(Number(raw));
                                        if (!Number.isFinite(n)) {
                                          updateGuest(gi, { child_age: "" });
                                          return;
                                        }
                                        updateGuest(gi, {
                                          child_age: Math.max(0, Math.min(120, n)),
                                        });
                                      }}
                                    />
                                  </label>
                                ) : null}
                              </div>
                            ))}
                          {!guests.some((g) => g.reservation_index === index) ? (
                            <p className="text-[11px] text-zinc-500">
                              {ui.noGuestsForBooking}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* سطر 2: (SNG/DBL) / نوع الغرفة / الوجبة / عدد الغرف */}
                      <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-2 lg:grid-cols-4">
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.roomCodeType}</span>
                          <SearchableSelect
                            listId={`room-code-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.room_code}
                            placeholder={t.commonSelect}
                            options={roomCodeSelectOptions}
                            onChange={(nextValue) => updateReservation(index, { room_code: nextValue })}
                          />
                          <div className="hidden lg:block text-[11px] text-zinc-500">
                            {ui.roomCodeHint}
                          </div>
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.roomType}</span>
                          <SearchableSelect
                            listId={`room-type-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.room_type}
                            placeholder={t.commonSelect}
                            options={roomTypes
                              .filter((room) => room.hotel === Number(reservation.hotel))
                              .map((room) => ({ value: String(room.id), label: room.name }))}
                            onChange={(nextValue) => updateReservation(index, { room_type: nextValue })}
                          />
                          <div className="hidden lg:block text-[11px] text-zinc-500">{ui.selected}: {roomTypeName}</div>
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.board}</span>
                          <SearchableSelect
                            listId={`board-code-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.board_code}
                            placeholder={t.commonSelect}
                            options={boardCodeSelectOptions}
                            onChange={(nextValue) => updateReservation(index, { board_code: nextValue })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.roomCount}</span>
                          <input
                            type="number"
                            className={COMPACT_FIELD_CLASS}
                            value={reservation.room_count}
                            onChange={(e) => updateReservation(index, { room_count: Number(e.target.value) })}
                          />
                        </label>
                      </div>

                      {/* سطر 3: الأسعار */}
                      <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-2 lg:grid-cols-4">
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.buyPrice} />
                          <input
                            type="number"
                            className={COMPACT_FIELD_CLASS}
                            value={reservation.buying_price}
                            onChange={(e) => updateReservation(index, { buying_price: Number(e.target.value) })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.buyCurrency} />
                          <SearchableSelect
                            listId={`buying-currency-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.buying_currency}
                            placeholder={t.commonSelect}
                            options={currencySelectOptions}
                            onChange={(nextValue) => updateReservation(index, { buying_currency: nextValue })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.sellPrice} />
                          <input
                            type="number"
                            className={COMPACT_FIELD_CLASS}
                            value={reservation.selling_price}
                            onChange={(e) => updateReservation(index, { selling_price: Number(e.target.value) })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.sellCurrency} />
                          <SearchableSelect
                            listId={`selling-currency-${index}`}
                            className={COMPACT_SELECT_CLASS}
                            value={reservation.selling_currency}
                            placeholder={t.commonSelect}
                            options={currencySelectOptions}
                            onChange={(nextValue) => updateReservation(index, { selling_currency: nextValue })}
                          />
                        </label>
                      </div>

                      {/* سطر 4: التواريخ */}
                      <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-3">
                        <label className="grid gap-1 text-xs text-zinc-600">
                          <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.checkIn} />
                          <PopupYmdDatePicker
                            value={reservation.check_in}
                            onChange={(nextIso) => {
                              updateReservation(index, { check_in: nextIso });
                              const draft = (nightsDraftByIndex[index] || "").trim();
                              const n = Number(draft);
                              if (draft && Number.isFinite(n)) {
                                const nextOut = addNightsToIsoDate(nextIso, n);
                                if (nextOut) updateReservation(index, { check_out: nextOut });
                              }
                            }}
                            className={COMPACT_FIELD_CLASS}
                            name={`reservation_check_in_${index}`}
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600">
                          <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.checkOut} />
                          <PopupYmdDatePicker
                            value={reservation.check_out}
                            onChange={(nextIso) => updateReservation(index, { check_out: nextIso })}
                            className={COMPACT_FIELD_CLASS}
                            name={`reservation_check_out_${index}`}
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600">
                          <span>{ui.nightsCount}</span>
                          <input
                            className={COMPACT_FIELD_CLASS}
                            type="number"
                            min={0}
                            step={1}
                            placeholder={String(nightsNow ?? "")}
                            value={nightsDraftByIndex[index] ?? ""}
                            onChange={(e) => {
                              const next = e.target.value;
                              setNightsDraftByIndex((p) => ({ ...p, [index]: next }));
                              const n = Number(next);
                              if (!reservation.check_in || !next || !Number.isFinite(n)) return;
                              const nextOut = addNightsToIsoDate(reservation.check_in, n);
                              if (nextOut) updateReservation(index, { check_out: nextOut });
                            }}
                          />
                          <div className="hidden lg:block text-[11px] text-zinc-500">{ui.current}: {nightsNow ?? "—"}</div>
                        </label>
                      </div>

                      {/* سطر 5: الحالة/النوع/التأكيد */}
                      <div className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-3">
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.reservationStatus}</span>
                          <SearchableSelect
                            listId={`reservation-status-${index}`}
                            value={reservation.reservation_status}
                            placeholder={t.commonSelect}
                            options={reservationStatusSelectOptions}
                            onChange={(nextValue) => updateReservation(index, { reservation_status: nextValue })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                          <span>{ui.reservationType}</span>
                          <SearchableSelect
                            listId={`reservation-type-${index}`}
                            value={reservation.reservation_type}
                            placeholder={t.commonSelect}
                            options={reservationTypeSelectOptions}
                            onChange={(nextValue) => updateReservation(index, { reservation_type: nextValue })}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-zinc-600">
                          <span>{ui.confirmationNo}</span>
                          <input
                            className={COMPACT_FIELD_CLASS}
                            value={reservation.confirmation_number}
                            onChange={(e) => updateReservation(index, { confirmation_number: e.target.value })}
                          />
                        </label>
                      </div>

                      {/* سطر 6: Extras & fees (موحد مع شاشة الحجوزات) */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                        {(() => {
                          const enabled = extrasFieldOptions.filter(
                            (f) =>
                              EXTRAS_FIELD_KEYS.has(f.value)
                                ? Boolean(reservation[f.value as keyof Reservation])
                                : Boolean(reservation.extras_prices?.[f.value]?.enabled),
                          );
                          return (
                            <details className="rounded-lg border border-emerald-100 bg-white p-3">
                              <summary className="cursor-pointer select-none">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-semibold text-emerald-900">Extras & fees</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {enabled.length ? (
                                      enabled.slice(0, 3).map((f) => (
                                        <span key={f.value} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900 border border-emerald-100">
                                          {f.label}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-[11px] text-zinc-500">{ui.noneShort}</span>
                                    )}
                                    {enabled.length > 3 ? (
                                      <span className="text-[11px] text-zinc-500">+{enabled.length - 3}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </summary>
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                {extrasFieldOptions.map((f) => (
                                  <div key={f.value} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                                    <label className="flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={
                                          EXTRAS_FIELD_KEYS.has(f.value)
                                            ? Boolean(reservation[f.value as keyof Reservation])
                                            : Boolean(reservation.extras_prices?.[f.value]?.enabled)
                                        }
                                        onChange={(e) =>
                                          updateReservation(
                                            index,
                                            {
                                              ...(EXTRAS_FIELD_KEYS.has(f.value) ? { [f.value]: e.target.checked } : {}),
                                              extras_prices: {
                                                ...(reservation.extras_prices || {}),
                                                [f.value]: {
                                                  buying_price:
                                                    reservation.extras_prices?.[f.value]?.buying_price != null
                                                      ? Number(reservation.extras_prices[f.value].buying_price)
                                                      : 0,
                                                  selling_price:
                                                    reservation.extras_prices?.[f.value]?.selling_price != null
                                                      ? Number(reservation.extras_prices[f.value].selling_price)
                                                      : 0,
                                                  enabled: e.target.checked,
                                                },
                                              },
                                            } as Partial<Reservation>,
                                          )
                                        }
                                      />
                                      <span className="min-w-0 truncate font-medium text-zinc-800">{f.label}</span>
                                    </label>
                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                      <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                                        <span>{lang === "ar" ? "سعر شراء (Voucher Hotel)" : lang === "tr" ? "Alis fiyati (Voucher Hotel)" : "Buying price (Voucher Hotel)"}</span>
                                        <input
                                          type="number"
                                          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                          value={reservation.extras_prices?.[f.value]?.buying_price ?? 0}
                                          onChange={(e) =>
                                            updateReservation(index, {
                                              extras_prices: {
                                                ...(reservation.extras_prices || {}),
                                                [f.value]: {
                                                  buying_price: Number(e.target.value),
                                                  selling_price:
                                                    reservation.extras_prices?.[f.value]?.selling_price != null
                                                      ? Number(reservation.extras_prices[f.value].selling_price)
                                                      : 0,
                                                  enabled:
                                                    reservation.extras_prices?.[f.value]?.enabled != null
                                                      ? Boolean(reservation.extras_prices[f.value].enabled)
                                                      : (EXTRAS_FIELD_KEYS.has(f.value)
                                                          ? Boolean(reservation[f.value as keyof Reservation])
                                                          : false),
                                                },
                                              },
                                            })
                                          }
                                        />
                                      </label>
                                      <label className="grid gap-1 text-xs text-zinc-600 min-w-0">
                                        <span>{lang === "ar" ? "سعر بيع (Voucher Customer)" : lang === "tr" ? "Satis fiyati (Voucher Customer)" : "Selling price (Voucher Customer)"}</span>
                                        <input
                                          type="number"
                                          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                                          value={reservation.extras_prices?.[f.value]?.selling_price ?? 0}
                                          onChange={(e) =>
                                            updateReservation(index, {
                                              extras_prices: {
                                                ...(reservation.extras_prices || {}),
                                                [f.value]: {
                                                  buying_price:
                                                    reservation.extras_prices?.[f.value]?.buying_price != null
                                                      ? Number(reservation.extras_prices[f.value].buying_price)
                                                      : 0,
                                                  selling_price: Number(e.target.value),
                                                  enabled:
                                                    reservation.extras_prices?.[f.value]?.enabled != null
                                                      ? Boolean(reservation.extras_prices[f.value].enabled)
                                                      : (EXTRAS_FIELD_KEYS.has(f.value)
                                                          ? Boolean(reservation[f.value as keyof Reservation])
                                                          : false),
                                                },
                                              },
                                            })
                                          }
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })()}
                      </div>

                      {/* سطر 8: خدمة الترنسفير */}
                      <details className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                        <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-900">
                          {ui.transferService}
                          <span className="ms-2 text-[11px] font-normal text-zinc-600">
                            {reservation.transfer_service_type ? `· ${reservation.transfer_service_type}` : `· ${ui.noneShort}`}
                          </span>
                        </summary>
                        <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3 space-y-3">
                          <div className="grid gap-2 md:grid-cols-4">
                            <SearchableSelect
                              listId={`transfer-service-type-${index}`}
                              value={reservation.transfer_service_type}
                              placeholder={t.voucherTransferType}
                              options={TRANSFER_TYPES.map((value) => ({ value, label: value }))}
                              onChange={(nextValue) => updateReservation(index, { transfer_service_type: nextValue })}
                            />
                            <input
                              type="number"
                              className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              placeholder={ui.transferServicePricePerDay}
                              value={reservation.transfer_service_price_per_day}
                              onChange={(e) =>
                                updateReservation(index, { transfer_service_price_per_day: Number(e.target.value) })
                              }
                            />
                            <SearchableSelect
                              listId={`transfer-service-currency-${index}`}
                              value={reservation.transfer_service_currency}
                              options={currencySelectOptions}
                              onChange={(nextValue) =>
                                updateReservation(index, { transfer_service_currency: nextValue })
                              }
                            />
                            <input
                              type="number"
                              className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              placeholder={ui.daysCount}
                              value={reservation.transfer_service_days}
                              onChange={(e) =>
                                updateReservation(index, { transfer_service_days: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <PopupYmdDatePicker
                              value={reservation.transfer_pickup_date}
                              onChange={(nextIso) => updateReservation(index, { transfer_pickup_date: nextIso })}
                              className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              name={`reservation_transfer_pickup_date_${index}`}
                            />
                            <PopupYmdDatePicker
                              value={reservation.transfer_dropoff_date}
                              onChange={(nextIso) => updateReservation(index, { transfer_dropoff_date: nextIso })}
                              className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              name={`reservation_transfer_dropoff_date_${index}`}
                            />
                          </div>
                        </div>
                      </details>

                      {/* Payment — حقول قابلة للتحرير (تُحفظ مع مسودة القسيمة) */}
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
                        <h3 className="text-base font-semibold tracking-tight text-emerald-950">Payment</h3>
                        <details className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                          <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-900">
                            {ui.paymentDetails}
                            <span className="ms-2 text-[11px] font-normal text-zinc-600">
                              {voucherPdfPaymentBox.bank.trim()
                                ? `· ${truncateSummary(voucherPdfPaymentBox.bank, 28)}`
                                : voucherPdfPaymentBox.payment_url.trim()
                                  ? `· ${truncateSummary(voucherPdfPaymentBox.payment_url, 36)}`
                                  : "· —"}
                            </span>
                          </summary>
                          <div className="mt-3 space-y-3">
                            <label className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950">
                              <input
                                type="checkbox"
                                checked={voucherPdfPaymentBox.enabled}
                                onChange={(e) =>
                                  setVoucherPdfPaymentBox((prev) => ({ ...prev, enabled: e.target.checked }))
                                }
                              />
                              <span className="font-semibold">{ui.showPaymentBox}</span>
                            </label>
                            <p className="text-[11px] text-zinc-500">
                              {ui.paymentHelp}
                            </p>
                            <div
                              dir="rtl"
                              className="space-y-2 rounded-lg border border-emerald-100/80 bg-white/90 p-3 text-right shadow-sm"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <span className="shrink-0 font-semibold text-emerald-900">{ui.titleLabel}:</span>
                                <input
                                  type="text"
                                  dir="auto"
                                  className="min-w-[10rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  value={voucherPdfPaymentBox.title}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, title: e.target.value }))
                                  }
                                  placeholder={ui.titlePlaceholder}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <span className="shrink-0 font-semibold text-emerald-900">{ui.bankLabel}:</span>
                                <input
                                  type="text"
                                  dir="auto"
                                  className="min-w-[10rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  value={voucherPdfPaymentBox.bank}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, bank: e.target.value }))
                                  }
                                  placeholder={ui.bankPlaceholder}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <span className="shrink-0 font-semibold text-emerald-900">{lang === "ar" ? "الإيبان" : lang === "tr" ? "IBAN" : "IBAN"}:</span>
                                <input
                                  type="text"
                                  dir="ltr"
                                  className="min-w-[10rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm"
                                  value={voucherPdfPaymentBox.iban}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, iban: e.target.value }))
                                  }
                                  placeholder="IBAN"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <span className="shrink-0 font-semibold text-emerald-900">{ui.accountLabel}:</span>
                                <input
                                  type="text"
                                  dir="ltr"
                                  className="min-w-[10rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm"
                                  value={voucherPdfPaymentBox.account}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, account: e.target.value }))
                                  }
                                  placeholder={ui.accountPlaceholder}
                                />
                              </div>
                              <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 text-sm">
                                <span className="shrink-0 font-semibold text-emerald-900">{ui.paymentLink}:</span>
                                <input
                                  type="url"
                                  dir="ltr"
                                  className="min-w-[10rem] flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  value={voucherPdfPaymentBox.payment_url}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, payment_url: e.target.value }))
                                  }
                                  placeholder="https://..."
                                />
                                {voucherPdfPaymentBox.payment_url.trim() ? (
                                  <a
                                    href={paymentUrlHref(voucherPdfPaymentBox.payment_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-xs font-medium text-teal-700 underline"
                                  >
                                    {ui.openLink}
                                  </a>
                                ) : null}
                              </div>
                              <div className="border-t border-emerald-100 pt-2">
                                <div className="mb-1 text-sm font-semibold text-zinc-700">{ui.extraNotes}:</div>
                                <textarea
                                  rows={3}
                                  dir="auto"
                                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm"
                                  value={voucherPdfPaymentBox.info_text}
                                  onChange={(e) =>
                                    setVoucherPdfPaymentBox((prev) => ({ ...prev, info_text: e.target.value }))
                                  }
                                  placeholder={ui.extraNotesPlaceholder}
                                />
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>

                      {/* الملاحظات: فندق/عميل/عامة */}
                      <div className="rounded-xl border border-zinc-200 bg-white p-3">
                        <div className="mb-2 text-sm font-semibold text-zinc-900">{ui.notesSection}</div>
                        <div className="grid gap-2 md:grid-cols-3">
                          <textarea
                            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                            placeholder={ui.hotelNotePlaceholder}
                            value={reservation.hotel_note}
                            onChange={(e) => updateReservation(index, { hotel_note: e.target.value })}
                          />
                          <textarea
                            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                            placeholder={ui.clientNotePlaceholder}
                            value={reservation.reservation_notes}
                            onChange={(e) => updateReservation(index, { reservation_notes: e.target.value })}
                          />
                          <textarea
                            className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                            placeholder={ui.generalNotePlaceholder}
                            value={reservation.internal_note}
                            onChange={(e) => updateReservation(index, { internal_note: e.target.value })}
                          />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </details>
          );
          })}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-lg border border-emerald-100 bg-[#f0fdf4] p-4 space-y-3 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold">{t.voucherFollowUp}</h2>
              <p className="text-xs text-zinc-500">{t.voucherFollowUpSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["edit", ui.actionEdit],
                ["cancel", ui.actionCancel],
                ["delete", ui.actionDelete],
                ["hotel", ui.actionHotel],
                ["client", ui.actionClient],
                ["invoice", ui.actionInvoice],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveAdminAction((prev) => (prev === key ? null : key))}
                  className={`rounded-md px-3 py-2 text-xs ${
                    activeAdminAction === key
                      ? "bg-emerald-600 text-white"
                      : "border border-emerald-200 bg-white text-emerald-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeAdminAction && (
              <div className="rounded-lg border border-emerald-100 bg-white p-4 space-y-3">
                {activeAdminAction === "edit" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.editBooking}</div>
                    <SearchableSelect
                      listId="edit-reservation-selector"
                      value={selectedReservationIndex}
                      placeholder={ui.selectBooking}
                      options={reservations.map((reservation, index) => ({
                        value: String(index),
                        label: `${reservation.index_nr || `${ui.bookingWord} ${index + 1}`} - ${getHotelName(reservation.hotel) || ui.noHotel}`,
                      }))}
                      onChange={(nextValue) => setSelectedReservationIndex(nextValue || "0")}
                    />
                    <p className="text-sm text-zinc-600">
                      {lang === "ar"
                        ? "بعد تحديد الحجز، سيتم تمييزه داخل النموذج بالأعلى لتعديله مباشرة."
                        : lang === "tr"
                          ? "Rezervasyonu sectikten sonra yukaridaki formda duzenleme icin vurgulanir."
                          : "After selecting a booking, it will be highlighted in the form above for direct editing."}
                    </p>
                    <button
                      type="button"
                      className="rounded-md bg-emerald-600 px-3 py-2 text-xs text-white"
                      onClick={() => reservationsSectionRef.current?.scrollIntoView({ behavior: "smooth" })}
                    >
                      {ui.jumpToForm}
                    </button>
                  </div>
                )}
                {activeAdminAction === "cancel" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.cancelWithNote}</div>
                    <SearchableSelect
                      listId="cancel-reservation-selector"
                      value={selectedReservationIndex}
                      placeholder={ui.selectCancelBooking}
                      options={reservations.map((reservation, index) => ({
                        value: String(index),
                        label: `${reservation.index_nr || `${ui.bookingWord} ${index + 1}`} - ${getHotelName(reservation.hotel) || ui.noHotel}`,
                      }))}
                      onChange={(nextValue) => setSelectedReservationIndex(nextValue || "0")}
                    />
                    <input
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                      value={selectedReservationHotelEmail || ui.noSavedHotelEmail}
                      readOnly
                    />
                    <textarea
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.cancelNotePlaceholder}
                      value={cancellationNote}
                      onChange={(e) => setCancellationNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-amber-600 px-3 py-2 text-xs text-white"
                        onClick={() => {
                          const targetIndex = Number(selectedReservationIndex);
                          setReservations((prev) =>
                            prev.map((reservation, index) =>
                              index === targetIndex
                                ? {
                                    ...reservation,
                                    reservation_status: "Cancelled",
                                    reservation_notes: [reservation.reservation_notes, cancellationNote]
                                      .filter(Boolean)
                                      .join("\n"),
                                  }
                                : reservation
                            )
                          );
                          setStatus(ui.markedCancelled);
                        }}
                      >
                        {ui.cancelConfirm}
                      </button>
                      <a
                        href={cancellationMailto || "#"}
                        onClick={(event) => {
                          if (!cancellationMailto) {
                            event.preventDefault();
                          }
                        }}
                        aria-disabled={!cancellationMailto}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          cancellationMailto
                            ? "border-amber-300 bg-white text-amber-700"
                            : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
                        }`}
                      >
                        {ui.actionHotel.replace(/^4\.\s*/, "")}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentVoucherId) {
                            setStatus(ui.cannotPrintBeforeSave);
                            return;
                          }
                          setPrintTemplate("hotel");
                          setPrintModalOpen(true);
                        }}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          "border-amber-300 bg-white text-amber-700"
                        }`}
                      >
                        {ui.printPreview}
                      </button>
                    </div>
                    {!selectedReservationHotelEmail && (
                      <p className="text-xs text-amber-700">{ui.addHotelEmailHint}</p>
                    )}
                    {!currentVoucherId && (
                      <p className="text-xs text-amber-700">{ui.saveVoucherFirstPrint}</p>
                    )}
                  </div>
                )}
                {activeAdminAction === "delete" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.deleteBooking}</div>
                    <p className="text-sm text-zinc-600">
                      {ui.deleteBookingWarn}
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-xs text-white"
                      aria-label={t.voucherDeleteBookingFromForm}
                      title={t.voucherDeleteBookingFromForm}
                      onClick={async () => {
                        const accepted = await requestDeleteConfirm(ui.deleteConfirm);
                        if (!accepted) return;
                        setReservations((prev) => prev.slice(0, 1).map((row) => ({ ...row, hotel: "", room_type: "" })));
                        setStatus(ui.deletedCurrentBooking);
                      }}
                    >
                      <TrashGlyph className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {activeAdminAction === "hotel" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.actionHotel.replace(/^4\.\s*/, "")}</div>
                    <SearchableSelect
                      listId="hotel-delivery-mode"
                      value={hotelDeliveryMode}
                      options={[
                        { value: "saved", label: ui.useSavedEmail },
                        { value: "manual", label: ui.useManualEmail },
                      ]}
                      onChange={(nextValue) =>
                        setHotelDeliveryMode(nextValue === "manual" ? "manual" : "saved")
                      }
                    />
                    {hotelDeliveryMode === "manual" ? (
                      <input
                        type="email"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="hotel@example.com"
                        value={hotelEmailManual}
                        onChange={(e) => setHotelEmailManual(e.target.value)}
                      />
                    ) : (
                      <input
                        className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                        value={firstHotelEmail || ui.noSavedHotelEmailShort}
                        readOnly
                      />
                    )}
                    <div className="grid gap-2">
                      {[
                        ["hotel_info", t.printHotelInfo],
                        ["reservation_info", t.printReservationInfo],
                        ["status_info", t.printStatusInfo],
                        ["room_summary", t.printRoomSummary],
                        ["voucher_note", t.printVoucherNote],
                        ["buying_price", t.printBuyingPrice],
                        ["buying_price_total", t.printBuyingPriceTotal],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={hotelVisibleFields.includes(key)}
                            onChange={() =>
                              setHotelVisibleFields((prev) => toggleVisibleField(prev, key))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs text-zinc-600">{ui.hotelEmailNoteLabel}</label>
                      <textarea
                        className="min-h-[84px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder={ui.emailNotePlaceholder}
                        value={hotelEmailNote}
                        onChange={(e) => setHotelEmailNote(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={hotelMailto || "#"}
                        onClick={(event) => {
                          if (!hotelMailto) {
                            event.preventDefault();
                          }
                        }}
                        aria-disabled={!hotelMailto}
                        className={`rounded-md px-3 py-2 text-xs ${
                          hotelMailto
                            ? "bg-emerald-600 text-white"
                            : "cursor-not-allowed bg-zinc-200 text-zinc-500"
                        }`}
                      >
                        {ui.actionHotel.replace(/^4\.\s*/, "")}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentVoucherId) {
                            setStatus(ui.cannotPrintBeforeSave);
                            return;
                          }
                          setPrintTemplate("hotel");
                          setPrintModalOpen(true);
                        }}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          "border-emerald-200 text-emerald-700"
                        }`}
                      >
                        {ui.printPreview}
                      </button>
                    </div>
                    {!effectiveHotelEmail && (
                      <p className="text-xs text-amber-700">
                        {lang === "ar"
                          ? "أضف إيميلًا للفندق أو اختر الإدخال اليدوي ليعمل زر الإرسال."
                          : lang === "tr"
                            ? "Gonder butonu icin otel e-postasi ekleyin veya manuel giris secin."
                            : "Add hotel email or choose manual input to enable sending."}
                      </p>
                    )}
                    {!currentVoucherId && (
                      <p className="text-xs text-amber-700">{ui.saveVoucherFirstPrint}</p>
                    )}
                  </div>
                )}
                {activeAdminAction === "client" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.actionClient.replace(/^5\.\s*/, "")}</div>
                    <SearchableSelect
                      listId="client-delivery-mode"
                      value={clientDeliveryMode}
                      options={[
                        { value: "saved", label: ui.useSavedClientEmail },
                        { value: "manual", label: ui.useManualEmail },
                      ]}
                      onChange={(nextValue) =>
                        setClientDeliveryMode(nextValue === "saved" ? "saved" : "manual")
                      }
                    />
                    {clientDeliveryMode === "manual" ? (
                      <input
                        type="email"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="client@example.com"
                        value={clientEmailManual}
                        onChange={(e) => setClientEmailManual(e.target.value)}
                      />
                    ) : (
                      <input
                        className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
                        value={matchedClient?.email || ui.noSavedClientEmail}
                        readOnly
                      />
                    )}
                    <div className="grid gap-2">
                      {[
                        ["customer_info", t.printCustomerInfo],
                        ["pax_info", t.printPaxInfo],
                        ["reservation_info", t.printReservationInfo],
                        ["guest_list", t.printGuestList],
                        ["fees", t.printFees],
                        ["voucher_note", t.printVoucherNote],
                        ["prices", t.printPrices],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={clientVisibleFields.includes(key)}
                            onChange={() =>
                              setClientVisibleFields((prev) => toggleVisibleField(prev, key))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs text-zinc-600">{ui.clientEmailNoteLabel}</label>
                      <textarea
                        className="min-h-[84px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder={ui.emailNotePlaceholder}
                        value={clientEmailNote}
                        onChange={(e) => setClientEmailNote(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={clientMailto || "#"}
                        onClick={(event) => {
                          if (!clientMailto) {
                            event.preventDefault();
                          }
                        }}
                        aria-disabled={!clientMailto}
                        className={`rounded-md px-3 py-2 text-xs ${
                          clientMailto
                            ? "bg-emerald-600 text-white"
                            : "cursor-not-allowed bg-zinc-200 text-zinc-500"
                        }`}
                      >
                        {ui.actionClient.replace(/^5\.\s*/, "")}
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (!currentVoucherId) {
                            setStatus(ui.cannotPrintBeforeSave);
                            return;
                          }
                          setPrintTemplate("customer");
                          setPrintModalOpen(true);
                        }}
                        className={`rounded-md border px-3 py-2 text-xs ${
                          "border-emerald-200 text-emerald-700"
                        }`}
                      >
                        {ui.printPreview}
                      </button>
                    </div>
                    {!effectiveClientEmail && (
                      <p className="text-xs text-amber-700">
                        {ui.sendToClientHint}
                      </p>
                    )}
                    {!currentVoucherId && (
                      <p className="text-xs text-amber-700">
                        {ui.saveVoucherFirstPrint}
                      </p>
                    )}
                  </div>
                )}
                {activeAdminAction === "invoice" && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">{ui.invoiceToAccounting}</div>
                    <SearchableSelect
                      listId="invoice-client"
                      value={invoiceForm.clientId}
                      placeholder={ui.selectClient}
                      options={clients.map((client) => ({
                        value: String(client.id),
                        label: client.name,
                      }))}
                      onChange={(nextValue) =>
                        setInvoiceForm((prev) => ({ ...prev, clientId: nextValue }))
                      }
                    />
                    <input
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.invoiceNumberPlaceholder}
                      value={invoiceForm.number}
                      onChange={(e) => setInvoiceForm((prev) => ({ ...prev, number: e.target.value }))}
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      <PopupYmdDatePicker
                        value={invoiceForm.issueDate}
                        onChange={(nextIso) => setInvoiceForm((prev) => ({ ...prev, issueDate: nextIso }))}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        name="voucher_invoice_issue_date"
                      />
                      <PopupYmdDatePicker
                        value={invoiceForm.dueDate}
                        onChange={(nextIso) => setInvoiceForm((prev) => ({ ...prev, dueDate: nextIso }))}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        name="voucher_invoice_due_date"
                      />
                    </div>
                    <input
                      type="number"
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.invoiceAmountPlaceholder}
                      value={invoiceForm.totalAmount}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, totalAmount: Number(e.target.value) }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                        disabled={!invoiceForm.clientId || !invoiceForm.number || !invoiceForm.totalAmount}
                        onClick={async () => {
                          const selectedReservation =
                            reservations[Number(selectedReservationIndex)] || reservations[0];
                          const invoice = await api.post<Invoice>("/invoices/", {
                            number: invoiceForm.number,
                            client: Number(invoiceForm.clientId),
                            issue_date: invoiceForm.issueDate,
                            due_date: invoiceForm.dueDate || null,
                            total_amount: Number(invoiceForm.totalAmount),
                            status: "draft",
                            notes: `Created from voucher ${currentVoucherId || voucherNumber}\nBooking serial: ${selectedReservation?.index_nr || "-"}`,
                          });
                          setCreatedInvoice(invoice);
                        }}
                      >
                        {ui.sendToAccounting}
                      </button>
                      {createdInvoice && (
                        <button
                          type="button"
                          onClick={() => void openInvoicePdf(createdInvoice.id)}
                          className="rounded-md border border-emerald-200 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50"
                        >
                          {ui.printInvoice}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-950">{t.voucherSummary}</h3>
          <dl className="mt-3 space-y-2 text-sm text-amber-950/90">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherSummaryVoucherNr}</dt>
              <dd className="font-medium tabular-nums">
                {(createdVoucher || voucher.voucher_nr || voucherNumber || "").trim() || "—"}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherClient}</dt>
              <dd className="max-w-[min(100%,18rem)] truncate text-end font-medium">
                {(voucher.client_name || "").trim() || "—"}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherSummaryLinesCount}</dt>
              <dd className="font-medium tabular-nums">{reservations.length}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherTotalPax}</dt>
              <dd className="font-medium tabular-nums">{totalPax}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherSellingSubtotal}</dt>
              <dd className="font-medium tabular-nums">
                {reservationTotal.toFixed(2)} {voucher.selling_currency || "USD"}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherTransferFee}</dt>
              <dd className="font-medium tabular-nums">
                {Number(voucher.transfer_fee || 0).toFixed(2)} {voucher.selling_currency || "USD"}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-amber-900/90">{t.voucherHandlingTotal}</dt>
              <dd className="font-medium tabular-nums">
                {handlingTotal.toFixed(2)} {voucher.handling_currency}
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200/80 pt-2 font-semibold text-amber-950">
              <dt>{t.voucherGrandTotal}</dt>
              <dd className="tabular-nums">
                {grandTotal.toFixed(2)} {voucher.selling_currency || "USD"}
              </dd>
            </div>
          </dl>
        </div>

        <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
          {t.voucherSave}
        </button>
        {status && <p className="text-sm text-zinc-600">{status}</p>}
      </form>

      {createdVoucher && (
        <div className="rounded-md border border-zinc-200 p-4 text-sm">
          <div className="font-semibold">{t.voucherPdfLinks}</div>
          <div className="flex flex-wrap gap-4 mt-2">
            <button
              type="button"
              onClick={() => void openVoucherPdf("customer")}
              className="text-blue-600"
            >
              {t.voucherCustomerPdf}
            </button>
            <button
              type="button"
              onClick={() => void openVoucherPdf("hotel")}
              className="text-blue-600"
            >
              {t.voucherHotelPdf}
            </button>
            <button
              type="button"
              onClick={() => void downloadGuestListPdf()}
              className="text-violet-700"
            >
              {t.voucherGuestListPdf}
            </button>
          </div>
        </div>
      )}

      <PrintPreviewModal
        t={t as unknown as Record<string, string>}
        lang={lang}
        open={printModalOpen}
        onClose={closePrintModal}
        template={printTemplate}
        onTemplateChange={setPrintTemplate}
        loading={printLoading}
        previewUrl={printPreviewUrl}
        hotelFields={hotelVisibleFields}
        setHotelFields={setHotelVisibleFields}
        clientFields={clientVisibleFields}
        setClientFields={setClientVisibleFields}
        toggleField={toggleVisibleField}
      />
    </div>
  );
}
