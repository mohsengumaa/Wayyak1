"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useRequireAllPermissions } from "@/lib/CapabilitiesContext";
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
import { IdCardIcon, TagIcon } from "@/components/FieldIcons";

type Hotel = { id: number; name: string };
type RoomType = {
  id: number;
  hotel: number;
  name: string;
  room_kind?: string;
  capacity: number;
};

export default function HotelRoomsPage() {
  useRequireAuth();
  useRequireAllPermissions([...PERMS_VIEW.hotels, ...PERMS_VIEW.hotelRoomType]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      added: lang === "ar" ? "تمت الإضافة" : lang === "tr" ? "Eklendi" : "Added",
      deleteConfirm: lang === "ar" ? "هل تريد تأكيد الحذف؟" : lang === "tr" ? "Silmeyi onayliyor musunuz?" : "Confirm deletion?",
      updated: lang === "ar" ? "تم التعديل" : lang === "tr" ? "Guncellendi" : "Updated",
      updateFailed: lang === "ar" ? "تعذر حفظ التعديل" : lang === "tr" ? "Guncelleme kaydedilemedi" : "Unable to save update",
      deleted: lang === "ar" ? "تم حذف النوع" : lang === "tr" ? "Tur silindi" : "Type deleted",
      deleteFailed: lang === "ar" ? "تعذر الحذف" : lang === "tr" ? "Silinemedi" : "Unable to delete",
      roomBaseNameHint: lang === "ar" ? "اسم الغرفة الأساسي." : lang === "tr" ? "Temel oda adi." : "Base room name.",
      customCap: lang === "ar" ? "سعة مخصصة (اختياري)" : lang === "tr" ? "Ozel kapasite (opsiyonel)" : "Custom capacity (optional)",
      customCapHint: lang === "ar" ? "يتجاوز السعة الافتراضية للنوع." : lang === "tr" ? "Turun varsayilan kapasitesini ezer." : "Overrides default kind capacity.",
      customCapPlaceholder:
        lang === "ar"
          ? "عدد الأشخاص لكل نوع (اختياري — يتجاوز الافتراضي)"
          : lang === "tr"
            ? "Tur basina kisi sayisi (opsiyonel - varsayilani ezer)"
            : "People per kind (optional - overrides default)",
      kindsSameRoom: lang === "ar" ? "أنواع لنفس الغرفة" : lang === "tr" ? "Ayni oda icin tipler" : "Kinds for same room",
      peopleWord: lang === "ar" ? "أشخاص" : lang === "tr" ? "kisi" : "people",
      roomCreateHint:
        lang === "ar"
          ? "سيتم إنشاء نوع لكل خيار تختاره بنفس اسم الغرفة."
          : lang === "tr"
            ? "Sectiginiz her secenek icin ayni oda adiyla bir tur olusturulur."
            : "A type will be created for each selected option with the same room name.",
      editRoom: lang === "ar" ? "تعديل الغرفة" : lang === "tr" ? "Odayi duzenle" : "Edit room",
      capacityPerKind: lang === "ar" ? "عدد الأشخاص لكل نوع" : lang === "tr" ? "Ture gore kisi sayisi" : "People per kind",
      roomEditHint:
        lang === "ar"
          ? "سيتم إنشاء/حذف الأنواع ضمن نفس اسم الغرفة."
          : lang === "tr"
            ? "Turler ayni oda adi altinda olusturulur/silinir."
            : "Types will be created/removed under the same room name.",
    }),
    [lang],
  );
  const params = useParams<{ id: string }>();
  const hotelId = useMemo(() => Number(params.id), [params.id]);

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [roomKindOptions, setRoomKindOptions] = useState<RoomKindOption[]>([]);
  const [status, setStatus] = useState("");
  const [deletingRoomId, setDeletingRoomId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; kinds: string[]; capacityOverride: string }>({
    name: "",
    kinds: ["SNG"],
    capacityOverride: "",
  });

  const [editing, setEditing] = useState<{ baseName: string; roomTypeIds: number[] } | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; kinds: string[]; capacities: Record<string, number> }>({
    name: "",
    kinds: ["SNG"],
    capacities: {},
  });

  const loadData = () => {
    api.get<Hotel>(`/hotels/${hotelId}/`).then(setHotel);
    api.get<RoomType[]>(`/room-types/?hotel=${encodeURIComponent(String(hotelId))}`).then(setRoomTypes);
  };

  useEffect(() => {
    loadData();
  }, [hotelId]);

  useReloadOnNavigateOrTabVisible(() => {
    void fetchHotelRoomKindOptions().then(setRoomKindOptions);
  });

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("");
    const name = createForm.name.trim();
    const kinds = createForm.kinds?.length ? createForm.kinds : ["SNG"];
    const capOverride = createForm.capacityOverride.trim()
      ? Math.max(1, parseInt(createForm.capacityOverride, 10) || 1)
      : null;
    const toCreate = kinds.map((k) => {
      return {
        hotel: hotelId,
        name,
        room_kind: k,
        capacity: capOverride ?? resolveKindCapacity(k, roomKindOptions),
      };
    });

    const created = await Promise.all(toCreate.map((p) => api.post<RoomType>("/room-types/", p)));
    setRoomTypes((prev) => [...created, ...prev]);
    setCreateForm({ name: "", kinds: ["SNG"], capacityOverride: "" });
    setCreating(false);
    setStatus(ui.added);
  };

  const openEdit = (rt: RoomType) => {
    const baseName = rt.name;
    const group = roomTypes.filter((x) => x.name === baseName);
    const kinds = group.map((g) => g.room_kind || "").filter(Boolean);
    const capacities = Object.fromEntries(
      group
        .filter((g) => g.room_kind)
        .map((g) => [String(g.room_kind), Number(g.capacity || resolveKindCapacity(String(g.room_kind), roomKindOptions))])
    ) as Record<string, number>;
    setEditing({ baseName, roomTypeIds: group.map((g) => g.id) });
    setEditForm({ name: baseName, kinds: kinds.length ? kinds : ["SNG"], capacities });
    setStatus("");
  };

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setStatus("");
    try {
      const nextName = String(editForm.name || "").trim();
      const nextKinds = editForm.kinds?.length ? editForm.kinds : ["SNG"];

      const current = roomTypes.filter((x) => x.name === editing.baseName);
      const currentKinds = new Set(current.map((c) => c.room_kind || "").filter(Boolean));
      const nextKindsSet = new Set(nextKinds);

      const toUpdate = current.filter((c) => c.name !== nextName);
      const toCreate = nextKinds.filter((k) => !currentKinds.has(k));
      const toDelete = current.filter((c) => c.room_kind && !nextKindsSet.has(c.room_kind));

      // Update name for existing rows in group
      if (toUpdate.length) {
        await Promise.all(
          toUpdate.map((c) =>
            api.patch(`/room-types/${c.id}/`, {
              hotel: hotelId,
              name: nextName,
              room_kind: c.room_kind,
              capacity: editForm.capacities[c.room_kind || ""] || c.capacity,
            })
          )
        );
      }

      // Create missing kinds
      if (toCreate.length) {
        await Promise.all(
          toCreate.map((k) => {
            return api.post("/room-types/", {
              hotel: hotelId,
              name: nextName,
              room_kind: k,
              capacity: resolveKindCapacity(k, roomKindOptions, editForm.capacities),
            });
          })
        );
      }

      // Delete unchecked kinds
      if (toDelete.length) {
        await Promise.all(
          toDelete.map((c) =>
            api.delete(`/room-types/${c.id}/`, { confirmMessage: ui.deleteConfirm })
          )
        );
      }

      await loadData();
      setEditing(null);
      setStatus(ui.updated);
    } catch (error) {
      if (error instanceof Error && error.message === "DELETE_CANCELLED_BY_USER") return;
      setStatus(ui.updateFailed);
    }
  };

  const deleteRoomType = async (roomTypeId: number) => {
    try {
      setDeletingRoomId(roomTypeId);
      await api.delete(`/room-types/${roomTypeId}/`, { confirmMessage: ui.deleteConfirm });
      setRoomTypes((prev) => prev.filter((rt) => rt.id !== roomTypeId));
      setStatus(ui.deleted);
    } catch (error) {
      if (error instanceof Error && error.message === "DELETE_CANCELLED_BY_USER") return;
      const message = error instanceof Error ? error.message : "";
      setStatus(message || ui.deleteFailed);
    } finally {
      setDeletingRoomId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">
            <Link href="/hotels" className="hover:underline">
              {t.hotels}
            </Link>{" "}
            /{" "}
            <Link href={`/hotels/${hotelId}`} className="hover:underline">
              {hotel?.name || `#${hotelId}`}
            </Link>{" "}
            / <span className="text-zinc-800">{t.hotelsRoomTypes}</span>
          </div>
          <h1 className="text-2xl font-semibold">{t.hotelsRoomTypes}</h1>
          <p className="text-sm text-zinc-500">{hotel?.name || "-"}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((prev) => !prev)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          {creating ? t.commonClose : t.commonAdd}
        </button>
      </div>

      {status && <div className="text-sm text-emerald-700">{status}</div>}

      {creating && (
        <form onSubmit={onCreate} className="rounded-lg border border-zinc-100 bg-white p-6 space-y-3">
          <div className="text-sm font-semibold">{t.hotelsNewRoomType}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={t.hotelsRoomName} hint={ui.roomBaseNameHint} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.hotelsRoomName}
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.customCap} hint={ui.customCapHint} />
              <input
                type="number"
                min={1}
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.customCapPlaceholder}
                value={createForm.capacityOverride}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, capacityOverride: e.target.value }))}
              />
            </div>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 md:col-span-2">
              <div className="text-xs font-medium text-zinc-600 mb-2">{ui.kindsSameRoom}</div>
              <div className="flex flex-wrap gap-3">
                {roomKindOptions.map((opt) => {
                  const checked = (createForm.kinds || []).includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const nextKinds = new Set(createForm.kinds || []);
                          if (e.target.checked) nextKinds.add(opt.value);
                          else nextKinds.delete(opt.value);
                          setCreateForm((p) => ({ ...p, kinds: Array.from(nextKinds) }));
                        }}
                      />
                      <span>
                        {opt.label} <span className="text-xs text-zinc-500">({opt.capacity} {ui.peopleWord})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-zinc-500">{ui.roomCreateHint}</div>
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      {editing && (
        <form onSubmit={onSaveEdit} className="rounded-lg border border-amber-200 bg-amber-50 p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">{ui.editRoom}</div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
            >
              {t.commonCancel}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={t.hotelsRoomName} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={t.hotelsRoomName}
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
              <div className="text-xs font-medium text-zinc-600 mb-2">{ui.kindsSameRoom}</div>
              <div className="flex flex-wrap gap-3">
                {roomKindOptions.map((opt) => {
                  const checked = (editForm.kinds || []).includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const nextKinds = new Set(editForm.kinds || []);
                          if (e.target.checked) nextKinds.add(opt.value);
                          else nextKinds.delete(opt.value);
                          setEditForm((p) => ({ ...p, kinds: Array.from(nextKinds) }));
                        }}
                      />
                      <span>
                        {opt.label} <span className="text-xs text-zinc-500">({opt.capacity} {ui.peopleWord})</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {(editForm.kinds || []).length > 0 && (
                <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                  <div className="text-xs font-medium text-zinc-600">{ui.capacityPerKind}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(editForm.kinds || []).map((k) => {
                      const opt = roomKindOptions.find((o) => o.value === k);
                      return (
                        <label key={k} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-zinc-700">{opt?.label ?? k}</span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            className="w-20 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                            value={editForm.capacities[k] ?? opt?.capacity ?? 1}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEditForm((prev) => ({
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
              <div className="mt-2 text-xs text-zinc-500">{ui.roomEditHint}</div>
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">{t.commonSave}</button>
        </form>
      )}

      <div className="rounded-lg border border-zinc-100 bg-white p-6">
        <div className="mb-4 text-sm font-semibold">{t.hotelsRoomTypes}</div>
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
                      <button
                        type="button"
                        onClick={() => openEdit(rt)}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-700 hover:bg-zinc-50"
                        aria-label={t.bookingEdit}
                        title={t.bookingEdit}
                      >
                        <PencilGlyph className="h-3.5 w-3.5" />
                      </button>
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

