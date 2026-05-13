"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, getApiBase } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MoneyIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";

type Car = { id: number; make: string; model: string; plate_number: string };
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
  booked_at: string;
};

export default function CarRentalsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.fleetRentals]);
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const ui = useMemo(
    () => ({
      added: lang === "ar" ? "تمت الإضافة" : lang === "tr" ? "Eklendi" : "Added",
      updated: lang === "ar" ? "تم التعديل" : lang === "tr" ? "Guncellendi" : "Updated",
      deleteConfirmPrefix:
        lang === "ar" ? "هل تريد تأكيد حذف التأجير رقم" : lang === "tr" ? "Kiralama kaydini silmeyi onayliyor musunuz #" : "Confirm deleting rental #",
      deleted: lang === "ar" ? "تم الحذف" : lang === "tr" ? "Silindi" : "Deleted",
      deleteFailed: lang === "ar" ? "تعذر حذف التأجير." : lang === "tr" ? "Kiralama silinemedi." : "Unable to delete rental.",
      fromDate: lang === "ar" ? "من تاريخ" : lang === "tr" ? "Baslangic tarihi" : "From date",
      toDate: lang === "ar" ? "إلى تاريخ" : lang === "tr" ? "Bitis tarihi" : "To date",
      editRental: lang === "ar" ? "تعديل التأجير" : lang === "tr" ? "Kiralamayi duzenle" : "Edit rental",
    }),
    [lang],
  );
  const params = useParams<{ id: string }>();
  const carId = useMemo(() => Number(params.id), [params.id]);

  const [car, setCar] = useState<Car | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    client: "",
    start_date: "",
    end_date: "",
    pickup_location: "",
    dropoff_location: "",
    price_per_day: "",
  });

  const [editing, setEditing] = useState<Rental | null>(null);
  const [editForm, setEditForm] = useState<Partial<Rental>>({});

  const loadData = () => {
    api.get<Car>(`/cars/${carId}/`).then(setCar);
    api.get<Client[]>("/clients/").then(setClients);
    api.get<Rental[]>(`/car-rentals/?car=${encodeURIComponent(String(carId))}`).then(setRentals);
  };

  useEffect(() => {
    loadData();
  }, [carId]);

  const addRental = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const payload = {
      car: carId,
      client: Number(form.client),
      start_date: form.start_date,
      end_date: form.end_date,
      pickup_location: form.pickup_location.trim(),
      dropoff_location: form.dropoff_location.trim(),
      price_per_day: Number(form.price_per_day || 0),
    };
    const created = await api.post<Rental>("/car-rentals/", payload);
    setRentals((prev) => [created, ...prev]);
    setForm({ client: "", start_date: "", end_date: "", pickup_location: "", dropoff_location: "", price_per_day: "" });
    setCreating(false);
    setStatus(ui.added);
  };

  const openEdit = (rental: Rental) => {
    setEditing(rental);
    setEditForm(rental);
    setStatus("");
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setStatus("");
    const payload = {
      car: carId,
      client: Number(editForm.client),
      start_date: String(editForm.start_date || ""),
      end_date: String(editForm.end_date || ""),
      pickup_location: String(editForm.pickup_location || "").trim(),
      dropoff_location: String(editForm.dropoff_location || "").trim(),
      price_per_day: Number(editForm.price_per_day || 0),
    };
    const updated = await api.patch<Rental>(`/car-rentals/${editing.id}/`, payload);
    setRentals((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setEditing(null);
    setStatus(ui.updated);
  };

  const deleteRental = async (rental: Rental) => {
    setError("");
    try {
      await api.delete(`/car-rentals/${rental.id}/`, {
        confirmMessage: `${ui.deleteConfirmPrefix} ${rental.id}?`,
      });
      setRentals((prev) => prev.filter((row) => row.id !== rental.id));
      setStatus(ui.deleted);
      if (editing?.id === rental.id) {
        setEditing(null);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.deleteFailed);
    }
  };

  const getClientName = (clientId: number) => clients.find((c) => c.id === clientId)?.name || String(clientId);

  return (
    <div className="space-y-6">
      <div className="mb-hero-strip mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-mb-muted">
            <Link href="/fleet" className="hover:underline">
              {t.fleet}
            </Link>{" "}
            /{" "}
            <Link href={`/fleet/${carId}`} className="hover:underline">
              {car ? `${car.make} ${car.model}` : `#${carId}`}
            </Link>{" "}
            / <span className="text-foreground">{t.fleetRentals}</span>
          </div>
          <h1>{t.fleetRentals}</h1>
          <p className="subtitle">{car ? `${car.plate_number}` : "-"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportActions
            exportUrl={`${getApiBase()}/car-rentals/export/`}
            importUrl={`${getApiBase()}/car-rentals/import_xlsx/`}
            onImported={loadData}
          />
          <button
            type="button"
            onClick={() => setCreating((prev) => !prev)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
          >
            {creating ? t.commonClose : t.commonAdd}
          </button>
        </div>
      </div>

      {status && <div className="text-sm text-emerald-700">{status}</div>}
      {error && <div className="text-sm text-red-700">{error}</div>}

      {creating && (
        <form onSubmit={addRental} className="rounded-lg border border-zinc-100 bg-white p-6 space-y-3">
          <div className="text-sm font-semibold">{t.fleetNewRental}</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={t.fleetSelectClient} />
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={form.client}
                onChange={(e) => setForm((prev) => ({ ...prev, client: e.target.value }))}
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
                value={form.start_date}
                onChange={(nextIso) => setForm((prev) => ({ ...prev, start_date: nextIso }))}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="fleet_new_rental_start"
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.toDate} />
              <PopupYmdDatePicker
                value={form.end_date}
                onChange={(nextIso) => setForm((prev) => ({ ...prev, end_date: nextIso }))}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="fleet_new_rental_end"
                required
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPickup} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPickup}
                value={form.pickup_location}
                onChange={(e) => setForm((prev) => ({ ...prev, pickup_location: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetDropoff} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetDropoff}
                value={form.dropoff_location}
                onChange={(e) => setForm((prev) => ({ ...prev, dropoff_location: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetPriceDay} />
              <input
                type="number"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPriceDay}
                value={form.price_per_day}
                onChange={(e) => setForm((prev) => ({ ...prev, price_per_day: e.target.value }))}
                required
              />
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      {editing && (
        <form onSubmit={saveEdit} className="rounded-lg border border-amber-200 bg-amber-50 p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">{ui.editRental}</div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
            >
              {t.commonCancel}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={t.fleetSelectClient} />
              <TypeableSelect
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={String(editForm.client ?? "")}
                onChange={(e) => setEditForm((prev) => ({ ...prev, client: Number(e.target.value) }))}
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
                value={String(editForm.start_date || "")}
                onChange={(nextIso) => setEditForm((prev) => ({ ...prev, start_date: nextIso }))}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="fleet_edit_rental_start"
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<CalendarIcon className="h-4 w-4" />} text={ui.toDate} />
              <PopupYmdDatePicker
                value={String(editForm.end_date || "")}
                onChange={(nextIso) => setEditForm((prev) => ({ ...prev, end_date: nextIso }))}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                name="fleet_edit_rental_end"
                required
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetPickup} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPickup}
                value={String(editForm.pickup_location || "")}
                onChange={(e) => setEditForm((prev) => ({ ...prev, pickup_location: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={t.fleetDropoff} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetDropoff}
                value={String(editForm.dropoff_location || "")}
                onChange={(e) => setEditForm((prev) => ({ ...prev, dropoff_location: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MoneyIcon className="h-4 w-4" />} text={t.fleetPriceDay} />
              <input
                type="number"
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.fleetPriceDay}
                value={String(editForm.price_per_day ?? 0)}
                onChange={(e) => setEditForm((prev) => ({ ...prev, price_per_day: Number(e.target.value) }))}
                required
              />
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      <div className="rounded-lg border border-zinc-100 bg-white p-6">
        <div className="mb-4 text-sm font-semibold">{t.fleetRentals}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-2">{t.commonId}</th>
                <th className="py-2">{t.clients}</th>
                <th className="py-2">{t.commonDate}</th>
                <th className="py-2">{t.fleetPickup}</th>
                <th className="py-2">{t.fleetDropoff}</th>
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
                  <td className="py-2 text-zinc-700">{r.pickup_location}</td>
                  <td className="py-2 text-zinc-700">{r.dropoff_location}</td>
                  <td className="py-2 text-zinc-700">{formatCurrency(r.total_price, currency, lang)}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-700 hover:bg-zinc-50"
                        aria-label={t.bookingEdit}
                        title={t.bookingEdit}
                      >
                        <PencilGlyph className="h-3.5 w-3.5" />
                      </button>
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
                  <td colSpan={7} className="py-4 text-center text-zinc-400">
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

