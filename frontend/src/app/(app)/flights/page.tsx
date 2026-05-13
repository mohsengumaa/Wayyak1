"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getApiBase } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import ImportExportActions from "@/components/ImportExportActions";
import PageHeader from "@/components/PageHeader";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import {
  ClockIcon,
  IdCardIcon,
  MapPinIcon,
  MoneyIcon,
  NotesIcon,
  PlaneIcon,
  SearchIcon,
  StatusIcon,
  TagIcon,
  TicketIcon,
  UserIcon,
} from "@/components/FieldIcons";
import { useModuleUiSettings } from "@/lib/useModuleUiSettings";

type Client = { id: number; name: string };
type FlightTicket = {
  id: number;
  client: number;
  client_name?: string;
  passenger_name: string;
  passport_number: string;
  airline: string;
  ticket_number: string;
  pnr: string;
  trip_type: string;
  departure_airport: string;
  arrival_airport: string;
  departure_datetime: string;
  return_datetime?: string | null;
  buying_price: number;
  buying_currency: string;
  selling_price: number;
  selling_currency: string;
  currency: string;
  service_fee: number;
  service_fee_currency: string;
  total_price: number;
  net_profit: number;
  status: string;
  notes: string;
};

const initialForm = {
  client: "",
  passenger_name: "",
  passport_number: "",
  airline: "",
  ticket_number: "",
  pnr: "",
  trip_type: "one_way",
  departure_airport: "",
  arrival_airport: "",
  departure_datetime: "",
  return_datetime: "",
  buying_price: 0,
  buying_currency: "USD",
  selling_price: 0,
  selling_currency: "USD",
  currency: "USD",
  service_fee: 0,
  service_fee_currency: "USD",
  status: "draft",
  notes: "",
};

const currencyOptions = ["USD", "EUR", "TRY", "GBP"] as const;

function toInputDateTime(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

export default function FlightsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.flights]);
  const { t, lang } = useI18n();
  const moduleUi = useModuleUiSettings("flights");
  const flightsPageTitle = String(moduleUi.page_title || "").trim() || t.flights;
  const defaultStatus = String(moduleUi.default_status || "draft");
  const initialFlightForm = useMemo(() => ({ ...initialForm, status: defaultStatus || "draft" }), [defaultStatus]);
  const ui = useMemo(
    () => ({
      statusLabels: {
        draft: lang === "ar" ? "مسودة" : lang === "tr" ? "Taslak" : "Draft",
        reserved: lang === "ar" ? "محجوزة" : lang === "tr" ? "Rezerve" : "Reserved",
        issued: lang === "ar" ? "مصدرة" : lang === "tr" ? "Duzenlendi" : "Issued",
        cancelled: lang === "ar" ? "ملغاة" : lang === "tr" ? "Iptal" : "Cancelled",
        refunded: lang === "ar" ? "مستردة" : lang === "tr" ? "Iade" : "Refunded",
      } as Record<string, string>,
      tripTypeLabels: {
        one_way: lang === "ar" ? "ذهاب فقط" : lang === "tr" ? "Tek yon" : "One way",
        round_trip: lang === "ar" ? "ذهاب وعودة" : lang === "tr" ? "Gidis-donus" : "Round trip",
        multi_city: lang === "ar" ? "وجهات متعددة" : lang === "tr" ? "Coklu varis" : "Multi-city",
      } as Record<string, string>,
      loadFailed: lang === "ar" ? "تعذر تحميل حجوزات الطيران." : lang === "tr" ? "Ucus rezervasyonlari yuklenemedi." : "Unable to load flight bookings.",
      updated: lang === "ar" ? "تم تعديل حجز الطيران." : lang === "tr" ? "Ucus rezervasyonu guncellendi." : "Flight booking updated.",
      created: lang === "ar" ? "تمت إضافة حجز الطيران." : lang === "tr" ? "Ucus rezervasyonu eklendi." : "Flight booking added.",
      saveFailed: lang === "ar" ? "تعذر حفظ حجز الطيران." : lang === "tr" ? "Ucus rezervasyonu kaydedilemedi." : "Unable to save flight booking.",
      deleteConfirmPrefix:
        lang === "ar" ? "هل تريد تأكيد حذف تذكرة الطيران للراكب" : lang === "tr" ? "Yolcu icin ucus biletini silmeyi onayliyor musunuz" : "Confirm deleting flight ticket for passenger",
      deleted: lang === "ar" ? "تم حذف تذكرة الطيران." : lang === "tr" ? "Ucus bileti silindi." : "Flight ticket deleted.",
      deleteFailed: lang === "ar" ? "تعذر حذف تذكرة الطيران." : lang === "tr" ? "Ucus bileti silinemedi." : "Unable to delete flight ticket.",
      pdfFailed: lang === "ar" ? "تعذر استخراج PDF للتذكرة." : lang === "tr" ? "Bilet PDF'i alinamadi." : "Unable to export ticket PDF.",
      editTicket: lang === "ar" ? "تعديل تذكرة طيران" : lang === "tr" ? "Ucus biletini duzenle" : "Edit flight ticket",
      addTicket: lang === "ar" ? "إضافة تذكرة طيران" : lang === "tr" ? "Ucus bileti ekle" : "Add flight ticket",
      cancelEdit: lang === "ar" ? "إلغاء التعديل" : lang === "tr" ? "Duzenlemeyi iptal et" : "Cancel edit",
      client: lang === "ar" ? "العميل" : lang === "tr" ? "Musteri" : "Client",
      clientHint: lang === "ar" ? "العميل الذي يتم إصدار التذكرة باسمه." : lang === "tr" ? "Biletin duzenlendigi musteri." : "Client this ticket is issued for.",
      chooseClient: lang === "ar" ? "اختر العميل" : lang === "tr" ? "Musteri secin" : "Select client",
      passengerName: lang === "ar" ? "اسم الراكب" : lang === "tr" ? "Yolcu adi" : "Passenger name",
      passengerHint: lang === "ar" ? "الاسم كما هو مكتوب في الجواز." : lang === "tr" ? "Pasaporttaki adla ayni." : "Name exactly as in passport.",
      passportNumber: lang === "ar" ? "رقم الجواز" : lang === "tr" ? "Pasaport no" : "Passport number",
      passportHint: lang === "ar" ? "اختياري، لتوثيق بيانات الراكب." : lang === "tr" ? "Opsiyonel, yolcu kaydi icin." : "Optional, for passenger record.",
      airline: lang === "ar" ? "شركة الطيران" : lang === "tr" ? "Havayolu" : "Airline",
      ticketNumber: lang === "ar" ? "رقم التذكرة" : lang === "tr" ? "Bilet no" : "Ticket number",
      ticketHint: lang === "ar" ? "رقم التذكرة/الوثيقة من شركة الطيران." : lang === "tr" ? "Havayolundan bilet/belge numarasi." : "Ticket/document number from airline.",
      pnrHint: lang === "ar" ? "رقم الحجز لدى شركة الطيران." : lang === "tr" ? "Havayolu rezervasyon numarasi." : "Booking number at airline.",
      tripType: lang === "ar" ? "نوع الرحلة" : lang === "tr" ? "Seyahat tipi" : "Trip type",
      tripTypeHint: lang === "ar" ? "ذهاب فقط / ذهاب وعودة / وجهات متعددة." : lang === "tr" ? "Tek yon / gidis-donus / coklu varis." : "One way / round trip / multi-city.",
      fromAirport: lang === "ar" ? "من مطار" : lang === "tr" ? "Nereden (havaalani)" : "From airport",
      toAirport: lang === "ar" ? "إلى مطار" : lang === "tr" ? "Nereye (havaalani)" : "To airport",
      depDateTime: lang === "ar" ? "تاريخ ووقت المغادرة" : lang === "tr" ? "Kalkis tarih-saat" : "Departure date and time",
      depDateHint: lang === "ar" ? "وقت الإقلاع (حسب التذكرة)." : lang === "tr" ? "Kalkis saati (bilete gore)." : "Takeoff time (from ticket).",
      retDateTime: lang === "ar" ? "تاريخ ووقت العودة" : lang === "tr" ? "Donus tarih-saat" : "Return date and time",
      retDateHint: lang === "ar" ? "اختياري للرحلات ذهاب وعودة." : lang === "tr" ? "Gidis-donus icin opsiyonel." : "Optional for round trips.",
      pricing: lang === "ar" ? "الأسعار والعملات" : lang === "tr" ? "Fiyatlar ve para birimleri" : "Prices and currencies",
      buyingPrice: lang === "ar" ? "سعر الشراء" : lang === "tr" ? "Alis fiyati" : "Buying price",
      buyingHint: lang === "ar" ? "تكلفة شراء التذكرة." : lang === "tr" ? "Biletin alis maliyeti." : "Ticket purchase cost.",
      sellingPrice: lang === "ar" ? "سعر البيع" : lang === "tr" ? "Satis fiyati" : "Selling price",
      sellingHint: lang === "ar" ? "السعر الذي سيتم بيعه للعميل." : lang === "tr" ? "Musteriye satilacak fiyat." : "Price sold to client.",
      serviceFee: lang === "ar" ? "رسوم الخدمة" : lang === "tr" ? "Hizmet ucreti" : "Service fee",
      serviceFeeHint: lang === "ar" ? "عمولة/خدمة إضافية (اختياري)." : lang === "tr" ? "Komisyon/ek hizmet (opsiyonel)." : "Commission/additional service (optional).",
      fxHint:
        lang === "ar"
          ? "الإجمالي والربح يُحسبان محاسبياً على عملة البيع الحالية. عند اختلاف العملات استخدم سعر الصرف/المحاسبة للمراجعة النهائية."
          : lang === "tr"
            ? "Toplam ve kar mevcut satis para birimine gore hesaplanir. Para birimleri farkliysa son kontrol icin kur/muhasebe kullanin."
            : "Total and profit are calculated in the current selling currency. When currencies differ, use exchange rate/accounting for final review.",
      ticketStatus: lang === "ar" ? "حالة التذكرة" : lang === "tr" ? "Bilet durumu" : "Ticket status",
      ticketStatusHint: lang === "ar" ? "مسودة/محجوزة/مصدرة/ملغاة/مستردة." : lang === "tr" ? "Taslak/Rezerve/Duzenlendi/Iptal/Iade." : "Draft/Reserved/Issued/Cancelled/Refunded.",
      notes: lang === "ar" ? "ملاحظات" : lang === "tr" ? "Notlar" : "Notes",
      notesHint: lang === "ar" ? "أي تفاصيل إضافية عن التذكرة (اختياري)." : lang === "tr" ? "Biletle ilgili ek detaylar (opsiyonel)." : "Any extra ticket details (optional).",
      saveEdit: lang === "ar" ? "حفظ التعديل" : lang === "tr" ? "Degisiklikleri kaydet" : "Save changes",
      ticketsCount: lang === "ar" ? "عدد التذاكر" : lang === "tr" ? "Bilet sayisi" : "Tickets count",
      totalSales: lang === "ar" ? "إجمالي البيع" : lang === "tr" ? "Toplam satis" : "Total sales",
      netProfit: lang === "ar" ? "صافي الربح" : lang === "tr" ? "Net kar" : "Net profit",
      ticketsLog: lang === "ar" ? "سجل تذاكر الطيران" : lang === "tr" ? "Ucus bilet kayitlari" : "Flight tickets log",
      search: lang === "ar" ? "بحث" : lang === "tr" ? "Ara" : "Search",
      searchHint:
        lang === "ar"
          ? "بحث بالراكب / PNR / شركة الطيران..."
          : lang === "tr"
            ? "Yolcu / PNR / havayolu ile ara..."
            : "Search by passenger / PNR / airline...",
      departure: lang === "ar" ? "المغادرة" : lang === "tr" ? "Kalkis" : "Departure",
      ticket: lang === "ar" ? "التذكرة" : lang === "tr" ? "Bilet" : "Ticket",
      buying: lang === "ar" ? "الشراء" : lang === "tr" ? "Alis" : "Buying",
      selling: lang === "ar" ? "البيع" : lang === "tr" ? "Satis" : "Selling",
      total: lang === "ar" ? "الإجمالي" : lang === "tr" ? "Toplam" : "Total",
      profit: lang === "ar" ? "الربح" : lang === "tr" ? "Kar" : "Profit",
    }),
    [lang],
  );
  const { currency: appCurrency } = useCurrency();
  const [clients, setClients] = useState<Client[]>([]);
  const [tickets, setTickets] = useState<FlightTicket[]>([]);
  const [form, setForm] = useState(initialFlightForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadData = () => {
    Promise.all([api.get<Client[]>("/clients/"), api.get<FlightTicket[]>("/flight-tickets/")])
      .then(([clientRows, ticketRows]) => {
        setClients(clientRows);
        setTickets(ticketRows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : ui.loadFailed));
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tickets;
    return tickets.filter((ticket) => {
      const blob = [
        ticket.client_name,
        ticket.passenger_name,
        ticket.passport_number,
        ticket.airline,
        ticket.ticket_number,
        ticket.pnr,
        ticket.departure_airport,
        ticket.arrival_airport,
        ticket.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [tickets, search]);

  const totals = useMemo(
    () =>
      filteredTickets.reduce(
        (acc, ticket) => {
          acc.sales += Number(ticket.total_price || 0);
          acc.profit += Number(ticket.net_profit || 0);
          return acc;
        },
        { sales: 0, profit: 0 },
      ),
    [filteredTickets],
  );

  const resetForm = () => {
    setForm(initialFlightForm);
    setEditingId(null);
  };

  const saveTicket = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    const payload = {
      ...form,
      client: Number(form.client),
      return_datetime: form.return_datetime || null,
      buying_price: Number(form.buying_price || 0),
      selling_price: Number(form.selling_price || 0),
      service_fee: Number(form.service_fee || 0),
      currency: form.selling_currency,
    };
    try {
      const saved = editingId
        ? await api.patch<FlightTicket>(`/flight-tickets/${editingId}/`, payload)
        : await api.post<FlightTicket>("/flight-tickets/", payload);
      setTickets((prev) =>
        editingId ? prev.map((row) => (row.id === saved.id ? saved : row)) : [saved, ...prev],
      );
      setStatus(editingId ? ui.updated : ui.created);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.saveFailed);
    }
  };

  const editTicket = (ticket: FlightTicket) => {
    setEditingId(ticket.id);
    setForm({
      client: String(ticket.client),
      passenger_name: ticket.passenger_name || "",
      passport_number: ticket.passport_number || "",
      airline: ticket.airline || "",
      ticket_number: ticket.ticket_number || "",
      pnr: ticket.pnr || "",
      trip_type: ticket.trip_type || "one_way",
      departure_airport: ticket.departure_airport || "",
      arrival_airport: ticket.arrival_airport || "",
      departure_datetime: toInputDateTime(ticket.departure_datetime),
      return_datetime: toInputDateTime(ticket.return_datetime),
      buying_price: Number(ticket.buying_price || 0),
      buying_currency: ticket.buying_currency || ticket.currency || "USD",
      selling_price: Number(ticket.selling_price || 0),
      selling_currency: ticket.selling_currency || ticket.currency || "USD",
      currency: ticket.currency || ticket.selling_currency || "USD",
      service_fee: Number(ticket.service_fee || 0),
      service_fee_currency: ticket.service_fee_currency || ticket.currency || "USD",
      status: ticket.status || "draft",
      notes: ticket.notes || "",
    });
  };

  const deleteTicket = async (ticket: FlightTicket) => {
    setError("");
    try {
      await api.delete(`/flight-tickets/${ticket.id}/`, {
        confirmMessage: `${ui.deleteConfirmPrefix} ${ticket.passenger_name}?`,
      });
      setTickets((prev) => prev.filter((row) => row.id !== ticket.id));
      setStatus(ui.deleted);
      if (editingId === ticket.id) resetForm();
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteFailed);
    }
  };

  const downloadTicketPdf = async (ticket: FlightTicket) => {
    setError("");
    try {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/flight-tickets/${ticket.id}/pdf/`, {
        headers: token ? { Authorization: `Token ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(ui.pdfFailed);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flight-ticket-${ticket.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.pdfFailed);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={flightsPageTitle} subtitle={t.flightsSubtitle}>
        <ImportExportActions
          exportUrl={`${getApiBase()}/flight-tickets/export/`}
          importUrl={`${getApiBase()}/flight-tickets/import_xlsx/`}
          onImported={loadData}
        />
      </PageHeader>

      {status && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <form onSubmit={saveTicket} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{editingId ? ui.editTicket : ui.addTicket}</h2>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs">
                {ui.cancelEdit}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={ui.client} hint={ui.clientHint} />
            <TypeableSelect
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              value={form.client}
              onChange={(e) => setForm((prev) => ({ ...prev, client: e.target.value }))}
              required
            >
              <option value="">{ui.chooseClient}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </TypeableSelect>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={ui.passengerName} hint={ui.passengerHint} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={ui.passengerName}
                value={form.passenger_name}
                onChange={(e) => setForm((prev) => ({ ...prev, passenger_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={ui.passportNumber} hint={ui.passportHint} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={ui.passportNumber}
                value={form.passport_number}
                onChange={(e) => setForm((prev) => ({ ...prev, passport_number: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<PlaneIcon className="h-4 w-4" />} text={ui.airline} hint="Example: Turkish Airlines." />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={ui.airline}
                value={form.airline}
                onChange={(e) => setForm((prev) => ({ ...prev, airline: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TicketIcon className="h-4 w-4" />} text={ui.ticketNumber} hint={ui.ticketHint} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder={ui.ticketNumber}
                value={form.ticket_number}
                onChange={(e) => setForm((prev) => ({ ...prev, ticket_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text="PNR" hint={ui.pnrHint} />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                placeholder="PNR"
                value={form.pnr}
                onChange={(e) => setForm((prev) => ({ ...prev, pnr: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.tripType} hint={ui.tripTypeHint} />
              <TypeableSelect
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                value={form.trip_type}
                onChange={(e) => setForm((prev) => ({ ...prev, trip_type: e.target.value }))}
              >
                <option value="one_way">{ui.tripTypeLabels.one_way}</option>
                <option value="round_trip">{ui.tripTypeLabels.round_trip}</option>
                <option value="multi_city">{ui.tripTypeLabels.multi_city}</option>
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={ui.fromAirport} hint="Use airport code, e.g. IST." />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm uppercase"
                placeholder={`${ui.fromAirport} (IST)`}
                value={form.departure_airport}
                onChange={(e) => setForm((prev) => ({ ...prev, departure_airport: e.target.value.toUpperCase() }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={ui.toAirport} hint="Use airport code, e.g. DXB." />
              <input
                className="w-full rounded-md mb-input-raised px-3 py-2 text-sm uppercase"
                placeholder={`${ui.toAirport} (DXB)`}
                value={form.arrival_airport}
                onChange={(e) => setForm((prev) => ({ ...prev, arrival_airport: e.target.value.toUpperCase() }))}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <FieldLabel icon={<ClockIcon className="h-4 w-4" />} text={ui.depDateTime} hint={ui.depDateHint} />
              <input type="datetime-local" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={form.departure_datetime} onChange={(e) => setForm((prev) => ({ ...prev, departure_datetime: e.target.value }))} required />
            </label>
            <label className="space-y-1">
              <FieldLabel icon={<ClockIcon className="h-4 w-4" />} text={ui.retDateTime} hint={ui.retDateHint} />
              <input type="datetime-local" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={form.return_datetime} onChange={(e) => setForm((prev) => ({ ...prev, return_datetime: e.target.value }))} />
            </label>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-white/70 p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-800">{ui.pricing}</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.buyingPrice} hint={ui.buyingHint} />
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <input type="number" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={form.buying_price} onChange={(e) => setForm((prev) => ({ ...prev, buying_price: Number(e.target.value) }))} />
                  <TypeableSelect className="w-full rounded-md mb-input-raised px-2 py-2 text-sm" value={form.buying_currency} onChange={(e) => setForm((prev) => ({ ...prev, buying_currency: e.target.value }))}>
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </TypeableSelect>
                </div>
              </label>
              <label className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.sellingPrice} hint={ui.sellingHint} />
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <input type="number" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={form.selling_price} onChange={(e) => setForm((prev) => ({ ...prev, selling_price: Number(e.target.value) }))} />
                  <TypeableSelect className="w-full rounded-md mb-input-raised px-2 py-2 text-sm" value={form.selling_currency} onChange={(e) => setForm((prev) => ({ ...prev, selling_currency: e.target.value, currency: e.target.value }))}>
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </TypeableSelect>
                </div>
              </label>
              <label className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={ui.serviceFee} hint={ui.serviceFeeHint} />
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                  <input type="number" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={form.service_fee} onChange={(e) => setForm((prev) => ({ ...prev, service_fee: Number(e.target.value) }))} />
                  <TypeableSelect className="w-full rounded-md mb-input-raised px-2 py-2 text-sm" value={form.service_fee_currency} onChange={(e) => setForm((prev) => ({ ...prev, service_fee_currency: e.target.value }))}>
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </TypeableSelect>
                </div>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              {ui.fxHint}
            </p>
          </div>

          <div className="space-y-1">
            <FieldLabel icon={<StatusIcon className="h-4 w-4" />} text={ui.ticketStatus} hint={ui.ticketStatusHint} />
            <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="draft">{ui.statusLabels.draft}</option>
              <option value="reserved">{ui.statusLabels.reserved}</option>
              <option value="issued">{ui.statusLabels.issued}</option>
              <option value="cancelled">{ui.statusLabels.cancelled}</option>
              <option value="refunded">{ui.statusLabels.refunded}</option>
            </TypeableSelect>
          </div>

          <div className="space-y-1">
            <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={ui.notes} hint={ui.notesHint} />
            <textarea className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={ui.notes} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{editingId ? ui.saveEdit : t.commonSave}</button>
        </form>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{ui.ticketsCount}</div>
              <div className="mt-1 text-xl font-semibold">{filteredTickets.length}</div>
            </div>
            <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{ui.totalSales}</div>
              <div className="mt-1 text-xl font-semibold">{formatCurrency(totals.sales, appCurrency, lang)}</div>
            </div>
            <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-4 shadow-sm">
              <div className="text-xs text-zinc-500">{ui.netProfit}</div>
              <div className="mt-1 text-xl font-semibold">{formatCurrency(totals.profit, appCurrency, lang)}</div>
            </div>
          </div>

          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{ui.ticketsLog}</h2>
              <div className="w-full max-w-sm">
                <div className="mb-2">
                  <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.search} hint={ui.searchHint} />
                </div>
                <input className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={ui.searchHint} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{ticket.passenger_name}</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {ticket.client_name || `#${ticket.client}`} | {ticket.airline || "-"} | PNR: {ticket.pnr || "-"}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {ticket.departure_airport} → {ticket.arrival_airport} | {ui.tripTypeLabels[ticket.trip_type] || ticket.trip_type}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                        {ui.statusLabels[ticket.status] || ticket.status}
                      </span>
                      <button type="button" onClick={() => editTicket(ticket)} className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-xs" aria-label={t.bookingEdit} title={t.bookingEdit}>
                        <PencilGlyph className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void downloadTicketPdf(ticket)} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        PDF
                      </button>
                      <button type="button" onClick={() => void deleteTicket(ticket)} className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700" aria-label={t.commonDelete} title={t.commonDelete}>
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-4">
                    <div>{ui.departure}: {toInputDateTime(ticket.departure_datetime).replace("T", " ")}</div>
                    <div>{ui.ticket}: {ticket.ticket_number || "-"}</div>
                    <div>{ui.buying}: {formatCurrency(ticket.buying_price, (ticket.buying_currency || ticket.currency || appCurrency) as typeof appCurrency, lang)}</div>
                    <div>{ui.selling}: {formatCurrency(ticket.selling_price, (ticket.selling_currency || ticket.currency || appCurrency) as typeof appCurrency, lang)}</div>
                    <div>{ui.serviceFee}: {formatCurrency(ticket.service_fee, (ticket.service_fee_currency || ticket.currency || appCurrency) as typeof appCurrency, lang)}</div>
                    <div>{ui.total}: {formatCurrency(ticket.total_price, (ticket.selling_currency || ticket.currency || appCurrency) as typeof appCurrency, lang)}</div>
                    <div>{ui.profit}: {formatCurrency(ticket.net_profit, (ticket.selling_currency || ticket.currency || appCurrency) as typeof appCurrency, lang)}</div>
                  </div>
                </div>
              ))}
              {!filteredTickets.length && <div className="py-6 text-center text-sm text-zinc-500">{t.commonNoData}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

