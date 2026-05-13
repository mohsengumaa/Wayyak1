"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MoneyIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
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
type Rental = {
  id: number;
  car: number;
  client: number;
  start_date: string;
  end_date: string;
  pickup_location: string;
  dropoff_location: string;
  price_per_day: number;
  total_price: number;
};

export default function CarDetailsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.fleetCar]);
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const ui = useMemo(
    () => ({
      updated: lang === "ar" ? "تم التعديل بنجاح" : lang === "tr" ? "Basariyla guncellendi" : "Updated successfully",
      rentalAdded: lang === "ar" ? "تمت إضافة التأجير" : lang === "tr" ? "Kiralama eklendi" : "Rental added",
      deleteCarConfirm: lang === "ar" ? "هل تريد تأكيد حذف السيارة؟" : lang === "tr" ? "Araci silmeyi onayliyor musunuz?" : "Confirm deleting car?",
      deleteCarFailed: lang === "ar" ? "تعذر حذف السيارة." : lang === "tr" ? "Arac silinemedi." : "Unable to delete car.",
      deleteRentalConfirmPrefix:
        lang === "ar" ? "هل تريد تأكيد حذف التأجير رقم" : lang === "tr" ? "Kiralama kaydini silmeyi onayliyor musunuz #" : "Confirm deleting rental #",
      rentalDeleted: lang === "ar" ? "تم حذف التأجير" : lang === "tr" ? "Kiralama silindi" : "Rental deleted",
      deleteRentalFailed: lang === "ar" ? "تعذر حذف التأجير." : lang === "tr" ? "Kiralama silinemedi." : "Unable to delete rental.",
      carNotFound: lang === "ar" ? "لم يتم العثور على السيارة." : lang === "tr" ? "Arac bulunamadi." : "Car not found.",
      back: lang === "ar" ? "رجوع" : lang === "tr" ? "Geri" : "Back",
      carInfo: lang === "ar" ? "معلومات السيارة" : lang === "tr" ? "Arac bilgileri" : "Car info",
      status: lang === "ar" ? "الحالة" : lang === "tr" ? "Durum" : "Status",
      rentalsSummary: lang === "ar" ? "ملخص التأجيرات" : lang === "tr" ? "Kiralama ozeti" : "Rentals summary",
      rentalsCount: lang === "ar" ? "عدد التأجيرات" : lang === "tr" ? "Kiralama sayisi" : "Rentals count",
      total: lang === "ar" ? "إجمالي" : lang === "tr" ? "Toplam" : "Total",
      editCar: lang === "ar" ? "تعديل السيارة" : lang === "tr" ? "Araci duzenle" : "Edit car",
      rentalsManageHint:
        lang === "ar" ? "إضافة وإدارة التأجيرات الخاصة بهذه السيارة" : lang === "tr" ? "Bu araca ait kiralamalari ekleyin ve yonetin" : "Add and manage rentals for this car",
      manageRentals: lang === "ar" ? "إدارة التأجيرات" : lang === "tr" ? "Kiralamalari yonet" : "Manage rentals",
      fromDate: lang === "ar" ? "من تاريخ" : lang === "tr" ? "Baslangic tarihi" : "From date",
      toDate: lang === "ar" ? "إلى تاريخ" : lang === "tr" ? "Bitis tarihi" : "To date",
    }),
    [lang],
  );
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = useMemo(() => Number(params.id), [params.id]);

  const [car, setCar] = useState<Car | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState<Partial<Car>>({});

  const [rentalCreating, setRentalCreating] = useState(false);
  const [rentalStatus, setRentalStatus] = useState("");
  const [rentalForm, setRentalForm] = useState({
    client: "",
    start_date: "",
    end_date: "",
    pickup_location: "",
    dropoff_location: "",
    price_per_day: "",
  });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get<Car>(`/cars/${id}/`),
      api.get<Client[]>("/clients/"),
      api.get<Rental[]>(`/car-rentals/?car=${encodeURIComponent(String(id))}`),
    ])
      .then(([carData, clientData, rentalData]) => {
        setCar(carData);
        setForm(carData);
        setClients(clientData);
        setRentals(rentalData);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const payload: Partial<Car> = {
      make: String(form.make || "").trim(),
      model: String(form.model || "").trim(),
      year: Number(form.year || new Date().getFullYear()),
      plate_number: String(form.plate_number || "").trim(),
      daily_rate: Number(form.daily_rate || 0),
      status: String(form.status || "available"),
      location: String(form.location || "").trim(),
    };
    const updated = await api.patch<Car>(`/cars/${id}/`, payload);
    setCar(updated);
    setForm(updated);
    setEditing(false);
    setStatus(ui.updated);
  };

  const addRental = async (event: FormEvent) => {
    event.preventDefault();
    setRentalStatus("");
    const payload = {
      car: id,
      client: Number(rentalForm.client),
      start_date: rentalForm.start_date,
      end_date: rentalForm.end_date,
      pickup_location: rentalForm.pickup_location.trim(),
      dropoff_location: rentalForm.dropoff_location.trim(),
      price_per_day: Number(rentalForm.price_per_day || 0),
    };
    const created = await api.post<Rental>("/car-rentals/", payload);
    setRentals((prev) => [created, ...prev]);
    setRentalForm({
      client: "",
      start_date: "",
      end_date: "",
      pickup_location: "",
      dropoff_location: "",
      price_per_day: "",
    });
    setRentalCreating(false);
    setRentalStatus(ui.rentalAdded);
  };

  const deleteCar = async () => {
    setError("");
    try {
      await api.delete(`/cars/${id}/`, { confirmMessage: ui.deleteCarConfirm });
      router.push("/fleet");
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteCarFailed);
    }
  };

  const deleteRental = async (rental: Rental) => {
    setError("");
    try {
      await api.delete(`/car-rentals/${rental.id}/`, {
        confirmMessage: `${ui.deleteRentalConfirmPrefix} ${rental.id}?`,
      });
      setRentals((prev) => prev.filter((row) => row.id !== rental.id));
      setRentalStatus(ui.rentalDeleted);
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteRentalFailed);
    }
  };

  const getClientName = (clientId: number) => clients.find((c) => c.id === clientId)?.name || String(clientId);

  if (loading) {
    return <div className="text-sm text-zinc-500">{t.commonLoading}</div>;
  }

  if (!car) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-zinc-500">{ui.carNotFound}</div>
        <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white" onClick={() => router.push("/fleet")}>
          {ui.back}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-hero-strip mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-mb-muted">
            <Link href="/fleet" className="hover:underline">
              {t.fleet}
            </Link>{" "}
            / <span className="text-foreground">{car.make} {car.model}</span>
          </div>
          <h1>
            {car.make} {car.model}
          </h1>
          <p className="subtitle">
            {car.plate_number} • {car.year} • {formatCurrency(car.daily_rate, currency, lang)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/fleet/${car.id}/rentals`}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            {t.fleetRentals}
          </Link>
          <button
            type="button"
            onClick={() => setEditing((prev) => !prev)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white inline-flex items-center justify-center"
            aria-label={editing ? t.commonClose : t.bookingEdit}
            title={editing ? t.commonClose : t.bookingEdit}
          >
            {editing ? t.commonClose : <PencilGlyph />}
          </button>
          <button
            type="button"
            onClick={() => void deleteCar()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 inline-flex items-center justify-center"
            aria-label={t.fleetDeleteCar}
            title={t.fleetDeleteCar}
          >
            <TrashGlyph />
          </button>
        </div>
      </div>

      {status && <div className="text-sm text-emerald-700">{status}</div>}
      {error && <div className="text-sm text-red-700">{error}</div>}

      {!editing ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-100 bg-white p-5">
            <div className="text-sm font-semibold text-zinc-900">{ui.carInfo}</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="text-zinc-500">{t.fleetMake}: </span>
                {car.make}
              </div>
              <div>
                <span className="text-zinc-500">{t.fleetModel}: </span>
                {car.model}
              </div>
              <div>
                <span className="text-zinc-500">{t.fleetYear}: </span>
                {car.year}
              </div>
              <div>
                <span className="text-zinc-500">{t.fleetPlate}: </span>
                {car.plate_number}
              </div>
              <div>
                <span className="text-zinc-500">{t.fleetDailyRate}: </span>
                {formatCurrency(car.daily_rate, currency, lang)}
              </div>
              <div>
                <span className="text-zinc-500">{ui.status}: </span>
                {car.status}
              </div>
              <div>
                <span className="text-zinc-500">{t.fleetPickup}: </span>
                {car.location || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-white p-5">
            <div className="text-sm font-semibold text-zinc-900">{ui.rentalsSummary}</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="text-zinc-500">{ui.rentalsCount}: </span>
                {rentals.length}
              </div>
              <div>
                <span className="text-zinc-500">{ui.total}: </span>
                {formatCurrency(rentals.reduce((sum, r) => sum + Number(r.total_price || 0), 0), currency, lang)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={onSave} className="rounded-lg border border-zinc-100 bg-white p-6 space-y-4">
          <div className="text-sm font-semibold">{ui.editCar}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<FleetIcon className="h-4 w-4" />} text={t.fleetMake} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetMake}
                value={String(form.make || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, make: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<FleetIcon className="h-4 w-4" />} text={t.fleetModel} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetModel}
                value={String(form.model || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
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
                value={String(form.year ?? new Date().getFullYear())}
                onChange={(e) => setForm((prev) => ({ ...prev, year: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPlate} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPlate}
                value={String(form.plate_number || "")}
                onChange={(e) => setForm((prev) => ({ ...prev, plate_number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetDailyRate} />
              <input
                type="number"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetDailyRate}
                value={String(form.daily_rate ?? 0)}
                onChange={(e) => setForm((prev) => ({ ...prev, daily_rate: Number(e.target.value) }))}
                required
              />
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      <div className="rounded-lg border border-zinc-100 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t.fleetRentals}</div>
            <div className="text-xs text-zinc-500">{ui.rentalsManageHint}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/fleet/${id}/rentals`}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              {ui.manageRentals}
            </Link>
            <button
              type="button"
              onClick={() => setRentalCreating((prev) => !prev)}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {rentalCreating ? t.commonClose : t.commonAdd}
            </button>
          </div>
        </div>

        {rentalStatus && <div className="text-sm text-emerald-700">{rentalStatus}</div>}

        {rentalCreating && (
          <form onSubmit={addRental} className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={t.fleetSelectClient} />
                <TypeableSelect
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={rentalForm.client}
                  onChange={(e) => setRentalForm((prev) => ({ ...prev, client: e.target.value }))}
                  required
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
                  value={rentalForm.start_date}
                  onChange={(nextIso) => setRentalForm((prev) => ({ ...prev, start_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  name="fleet_rental_start_date"
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.toDate} />
                <PopupYmdDatePicker
                  value={rentalForm.end_date}
                  onChange={(nextIso) => setRentalForm((prev) => ({ ...prev, end_date: nextIso }))}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  name="fleet_rental_end_date"
                  required
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPickup} />
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder={t.fleetPickup}
                  value={rentalForm.pickup_location}
                  onChange={(e) => setRentalForm((prev) => ({ ...prev, pickup_location: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetDropoff} />
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder={t.fleetDropoff}
                  value={rentalForm.dropoff_location}
                  onChange={(e) => setRentalForm((prev) => ({ ...prev, dropoff_location: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetPriceDay} />
                <input
                  type="number"
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder={t.fleetPriceDay}
                  value={rentalForm.price_per_day}
                  onChange={(e) => setRentalForm((prev) => ({ ...prev, price_per_day: e.target.value }))}
                  required
                />
              </div>
            </div>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-2">{t.commonId}</th>
                <th className="py-2">{t.clients}</th>
                <th className="py-2">{t.commonDate}</th>
                <th className="py-2">{t.commonTotal}</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rentals.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="py-2 text-zinc-500">{r.id}</td>
                  <td className="py-2 text-zinc-900">{getClientName(r.client)}</td>
                  <td className="py-2 text-zinc-700">
                    {r.start_date} → {r.end_date}
                  </td>
                  <td className="py-2 text-zinc-700">{formatCurrency(r.total_price, currency, lang)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/fleet/${id}/rentals`}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-700 hover:bg-zinc-50"
                        aria-label={t.bookingEdit}
                        title={t.bookingEdit}
                      >
                        <PencilGlyph className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void deleteRental(r)}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rentals.length && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-zinc-400">
                    {t.commonNoData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

