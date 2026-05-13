"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, API_BASE } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import ImportExportActions from "@/components/ImportExportActions";
import CollapseSection from "@/components/CollapseSection";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MailIcon, MapPinIcon, NotesIcon, PhoneIcon, SearchIcon, StatusIcon } from "@/components/FieldIcons";
import { HotelIcon } from "@/components/NavIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import { fetchHotelRoomKindOptions, resolveKindCapacity, type RoomKindOption } from "@/lib/hotelRoomKinds";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import { useModuleUiSettings } from "@/lib/useModuleUiSettings";

type Hotel = {
  id: number;
  name: string;
  address: string;
  location?: string;
  contact_info?: string;
  email_1?: string;
  email_2?: string;
  email_3?: string;
  phone_1?: string;
  phone_2?: string;
};

type Booking = {
  id: number;
  hotel: number;
  check_in: string;
  check_out: string;
  total_price: number;
  net_profit: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  booked_at: string;
};

type RoomDraft = {
  name: string;
  kinds: string[];
  capacities: Record<string, number>;
};

export default function HotelsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.hotels]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      statsLoadFailed:
        lang === "ar"
          ? "تعذر تحميل إحصائيات الحجوزات. تأكد من صلاحيات قسم الحجوزات."
          : lang === "tr"
            ? "Rezervasyon istatistikleri yuklenemedi. Rezervasyon izinlerini kontrol edin."
            : "Unable to load booking stats. Check bookings permissions.",
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      deleteHotelFailed:
        lang === "ar"
          ? "تعذر حذف الفندق. قد يكون مرتبطًا بحجوزات أو بيانات أخرى."
          : lang === "tr"
            ? "Otel silinemedi. Rezervasyonlara veya diger kayitlara bagli olabilir."
            : "Unable to delete hotel. It may be linked to bookings or other data.",
      search: lang === "ar" ? "بحث" : lang === "tr" ? "Ara" : "Search",
      searchHint:
        lang === "ar"
          ? "ابحث بالاسم/العنوان/الهاتف/الإيميل…"
          : lang === "tr"
            ? "Ad/adres/telefon/e-posta ile ara..."
            : "Search by name/address/phone/email...",
      searchPlaceholder: lang === "ar" ? "بحث بالفنادق..." : lang === "tr" ? "Otellerde ara..." : "Search hotels...",
      bookingFiltersTitle:
        lang === "ar" ? "فلاتر وإحصائيات حجوزات الفنادق" : lang === "tr" ? "Otel rezervasyon filtreleri ve istatistikleri" : "Hotel booking filters and stats",
      hotel: lang === "ar" ? "الفندق" : lang === "tr" ? "Otel" : "Hotel",
      hotelFilterHint:
        lang === "ar"
          ? "فلترة الإحصائيات حسب فندق محدد."
          : lang === "tr"
            ? "Istatistikleri belirli bir otele gore filtrele."
            : "Filter stats by a specific hotel.",
      reservationStatus: lang === "ar" ? "حالة الحجز" : lang === "tr" ? "Rezervasyon durumu" : "Booking status",
      fromDate: lang === "ar" ? "من تاريخ" : lang === "tr" ? "Baslangic tarihi" : "From date",
      toDate: lang === "ar" ? "إلى تاريخ" : lang === "tr" ? "Bitis tarihi" : "To date",
      thisMonth: lang === "ar" ? "هذا الشهر" : lang === "tr" ? "Bu ay" : "This month",
      clearFilters: lang === "ar" ? "مسح الفلاتر" : lang === "tr" ? "Filtreleri temizle" : "Clear filters",
      allHotels: lang === "ar" ? "كل الفنادق" : lang === "tr" ? "Tum oteller" : "All hotels",
      allStatuses: lang === "ar" ? "كل الحالات" : lang === "tr" ? "Tum durumlar" : "All statuses",
      bookingsCount: lang === "ar" ? "عدد الحجوزات" : lang === "tr" ? "Rezervasyon sayisi" : "Bookings count",
      bookingsValue: lang === "ar" ? "إجمالي قيمة الحجوزات" : lang === "tr" ? "Toplam rezervasyon tutari" : "Total booking value",
      netProfit: lang === "ar" ? "صافي الربح" : lang === "tr" ? "Net kar" : "Net profit",
      avgBookingValue: lang === "ar" ? "متوسط قيمة الحجز" : lang === "tr" ? "Ortalama rezervasyon tutari" : "Average booking value",
      valueCol: lang === "ar" ? "قيمة الحجوزات" : lang === "tr" ? "Rezervasyon tutari" : "Booking value",
      lastBooking: lang === "ar" ? "آخر حجز" : lang === "tr" ? "Son rezervasyon" : "Last booking",
      noFilteredData:
        lang === "ar" ? "لا يوجد بيانات ضمن الفلاتر الحالية." : lang === "tr" ? "Mevcut filtrelerde veri yok." : "No data for current filters.",
      address: lang === "ar" ? "العنوان" : lang === "tr" ? "Adres" : "Address",
      addressHint: lang === "ar" ? "عنوان الفندق (اختياري)." : lang === "tr" ? "Otel adresi (opsiyonel)." : "Hotel address (optional).",
      locationHint:
        lang === "ar" ? "مدينة/منطقة لتسهيل البحث." : lang === "tr" ? "Aramayi kolaylastirmak icin sehir/bolge." : "City/area for easier search.",
      contactHint:
        lang === "ar"
          ? "شخص التواصل/ملاحظات التواصل (اختياري)."
          : lang === "tr"
            ? "Iletisim kisisi/notlari (opsiyonel)."
            : "Contact person/notes (optional).",
      email1: lang === "ar" ? "إيميل 1" : lang === "tr" ? "E-posta 1" : "Email 1",
      email2: lang === "ar" ? "إيميل 2" : lang === "tr" ? "E-posta 2" : "Email 2",
      email3: lang === "ar" ? "إيميل 3" : lang === "tr" ? "E-posta 3" : "Email 3",
      phone1: lang === "ar" ? "رقم التلفون 1" : lang === "tr" ? "Telefon 1" : "Phone 1",
      phone2: lang === "ar" ? "رقم التلفون 2" : lang === "tr" ? "Telefon 2" : "Phone 2",
      roomNameExample: lang === "ar" ? "مثال: Standard Room" : lang === "tr" ? "Ornek: Standard Room" : "Example: Standard Room",
      roomCreateHint:
        lang === "ar"
          ? "سيتم إنشاء نوع لكل خيار تختاره بنفس اسم الغرفة."
          : lang === "tr"
            ? "Sectiginiz her secenek icin ayni oda adiyla bir tur olusturulur."
            : "A room type will be created for each selected option with the same room name.",
    }),
    [lang],
  );
  const moduleUi = useModuleUiSettings("hotels");
  const hotelsPageTitle = String(moduleUi.page_title || "").trim() || t.hotels;
  const showBookingFilters = Boolean(moduleUi.show_booking_filters ?? true);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState("");
  const [statsError, setStatsError] = useState("");
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd = `${now.getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  const [filters, setFilters] = useState({
    hotelId: "",
    status: "",
    fromDate: monthStart,
    toDate: monthEnd,
  });
  const [hotelForm, setHotelForm] = useState({
    name: "",
    address: "",
    location: "",
    contact_info: "",
    email_1: "",
    email_2: "",
    email_3: "",
    phone_1: "",
    phone_2: "",
  });
  const [roomsDraft, setRoomsDraft] = useState<RoomDraft[]>([
    { name: "", kinds: ["SNG"], capacities: {} },
  ]);
  const [creating, setCreating] = useState(false);
  const [deletingHotelId, setDeletingHotelId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [roomKindOptions, setRoomKindOptions] = useState<RoomKindOption[]>([]);

  const loadData = () => {
    Promise.allSettled([api.get<Hotel[]>("/hotels/"), api.get<Booking[]>("/bookings/")]).then(
      ([hotelsRes, bookingsRes]) => {
        if (hotelsRes.status === "fulfilled") setHotels(hotelsRes.value);
        if (bookingsRes.status === "fulfilled") {
          setBookings(bookingsRes.value);
          setStatsError("");
        } else {
          setBookings([]);
          setStatsError(ui.statsLoadFailed);
        }
      },
    );
  };

  useEffect(() => {
    loadData();
  }, []);

  useReloadOnNavigateOrTabVisible(() => {
    void fetchHotelRoomKindOptions().then(setRoomKindOptions);
  });

  const addHotel = async (event: FormEvent) => {
    event.preventDefault();
    const hotel = await api.post<Hotel>("/hotels/", { ...hotelForm });

    const roomsToCreate = roomsDraft
      .flatMap((r) => {
        const name = r.name.trim();
        const kinds = r.kinds?.length ? r.kinds : ["SNG"];
        return kinds.map((k) => ({
          name,
          room_kind: k,
          capacity: resolveKindCapacity(k, roomKindOptions, r.capacities),
        }));
      })
      .filter((r) => r.name.length > 0);

    if (roomsToCreate.length) {
      await Promise.all(
        roomsToCreate.map((r) =>
          api.post("/room-types/", {
            hotel: hotel.id,
            name: r.name,
            room_kind: r.room_kind,
            capacity: r.capacity,
          }),
        ),
      );
    }

    setHotels((prev) => [hotel, ...prev]);
    setHotelForm({
      name: "",
      address: "",
      location: "",
      contact_info: "",
      email_1: "",
      email_2: "",
      email_3: "",
      phone_1: "",
      phone_2: "",
    });
    setRoomsDraft([{ name: "", kinds: ["SNG"], capacities: {} }]);
    setCreating(false);
  };

  const addRoomDraft = () => {
    setRoomsDraft((prev) => [...prev, { name: "", kinds: ["SNG"], capacities: {} }]);
  };

  const removeRoomDraft = (index: number) => {
    setRoomsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRoomDraft = (index: number, next: Partial<RoomDraft>) => {
    setRoomsDraft((prev) => prev.map((room, i) => (i === index ? { ...room, ...next } : room)));
  };

  const deleteHotel = async (hotelId: number) => {
    try {
      setDeleteError("");
      setDeletingHotelId(hotelId);
      await api.delete(`/hotels/${hotelId}/`, { confirmMessage: ui.deleteConfirm });
      setHotels((prev) => prev.filter((h) => h.id !== hotelId));
      setBookings((prev) => prev.filter((b) => b.hotel !== hotelId));
    } catch (error) {
      if (error instanceof Error && error.message === "DELETE_CANCELLED_BY_USER") return;
      const message = error instanceof Error ? error.message : "";
      setDeleteError(message || ui.deleteHotelFailed);
    } finally {
      setDeletingHotelId(null);
    }
  };

  const filteredHotels = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return hotels;
    return hotels.filter((h) => {
      const blob = [
        h.name,
        h.address,
        h.location,
        h.contact_info,
        h.email_1,
        h.email_2,
        h.email_3,
        h.phone_1,
        h.phone_2,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [hotels, search]);

  const filteredBookings = useMemo(() => {
    const from = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00`) : null;
    const to = filters.toDate ? new Date(`${filters.toDate}T23:59:59`) : null;
    return bookings.filter((b) => {
      if (filters.hotelId && String(b.hotel) !== filters.hotelId) return false;
      if (filters.status && b.status !== filters.status) return false;
      const bookedAt = b.booked_at ? new Date(b.booked_at) : null;
      if (from && bookedAt && bookedAt < from) return false;
      if (to && bookedAt && bookedAt > to) return false;
      return true;
    });
  }, [bookings, filters]);

  const summary = useMemo(() => {
    const totalBookings = filteredBookings.length;
    const confirmed = filteredBookings.filter((b) => b.status === "confirmed").length;
    const completed = filteredBookings.filter((b) => b.status === "completed").length;
    const cancelled = filteredBookings.filter((b) => b.status === "cancelled").length;
    const revenue = filteredBookings.reduce((acc, b) => acc + Number(b.total_price || 0), 0);
    const profit = filteredBookings.reduce((acc, b) => acc + Number(b.net_profit || 0), 0);
    return {
      totalBookings,
      confirmed,
      completed,
      cancelled,
      revenue,
      profit,
      avg: totalBookings ? revenue / totalBookings : 0,
    };
  }, [filteredBookings]);

  const perHotelStats = useMemo(() => {
    const map = new Map<
      number,
      { bookings: number; revenue: number; profit: number; confirmed: number; completed: number; last: string }
    >();
    for (const b of filteredBookings) {
      const current = map.get(b.hotel) || {
        bookings: 0,
        revenue: 0,
        profit: 0,
        confirmed: 0,
        completed: 0,
        last: "",
      };
      current.bookings += 1;
      current.revenue += Number(b.total_price || 0);
      current.profit += Number(b.net_profit || 0);
      if (b.status === "confirmed") current.confirmed += 1;
      if (b.status === "completed") current.completed += 1;
      if (!current.last || new Date(b.booked_at) > new Date(current.last)) current.last = b.booked_at;
      map.set(b.hotel, current);
    }
    return filteredHotels
      .map((h) => ({
        hotel: h,
        ...(
          map.get(h.id) || {
            bookings: 0,
            revenue: 0,
            profit: 0,
            confirmed: 0,
            completed: 0,
            last: "",
          }
        ),
      }))
      .sort((a, b) => b.bookings - a.bookings);
  }, [filteredBookings, filteredHotels]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{hotelsPageTitle}</h1>
          <p className="text-sm text-zinc-500">{t.hotelsSubtitle}</p>
        </div>
        <ImportExportActions
          exportUrl={`${API_BASE}/hotels/export/`}
          importUrl={`${API_BASE}/hotels/import_xlsx/`}
          onImported={loadData}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-md">
          <div className="mb-2">
            <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.search} hint={ui.searchHint} />
          </div>
          <input
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
            placeholder={ui.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          {t.commonAdd}
        </button>
      </div>
      {deleteError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {showBookingFilters ? <CollapseSection title={ui.bookingFiltersTitle} defaultOpen>
        <div className="space-y-4 rounded-lg border border-zinc-100 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-1 text-sm">
              <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={ui.hotel} hint={ui.hotelFilterHint} />
              <TypeableSelect
                value={filters.hotelId}
                onChange={(e) => setFilters((prev) => ({ ...prev, hotelId: e.target.value }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">{ui.allHotels}</option>
                {hotels.map((h) => (
                  <option key={h.id} value={String(h.id)}>
                    {h.name}
                  </option>
                ))}
              </TypeableSelect>
            </label>
            <label className="grid gap-1 text-sm">
              <FieldLabel icon={<StatusIcon className="h-4 w-4" />} text={ui.reservationStatus} hint="Pending/Confirmed/Completed/Cancelled." />
              <TypeableSelect
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">{ui.allStatuses}</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </TypeableSelect>
            </label>
            <label className="grid gap-1 text-sm">
              <FieldLabel
                icon={<CalendarIcon className="h-4 w-4" />}
                text={ui.fromDate}
                hint={lang === "ar" ? "بداية نطاق تاريخ الحجز." : lang === "tr" ? "Rezervasyon tarih araligi baslangici." : "Start of booking date range."}
              />
              <PopupYmdDatePicker
                value={filters.fromDate}
                onChange={(nextIso) => setFilters((prev) => ({ ...prev, fromDate: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="hotels_filters_from_date"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <FieldLabel
                icon={<CalendarIcon className="h-4 w-4" />}
                text={ui.toDate}
                hint={lang === "ar" ? "نهاية نطاق تاريخ الحجز." : lang === "tr" ? "Rezervasyon tarih araligi bitisi." : "End of booking date range."}
              />
              <PopupYmdDatePicker
                value={filters.toDate}
                onChange={(nextIso) => setFilters((prev) => ({ ...prev, toDate: nextIso }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="hotels_filters_to_date"
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, fromDate: monthStart, toDate: monthEnd }))}
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
              >
                {ui.thisMonth}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    hotelId: "",
                    status: "",
                    fromDate: "",
                    toDate: "",
                  }))
                }
                className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
              >
                {ui.clearFilters}
              </button>
            </div>
          </div>

          {statsError && <div className="text-xs text-red-600">{statsError}</div>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-xs text-zinc-600">{ui.bookingsCount}</div>
              <div className="text-2xl font-semibold">{summary.totalBookings}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-xs text-zinc-600">{ui.bookingsValue}</div>
              <div className="text-2xl font-semibold">{summary.revenue.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-xs text-zinc-600">{ui.netProfit}</div>
              <div className="text-2xl font-semibold">{summary.profit.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-white p-3">
              <div className="text-xs text-zinc-600">Confirmed</div>
              <div className="text-xl font-semibold">{summary.confirmed}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-white p-3">
              <div className="text-xs text-zinc-600">Completed</div>
              <div className="text-xl font-semibold">{summary.completed}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-white p-3">
              <div className="text-xs text-zinc-600">{ui.avgBookingValue}</div>
              <div className="text-xl font-semibold">{summary.avg.toFixed(2)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 text-start">{ui.hotel}</th>
                  <th className="px-3 py-2 text-start">{ui.bookingsCount}</th>
                  <th className="px-3 py-2 text-start">Confirmed</th>
                  <th className="px-3 py-2 text-start">Completed</th>
                  <th className="px-3 py-2 text-start">{ui.valueCol}</th>
                  <th className="px-3 py-2 text-start">{ui.netProfit}</th>
                  <th className="px-3 py-2 text-start">{ui.lastBooking}</th>
                </tr>
              </thead>
              <tbody>
                {perHotelStats.map((row) => (
                  <tr key={row.hotel.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-medium">{row.hotel.name}</td>
                    <td className="px-3 py-2">{row.bookings}</td>
                    <td className="px-3 py-2">{row.confirmed}</td>
                    <td className="px-3 py-2">{row.completed}</td>
                    <td className="px-3 py-2">{row.revenue.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.profit.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {row.last ? new Date(row.last).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))}
                {!perHotelStats.length && (
                  <tr>
                    <td className="px-3 py-4 text-center text-zinc-500" colSpan={7}>
                      {ui.noFilteredData}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CollapseSection> : null}

      {creating && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotel-add-title"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
              <h2 id="hotel-add-title" className="text-base font-semibold">
                {t.hotelsAddHotelModal}
              </h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {t.commonClose}
              </button>
            </div>
            <form onSubmit={addHotel} className="space-y-4 p-5">
              <p className="text-xs text-zinc-500">{t.hotelsKindsHint}</p>

              <CollapseSection title={t.hotelsSectionMainData} defaultOpen>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-sm text-zinc-700">
                    <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={t.hotelsName} hint={lang === "ar" ? "اسم الفندق كما يظهر في النظام." : lang === "tr" ? "Sistemde gorunen otel adi." : "Hotel name as shown in the system."} />
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      value={hotelForm.name}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-zinc-700">
                    <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={ui.address} hint={ui.addressHint} />
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      value={hotelForm.address}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, address: e.target.value }))}
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-zinc-700 md:col-span-2">
                    <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={t.hotelsLocation} hint={ui.locationHint} />
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      value={hotelForm.location}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, location: e.target.value }))}
                    />
                  </label>
                </div>
              </CollapseSection>

              <CollapseSection title={t.hotelsSectionComm}>
                <label className="mb-3 grid gap-1 text-sm text-zinc-700">
                  <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.hotelsContact} hint={ui.contactHint} />
                  <input
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={hotelForm.contact_info}
                    onChange={(e) => setHotelForm((prev) => ({ ...prev, contact_info: e.target.value }))}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email1} />
                    <input
                      type="email"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.email1}
                      value={hotelForm.email_1}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, email_1: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email2} />
                    <input
                      type="email"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.email2}
                      value={hotelForm.email_2}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, email_2: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email3} />
                    <input
                      type="email"
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.email3}
                      value={hotelForm.email_3}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, email_3: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={ui.phone1} />
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.phone1}
                      value={hotelForm.phone_1}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, phone_1: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={ui.phone2} />
                    <input
                      className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                      placeholder={ui.phone2}
                      value={hotelForm.phone_2}
                      onChange={(e) => setHotelForm((prev) => ({ ...prev, phone_2: e.target.value }))}
                    />
                  </div>
                </div>
              </CollapseSection>

              <CollapseSection title={t.hotelsRoomTypes} defaultOpen>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={addRoomDraft}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
                  >
                    {t.commonAdd}
                  </button>
                </div>
                <div className="space-y-3">
                  {roomsDraft.map((room, index) => (
                    <div
                      key={`draft-room-${index}`}
                      className="grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:grid-cols-[1.2fr_2fr_auto]"
                    >
                      <label className="grid gap-1 text-sm text-zinc-700">
                        <span className="text-xs font-medium text-zinc-600">{t.hotelsRoomName}</span>
                        <input
                          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={room.name}
                          onChange={(e) => updateRoomDraft(index, { name: e.target.value })}
                          placeholder={ui.roomNameExample}
                        />
                      </label>
                      <div className="grid gap-1 text-sm text-zinc-700">
                        <span className="text-xs font-medium text-zinc-600">{t.hotelsRoomKindsMulti}</span>
                        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                          <div className="flex flex-wrap gap-3">
                            {roomKindOptions.map((opt) => {
                              const checked = (room.kinds || []).includes(opt.value);
                              return (
                                <label key={opt.value} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const nextKinds = new Set(room.kinds || []);
                                      if (e.target.checked) {
                                        nextKinds.add(opt.value);
                                        updateRoomDraft(index, {
                                          kinds: Array.from(nextKinds),
                                          capacities: {
                                            ...room.capacities,
                                            [opt.value]: room.capacities[opt.value] ?? opt.capacity,
                                          },
                                        });
                                      } else {
                                        nextKinds.delete(opt.value);
                                        const nextCap = { ...room.capacities };
                                        delete nextCap[opt.value];
                                        updateRoomDraft(index, {
                                          kinds: Array.from(nextKinds),
                                          capacities: nextCap,
                                        });
                                      }
                                    }}
                                  />
                                  <span>
                                    {opt.label}{" "}
                                    <span className="text-xs text-zinc-500">({opt.capacity})</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          {(room.kinds || []).length > 0 && (
                            <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                              <div className="text-xs font-medium text-zinc-600">
                                {t.hotelsMaxGuestsPerKind}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(room.kinds || []).map((k) => {
                                  const opt = roomKindOptions.find((o) => o.value === k);
                                  return (
                                    <label
                                      key={k}
                                      className="flex items-center justify-between gap-2 text-sm"
                                    >
                                      <span className="text-zinc-700">{opt?.label ?? k}</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={99}
                                        className="w-20 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                                        value={room.capacities[k] ?? opt?.capacity ?? 1}
                                        onChange={(e) => {
                                          const v = Number(e.target.value);
                                          updateRoomDraft(index, {
                                            capacities: {
                                              ...room.capacities,
                                              [k]: Number.isFinite(v)
                                                ? Math.max(1, Math.min(99, Math.floor(v)))
                                                : opt?.capacity ?? 1,
                                            },
                                          });
                                        }}
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="mt-2 text-xs text-zinc-500">
                            {ui.roomCreateHint}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRoomDraft(index)}
                        disabled={roomsDraft.length === 1}
                        className="h-10 self-end inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs text-red-600 disabled:opacity-50"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph />
                      </button>
                    </div>
                  ))}
                </div>
              </CollapseSection>

              <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-md border border-zinc-200 px-4 py-2 text-sm"
                >
                  {t.commonCancel}
                </button>
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                  {t.commonSave}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CollapseSection title={t.hotelsList} defaultOpen>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredHotels.map((hotel) => (
            <div
              key={hotel.id}
              className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">{hotel.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-zinc-600">
                    {[hotel.location, hotel.address].filter(Boolean).join(" • ") || "-"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/hotels/${hotel.id}`}
                    className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50 inline-flex items-center justify-center"
                    aria-label={t.hotelsEditInModal}
                    title={t.bookingEdit}
                  >
                    <PencilGlyph />
                  </Link>
                  <button
                    type="button"
                    onClick={() => deleteHotel(hotel.id)}
                    disabled={deletingHotelId === hotel.id}
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center min-w-[2rem]"
                    aria-label={t.commonDelete}
                    title={t.commonDelete}
                  >
                    {deletingHotelId === hotel.id ? "..." : <TrashGlyph />}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-700">
                {(hotel.phone_1 || hotel.phone_2) && (
                  <span className="rounded-full bg-zinc-100 px-2 py-1">
                    {(hotel.phone_1 || hotel.phone_2) as string}
                  </span>
                )}
                {(hotel.email_1 || hotel.email_2) && (
                  <span className="rounded-full bg-zinc-100 px-2 py-1">
                    {(hotel.email_1 || hotel.email_2) as string}
                  </span>
                )}
              </div>
            </div>
          ))}
          {!filteredHotels.length && (
            <div className="col-span-full py-6 text-center text-sm text-zinc-500">{t.commonNoData}</div>
          )}
        </div>
      </CollapseSection>
    </div>
  );
}
