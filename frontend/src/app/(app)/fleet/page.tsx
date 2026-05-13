"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getApiBase } from "@/lib/api";
import { requestDeleteConfirm } from "@/lib/deleteConfirm";
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
import { CalendarIcon, MoneyIcon, SearchIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import { FleetIcon } from "@/components/NavIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";

type Car = {
  id: number;
  make: string;
  model: string;
  year: number;
  plate_number: string;
  daily_rate: number;
  status: string;
  location?: string;
};
type Client = { id: number; name: string };
type Rental = { id: number; car: number; client: number; total_price: number; start_date: string; end_date: string };

export default function FleetPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.fleet]);
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const ui = useMemo(
    () => ({
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      deleteCarConfirmPrefix:
        lang === "ar" ? "هل تريد تأكيد حذف السيارة" : lang === "tr" ? "Araci silmeyi onayliyor musunuz" : "Confirm deleting car",
      deleteCarFailed: lang === "ar" ? "تعذر حذف السيارة." : lang === "tr" ? "Arac silinemedi." : "Unable to delete car.",
      search: lang === "ar" ? "بحث" : lang === "tr" ? "Ara" : "Search",
      searchHint:
        lang === "ar"
          ? "ابحث بالموديل/اللوحة/السنة/الحالة/الموقع…"
          : lang === "tr"
            ? "Model/plaka/yil/durum/konuma gore ara..."
            : "Search by model/plate/year/status/location...",
      searchPlaceholder: lang === "ar" ? "بحث بالسيارات..." : lang === "tr" ? "Araclarda ara..." : "Search cars...",
      makeHint: lang === "ar" ? "اسم الشركة المصنعة." : lang === "tr" ? "Uretici firma adi." : "Manufacturer name.",
      modelHint: lang === "ar" ? "موديل السيارة." : lang === "tr" ? "Arac modeli." : "Car model.",
      plateHint: lang === "ar" ? "رقم اللوحة." : lang === "tr" ? "Plaka numarasi." : "Plate number.",
      dailyRateHint: lang === "ar" ? "سعر الإيجار لليوم." : lang === "tr" ? "Gunluk kiralama ucreti." : "Daily rental price.",
      fromDate: lang === "ar" ? "من تاريخ" : lang === "tr" ? "Baslangic tarihi" : "From date",
      toDate: lang === "ar" ? "إلى تاريخ" : lang === "tr" ? "Bitis tarihi" : "To date",
      rentalsHint:
        lang === "ar"
          ? "يتم إنشاء التأجيرات بعد حفظ السيارة (يمكن ترك التأجيرات فارغة)."
          : lang === "tr"
            ? "Arac kaydedildikten sonra kiralamalar olusturulur (bos birakabilirsiniz)."
            : "Rentals are created after saving the car (can be left empty).",
    }),
    [lang],
  );
  const router = useRouter();
  const [cars, setCars] = useState<Car[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [carForm, setCarForm] = useState({
    make: "",
    model: "",
    year: new Date().getFullYear(),
    plate_number: "",
    daily_rate: 0,
    status: "available",
    location: "",
  });

  const [rentalDrafts, setRentalDrafts] = useState<
    { client: string; start_date: string; end_date: string; pickup_location: string; dropoff_location: string; price_per_day: string }[]
  >([
    {
      client: "",
      start_date: "",
      end_date: "",
      pickup_location: "",
      dropoff_location: "",
      price_per_day: "",
    },
  ]);

  useEffect(() => {
    api.get<Car[]>("/cars/").then(setCars);
    api.get<Client[]>("/clients/").then(setClients);
  }, []);

  const addCar = async (event: FormEvent) => {
    event.preventDefault();
    const car = await api.post<Car>("/cars/", carForm);
    setCars((prev) => [car, ...prev]);

    const rentalsToCreate = rentalDrafts
      .map((r) => ({
        client: Number(r.client),
        start_date: r.start_date,
        end_date: r.end_date,
        pickup_location: r.pickup_location.trim(),
        dropoff_location: r.dropoff_location.trim(),
        price_per_day: Number(r.price_per_day || 0),
      }))
      .filter((r) => r.client && r.start_date && r.end_date && r.pickup_location && r.dropoff_location);

    if (rentalsToCreate.length) {
      await Promise.all(
        rentalsToCreate.map((r) =>
          api.post("/car-rentals/", {
            car: car.id,
            ...r,
          })
        )
      );
    }

    setCarForm({
      make: "",
      model: "",
      year: new Date().getFullYear(),
      plate_number: "",
      daily_rate: 0,
      status: "available",
      location: "",
    });
    setRentalDrafts([
      { client: "", start_date: "", end_date: "", pickup_location: "", dropoff_location: "", price_per_day: "" },
    ]);
    setCreating(false);
  };

  const filteredCars = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cars;
    return cars.filter((c) => {
      const blob = [c.make, c.model, String(c.year), c.plate_number, c.status, c.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [cars, search]);

  const addRentalDraft = () => {
    setRentalDrafts((prev) => [
      ...prev,
      { client: "", start_date: "", end_date: "", pickup_location: "", dropoff_location: "", price_per_day: "" },
    ]);
  };

  const removeRentalDraft = async (index: number) => {
    const accepted = await requestDeleteConfirm(ui.deleteConfirm);
    if (!accepted) return;
    setRentalDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRentalDraft = (
    index: number,
    next: Partial<{
      client: string;
      start_date: string;
      end_date: string;
      pickup_location: string;
      dropoff_location: string;
      price_per_day: string;
    }>
  ) => {
    setRentalDrafts((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)));
  };

  const deleteCar = async (car: Car) => {
    setError("");
    try {
      await api.delete(`/cars/${car.id}/`, {
        confirmMessage: `${ui.deleteCarConfirmPrefix} ${car.make} ${car.model}?`,
      });
      setCars((prev) => prev.filter((row) => row.id !== car.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteCarFailed);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t.fleet} subtitle={t.fleetSubtitle}>
        <ImportExportActions
          exportUrl={`${getApiBase()}/cars/export/`}
          importUrl={`${getApiBase()}/cars/import_xlsx/`}
          onImported={() => api.get<Car[]>("/cars/").then(setCars)}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-md">
          <div className="mb-2">
            <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.search} hint={ui.searchHint} />
          </div>
          <input
            className="w-full max-w-md"
            placeholder={ui.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating((prev) => !prev)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          {creating ? t.commonClose : t.commonAdd}
        </button>
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {creating && (
        <form onSubmit={addCar} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold">{t.fleetNewCar}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<FleetIcon className="h-4 w-4" />} text={t.fleetMake} hint={ui.makeHint} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetMake}
                value={carForm.make}
                onChange={(e) => setCarForm((prev) => ({ ...prev, make: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<FleetIcon className="h-4 w-4" />} text={t.fleetModel} hint={ui.modelHint} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetModel}
                value={carForm.model}
                onChange={(e) => setCarForm((prev) => ({ ...prev, model: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={t.fleetYear} />
              <input
                type="number"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetYear}
                value={carForm.year}
                onChange={(e) => setCarForm((prev) => ({ ...prev, year: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPlate} hint={ui.plateHint} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPlate}
                value={carForm.plate_number}
                onChange={(e) => setCarForm((prev) => ({ ...prev, plate_number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetDailyRate} hint={ui.dailyRateHint} />
              <input
                type="number"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetDailyRate}
                value={carForm.daily_rate}
                onChange={(e) => setCarForm((prev) => ({ ...prev, daily_rate: Number(e.target.value) }))}
                required
              />
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-800">{t.fleetRentals}</h3>
              <button
                type="button"
                onClick={addRentalDraft}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 hover:bg-zinc-50"
              >
                {t.commonAdd}
              </button>
            </div>
            <div className="space-y-3">
              {rentalDrafts.map((rental, index) => (
                <div
                  key={`draft-rental-${index}`}
                  className="grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 md:grid-cols-6"
                >
                  <div className="space-y-1">
                    <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={t.fleetSelectClient} />
                    <TypeableSelect
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={rental.client}
                      onChange={(e) => updateRentalDraft(index, { client: e.target.value })}
                    >
                      <option value="">{t.fleetSelectClient}</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </TypeableSelect>
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.fromDate} />
                    <PopupYmdDatePicker
                      value={rental.start_date}
                      onChange={(nextIso) => updateRentalDraft(index, { start_date: nextIso })}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      name={`fleet_rental_draft_start_${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.toDate} />
                    <PopupYmdDatePicker
                      value={rental.end_date}
                      onChange={(nextIso) => updateRentalDraft(index, { end_date: nextIso })}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      name={`fleet_rental_draft_end_${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPickup} />
                    <input
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={t.fleetPickup}
                      value={rental.pickup_location}
                      onChange={(e) => updateRentalDraft(index, { pickup_location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetDropoff} />
                    <input
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={t.fleetDropoff}
                      value={rental.dropoff_location}
                      onChange={(e) => updateRentalDraft(index, { dropoff_location: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-full space-y-1">
                      <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetPriceDay} />
                      <input
                        type="number"
                        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                        placeholder={t.fleetPriceDay}
                        value={rental.price_per_day}
                        onChange={(e) => updateRentalDraft(index, { price_per_day: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRentalDraft(index)}
                      disabled={rentalDrafts.length === 1}
                      className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-xs text-red-600 disabled:opacity-50"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                    >
                      <TrashGlyph />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              {ui.rentalsHint}
            </div>
          </div>

          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">{t.fleetCars}</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredCars.map((car) => (
            <div key={car.id} className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {car.make} {car.model}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {car.plate_number} • {car.year} • {car.status}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/fleet/${car.id}`)}
                    className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                    aria-label={t.bookingEdit}
                    title={t.bookingEdit}
                  >
                    <PencilGlyph />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteCar(car)}
                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                    aria-label={t.commonDelete}
                    title={t.commonDelete}
                  >
                    <TrashGlyph className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-700">
                <span className="rounded-full bg-zinc-100 px-2 py-1">{formatCurrency(car.daily_rate, currency, lang)}</span>
                <span className="text-zinc-500">{car.location || "-"}</span>
              </div>
            </div>
          ))}
          {!filteredCars.length && (
            <div className="col-span-full py-6 text-center text-sm text-zinc-500">{t.commonNoData}</div>
          )}
        </div>
      </div>
    </div>
  );
}



