"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { IdCardIcon, MailIcon, NotesIcon, PhoneIcon, SearchIcon, TagIcon, UserIcon } from "@/components/FieldIcons";
import { rowMatchesQuery } from "@/lib/search";

type ClientDocument = { id: number; file: string; label: string; created_at: string };
type Client = {
  id: number;
  client_code: string;
  name: string;
  email: string;
  phone: string;
  documents: ClientDocument[];
};
type Referrer = {
  id: number;
  referrer_code: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  is_active?: boolean;
};

export default function ClientsPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.clients]);
  const { t, lang } = useI18n();
  const ui = useMemo(
    () => ({
      referrerUpdated: lang === "ar" ? "تم تحديث المُحيل." : lang === "tr" ? "Yönlendiren güncellendi." : "Referrer updated.",
      referrerAdded: lang === "ar" ? "تمت إضافة المُحيل." : lang === "tr" ? "Yönlendiren eklendi." : "Referrer added.",
      referrerSaveFailed:
        lang === "ar" ? "تعذر حفظ بيانات المُحيل." : lang === "tr" ? "Yönlendiren kaydedilemedi." : "Unable to save referrer.",
      referrerDeleteConfirm:
        lang === "ar" ? "هل تريد تأكيد حذف المُحيل؟" : lang === "tr" ? "Yönlendiren silinsin mi?" : "Delete this referrer?",
      referrerDeleted: lang === "ar" ? "تم الحذف بنجاح." : lang === "tr" ? "Başarıyla silindi." : "Deleted successfully.",
      referrerDeleteFailed:
        lang === "ar" ? "تعذر حذف المُحيل." : lang === "tr" ? "Yönlendiren silinemedi." : "Unable to delete referrer.",
      clientDeleteFailed: lang === "ar" ? "تعذر حذف العميل." : lang === "tr" ? "Müşteri silinemedi." : "Unable to delete client.",
      searchAnyLabel: lang === "ar" ? "بحث عام" : lang === "tr" ? "Genel arama" : "Global search",
      searchAnyHint:
        lang === "ar"
          ? "اكتب أي شيء: اسم، كود، هاتف، بريد…"
          : lang === "tr"
            ? "Herhangi bir şey yazın: ad, kod, telefon, e-posta..."
            : "Type anything: name, code, phone, email...",
      searchAnyPlaceholder: lang === "ar" ? "اسم / رقم / بريد…" : lang === "tr" ? "Ad / no / e-posta..." : "Name / number / email...",
      codeSearchLabel:
        lang === "ar" ? "بحث بالكود فقط (اختياري)" : lang === "tr" ? "Sadece koda göre ara (opsiyonel)" : "Code-only search (optional)",
      codeSearchHint:
        lang === "ar"
          ? "يعمل عبر السيرفر لتصفية النتائج."
          : lang === "tr"
            ? "Sonuçları sunucu tarafında filtreler."
            : "Filters results server-side.",
      clientCodeHint:
        lang === "ar"
          ? "رمز داخلي لتمييز العميل (مثل: CLT001)."
          : lang === "tr"
            ? "Müşteriyi ayırmak için iç kod (örn: CLT001)."
            : "Internal client code (e.g. CLT001).",
      fullNameHint:
        lang === "ar" ? "الاسم الكامل للعميل." : lang === "tr" ? "Müşterinin tam adı." : "Client full name.",
      emailHint:
        lang === "ar"
          ? "اختياري للتواصل وإرسال المستندات."
          : lang === "tr"
            ? "İletişim ve belge gönderimi için opsiyonel."
            : "Optional for contact and document sending.",
      phoneHint:
        lang === "ar" ? "رقم الهاتف الرئيسي للعميل." : lang === "tr" ? "Müşterinin ana telefon numarası." : "Primary client phone number.",
      referrersTitle: lang === "ar" ? "المُحيلون" : lang === "tr" ? "Yönlendirenler" : "Referrers",
      referrersSubtitle:
        lang === "ar"
          ? "إضافة/تعديل المُحيلين مباشرة من قسم العملاء."
          : lang === "tr"
            ? "Yönlendirenleri müşteri bölümünden ekleyin/düzenleyin."
            : "Add/edit referrers directly from clients section.",
      referrerCodeLabel:
        lang === "ar" ? "رمز المُحيل (فريد)" : lang === "tr" ? "Yönlendiren kodu (benzersiz)" : "Referrer code (unique)",
      referrerCodeHint: lang === "ar" ? "مثال: SR001" : lang === "tr" ? "Örnek: SR001" : "Example: SR001",
      referrerNameHint:
        lang === "ar" ? "اسم المُحيل الظاهر بالقوائم." : lang === "tr" ? "Listelerde görünen yönlendiren adı." : "Referrer name shown in lists.",
      phoneLabel: lang === "ar" ? "هاتف" : lang === "tr" ? "Telefon" : "Phone",
      emailLabel: lang === "ar" ? "بريد إلكتروني" : lang === "tr" ? "E-posta" : "Email",
      optionalHint: lang === "ar" ? "اختياري." : lang === "tr" ? "Opsiyonel." : "Optional.",
      notesHint:
        lang === "ar" ? "ملاحظات داخلية للفريق." : lang === "tr" ? "Ekip için iç notlar." : "Internal notes for team.",
      update: lang === "ar" ? "تحديث" : lang === "tr" ? "Güncelle" : "Update",
      cancel: lang === "ar" ? "إلغاء" : lang === "tr" ? "İptal" : "Cancel",
      searchReferrers:
        lang === "ar" ? "بحث بالمُحيلين" : lang === "tr" ? "Yönlendirenlerde ara" : "Search referrers",
      searchReferrersHint:
        lang === "ar"
          ? "اكتب رمز أو اسم أو هاتف…"
          : lang === "tr"
            ? "Kod, ad veya telefon yazın..."
            : "Type code, name, or phone...",
      searchReferrersPlaceholder:
        lang === "ar" ? "SR001 / اسم / هاتف…" : lang === "tr" ? "SR001 / ad / telefon..." : "SR001 / name / phone...",
      edit: lang === "ar" ? "تعديل" : lang === "tr" ? "Düzenle" : "Edit",
      delete: lang === "ar" ? "حذف" : lang === "tr" ? "Sil" : "Delete",
      fileLabelHint:
        lang === "ar" ? "اسم مختصر للملف (اختياري)." : lang === "tr" ? "Dosya için kısa ad (opsiyonel)." : "Short label for file (optional).",
    }),
    [lang],
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [searchCode, setSearchCode] = useState("");
  const [searchAny, setSearchAny] = useState("");
  const [uploadLabels, setUploadLabels] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    client_code: "",
    name: "",
    email: "",
    phone: "",
  });
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [referrerSearch, setReferrerSearch] = useState("");
  const [referrerError, setReferrerError] = useState("");
  const [referrerStatus, setReferrerStatus] = useState("");
  const [referrerForm, setReferrerForm] = useState({
    referrer_code: "",
    name: "",
    phone: "",
    email: "",
    notes: "",
    is_active: true,
  });
  const [editingReferrerId, setEditingReferrerId] = useState<number | null>(null);

  const loadClients = () => {
    const query = searchCode ? `?client_code=${encodeURIComponent(searchCode)}` : "";
    api.get<Client[]>(`/clients/${query}`).then(setClients);
  };

  const loadReferrers = () => api.get<Referrer[]>("/referrers/").then(setReferrers);

  useEffect(() => {
    loadClients();
  }, [searchCode]);

  useEffect(() => {
    loadReferrers().catch(() => setReferrers([]));
  }, []);

  const addClient = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const client = await api.post<Client>("/clients/", form);
    setClients((prev) => [client, ...prev]);
    setForm({ client_code: "", name: "", email: "", phone: "" });
  };

  const addOrUpdateReferrer = async (event: FormEvent) => {
    event.preventDefault();
    setReferrerError("");
    setReferrerStatus("");
    try {
      if (editingReferrerId) {
        const row = await api.patch<Referrer>(`/referrers/${editingReferrerId}/`, referrerForm);
        setReferrers((prev) => prev.map((item) => (item.id === row.id ? row : item)));
        setReferrerStatus(ui.referrerUpdated);
      } else {
        const row = await api.post<Referrer>("/referrers/", referrerForm);
        setReferrers((prev) => [row, ...prev]);
        setReferrerStatus(ui.referrerAdded);
      }
      setReferrerForm({ referrer_code: "", name: "", phone: "", email: "", notes: "", is_active: true });
      setEditingReferrerId(null);
    } catch (err) {
      setReferrerError(err instanceof Error ? err.message : ui.referrerSaveFailed);
    }
  };

  const deleteReferrer = async (row: Referrer) => {
    setReferrerError("");
    setReferrerStatus("");
    try {
      await api.delete(`/referrers/${row.id}/`, { confirmMessage: ui.referrerDeleteConfirm });
      setReferrers((prev) => prev.filter((r) => r.id !== row.id));
      if (editingReferrerId === row.id) {
        setEditingReferrerId(null);
        setReferrerForm({ referrer_code: "", name: "", phone: "", email: "", notes: "", is_active: true });
      }
      setReferrerStatus(ui.referrerDeleted);
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setReferrerError(err instanceof Error ? err.message : ui.referrerDeleteFailed);
    }
  };

  const filteredReferrers = useMemo(() => {
    return referrers.filter((r) => rowMatchesQuery(r, referrerSearch));
  }, [referrers, referrerSearch]);

  const uploadDocument = async (clientId: number, file: File | null) => {
    if (!file) {
      return;
    }
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const label = uploadLabels[clientId];
    if (label) {
      formData.append("label", label);
    }
    await fetch(`${API_BASE}/clients/${clientId}/documents/`, {
      method: "POST",
      headers: token ? { Authorization: `Token ${token}` } : undefined,
      body: formData,
    });
    setUploadLabels((prev) => ({ ...prev, [clientId]: "" }));
    loadClients();
  };

  const deleteClient = async (client: Client) => {
    setError("");
    try {
      await api.delete(`/clients/${client.id}/`, {
        confirmMessage: `هل تريد تأكيد حذف العميل ${client.name}؟`,
      });
      setClients((prev) => prev.filter((row) => row.id !== client.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : ui.clientDeleteFailed);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.clients}</h1>
          <p className="text-sm text-zinc-500">{t.clientsSubtitle}</p>
        </div>
        <div className="min-w-[260px] space-y-3">
          <div>
            <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.searchAnyLabel} hint={ui.searchAnyHint} />
            <input
              className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={ui.searchAnyPlaceholder}
              value={searchAny}
              onChange={(e) => setSearchAny(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.codeSearchLabel} hint={ui.codeSearchHint} />
            <input
              className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.clientsSearchCode}
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <form onSubmit={addClient} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold">{t.clientsNew}</h2>
          <div className="space-y-1">
            <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={t.clientsCode} hint={ui.clientCodeHint} />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.clientsCode}
              value={form.client_code}
              onChange={(e) => setForm((prev) => ({ ...prev, client_code: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={t.commonName} hint={ui.fullNameHint} />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.commonName}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={t.clientsEmail} hint={ui.emailHint} />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.clientsEmail}
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={t.clientsPhone} hint={ui.phoneHint} />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.clientsPhone}
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
            {t.commonSave}
          </button>
          </form>

          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-semibold">{ui.referrersTitle}</h2>
              <p className="text-xs text-zinc-500">{ui.referrersSubtitle}</p>
            </div>

            {referrerError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{referrerError}</div>
            ) : null}
            {referrerStatus ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{referrerStatus}</div>
            ) : null}

            <form onSubmit={addOrUpdateReferrer} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel icon={<TagIcon className="h-4 w-4" />} text={ui.referrerCodeLabel} hint={ui.referrerCodeHint} />
                  <input
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={referrerForm.referrer_code}
                    onChange={(e) => setReferrerForm((p) => ({ ...p, referrer_code: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel icon={<UserIcon className="h-4 w-4" />} text={t.commonName} hint={ui.referrerNameHint} />
                  <input
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={referrerForm.name}
                    onChange={(e) => setReferrerForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={ui.phoneLabel} hint={ui.optionalHint} />
                  <input
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={referrerForm.phone}
                    onChange={(e) => setReferrerForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel icon={<MailIcon className="h-4 w-4" />} text={ui.emailLabel} hint={ui.optionalHint} />
                  <input
                    type="email"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                    value={referrerForm.email}
                    onChange={(e) => setReferrerForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel icon={<NotesIcon className="h-4 w-4" />} text={t.commonNotes} hint={ui.notesHint} />
                <textarea
                  className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  rows={2}
                  value={referrerForm.notes}
                  onChange={(e) => setReferrerForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={referrerForm.is_active}
                  onChange={(e) => setReferrerForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                {t.commonStatus}
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                  {editingReferrerId ? ui.update : t.commonSave}
                </button>
                {editingReferrerId ? (
                  <button
                    type="button"
                    className="rounded-md border px-4 py-2 text-sm"
                    onClick={() => {
                      setEditingReferrerId(null);
                      setReferrerForm({ referrer_code: "", name: "", phone: "", email: "", notes: "", is_active: true });
                    }}
                  >
                    {ui.cancel}
                  </button>
                ) : null}
              </div>
            </form>

            <div className="pt-2 border-t border-zinc-100">
              <FieldLabel icon={<SearchIcon className="h-4 w-4" />} text={ui.searchReferrers} hint={ui.searchReferrersHint} />
              <input
                className="mt-2 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={ui.searchReferrersPlaceholder}
                value={referrerSearch}
                onChange={(e) => setReferrerSearch(e.target.value)}
              />
              <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto">
                {filteredReferrers.map((r) => (
                  <div key={r.id} className="rounded-lg border border-zinc-100 bg-white px-3 py-2 shadow-sm">
                    <div className="font-medium">{r.referrer_code} — {r.name}</div>
                    <div className="text-xs text-zinc-500">{r.phone || r.email || "—"}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => {
                          setEditingReferrerId(r.id);
                          setReferrerForm({
                            referrer_code: r.referrer_code,
                            name: r.name,
                            phone: r.phone || "",
                            email: r.email || "",
                            notes: r.notes || "",
                            is_active: r.is_active ?? true,
                          });
                        }}
                      >
                        {ui.edit}
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-red-600 px-2 py-1 text-xs text-white"
                        onClick={() => void deleteReferrer(r)}
                      >
                        {ui.delete}
                      </button>
                    </div>
                  </div>
                ))}
                {!referrers.length ? <div className="text-xs text-zinc-400">{t.commonNoData}</div> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">{t.clientsList}</h2>
          {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="space-y-2 text-sm">
            {clients.filter((c) => rowMatchesQuery(c, searchAny)).map((client) => (
              <div key={client.id} className="space-y-3 border-b border-zinc-100 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{client.name}</p>
                    <p className="text-xs text-zinc-500">{client.client_code}</p>
                    <p className="text-xs text-zinc-500">{client.phone}</p>
                    {client.email && <p className="text-xs text-zinc-500">{client.email}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteClient(client)}
                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    aria-label={t.commonDelete}
                    title={t.commonDelete}
                  >
                    <TrashGlyph />
                  </button>
                </div>
                <div className="rounded-md border border-zinc-100 bg-white/70 p-3">
                  <div className="text-xs font-semibold text-zinc-600">{t.clientsDocuments}</div>
                  <div className="mt-2 space-y-1 text-xs text-zinc-500">
                    {client.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.file}
                        className="block text-blue-600"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {doc.label || doc.file.split("/").pop()}
                      </a>
                    ))}
                    {!client.documents.length && <div>{t.commonNoData}</div>}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr]">
                    <div className="space-y-1">
                      <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={t.clientsFileLabel} hint={ui.fileLabelHint} />
                      <input
                        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-xs"
                        placeholder={t.clientsFileLabel}
                        value={uploadLabels[client.id] || ""}
                        onChange={(e) => setUploadLabels((prev) => ({ ...prev, [client.id]: e.target.value }))}
                      />
                    </div>
                    <input
                      type="file"
                      className="text-xs"
                      onChange={(e) => uploadDocument(client.id, e.target.files?.[0] || null)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {!clients.length && <p className="text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}



