"use client";

import { useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import {
  DROPDOWN_CATEGORY_KEYS,
  fetchDropdownOptionsMap,
  type DropdownOptionRow,
} from "@/lib/dropdownOptions";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, IdCardIcon, SearchIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import { HotelIcon } from "@/components/NavIcons";
import { getToken } from "@/lib/auth";
import { stayNightsBetween } from "@/lib/stayNights";
import { formatYmdSlash } from "@/lib/dateFormat";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import { requestDeleteConfirm } from "@/lib/deleteConfirm";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useModuleUiSettings } from "@/lib/useModuleUiSettings";
import { openPdfBlobWithFallback, openPdfUrlWithFallback } from "@/lib/pdfOpen";

type Hotel = { id: number; name: string };
type RoomType = { id: number; hotel: number; name: string; capacity?: number };
type Guest = {
  id?: number;
  salutation?: string;
  /** Years; only used when salutation is `chd` */
  child_age?: number | "" | null;
  full_name: string;
  passport_number?: string;
  is_leader: boolean;
  room?: number | null;
  /** Read-only from API: VoucherRoom.reservation_id when `room` is set */
  room_reservation_id?: number | null;
  reservation_index?: number | null;
  room_number?: number | null;
};

type Reservation = {
  id: number;
  hotel: number;
  room_type: number;
  room_type_code: string;
  board_code: string;
  room_code: string;
  room_count: number;
  selling_date?: string | null;
  adult_count?: number;
  child_count?: number;
  infant_count?: number;
  extra_bed?: boolean;
  promotion_room?: boolean;
  honey_moons?: boolean;
  free_of_charge?: boolean;
  check_in: string;
  check_out: string;
  confirmation_number: string;
  room_nr?: string;
  external_voucher_no?: string;
  buying_price?: number;
  buying_currency?: string;
  selling_price?: number;
  selling_currency?: string;
  reservation_notes?: string;
  hotel_note?: string;
  internal_note?: string;
  transfer_note?: string;
  operator_note?: string;
  allotment_type?: string;
  hotel_confirmation?: string;
  operator_confirmation?: string;
  reservation_status: string;
  reservation_type?: string;
  print_option?: string;
  special_code?: string;
  code_2?: string;
  code_3?: string;
  code_4?: string;
  spo_spec_code?: string;
  package_splitting?: boolean;
  index_nr?: string;
  bubble?: boolean;
  passive?: boolean;
  free_sale?: boolean;
  local_service?: boolean;
  voucher_form_printing?: string;
  confirmation_form_print?: string;
  arrival_transfer?: boolean;
  arrival_transfer_date?: string | null;
  arrival_transfer_type?: string;
  departure_transfer?: boolean;
  departure_transfer_date?: string | null;
  departure_transfer_type?: string;
  handling_fee_type?: string;
  extras_prices?: Record<string, { buying_price?: number; selling_price?: number; enabled?: boolean }>;
};
type ReferrerDisplay = { id?: number; referrer_code: string; name: string };

type Voucher = {
  voucher_nr: string;
  client_name?: string;
  referrer_display?: ReferrerDisplay | null;
  transfer_fee?: number;
  transfer_buying_price?: number;
  transfer_currency?: string;
  reservations: Reservation[];
  guests?: Guest[];
};

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

/** لون خلفية وحد يسار للصف في جدول المتابعة حسب حالة الحجز. */
function rowClassForReservationStatus(status: string | undefined | null): string {
  const s = (status || "").trim().toLowerCase();
  if (s === "confirmed") {
    return "border-t border-zinc-100 bg-emerald-50/85 border-s-4 border-s-emerald-500";
  }
  if (s === "on request") {
    return "border-t border-zinc-100 bg-orange-50/85 border-s-4 border-s-orange-500";
  }
  if (s === "cancelled") {
    return "border-t border-zinc-100 bg-red-100/95 border-s-4 border-s-red-800";
  }
  return "border-t border-zinc-100";
}

function reservationGuestCapacity(
  reservation: Reservation,
  roomTypes: RoomType[],
): { total: number; perRoom: number; rooms: number } | null {
  const rt = roomTypes.find((r) => r.id === reservation.room_type);
  const rooms = Math.max(1, Math.floor(Number(reservation.room_count) || 1));
  if (!rt || rt.capacity == null) return null;
  const perRoom = Math.max(0, Number(rt.capacity));
  if (Number.isNaN(perRoom)) return null;
  return { total: rooms * perRoom, perRoom, rooms };
}

function registeredGuestCountForReservation(v: Voucher | undefined, reservationId: number): number {
  return (v?.guests || []).filter(
    (g) =>
      (g.full_name || "").trim().length > 0 && (g.room_reservation_id ?? null) === reservationId
  ).length;
}

const PRINT_FIELDS = [
  { key: "customer_info", labelKey: "printCustomerInfo" },
  { key: "pax_info", labelKey: "printPaxInfo" },
  { key: "reservation_info", labelKey: "printReservationInfo" },
  { key: "cancellation", labelKey: "printCancellation" },
  { key: "guest_list", labelKey: "printGuestList" },
  { key: "fees", labelKey: "printFees" },
  { key: "voucher_note", labelKey: "printVoucherNote" },
  { key: "prices", labelKey: "printPrices" },
  { key: "status_info", labelKey: "printStatusInfo" },
  { key: "hotel_info", labelKey: "printHotelInfo" },
  { key: "room_summary", labelKey: "printRoomSummary" },
  { key: "buying_price", labelKey: "printBuyingPrice" },
  { key: "buying_price_total", labelKey: "printBuyingPriceTotal" },
  { key: "footer_note", labelKey: "printFooterNote" },
] as const;

export default function BookingsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.bookings]);
  const { lang, t } = useI18n();
  const ui = useMemo(
    () => ({
      noPrintReady: lang === "ar" ? "لا يوجد ملف طباعة جاهز." : lang === "tr" ? "Hazir yazdirma dosyasi yok." : "No print file is ready.",
      printLoadFailed: lang === "ar" ? "تعذر تحميل ملف الطباعة." : lang === "tr" ? "Yazdirma dosyasi yuklenemedi." : "Unable to load print file.",
      printOpenFailed: lang === "ar" ? "تعذر فتح ملف الطباعة." : lang === "tr" ? "Yazdirma dosyasi acilamadi." : "Unable to open print file.",
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      confirmedNeedsNumber:
        lang === "ar"
          ? "لا يمكن حفظ حالة Confirmed دون رقم تأكيد (رقم الحجز)."
          : lang === "tr"
            ? "Onay numarasi olmadan Confirmed kaydedilemez."
            : "Cannot save Confirmed status without confirmation number.",
      noSession:
        lang === "ar"
          ? "لا يوجد جلسة دخول. سجّل الدخول ثم أعد المحاولة."
          : lang === "tr"
            ? "Oturum yok. Giris yapip tekrar deneyin."
            : "No active session. Sign in and try again.",
      previewLoadFailed: (code: number) =>
        lang === "ar"
          ? `تعذر تحميل المعاينة (رمز ${code}).`
          : lang === "tr"
            ? `Onizleme yuklenemedi (kod ${code}).`
            : `Unable to load preview (code ${code}).`,
      emptyPdf: lang === "ar" ? "ملف PDF فارغ." : lang === "tr" ? "PDF dosyasi bos." : "PDF file is empty.",
      previewFallback:
        lang === "ar"
          ? "تعذر تحميل معاينة PDF. تحقق من الاتصال بـ API أو سجّل الخروج والدخول مرة أخرى."
          : lang === "tr"
            ? "PDF onizlemesi yuklenemedi. API baglantisini kontrol edin veya cikis-giris yapin."
            : "Unable to load PDF preview. Check API connection or sign out and back in.",
      search: lang === "ar" ? "بحث" : lang === "tr" ? "Ara" : "Search",
      searchHint:
        lang === "ar"
          ? "ابحث برقم الحجز، اسم العميل، رقم التأكيد…"
          : lang === "tr"
            ? "Rezervasyon no, musteri, onay no ile ara..."
            : "Search by booking number, client name, confirmation number...",
      hotel: lang === "ar" ? "الفندق" : lang === "tr" ? "Otel" : "Hotel",
      hotelHint: lang === "ar" ? "فلترة الحجوزات حسب الفندق." : lang === "tr" ? "Otellere gore filtrele." : "Filter bookings by hotel.",
      roomType: lang === "ar" ? "نوع الغرفة" : lang === "tr" ? "Oda tipi" : "Room type",
      roomTypeHint: lang === "ar" ? "فلترة حسب نوع الغرفة." : lang === "tr" ? "Oda tipine gore filtrele." : "Filter by room type.",
      reservationStatus: lang === "ar" ? "حالة الحجز" : lang === "tr" ? "Rezervasyon durumu" : "Reservation status",
      reservationStatusHint: lang === "ar" ? "فلترة حسب حالة الحجز." : lang === "tr" ? "Duruma gore filtrele." : "Filter by reservation status.",
      checkInFrom: lang === "ar" ? "Check-in من" : lang === "tr" ? "Check-in baslangic" : "Check-in from",
      checkInTo: lang === "ar" ? "Check-in إلى" : lang === "tr" ? "Check-in bitis" : "Check-in to",
      allHotels: lang === "ar" ? "كل الفنادق" : lang === "tr" ? "Tum oteller" : "All hotels",
      allTypes: lang === "ar" ? "كل الأنواع" : lang === "tr" ? "Tum tipler" : "All types",
      allStatuses: lang === "ar" ? "كل الحالات" : lang === "tr" ? "Tum durumlar" : "All statuses",
      thisMonth: lang === "ar" ? "هذا الشهر" : lang === "tr" ? "Bu ay" : "This month",
      clear: lang === "ar" ? "مسح" : lang === "tr" ? "Temizle" : "Clear",
      quickReport: lang === "ar" ? "تقرير سريع" : lang === "tr" ? "Hizli rapor" : "Quick report",
      quickReportHint:
        lang === "ar"
          ? "يطابق نفس فلاتر الجدول أدناه (الفندق، نوع الغرفة، الحالة، نطاق تاريخ check-in، والبحث)."
          : lang === "tr"
            ? "Asagidaki tablo filtreleriyle aynidir (otel, oda tipi, durum, check-in tarih araligi ve arama)."
            : "Matches the same filters as the table below (hotel, room type, status, check-in range, and search).",
      vouchersCount: lang === "ar" ? "قسائم (عدد Voucher مميّز)" : lang === "tr" ? "Kuponlar (benzersiz Voucher sayisi)" : "Vouchers (distinct voucher count)",
      bookingLines: lang === "ar" ? "سطور حجز (أسطر في الجدول)" : lang === "tr" ? "Rezervasyon satirlari (tabloda)" : "Booking lines (table rows)",
      roomUnits: lang === "ar" ? "إجمالي وحدات غرف (Σ room count)" : lang === "tr" ? "Toplam oda birimi (Σ room count)" : "Total room units (Σ room count)",
      roomNights: lang === "ar" ? "ليالٍ-غرف (ليالي × غرف)" : lang === "tr" ? "Oda-gece (gece × oda)" : "Room-nights (nights × rooms)",
      statusDistribution:
        lang === "ar" ? "التوزيع حسب حالة الحجز:" : lang === "tr" ? "Rezervasyon durumuna gore dagilim:" : "Distribution by booking status:",
      sameCurrencyOnly: lang === "ar" ? "نفس العملة فقط" : lang === "tr" ? "Yalnizca ayni para birimi" : "Same currency only",
      bookingData: lang === "ar" ? "بيانات الحجز" : lang === "tr" ? "Rezervasyon bilgileri" : "Booking data",
      peopleGuests: lang === "ar" ? "الأشخاص (Guests)" : lang === "tr" ? "Kisiler (Guests)" : "People (Guests)",
      addPerson: lang === "ar" ? "إضافة شخص" : lang === "tr" ? "Kisi ekle" : "Add person",
      salutation: lang === "ar" ? "اللقب" : lang === "tr" ? "Hitap" : "Salutation",
      noPeople:
        lang === "ar"
          ? "لا يوجد أشخاص لهذه القسيمة (أضفهم من هنا إذا بدك)."
          : lang === "tr"
            ? "Bu kupon icin kisi yok (buradan ekleyebilirsiniz)."
            : "No people for this voucher (you can add them here).",
      countsAndOptions: lang === "ar" ? "الأعداد والخيارات" : lang === "tr" ? "Sayilar ve secenekler" : "Counts and options",
      adults: lang === "ar" ? "بالغين" : lang === "tr" ? "Yetiskin" : "Adults",
      children: lang === "ar" ? "أطفال" : lang === "tr" ? "Cocuk" : "Children",
      infants: lang === "ar" ? "رضّع" : lang === "tr" ? "Bebek" : "Infants",
      extrasBuyPrice: lang === "ar" ? "سعر شراء (Voucher Hotel)" : lang === "tr" ? "Alis fiyati (Voucher Hotel)" : "Buying price (Voucher Hotel)",
      extrasSellPrice: lang === "ar" ? "سعر بيع (Voucher Customer)" : lang === "tr" ? "Satis fiyati (Voucher Customer)" : "Selling price (Voucher Customer)",
      pricesAndNotes: lang === "ar" ? "الأسعار والملاحظات" : lang === "tr" ? "Fiyatlar ve notlar" : "Prices and notes",
      buyPrice: lang === "ar" ? "سعر الشراء" : lang === "tr" ? "Alis fiyati" : "Buying price",
      buyCurrency: lang === "ar" ? "عملة الشراء" : lang === "tr" ? "Alis para birimi" : "Buying currency",
      sellPrice: lang === "ar" ? "سعر البيع" : lang === "tr" ? "Satis fiyati" : "Selling price",
      sellCurrency: lang === "ar" ? "عملة البيع" : lang === "tr" ? "Satis para birimi" : "Selling currency",
      hotelNote: lang === "ar" ? "ملاحظة الفندق" : lang === "tr" ? "Otel notu" : "Hotel note",
      reservationNotes: lang === "ar" ? "ملاحظات الحجز" : lang === "tr" ? "Rezervasyon notlari" : "Reservation notes",
      internalNote: lang === "ar" ? "ملاحظة داخلية" : lang === "tr" ? "Ic not" : "Internal note",
      operatorNote: lang === "ar" ? "ملاحظة المشغّل" : lang === "tr" ? "Operator notu" : "Operator note",
      transferPrices: lang === "ar" ? "أسعار الترانسفير" : lang === "tr" ? "Transfer fiyatlari" : "Transfer prices",
      transferBuy: lang === "ar" ? "سعر شراء الترانسفير" : lang === "tr" ? "Transfer alis fiyati" : "Transfer buying price",
      transferSell: lang === "ar" ? "سعر بيع الترانسفير" : lang === "tr" ? "Transfer satis fiyati" : "Transfer selling price",
      transferCurrency: lang === "ar" ? "عملة الترانسفير" : lang === "tr" ? "Transfer para birimi" : "Transfer currency",
      statusAndFollow: lang === "ar" ? "الحالة والمتابعة" : lang === "tr" ? "Durum ve takip" : "Status and follow-up",
      confirmedNeedsMessage:
        lang === "ar"
          ? "أدخل رقم التأكيد (رقم الحجز) أولاً — أو سيُعيّن تلقائياً عند كتابة الرقم."
          : lang === "tr"
            ? "Once onay numarasini girin; yazinca otomatik atanir."
            : "Enter confirmation number first; it can be auto-assigned when typed.",
      requiresConfirmation: lang === "ar" ? " (يتطلب رقم تأكيد)" : lang === "tr" ? " (onay numarasi gerekir)" : " (requires confirmation number)",
      extraData: lang === "ar" ? "بيانات إضافية" : lang === "tr" ? "Ek bilgiler" : "Additional data",
    }),
    [lang],
  );
  const guestSalutationOptions = useMemo(
    () => [
      { value: "", label: "—" },
      { value: "mr", label: "Mr" },
      { value: "ms", label: "Ms" },
      { value: "chd", label: lang === "ar" ? "طفل" : lang === "tr" ? "Cocuk" : "Child" },
      { value: "inf", label: lang === "ar" ? "رضيع" : lang === "tr" ? "Bebek" : "Infant" },
    ],
    [lang],
  );
  const moduleUi = useModuleUiSettings("bookings");
  const bookingsPageTitle = String(moduleUi.page_title || "").trim() || t.bookingsTitle;
  const showGuestList = Boolean(moduleUi.show_guest_list ?? true);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const today = new Date();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthStart = `${monthPrefix}-01`;
  const currentMonthEnd = `${monthPrefix}-${String(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
  ).padStart(2, "0")}`;
  const [bookingFilters, setBookingFilters] = useState({
    hotelId: "",
    roomTypeId: "",
    reservationStatus: "",
    fromDate: currentMonthStart,
    toDate: currentMonthEnd,
  });
  const [printVoucher, setPrintVoucher] = useState<string | null>(null);
  const [printTemplate, setPrintTemplate] = useState<"customer" | "hotel">("customer");
  const [printOptions, setPrintOptions] = useState<Record<string, boolean>>(
    Object.fromEntries(PRINT_FIELDS.map((field) => [field.key, true]))
  );
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string>("");
  const [printLoading, setPrintLoading] = useState(false);
  const [printPreviewError, setPrintPreviewError] = useState<string | null>(null);

  const printPreviewFetchUrl = useMemo(() => {
    if (!printVoucher) {
      return "";
    }
    const keys = PRINT_FIELDS.filter((field) => printOptions[field.key]).map((field) => field.key);
    const params = new URLSearchParams();
    if (keys.length) params.set("show", keys.join(","));
    params.set("lang", lang);
    params.set("v", String(Date.now()));
    return `${API_BASE}/vouchers/${printVoucher}/pdf/${printTemplate}/?${params.toString()}`;
  }, [printVoucher, printTemplate, printOptions]);
  const [editing, setEditing] = useState<{
    voucherNr: string;
    reservation: Reservation;
    /** Index in voucher.reservations (same order as GET /vouchers/) for new guest room linking */
    reservationIndex: number;
  } | null>(null);
  const [editForm, setEditForm] = useState<Partial<Reservation>>({});
  const [guestForm, setGuestForm] = useState<Guest[]>([]);
  const [voucherTransferForm, setVoucherTransferForm] = useState({
    transfer_fee: 0,
    transfer_buying_price: 0,
    transfer_currency: "USD",
  });
  const [bookingDropdowns, setBookingDropdowns] = useState<Record<string, DropdownOptionRow[]>>({});

  useReloadOnNavigateOrTabVisible(() => {
    void fetchDropdownOptionsMap([
      DROPDOWN_CATEGORY_KEYS.bookingRoomCode,
      DROPDOWN_CATEGORY_KEYS.bookingRoomTypeCode,
      DROPDOWN_CATEGORY_KEYS.bookingBoardCode,
      DROPDOWN_CATEGORY_KEYS.bookingConfirmation,
      DROPDOWN_CATEGORY_KEYS.bookingReservationStatus,
      DROPDOWN_CATEGORY_KEYS.bookingReservationType,
      DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras,
    ]).then(setBookingDropdowns);
  });

  const roomCodeSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingRoomCode] || [],
    [bookingDropdowns],
  );
  const roomTypeCodeSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingRoomTypeCode] || [],
    [bookingDropdowns],
  );
  const boardCodeSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingBoardCode] || [],
    [bookingDropdowns],
  );
  const confirmationSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingConfirmation] || [],
    [bookingDropdowns],
  );
  const reservationStatusSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingReservationStatus] || [],
    [bookingDropdowns],
  );
  const reservationTypeSelectOptions = useMemo(
    () => bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingReservationType] || [],
    [bookingDropdowns],
  );
  const extrasFieldOptions = useMemo(() => {
    const seen = new Set<string>();
    const apiRows = (bookingDropdowns[DROPDOWN_CATEGORY_KEYS.bookingVoucherExtras] || [])
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
    if (apiRows.length > 0) return apiRows;
    return EXTRAS_FIELD_DEFAULTS.map((x) => ({ value: x.value, label: x.label }));
  }, [bookingDropdowns]);

  useEffect(() => {
    Promise.all([api.get<Hotel[]>("/hotels/"), api.get<RoomType[]>("/room-types/"), api.get<Voucher[]>("/vouchers/")]).then(
      ([hotelData, roomData, voucherData]) => {
        setHotels(hotelData);
        setRoomTypes(roomData);
        setVouchers(voucherData);
      }
    );
  }, []);

  const rows = useMemo(
    () =>
      vouchers.flatMap((voucher) =>
        voucher.reservations.map((reservation) => ({
          voucher_nr: voucher.voucher_nr,
          reservation,
        }))
      ),
    [vouchers]
  );
  const voucherByNr = useMemo(() => {
    const m = new Map<string, Voucher>();
    vouchers.forEach((v) => m.set(v.voucher_nr, v));
    return m;
  }, [vouchers]);

  const term = searchTerm.trim().toLowerCase();
  const from = bookingFilters.fromDate ? new Date(`${bookingFilters.fromDate}T00:00:00`) : null;
  const to = bookingFilters.toDate ? new Date(`${bookingFilters.toDate}T23:59:59`) : null;
  const filteredRows = rows.filter(({ voucher_nr, reservation }) => {
    if (bookingFilters.hotelId && String(reservation.hotel) !== bookingFilters.hotelId) {
      return false;
    }
    if (bookingFilters.roomTypeId && String(reservation.room_type) !== bookingFilters.roomTypeId) {
      return false;
    }
    if (
      bookingFilters.reservationStatus &&
      String(reservation.reservation_status || "") !== bookingFilters.reservationStatus
    ) {
      return false;
    }
    const checkInDate = reservation.check_in ? new Date(`${reservation.check_in}T00:00:00`) : null;
    if (from && checkInDate && checkInDate < from) return false;
    if (to && checkInDate && checkInDate > to) return false;

    if (!term) return true;

    const v = voucherByNr.get(voucher_nr);
    const hotelName = getHotelName(reservation.hotel).toLowerCase();
    const roomTypeName = getRoomTypeName(reservation.room_type).toLowerCase();
    const client = (v?.client_name || "").toLowerCase();
    const refn = (v?.referrer_display?.name || "").toLowerCase();
    return (
      voucher_nr.toLowerCase().includes(term) ||
      hotelName.includes(term) ||
      roomTypeName.includes(term) ||
      client.includes(term) ||
      refn.includes(term) ||
      (reservation.confirmation_number || "").toLowerCase().includes(term) ||
      (reservation.reservation_status || "").toLowerCase().includes(term) ||
      (reservation.index_nr || "").toLowerCase().includes(term)
    );
  });

  const tableTotals = (() => {
    let buy = 0;
    let sell = 0;
    let profit = 0;
    let n = 0;
    for (const { reservation } of filteredRows) {
      const b = Number(reservation.buying_price) || 0;
      const s = Number(reservation.selling_price) || 0;
      const bc = (reservation.buying_currency || "").toUpperCase();
      const sc = (reservation.selling_currency || "").toUpperCase();
      if (bc && sc && bc === sc) {
        buy += b;
        sell += s;
        profit += s - b;
        n += 1;
      }
    }
    return { buy, sell, profit, n };
  })();

  const bookingReportStats = useMemo(() => {
    const voucherNrs = new Set<string>();
    let roomNights = 0;
    let roomUnits = 0;
    let guestCapacitySum = 0;
    const statusCounts: Record<string, number> = {};
    for (const { voucher_nr, reservation } of filteredRows) {
      voucherNrs.add(voucher_nr);
      const st = (reservation.reservation_status || "").trim() || "—";
      statusCounts[st] = (statusCounts[st] || 0) + 1;
      const nights = stayNightsBetween(reservation.check_in, reservation.check_out);
      const rc = Math.max(1, Math.floor(Number(reservation.room_count) || 1));
      roomUnits += rc;
      if (nights != null) {
        roomNights += nights * rc;
      }
      const cap = reservationGuestCapacity(reservation, roomTypes);
      if (cap) {
        guestCapacitySum += cap.total;
      }
    }
    return {
      voucherCount: voucherNrs.size,
      lineCount: filteredRows.length,
      roomNights,
      roomUnits,
      guestCapacitySum,
      statusCounts,
    };
  }, [filteredRows, roomTypes]);

  const getHotelName = (hotelId: number) =>
    hotels.find((hotel) => hotel.id === hotelId)?.name || "-";
  const getRoomTypeName = (roomTypeId: number) =>
    roomTypes.find((room) => room.id === roomTypeId)?.name || "-";

  const openPrint = (voucherNr: string, template: "customer" | "hotel") => {
    setPrintPreviewError(null);
    setPrintPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    setPrintVoucher(voucherNr);
    setPrintTemplate(template);
    setPrintLoading(true);
  };

  const closePrint = () => {
    setPrintVoucher(null);
    setPrintLoading(false);
    setPrintPreviewError(null);
    setPrintPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  };

  const openCurrentPrintPdf = async () => {
    if (printPreviewUrl) {
      openPdfUrlWithFallback(printPreviewUrl, { mode: "preview" });
      return;
    }
    if (!printPreviewFetchUrl) {
      alert(ui.noPrintReady);
      return;
    }
    try {
      const token = getToken();
      const response = await fetch(printPreviewFetchUrl, {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(ui.printLoadFailed);
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error(ui.printLoadFailed);
      }
      openPdfBlobWithFallback(blob, { mode: "preview", downloadFileName: "booking-voucher.pdf" });
    } catch (err) {
      alert(err instanceof Error ? err.message : ui.printOpenFailed);
    }
  };

  const openEdit = (voucherNr: string, reservation: Reservation) => {
    const voucherRow = vouchers.find((v) => v.voucher_nr === voucherNr);
    let reservationIndexInit = 0;
    if (voucherRow) {
      const i = voucherRow.reservations.findIndex((r) => r.id === reservation.id);
      reservationIndexInit = i >= 0 ? i : 0;
    }
    setEditing({ voucherNr, reservation, reservationIndex: reservationIndexInit });
    setEditForm(reservation);
    setGuestForm([]);
    setVoucherTransferForm({
      transfer_fee: 0,
      transfer_buying_price: 0,
      transfer_currency: "USD",
    });

    api
      .get<Reservation>(`/voucher-reservations/${reservation.id}/`)
      .then((full) => {
        setEditing((prev) => (prev?.reservation.id === reservation.id ? { ...prev, reservation: full } : prev));
        setEditForm(full);
      })
      .catch(() => {
        // Keep the lightweight row data if the detailed fetch fails.
      });

    api
      .get<Voucher>(`/vouchers/${voucherNr}/`)
      .then((voucher) => {
        setVoucherTransferForm({
          transfer_fee: Number(voucher?.transfer_fee || 0),
          transfer_buying_price: Number(voucher?.transfer_buying_price || 0),
          transfer_currency: (voucher?.transfer_currency || "USD").toUpperCase(),
        });
        const resIdxRaw = voucher.reservations.findIndex((r) => r.id === reservation.id);
        const ri = resIdxRaw >= 0 ? resIdxRaw : 0;
        setEditing((prev) =>
          prev &&
          prev.voucherNr === voucherNr &&
          prev.reservation.id === reservation.id
            ? { ...prev, reservationIndex: ri }
            : prev
        );
        if (!voucher?.guests) return;
        const guestsThisReservation = voucher.guests.filter(
          (guest) => (guest.room_reservation_id ?? null) === reservation.id
        );
        setGuestForm(
          guestsThisReservation.map((guest) => ({
            id: guest.id,
            salutation: guest.salutation || "",
            child_age:
              guest.child_age != null && guest.child_age !== ""
                ? Number(guest.child_age)
                : "",
            full_name: guest.full_name || "",
            passport_number: guest.passport_number || "",
            is_leader: Boolean(guest.is_leader),
            room: guest.room ?? null,
            room_reservation_id: guest.room_reservation_id ?? reservation.id,
            reservation_index: guest.room != null ? null : ri,
            room_number: guest.room != null ? null : 1,
          }))
        );
      })
      .catch(() => {
        // Guests are optional for editing; ignore failures.
      });
  };

  const addGuest = () => {
    setGuestForm((prev) => {
      const ri = editing?.reservationIndex ?? 0;
      return [
        ...prev,
        {
          salutation: "",
          child_age: "",
          full_name: "",
          passport_number: "",
          is_leader: prev.length === 0,
          room: null,
          reservation_index: ri,
          room_number: 1,
        },
      ];
    });
  };

  const removeGuest = async (index: number) => {
    const accepted = await requestDeleteConfirm(ui.deleteConfirm);
    if (!accepted) return;
    setGuestForm((prev) => prev.filter((_, i) => i !== index));
  };

  const updateGuest = (index: number, next: Partial<Guest>) => {
    setGuestForm((prev) =>
      prev.map((guest, i) => {
        if (i === index) {
          return { ...guest, ...next };
        }
        if (next.is_leader) {
          return { ...guest, is_leader: false };
        }
        return guest;
      })
    );
  };

  const saveEdit = async () => {
    if (!editing) {
      return;
    }
    const st = (editForm.reservation_status || "").trim();
    if (st === "Confirmed" && !(editForm.confirmation_number || "").trim()) {
      alert(ui.confirmedNeedsNumber);
      return;
    }
    const normalizedExtrasPrices = Object.fromEntries(
      Object.entries(editForm.extras_prices || {}).map(([key, row]) => [
        key,
        {
          buying_price: Number((row as { buying_price?: number })?.buying_price || 0),
          selling_price: Number((row as { selling_price?: number })?.selling_price || 0),
          enabled: Boolean((row as { enabled?: boolean })?.enabled),
        },
      ]),
    );
    const payload: Partial<Reservation> = {
      ...editForm,
      room_type_code: (editForm.room_type_code || "").trim() || "GUES",
      board_code: (editForm.board_code || "").trim() || "BB",
      room_code: (editForm.room_code || "").trim() || "DBL",
      room_count: editForm.room_count != null ? Number(editForm.room_count) : undefined,
      room_type: editForm.room_type != null ? Number(editForm.room_type) : undefined,
      hotel: editForm.hotel != null ? Number(editForm.hotel) : undefined,
      adult_count: editForm.adult_count != null ? Number(editForm.adult_count) : undefined,
      child_count: editForm.child_count != null ? Number(editForm.child_count) : undefined,
      infant_count: editForm.infant_count != null ? Number(editForm.infant_count) : undefined,
      buying_price: editForm.buying_price != null ? Number(editForm.buying_price) : undefined,
      selling_price: editForm.selling_price != null ? Number(editForm.selling_price) : undefined,
      extras_prices: normalizedExtrasPrices,
    };
    const updated = await api.patch<Reservation>(
      `/voucher-reservations/${editing.reservation.id}/`,
      payload
    );

    const cleanedGuests = guestForm
      .map((guest) => ({
        salutation: guest.salutation || "",
        full_name: guest.full_name.trim(),
        passport_number: (guest.passport_number || "").trim(),
        is_leader: Boolean(guest.is_leader),
        child_age:
          guest.salutation === "chd" &&
          guest.child_age !== "" &&
          guest.child_age != null &&
          Number.isFinite(Number(guest.child_age))
            ? Math.max(0, Math.min(120, Math.floor(Number(guest.child_age))))
            : null,
        room: guest.room ?? null,
        reservation_index:
          guest.room != null
            ? undefined
            : guest.reservation_index ?? editing.reservationIndex ?? undefined,
        room_number: guest.room != null ? undefined : guest.room_number ?? 1,
      }))
      .filter((guest) => guest.full_name.length > 0);

    const voucherFresh = await api.get<Voucher>(
      `/vouchers/${encodeURIComponent(editing.voucherNr)}/`
    );
    const rid = editing.reservation.id;
    const formHasLeader = cleanedGuests.some((g) => g.is_leader);
    const otherPayload = (voucherFresh.guests || [])
      .filter((g) => (g.room_reservation_id ?? null) !== rid)
      .map((g) => {
        const salutation = g.salutation || "";
        const room = g.room ?? null;
        const resIdx =
          g.room_reservation_id != null
            ? voucherFresh.reservations.findIndex((r) => r.id === g.room_reservation_id)
            : -1;
        return {
          salutation,
          full_name: (g.full_name || "").trim(),
          passport_number: (g.passport_number || "").trim(),
          is_leader: formHasLeader ? false : Boolean(g.is_leader),
          child_age:
            salutation === "chd" &&
            g.child_age != null &&
            g.child_age !== "" &&
            Number.isFinite(Number(g.child_age))
              ? Math.max(0, Math.min(120, Math.floor(Number(g.child_age))))
              : null,
          room,
          reservation_index: room != null ? undefined : resIdx >= 0 ? resIdx : undefined,
          room_number: room != null ? undefined : resIdx >= 0 ? (g.room_number ?? 1) : undefined,
        };
      })
      .filter((g) => g.full_name.length > 0);

    const mergedGuests = [...otherPayload, ...cleanedGuests];

    const voucherPatchPayload: Record<string, unknown> = {
      transfer_fee: Number(voucherTransferForm.transfer_fee) || 0,
      transfer_buying_price: Number(voucherTransferForm.transfer_buying_price) || 0,
      transfer_currency: (voucherTransferForm.transfer_currency || "USD").toUpperCase(),
      guests: mergedGuests,
    };
    await api.patch<Voucher>(
      `/vouchers/${encodeURIComponent(editing.voucherNr)}/`,
      voucherPatchPayload
    );

    const voucherSynced = await api.get<Voucher>(
      `/vouchers/${encodeURIComponent(editing.voucherNr)}/`
    );

    setVouchers((prev) =>
      prev.map((voucher) => {
        if (voucher.voucher_nr !== editing.voucherNr) return voucher;
        return {
          ...voucherSynced,
          reservations: voucherSynced.reservations.map((reservation) =>
            reservation.id === updated.id ? { ...reservation, ...updated } : reservation
          ),
        };
      })
    );
    setEditing(null);
  };

  useEffect(() => {
    if (!printPreviewFetchUrl) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    const token = getToken();

    if (!token) {
      setPrintPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
      setPrintPreviewError(ui.noSession);
      setPrintLoading(false);
      return () => controller.abort();
    }

    setPrintLoading(true);
    setPrintPreviewError(null);
    fetch(printPreviewFetchUrl, {
      headers: { Authorization: `Token ${token}` },
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(ui.previewLoadFailed(response.status));
        }
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        if (!blob.size) {
          throw new Error(ui.emptyPdf);
        }
        const objectUrl = URL.createObjectURL(blob);
        setPrintPreviewUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return objectUrl;
        });
        setPrintPreviewError(null);
      })
      .catch((err) => {
        if (active) {
          setPrintPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return "";
          });
          setPrintPreviewError(
            err instanceof Error
              ? err.message
              : ui.previewFallback,
          );
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
  }, [printPreviewFetchUrl, ui]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{bookingsPageTitle}</h1>
          <p className="text-sm text-zinc-500">{t.bookingsSubtitle}</p>
        </div>
        <div className="w-full max-w-xl">
          <div className="mb-2">
            <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.search} hint={ui.searchHint} />
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.bookingSearch}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-100 bg-white p-4">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="grid gap-1 text-sm">
            <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={ui.hotel} hint={ui.hotelHint} />
            <TypeableSelect
              className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm"
              value={bookingFilters.hotelId}
              onChange={(e) => setBookingFilters((prev) => ({ ...prev, hotelId: e.target.value }))}
            >
              <option value="">{ui.allHotels}</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={String(hotel.id)}>
                  {hotel.name}
                </option>
              ))}
            </TypeableSelect>
          </label>

          <label className="grid gap-1 text-sm">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.roomType} hint={ui.roomTypeHint} />
            <TypeableSelect
              className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm"
              value={bookingFilters.roomTypeId}
              onChange={(e) => setBookingFilters((prev) => ({ ...prev, roomTypeId: e.target.value }))}
            >
              <option value="">{ui.allTypes}</option>
              {roomTypes.map((room) => (
                <option key={room.id} value={String(room.id)}>
                  {room.name}
                </option>
              ))}
            </TypeableSelect>
          </label>

          <label className="grid gap-1 text-sm">
            <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.reservationStatus} hint={ui.reservationStatusHint} />
            <TypeableSelect
              className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm"
              value={bookingFilters.reservationStatus}
              onChange={(e) =>
                setBookingFilters((prev) => ({ ...prev, reservationStatus: e.target.value }))
              }
            >
              <option value="">{ui.allStatuses}</option>
              {reservationStatusSelectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </TypeableSelect>
          </label>

          <div className="grid gap-3 md:grid-cols-2 xl:col-span-2">
            <label className="grid gap-1 text-sm">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.checkInFrom} hint={lang === "ar" ? "بداية نطاق التاريخ." : lang === "tr" ? "Tarih araligi baslangici." : "Start of date range."} />
              <PopupYmdDatePicker
                value={bookingFilters.fromDate}
                onChange={(nextIso) => setBookingFilters((prev) => ({ ...prev, fromDate: nextIso }))}
                className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm"
                name="booking_filters_from_date"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.checkInTo} hint={lang === "ar" ? "نهاية نطاق التاريخ." : lang === "tr" ? "Tarih araligi sonu." : "End of date range."} />
              <PopupYmdDatePicker
                value={bookingFilters.toDate}
                onChange={(nextIso) => setBookingFilters((prev) => ({ ...prev, toDate: nextIso }))}
                className="rounded-md border border-zinc-200 px-2.5 py-2 text-sm"
                name="booking_filters_to_date"
              />
            </label>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
              onClick={() =>
                setBookingFilters((prev) => ({
                  ...prev,
                  fromDate: currentMonthStart,
                  toDate: currentMonthEnd,
                }))
              }
            >
              {ui.thisMonth}
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
              onClick={() =>
                setBookingFilters({
                  hotelId: "",
                  roomTypeId: "",
                  reservationStatus: "",
                  fromDate: "",
                  toDate: "",
                })
              }
            >
              {ui.clear}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/30 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{ui.quickReport}</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {ui.quickReportHint}
        </p>
        <p className="mt-0.5 text-xs font-mono text-zinc-600">
          check-in: {bookingFilters.fromDate || "—"} → {bookingFilters.toDate || "—"}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-lg border border-zinc-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{ui.vouchersCount}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {bookingReportStats.voucherCount}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{ui.bookingLines}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {bookingReportStats.lineCount}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{ui.roomUnits}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">
              {bookingReportStats.roomUnits}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{ui.roomNights}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">
              {bookingReportStats.roomNights}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{t.bookingReportGuestCapacity}</div>
            <div
              className="mt-1 text-2xl font-semibold tabular-nums text-indigo-800"
              title={t.bookingGuestCapacityHint}
            >
              {bookingReportStats.guestCapacitySum}
            </div>
          </div>
        </div>
        {Object.keys(bookingReportStats.statusCounts).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            <span className="font-medium text-zinc-700">{ui.statusDistribution}</span>
            {Object.entries(bookingReportStats.statusCounts)
              .sort(([a], [b]) => a.localeCompare(b, "ar"))
              .map(([status, c]) => (
                <span key={status} className="font-mono">
                  {status}: {c}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold">{t.bookingsFollowUp}</h2>
        <p className="mb-3 flex flex-wrap gap-4 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden />
            Confirmed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" aria-hidden />
            On Request
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-red-800" aria-hidden />
            Cancelled
          </span>
        </p>
        <div className="-mx-4 overflow-x-auto">
          <table className="min-w-full text-[12px]">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-2 py-1.5">{t.voucherNumber}</th>
                <th className="px-2 py-1.5">{t.bookingClientName}</th>
                <th className="px-2 py-1.5">{t.bookingReferrerCol}</th>
                <th className="px-2 py-1.5">{t.bookingSerial}</th>
                <th className="px-2 py-1.5">{t.bookingHotel}</th>
                <th className="px-2 py-1.5">{t.bookingCheckIn}</th>
                <th className="px-2 py-1.5">{t.bookingCheckOut}</th>
                <th className="px-2 py-1.5">{t.bookingNights}</th>
                <th className="px-2 py-1.5">{t.voucherFollowUpRoomSize}</th>
                <th className="px-2 py-1.5">{t.voucherFollowUpRoomType}</th>
                <th className="px-2 py-1.5">{t.voucherFollowUpBoard}</th>
                <th className="px-2 py-1.5 max-w-[7rem]" title={t.bookingGuestCapacityHint}>
                  {t.bookingGuestCapacity}
                </th>
                <th className="px-2 py-1.5">{t.bookingGuestRegistered}</th>
                <th className="px-2 py-1.5">{t.bookingBuyPrice}</th>
                <th className="px-2 py-1.5">{t.bookingSellPrice}</th>
                <th className="px-2 py-1.5">{t.bookingLineProfit}</th>
                <th className="px-2 py-1.5">{t.voucherReservationStatus}</th>
                <th className="px-2 py-1.5">{t.voucherConfirmation}</th>
                <th className="px-2 py-1.5">{t.bookingPrint}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const v = voucherByNr.get(row.voucher_nr);
                const resIdx = v?.reservations?.findIndex((r) => r.id === row.reservation.id) ?? -1;
                const serialDisplay =
                  row.reservation.index_nr ||
                  (resIdx >= 0 ? String(resIdx + 1).padStart(7, "0") : "—");
                const buy = Number(row.reservation.buying_price) || 0;
                const sell = Number(row.reservation.selling_price) || 0;
                const bc = (row.reservation.buying_currency || "").toUpperCase();
                const sc = (row.reservation.selling_currency || "").toUpperCase();
                const same = bc && sc && bc === sc;
                const lineProfit = same ? sell - buy : null;
                const nights = stayNightsBetween(row.reservation.check_in, row.reservation.check_out);
                const cap = reservationGuestCapacity(row.reservation, roomTypes);
                const regGuests = registeredGuestCountForReservation(v, row.reservation.id);
                return (
                  <tr
                    key={`${row.voucher_nr}-${row.reservation.id}-${index}`}
                    className={rowClassForReservationStatus(row.reservation.reservation_status)}
                  >
                    <td className="px-2 py-1.5 font-mono text-[11px]">{row.voucher_nr}</td>
                    <td className="px-2 py-1.5">{v?.client_name || "—"}</td>
                    <td className="px-2 py-1.5">
                      {v?.referrer_display
                        ? `${v.referrer_display.referrer_code} · ${v.referrer_display.name}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{serialDisplay}</td>
                    <td className="px-2 py-1.5">{getHotelName(row.reservation.hotel)}</td>
                    <td className="px-2 py-1.5">{formatYmdSlash(row.reservation.check_in)}</td>
                    <td className="px-2 py-1.5">{formatYmdSlash(row.reservation.check_out)}</td>
                    <td className="px-2 py-1.5 text-center font-medium tabular-nums">
                      {nights != null ? nights : "—"}
                    </td>
                    <td className="px-2 py-1.5">{row.reservation.room_code}</td>
                    <td className="px-2 py-1.5">
                      {getRoomTypeName(row.reservation.room_type) || row.reservation.room_type_code}
                    </td>
                    <td className="px-2 py-1.5">{row.reservation.board_code}</td>
                    <td
                      className="px-2 py-1.5 text-center align-top tabular-nums"
                      title={cap ? t.bookingGuestCapacityHint : undefined}
                    >
                      {cap ? (
                        <span className="inline-flex flex-col leading-tight">
                          <span className="font-semibold">{cap.total}</span>
                          <span className="text-[10px] font-normal text-zinc-500">
                            {cap.rooms}×{cap.perRoom}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{regGuests}</td>
                    <td className="px-2 py-1.5">
                      {buy.toFixed(2)} {bc || "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {sell.toFixed(2)} {sc || "—"}
                    </td>
                    <td className="py-2">
                      {lineProfit != null ? `${lineProfit.toFixed(2)} ${sc}` : "—"}
                    </td>
                    <td className="py-2">{row.reservation.reservation_status || "-"}</td>
                    <td className="py-2">{row.reservation.confirmation_number || "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row.voucher_nr, row.reservation)}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs mb-input-raised inline-flex items-center justify-center"
                          aria-label={t.bookingEdit}
                          title={t.bookingEdit}
                        >
                          <PencilGlyph className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openPrint(row.voucher_nr, "hotel")}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
                        >
                          {t.printHotel}
                        </button>
                        <button
                          type="button"
                          onClick={() => openPrint(row.voucher_nr, "customer")}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs"
                        >
                          {t.printCustomer}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={19} className="py-4 text-center text-zinc-400">
                    {t.bookingNoBookings}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && tableTotals.n > 0 && (
              <tfoot>
                <tr className="border-t-2 border-emerald-200 bg-emerald-50/60 font-semibold">
                  <td colSpan={13} className="py-2 text-right">
                    {t.bookingTableTotals} ({t.commonProfit} — {t.bookingBuyPrice} / {t.bookingSellPrice})
                  </td>
                  <td className="py-2">{tableTotals.buy.toFixed(2)}</td>
                  <td className="py-2">{tableTotals.sell.toFixed(2)}</td>
                  <td className="py-2">{tableTotals.profit.toFixed(2)}</td>
                  <td colSpan={3} className="py-2 text-xs font-normal text-zinc-500">
                    {tableTotals.n} {t.dashboardBookingsCount} · {ui.sameCurrencyOnly}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {printVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.bookingPrintOptions}</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={closePrint}>
                {t.commonClose}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{t.bookingPrintSubtitle}</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {PRINT_FIELDS.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={printOptions[field.key]}
                    onChange={(e) =>
                      setPrintOptions((prev) => ({ ...prev, [field.key]: e.target.checked }))
                    }
                  />
                  {t[field.labelKey]}
                </label>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50">
              {printLoading ? (
                <div className="px-4 py-6 text-center text-sm text-zinc-400">{t.commonLoading}</div>
              ) : printPreviewUrl ? (
                <embed
                  key={printPreviewUrl}
                  type="application/pdf"
                  title="print-preview"
                  src={printPreviewUrl}
                  className="h-[420px] w-full min-h-[420px] rounded-md"
                />
              ) : printPreviewError ? (
                <div className="px-4 py-6 text-center text-sm text-red-600">{printPreviewError}</div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-zinc-400">{t.commonNoData}</div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePrint}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                {t.commonCancel}
              </button>
              <button
                type="button"
                onClick={() => void openCurrentPrintPdf()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
              >
                {t.commonPrint}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-2 md:p-4">
          <div className="flex h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-lg 2xl:max-w-[1800px]">
            <div className="flex items-center justify-between px-6 pt-6">
              <h3 className="text-sm font-semibold">{t.bookingEditTitle}</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setEditing(null)}>
                {t.commonClose}
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-[#f0fdf4] p-4">
                  <div className="mb-3 text-sm font-semibold text-emerald-900">{ui.bookingData}</div>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.bookingCheckIn}</span>
                      <PopupYmdDatePicker
                        value={editForm.check_in || ""}
                        onChange={(nextIso) => setEditForm((prev) => ({ ...prev, check_in: nextIso }))}
                        className="mb-input-raised rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                        name="booking_edit_check_in"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.bookingCheckOut}</span>
                      <PopupYmdDatePicker
                        value={editForm.check_out || ""}
                        onChange={(nextIso) => setEditForm((prev) => ({ ...prev, check_out: nextIso }))}
                        className="mb-input-raised rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                        name="booking_edit_check_out"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.bookingNights}</span>
                      <div className="mb-input-raised flex min-h-[42px] items-center rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800">
                        {stayNightsBetween(
                          editForm.check_in || "",
                          editForm.check_out || ""
                        ) ?? "—"}
                      </div>
                    </label>
                    <label className="grid gap-1 text-xs text-zinc-600">
                      <span>{t.voucherSellingDate}</span>
                      <PopupYmdDatePicker
                        value={editForm.selling_date || ""}
                        onChange={(nextIso) => setEditForm((prev) => ({ ...prev, selling_date: nextIso }))}
                        className="mb-input-raised rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                        name="booking_edit_selling_date"
                      />
                    </label>
                    <TypeableSelect
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={editForm.hotel ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          hotel: Number(e.target.value),
                          room_type: undefined,
                        }))
                      }
                    >
                      <option value="">{t.bookingHotel}</option>
                      {hotels.map((hotel) => (
                        <option key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </option>
                      ))}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={editForm.room_type ?? ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, room_type: Number(e.target.value) }))
                      }
                    >
                      <option value="">{t.bookingRoomType}</option>
                      {roomTypes
                        .filter((room) => room.hotel === Number(editForm.hotel))
                        .map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.name}
                          </option>
                        ))}
                    </TypeableSelect>
                    <input
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder="Room count"
                      type="number"
                      value={editForm.room_count ?? 1}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, room_count: Number(e.target.value) }))
                      }
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <TypeableSelect
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={editForm.room_code || ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, room_code: e.target.value }))}
                    >
                      <option value="">{t.voucherFollowUpRoomSize}</option>
                      {roomCodeSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={editForm.room_type_code || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, room_type_code: e.target.value }))
                      }
                    >
                      <option value="">Room type code</option>
                      {roomTypeCodeSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={editForm.board_code || ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, board_code: e.target.value }))}
                    >
                      <option value="">{t.voucherFollowUpBoard}</option>
                      {boardCodeSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                    <input
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={t.voucherConfirmation}
                      value={editForm.confirmation_number || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditForm((prev) => {
                          const next: Partial<Reservation> = { ...prev, confirmation_number: v };
                          const trimmed = v.trim();
                          if (trimmed) {
                            next.reservation_status = "Confirmed";
                          } else if ((prev.reservation_status || "").trim() === "Confirmed") {
                            next.reservation_status = "On Request";
                          }
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>

                {showGuestList ? <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-sky-900">{ui.peopleGuests}</div>
                    <button
                      type="button"
                      onClick={addGuest}
                      className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-xs text-sky-800"
                    >
                      {ui.addPerson}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {guestForm.map((guest, index) => (
                      <div
                        key={`${guest.id ?? "new"}-${index}`}
                        className="space-y-2 rounded-lg border border-sky-100 bg-white p-3"
                      >
                        <div className="grid gap-2 md:grid-cols-[100px_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-500">{ui.salutation}</span>
                            <TypeableSelect
                              className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm"
                              value={guest.salutation || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateGuest(index, {
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
                              hint={lang === "ar" ? "الاسم كما هو في الجواز." : lang === "tr" ? "Pasaporttaki adla ayni." : "Name exactly as in passport."}
                            />
                            <input
                              className="w-full min-w-0 rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              placeholder={t.voucherGuestName}
                              value={guest.full_name}
                              onChange={(e) => updateGuest(index, { full_name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <FieldLabel
                              icon={<IdCardIcon className="h-4 w-4" />}
                              text={t.voucherGuestPassport}
                              hint={lang === "ar" ? "اختياري." : lang === "tr" ? "Opsiyonel." : "Optional."}
                            />
                            <input
                              className="w-full min-w-0 rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              placeholder={t.voucherGuestPassport}
                              value={guest.passport_number || ""}
                              onChange={(e) =>
                                updateGuest(index, { passport_number: e.target.value })
                              }
                            />
                          </div>
                          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-zinc-700">
                            <input
                              type="checkbox"
                              checked={guest.is_leader}
                              onChange={(e) => updateGuest(index, { is_leader: e.target.checked })}
                            />
                            {t.voucherGuestLeader}
                          </label>
                          <button
                            type="button"
                            onClick={() => removeGuest(index)}
                            className="self-center rounded-md border border-zinc-200 px-2 py-2 text-xs text-red-600 inline-flex items-center justify-center"
                            aria-label={t.commonDelete}
                            title={t.commonDelete}
                          >
                            <TrashGlyph />
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
                              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                              placeholder={lang === "ar" ? "مثال: 7" : lang === "tr" ? "Ornek: 7" : "Example: 7"}
                              value={
                                guest.child_age === "" || guest.child_age == null
                                  ? ""
                                  : String(guest.child_age)
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  updateGuest(index, { child_age: "" });
                                  return;
                                }
                                const n = Math.floor(Number(raw));
                                if (!Number.isFinite(n)) {
                                  updateGuest(index, { child_age: "" });
                                  return;
                                }
                                updateGuest(index, {
                                  child_age: Math.max(0, Math.min(120, n)),
                                });
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    ))}
                    {!guestForm.length && (
                      <div className="rounded-md border border-sky-100 bg-white px-4 py-3 text-sm text-sky-900/70">
                        {ui.noPeople}
                      </div>
                    )}
                  </div>
                </div> : null}

                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-zinc-800">{ui.countsAndOptions}</div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.adults}</span>
                      <input
                        type="number"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Adult"
                        value={editForm.adult_count ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, adult_count: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.children}</span>
                      <input
                        type="number"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Child"
                        value={editForm.child_count ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, child_count: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.infants}</span>
                      <input
                        type="number"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Infant"
                        value={editForm.infant_count ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, infant_count: Number(e.target.value) }))
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3">
                    <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                        Extras & fees
                        {" - "}
                        {
                          extrasFieldOptions.filter((opt) =>
                            EXTRAS_FIELD_KEYS.has(opt.value)
                              ? Boolean(editForm[opt.value as keyof Reservation])
                              : Boolean(editForm.extras_prices?.[opt.value]?.enabled),
                          ).length
                        }
                      </summary>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {extrasFieldOptions.map((opt) => (
                          <div key={opt.value} className="rounded-md border border-zinc-200 bg-white p-2">
                            <label className="flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="checkbox"
                                checked={
                                  EXTRAS_FIELD_KEYS.has(opt.value)
                                    ? Boolean(editForm[opt.value as keyof Reservation])
                                    : Boolean(editForm.extras_prices?.[opt.value]?.enabled)
                                }
                                onChange={(e) =>
                                  setEditForm((prev) => {
                                    const isNative = EXTRAS_FIELD_KEYS.has(opt.value);
                                    return {
                                      ...prev,
                                      ...(isNative ? { [opt.value]: e.target.checked } : {}),
                                      extras_prices: {
                                        ...(prev.extras_prices || {}),
                                        [opt.value]: {
                                          buying_price:
                                            prev.extras_prices?.[opt.value]?.buying_price != null
                                              ? Number(prev.extras_prices[opt.value].buying_price)
                                              : 0,
                                          selling_price:
                                            prev.extras_prices?.[opt.value]?.selling_price != null
                                              ? Number(prev.extras_prices[opt.value].selling_price)
                                              : 0,
                                          enabled: e.target.checked,
                                        },
                                      },
                                    };
                                  })
                                }
                              />
                              {opt.label}
                            </label>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <label className="grid gap-1 text-xs text-zinc-600">
                                <span>{ui.extrasBuyPrice}</span>
                                <input
                                  type="number"
                                  className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                                  value={editForm.extras_prices?.[opt.value]?.buying_price ?? 0}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      extras_prices: {
                                        ...(prev.extras_prices || {}),
                                        [opt.value]: {
                                          buying_price: Number(e.target.value),
                                          selling_price:
                                            prev.extras_prices?.[opt.value]?.selling_price != null
                                              ? Number(prev.extras_prices[opt.value].selling_price)
                                              : 0,
                                          enabled:
                                            prev.extras_prices?.[opt.value]?.enabled != null
                                              ? Boolean(prev.extras_prices[opt.value].enabled)
                                              : (EXTRAS_FIELD_KEYS.has(opt.value)
                                                  ? Boolean(prev[opt.value as keyof Reservation])
                                                  : false),
                                        },
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-xs text-zinc-600">
                                <span>{ui.extrasSellPrice}</span>
                                <input
                                  type="number"
                                  className="rounded-md border border-zinc-200 px-2 py-1 text-sm"
                                  value={editForm.extras_prices?.[opt.value]?.selling_price ?? 0}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({
                                      ...prev,
                                      extras_prices: {
                                        ...(prev.extras_prices || {}),
                                        [opt.value]: {
                                          buying_price:
                                            prev.extras_prices?.[opt.value]?.buying_price != null
                                              ? Number(prev.extras_prices[opt.value].buying_price)
                                              : 0,
                                          selling_price: Number(e.target.value),
                                          enabled:
                                            prev.extras_prices?.[opt.value]?.enabled != null
                                              ? Boolean(prev.extras_prices[opt.value].enabled)
                                              : (EXTRAS_FIELD_KEYS.has(opt.value)
                                                  ? Boolean(prev[opt.value as keyof Reservation])
                                                  : false),
                                        },
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-zinc-800">{ui.pricesAndNotes}</div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.buyPrice}</span>
                      <input
                        type="number"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Buying price"
                        value={editForm.buying_price ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, buying_price: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.buyCurrency}</span>
                      <input
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Buying currency"
                        value={editForm.buying_currency || "EUR"}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, buying_currency: e.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.sellPrice}</span>
                      <input
                        type="number"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Selling price"
                        value={editForm.selling_price ?? 0}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, selling_price: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.sellCurrency}</span>
                      <input
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Selling currency"
                        value={editForm.selling_currency || "USD"}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, selling_currency: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.hotelNote}</span>
                      <textarea
                        className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Hotel note"
                        value={editForm.hotel_note || ""}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, hotel_note: e.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.reservationNotes}</span>
                      <textarea
                        className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Reservation notes"
                        value={editForm.reservation_notes || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, reservation_notes: e.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.internalNote}</span>
                      <textarea
                        className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Internal note"
                        value={editForm.internal_note || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, internal_note: e.target.value }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.operatorNote}</span>
                      <textarea
                        className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                        placeholder="Operator note"
                        value={editForm.operator_note || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, operator_note: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-emerald-900">{ui.transferPrices}</div>
                  <div className="grid gap-3">
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.transferBuy}</span>
                      <input
                        type="number"
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
                        placeholder={lang === "ar" ? "مثال: 100" : lang === "tr" ? "Ornek: 100" : "Example: 100"}
                        value={voucherTransferForm.transfer_buying_price ?? 0}
                        onChange={(e) =>
                          setVoucherTransferForm((prev) => ({
                            ...prev,
                            transfer_buying_price: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.transferSell}</span>
                      <input
                        type="number"
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
                        placeholder={lang === "ar" ? "مثال: 150" : lang === "tr" ? "Ornek: 150" : "Example: 150"}
                        value={voucherTransferForm.transfer_fee ?? 0}
                        onChange={(e) =>
                          setVoucherTransferForm((prev) => ({
                            ...prev,
                            transfer_fee: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm text-zinc-700">
                      <span className="text-xs font-medium text-zinc-600">{ui.transferCurrency}</span>
                      <input
                        className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm"
                        placeholder="USD"
                        value={voucherTransferForm.transfer_currency || "USD"}
                        onChange={(e) =>
                          setVoucherTransferForm((prev) => ({
                            ...prev,
                            transfer_currency: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <div className="mb-3 text-sm font-semibold text-amber-900">{ui.statusAndFollow}</div>
                  <div className="grid gap-3">
                    <input
                      className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                      placeholder="Index nr"
                      value={editForm.index_nr || ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, index_nr: e.target.value }))}
                    />
                    <TypeableSelect
                      className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                      value={editForm.reservation_status || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "Confirmed" && !(editForm.confirmation_number || "").trim()) {
                          alert(ui.confirmedNeedsMessage);
                          return;
                        }
                        setEditForm((prev) => ({ ...prev, reservation_status: val }));
                      }}
                    >
                      <option value="">{t.voucherReservationStatus}</option>
                      {reservationStatusSelectOptions.map((opt) => {
                        const needConf = opt.value === "Confirmed" && !(editForm.confirmation_number || "").trim();
                        return (
                          <option key={opt.value} value={opt.value} disabled={needConf}>
                            {opt.label}
                            {needConf ? ui.requiresConfirmation : ""}
                          </option>
                        );
                      })}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                      value={editForm.reservation_type || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, reservation_type: e.target.value }))
                      }
                    >
                      <option value="">Reservation type</option>
                      {reservationTypeSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                      value={editForm.hotel_confirmation || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, hotel_confirmation: e.target.value }))
                      }
                    >
                      <option value="">Hotel confirmation</option>
                      {confirmationSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                    <TypeableSelect
                      className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                      value={editForm.operator_confirmation || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, operator_confirmation: e.target.value }))
                      }
                    >
                      <option value="">Operator confirmation</option>
                      {confirmationSelectOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </TypeableSelect>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-zinc-800">{ui.extraData}</div>
                  <div className="grid gap-3">
                    <input
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Room nr"
                      value={editForm.room_nr || ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, room_nr: e.target.value }))}
                    />
                    <input
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="External voucher no"
                      value={editForm.external_voucher_no || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, external_voucher_no: e.target.value }))
                      }
                    />
                    <input
                      className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Allotment type"
                      value={editForm.allotment_type || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, allotment_type: e.target.value }))
                      }
                    />
                    <textarea
                      className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder="Transfer note"
                      value={editForm.transfer_note || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, transfer_note: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div className="sticky bottom-0 border-t border-zinc-100 bg-white px-6 py-4">
              <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                {t.commonCancel}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
              >
                {t.commonSave}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
