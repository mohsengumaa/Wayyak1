"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import {
  fetchHotelRoomKindOptions,
  resolveKindCapacity,
  type RoomKindOption,
} from "@/lib/hotelRoomKinds";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { CalendarIcon, MailIcon, MapPinIcon, NotesIcon, PhoneIcon } from "@/components/FieldIcons";
import { HotelIcon } from "@/components/NavIcons";

type Hotel = {
  id: number;
  name: string;
  address?: string;
  location?: string;
  contact_info?: string;
  description?: string;
  email_1?: string;
  email_2?: string;
  email_3?: string;
  phone_1?: string;
  phone_2?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  child_policy?: string;
  check_in_time?: string;
  check_out_time?: string;
};

type RoomType = {
  id: number;
  hotel: number;
  name: string;
  room_kind?: string;
  capacity: number;
};

export default function HotelDetailsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.hotels]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      updated: lang === "ar" ? "تم التعديل بنجاح" : lang === "tr" ? "Guncellendi" : "Updated successfully",
      roomAdded: lang === "ar" ? "تمت إضافة الغرفة" : lang === "tr" ? "Oda eklendi" : "Room added",
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      deleteHotelFailed: lang === "ar" ? "تعذر حذف الفندق" : lang === "tr" ? "Otel silinemedi" : "Unable to delete hotel",
      roomTypeDeleted: lang === "ar" ? "تم حذف نوع الغرفة" : lang === "tr" ? "Oda tipi silindi" : "Room type deleted",
      roomTypeDeleteFailed: lang === "ar" ? "تعذر حذف نوع الغرفة" : lang === "tr" ? "Oda tipi silinemedi" : "Unable to delete room type",
      notFound: lang === "ar" ? "لم يتم العثور على الفندق." : lang === "tr" ? "Otel bulunamadi." : "Hotel not found.",
      back: lang === "ar" ? "رجوع" : lang === "tr" ? "Geri" : "Back",
      rooms: lang === "ar" ? "الغرف" : lang === "tr" ? "Odalar" : "Rooms",
      hotelInfo: lang === "ar" ? "معلومات الفندق" : lang === "tr" ? "Otel bilgileri" : "Hotel info",
      address: lang === "ar" ? "العنوان" : lang === "tr" ? "Adres" : "Address",
      contact: lang === "ar" ? "التواصل" : lang === "tr" ? "Iletisim" : "Contact",
      phone1: lang === "ar" ? "هاتف 1" : lang === "tr" ? "Telefon 1" : "Phone 1",
      phone2: lang === "ar" ? "هاتف 2" : lang === "tr" ? "Telefon 2" : "Phone 2",
      email1: lang === "ar" ? "إيميل 1" : lang === "tr" ? "E-posta 1" : "Email 1",
      email2: lang === "ar" ? "إيميل 2" : lang === "tr" ? "E-posta 2" : "Email 2",
      email3: lang === "ar" ? "إيميل 3" : lang === "tr" ? "E-posta 3" : "Email 3",
      editHotel: lang === "ar" ? "تعديل الفندق" : lang === "tr" ? "Oteli duzenle" : "Edit hotel",
      hotelNameHint: lang === "ar" ? "اسم الفندق." : lang === "tr" ? "Otel adi." : "Hotel name.",
      addManageRooms:
        lang === "ar" ? "إضافة وإدارة الغرف الخاصة بهذا الفندق" : lang === "tr" ? "Bu otele ait odalari ekle/yonet" : "Add and manage rooms for this hotel",
      manageRooms: lang === "ar" ? "إدارة الغرف" : lang === "tr" ? "Oda yonetimi" : "Manage rooms",
      roomExample: lang === "ar" ? "مثال: Standard Room." : lang === "tr" ? "Ornek: Standard Room." : "Example: Standard Room.",
      kindsSameRoom: lang === "ar" ? "أنواع لنفس الغرفة" : lang === "tr" ? "Ayni oda icin tipler" : "Kinds for same room",
      peopleWord: lang === "ar" ? "أشخاص" : lang === "tr" ? "kisi" : "people",
      capacityPerKind: lang === "ar" ? "عدد الأشخاص لكل نوع" : lang === "tr" ? "Ture gore kisi sayisi" : "People per kind",
      roomCreateHint:
        lang === "ar"
          ? "سيتم إنشاء نوع لكل خيار تختاره بنفس اسم الغرفة."
          : lang === "tr"
            ? "Sectiginiz her secenek icin ayni oda adiyla bir tur olusturulur."
            : "A type is created for each selected option using the same room name.",
    }),
    [lang],
  );
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = useMemo(() => Number(params.id), [params.id]);

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<Partial<Hotel>>({});

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomKindOptions, setRoomKindOptions] = useState<RoomKindOption[]>([]);
  const [roomsStatus, setRoomsStatus] = useState("");
  const [deletingHotel, setDeletingHotel] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);
  const [roomCreating, setRoomCreating] = useState(false);
  const [roomForm, setRoomForm] = useState<{ name: string; kinds: string[]; capacities: Record<string, number> }>({
    name: "",
    kinds: ["SNG"],
    capacities: {},
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Hotel>(`/hotels/${id}/`),
      api.get<RoomType[]>(`/room-types/?hotel=${encodeURIComponent(String(id))}`),
    ])
      .then(([hotelData, roomTypeData]) => {
        setHotel(hotelData);
        setForm(hotelData);
        setRoomTypes(roomTypeData);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useReloadOnNavigateOrTabVisible(() => {
    void fetchHotelRoomKindOptions().then(setRoomKindOptions);
  });

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const payload: Partial<Hotel> = {
      name: (form.name || "").trim(),
      address: (form.address || "").trim(),
      location: (form.location || "").trim(),
      contact_info: (form.contact_info || "").trim(),
      description: (form.description || "").trim(),
      email_1: (form.email_1 || "").trim(),
      email_2: (form.email_2 || "").trim(),
      email_3: (form.email_3 || "").trim(),
      phone_1: (form.phone_1 || "").trim(),
      phone_2: (form.phone_2 || "").trim(),
      child_policy: (form.child_policy || "").trim(),
      check_in_time: (form.check_in_time || "").trim(),
      check_out_time: (form.check_out_time || "").trim(),
    };
    const updated = await api.patch<Hotel>(`/hotels/${id}/`, payload);
    setHotel(updated);
    setForm(updated);
    setEditing(false);
    setStatus(ui.updated);
  };

  const addRoom = async (event: FormEvent) => {
    event.preventDefault();
    setRoomsStatus("");
    const name = roomForm.name.trim();
    const kinds = roomForm.kinds?.length ? roomForm.kinds : ["SNG"];
    const toCreate = kinds.map((k) => {
      return {
        hotel: id,
        name,
        room_kind: k,
        capacity: resolveKindCapacity(k, roomKindOptions, roomForm.capacities),
      };
    });
    const created = await Promise.all(toCreate.map((p) => api.post<RoomType>("/room-types/", p)));
    setRoomTypes((prev) => [...created, ...prev]);
    setRoomForm({ name: "", kinds: ["SNG"], capacities: {} });
    setRoomCreating(false);
    setRoomsStatus(ui.roomAdded);
  };

  const deleteHotel = async () => {
    try {
      setDeletingHotel(true);
      await api.delete(`/hotels/${id}/`, { confirmMessage: ui.deleteConfirm });
      router.push("/hotels");
    } catch (error) {
      if (error instanceof Error && error.message === "DELETE_CANCELLED_BY_USER") return;
      const message = error instanceof Error ? error.message : "";
      setStatus(message || ui.deleteHotelFailed);
    } finally {
      setDeletingHotel(false);
    }
  };

  const deleteRoomType = async (roomTypeId: number) => {
    try {
      setDeletingRoomId(roomTypeId);
      await api.delete(`/room-types/${roomTypeId}/`, { confirmMessage: ui.deleteConfirm });
      setRoomTypes((prev) => prev.filter((rt) => rt.id !== roomTypeId));
      setRoomsStatus(ui.roomTypeDeleted);
    } catch (error) {
      if (error instanceof Error && error.message === "DELETE_CANCELLED_BY_USER") return;
      const message = error instanceof Error ? error.message : "";
      setRoomsStatus(message || ui.roomTypeDeleteFailed);
    } finally {
      setDeletingRoomId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-zinc-500">{t.commonLoading}</div>;
  }

  if (!hotel) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-zinc-500">{ui.notFound}</div>
        <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white" onClick={() => router.push("/hotels")}>
          {ui.back}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">
            <Link href="/hotels" className="hover:underline">
              {t.hotels}
            </Link>{" "}
            / <span className="text-zinc-800">{hotel.name}</span>
          </div>
          <h1 className="text-2xl font-semibold">{hotel.name}</h1>
          <p className="text-sm text-zinc-500">{[hotel.location, hotel.address].filter(Boolean).join(" • ") || "-"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/hotels/${hotel.id}/rooms`}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          >
            {ui.rooms}
          </Link>
          <button
            type="button"
            onClick={deleteHotel}
            disabled={deletingHotel}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            aria-label={t.hotelsDeleteHotel}
            title={t.hotelsDeleteHotel}
          >
            {deletingHotel ? "..." : <TrashGlyph />}
          </button>
          <button
            type="button"
            onClick={() => setEditing((prev) => !prev)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white inline-flex items-center justify-center gap-1"
            aria-label={editing ? t.commonClose : t.bookingEdit}
            title={editing ? t.commonClose : t.bookingEdit}
          >
            {editing ? t.commonClose : <PencilGlyph />}
          </button>
        </div>
      </div>

      {status && <div className="text-sm text-emerald-700">{status}</div>}

      {!editing ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-100 bg-white p-5">
            <div className="text-sm font-semibold text-zinc-900">{ui.hotelInfo}</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="text-zinc-500">{t.hotelsName}: </span>
                {hotel.name || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{ui.address}: </span>
                {hotel.address || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{t.hotelsLocation}: </span>
                {hotel.location || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{t.hotelsContact}: </span>
                {hotel.contact_info || "-"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-white p-5">
            <div className="text-sm font-semibold text-zinc-900">{ui.contact}</div>
            <div className="mt-3 space-y-2 text-sm text-zinc-700">
              <div>
                <span className="text-zinc-500">{ui.phone1}: </span>
                {hotel.phone_1 || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{ui.phone2}: </span>
                {hotel.phone_2 || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{ui.email1}: </span>
                {hotel.email_1 || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{ui.email2}: </span>
                {hotel.email_2 || "-"}
              </div>
              <div>
                <span className="text-zinc-500">{ui.email3}: </span>
                {hotel.email_3 || "-"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={onSave} className="rounded-lg border border-zinc-100 bg-white p-6 space-y-4">
          <div className="text-sm font-semibold">{ui.editHotel}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-zinc-700">
              <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={t.hotelsName} hint={ui.hotelNameHint} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={form.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={ui.address} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={form.address || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-zinc-700">
              <FieldLabel icon={<MapPinIcon className="h-4 w-4" />} text={t.hotelsLocation} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={form.location || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm text-zinc-700">
              <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.hotelsContact} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                value={form.contact_info || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_info: e.target.value }))}
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email1} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.email1}
                value={form.email_1 || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email_1: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email2} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.email2}
                value={form.email_2 || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email_2: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.email3} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.email3}
                value={form.email_3 || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email_3: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={ui.phone1} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.phone1}
                value={form.phone_1 || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_1: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={ui.phone2} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.phone2}
                value={form.phone_2 || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_2: e.target.value }))}
              />
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      <div className="rounded-lg border border-zinc-100 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t.hotelsRoomTypes}</div>
            <div className="text-xs text-zinc-500">{ui.addManageRooms}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/hotels/${id}/rooms`}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              {ui.manageRooms}
            </Link>
            <button
              type="button"
              onClick={() => setRoomCreating((prev) => !prev)}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {roomCreating ? t.commonClose : t.commonAdd}
            </button>
          </div>
        </div>

        {roomsStatus && <div className="text-sm text-emerald-700">{roomsStatus}</div>}

        {roomCreating && (
          <form onSubmit={addRoom} className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel icon={<HotelIcon className="h-4 w-4" />} text={t.hotelsRoomName} hint={ui.roomExample} />
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder={t.hotelsRoomName}
                  value={roomForm.name}
                  onChange={(e) => setRoomForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
                <div className="text-xs font-medium text-zinc-600 mb-2">{ui.kindsSameRoom}</div>
                <div className="flex flex-wrap gap-3">
                  {roomKindOptions.map((opt) => {
                    const checked = (roomForm.kinds || []).includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextKinds = new Set(roomForm.kinds || []);
                            if (e.target.checked) {
                              nextKinds.add(opt.value);
                              setRoomForm((p) => ({
                                ...p,
                                kinds: Array.from(nextKinds),
                                capacities: {
                                  ...p.capacities,
                                  [opt.value]: p.capacities[opt.value] ?? opt.capacity,
                                },
                              }));
                            } else {
                              nextKinds.delete(opt.value);
                              setRoomForm((p) => {
                                const nextCap = { ...p.capacities };
                                delete nextCap[opt.value];
                                return { ...p, kinds: Array.from(nextKinds), capacities: nextCap };
                              });
                            }
                          }}
                        />
                        <span>
                          {opt.label} <span className="text-xs text-zinc-500">({opt.capacity} {ui.peopleWord})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {(roomForm.kinds || []).length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                    <div className="text-xs font-medium text-zinc-600">{ui.capacityPerKind}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(roomForm.kinds || []).map((k) => {
                        const opt = roomKindOptions.find((o) => o.value === k);
                        return (
                          <label key={k} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-zinc-700">{opt?.label ?? k}</span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              className="w-20 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                              value={roomForm.capacities[k] ?? opt?.capacity ?? 1}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setRoomForm((prev) => ({
                                  ...prev,
                                  capacities: {
                                    ...prev.capacities,
                                    [k]: Number.isFinite(v) ? Math.max(1, Math.min(99, Math.floor(v))) : opt?.capacity ?? 1,
                                  },
                                }));
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-2 text-xs text-zinc-500">{ui.roomCreateHint}</div>
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
                <th className="py-2">{t.hotelsRoomName}</th>
                <th className="py-2">Kind</th>
                <th className="py-2">Capacity</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((rt) => (
                <tr key={rt.id} className="border-t border-zinc-100">
                  <td className="py-2 text-zinc-500">{rt.id}</td>
                  <td className="py-2 font-medium text-zinc-900">{rt.name}</td>
                  <td className="py-2 text-zinc-700">
                    {roomKindOptions.find((x) => x.value === rt.room_kind)?.label || rt.room_kind || "-"}
                  </td>
                  <td className="py-2 text-zinc-700">{rt.capacity}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/hotels/${id}/rooms`}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-700 hover:bg-zinc-50"
                        aria-label={t.bookingEdit}
                        title={t.bookingEdit}
                      >
                        <PencilGlyph className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteRoomType(rt.id)}
                        disabled={deletingRoomId === rt.id}
                        className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        {deletingRoomId === rt.id ? "..." : <TrashGlyph className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!roomTypes.length && (
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

