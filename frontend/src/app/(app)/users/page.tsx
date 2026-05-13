"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { PencilGlyph, TrashGlyph } from "@/components/ActionGlyphs";
import FieldLabel from "@/components/FieldLabel";
import { IdCardIcon, LockIcon, MailIcon, PhoneIcon, RoleIcon, SearchIcon, UserIcon } from "@/components/FieldIcons";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { NAV_LINK_CONFIG, PERMS_VIEW } from "@/lib/modulePermissions";
import { rowMatchesQuery } from "@/lib/search";

type Role = {
  id: number;
  name: string;
  description: string;
  permissions: number[];
  allowed_section_keys?: string[] | null;
};
type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: number | null;
  role_name?: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser?: boolean;
  user_permissions?: number[];
  permission_codenames?: string[];
};
type Permission = { id: number; name: string; codename: string; app_label: string; model: string };

export default function UsersPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.users]);
  const { t, lang } = useI18n();
  const l = (ar: string, tr: string, en: string) => (lang === "ar" ? ar : lang === "tr" ? tr : en);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    sectionKeys: [] as string[],
    permissions: [] as number[],
  });
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    role: "",
    password: "",
    is_active: true,
    is_staff: false,
    user_permissions: [] as number[],
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    role: "",
    is_active: true,
    is_staff: false,
    password: "",
    user_permissions: [] as number[],
  });
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({
    name: "",
    description: "",
    sectionKeys: [] as string[],
    permissions: [] as number[],
  });

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [roleRows, userRows, permissionRows] = await Promise.all([
        api.get<Role[]>("/roles"),
        api.get<User[]>("/users"),
        api.get<Permission[]>("/permissions"),
      ]);
      setRoles(roleRows);
      setUsers(userRows);
      setPermissions(permissionRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message
          ? l(`تعذر تحميل المستخدمين. (${message})`, `Kullanicilar yuklenemedi. (${message})`, `Unable to load users. (${message})`)
          : l("تعذر تحميل المستخدمين.", "Kullanicilar yuklenemedi.", "Unable to load users."),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const addRole = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    const payload = {
      name: roleForm.name,
      description: roleForm.description,
      allowed_section_keys: roleForm.sectionKeys.length > 0 ? roleForm.sectionKeys : null,
      permissions: roleForm.permissions,
    };
    try {
      const role = await api.post<Role>("/roles", payload);
      setRoles((prev) => [role, ...prev]);
      setRoleForm({
        name: "",
        description: "",
        sectionKeys: [],
        permissions: [],
      });
      setStatus(l("تمت إضافة الدور.", "Rol eklendi.", "Role added."));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || l("تعذر إضافة الدور.", "Rol eklenemedi.", "Unable to add role."));
    }
  };

  const addUser = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    const payload = {
      ...userForm,
      role: userForm.role ? Number(userForm.role) : null,
      user_permissions: userForm.user_permissions,
    };
    try {
      const user = await api.post<User>("/users", payload);
      setUsers((prev) => [user, ...prev]);
      setUserForm({
        username: "",
        email: "",
        first_name: "",
        last_name: "",
        phone: "",
        role: "",
        password: "",
        is_active: true,
        is_staff: false,
        user_permissions: [],
      });
      setStatus(l("تمت إضافة المستخدم.", "Kullanici eklendi.", "User added."));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || l("تعذر إضافة المستخدم.", "Kullanici eklenemedi.", "Unable to add user."));
    }
  };

  const openUserEdit = (user: User) => {
    setEditingUser(user);
    setEditUserForm({
      username: user.username || "",
      email: user.email || "",
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      phone: user.phone || "",
      role: user.role ? String(user.role) : "",
      is_active: !!user.is_active,
      is_staff: !!user.is_staff,
      password: "",
      user_permissions: user.user_permissions || [],
    });
  };

  const saveUserEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    setError("");
    setStatus("");
    try {
      const updated = await api.patch<User>(`/users/${editingUser.id}`, {
        username: editUserForm.username,
        email: editUserForm.email,
        first_name: editUserForm.first_name,
        last_name: editUserForm.last_name,
        phone: editUserForm.phone,
        role: editUserForm.role ? Number(editUserForm.role) : null,
        is_active: editUserForm.is_active,
        is_staff: editUserForm.is_staff,
        user_permissions: editUserForm.user_permissions,
      });
      if (editUserForm.password.trim()) {
        await api.post(`/users/${editingUser.id}/set_password`, { password: editUserForm.password.trim() });
      }
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      setEditingUser(null);
      setStatus(l("تم تحديث المستخدم.", "Kullanici guncellendi.", "User updated."));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || l("تعذر تحديث المستخدم.", "Kullanici guncellenemedi.", "Unable to update user."));
    }
  };

  const removeUser = async (user: User) => {
    setError("");
    setStatus("");
    try {
      await api.delete(`/users/${user.id}`, {
        confirmMessage: l(
          `هل تريد تأكيد حذف المستخدم ${user.username}؟`,
          `${user.username} kullanicisini silmeyi onayliyor musunuz?`,
          `Confirm deleting user ${user.username}?`,
        ),
      });
      setUsers((prev) => prev.filter((row) => row.id !== user.id));
      setStatus(l("تم حذف المستخدم.", "Kullanici silindi.", "User deleted."));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      const message = err instanceof Error ? err.message : "";
      setError(message || l("تعذر حذف المستخدم.", "Kullanici silinemedi.", "Unable to delete user."));
    }
  };

  const openRoleEdit = (role: Role) => {
    setEditingRole(role);
    const sk =
      Array.isArray(role.allowed_section_keys) && role.allowed_section_keys.length > 0
        ? [...(role.allowed_section_keys as string[])]
        : [];
    setEditRoleForm({
      name: role.name || "",
      description: role.description || "",
      sectionKeys: sk,
      permissions: role.permissions || [],
    });
  };

  const saveRoleEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingRole) return;
    setError("");
    setStatus("");
    const payload = {
      name: editRoleForm.name,
      description: editRoleForm.description,
      allowed_section_keys: editRoleForm.sectionKeys.length > 0 ? editRoleForm.sectionKeys : null,
      permissions: editRoleForm.permissions,
    };
    try {
      const updated = await api.patch<Role>(`/roles/${editingRole.id}`, payload);
      setRoles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setEditingRole(null);
      setStatus(l("تم تحديث الدور.", "Rol guncellendi.", "Role updated."));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message || l("تعذر تحديث الدور.", "Rol guncellenemedi.", "Unable to update role."));
    }
  };

  const removeRole = async (role: Role) => {
    setError("");
    setStatus("");
    try {
      await api.delete(`/roles/${role.id}`, {
        confirmMessage: l(
          `هل تريد تأكيد حذف الدور ${role.name}؟`,
          `${role.name} rolunu silmeyi onayliyor musunuz?`,
          `Confirm deleting role ${role.name}?`,
        ),
      });
      setRoles((prev) => prev.filter((row) => row.id !== role.id));
      setStatus(l("تم حذف الدور.", "Rol silindi.", "Role deleted."));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      const message = err instanceof Error ? err.message : "";
      setError(
        message ||
          l(
            "تعذر حذف الدور (تأكد أنه غير مستخدم).",
            "Rol silinemedi (kullanilmadigindan emin olun).",
            "Unable to delete role (make sure it is unused).",
          ),
      );
    }
  };

  const permissionCountByRole = useMemo(() => {
    const map = new Map<number, number>();
    for (const role of roles) map.set(role.id, role.permissions?.length || 0);
    return map;
  }, [roles]);

  const permissionGroups = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const perm of permissions) {
      const key = perm.app_label || "other";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(perm);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0], lang));
  }, [permissions, lang]);

  const filteredUsers = useMemo(() => users.filter((u) => rowMatchesQuery(u, search)), [users, search]);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-emerald-100 bg-[#ecfdf5] p-4 text-sm text-emerald-950 shadow-sm mb-input-raised">
        <p className="font-semibold">{l("تعريف الأدوار", "Rol tanimi", "Role definition")}</p>
        <p className="mt-1 text-xs text-emerald-900/80 leading-relaxed">
          <strong>{l("القسم الأول — أقسام النظام:", "Bolum 1 - Sistem bolumleri:", "Section 1 - System sections:")}</strong>{" "}
          {l(
            "اختر بسرعة من يظهر في القائمة الجانبية (لوحة التحكم، الفنادق، المحاسبة...) بدون تفاصيل تقنية. يُولَّد تلقائياً سلة صلاحيات لكل موديلات القسم.",
            "Yan menude gorunecek bolumleri hizlica secin (panel, oteller, muhasebe...) teknik detay olmadan. Her bolum modeli icin izin sepeti otomatik olusturulur.",
            "Quickly choose what appears in the sidebar (dashboard, hotels, accounting...) without technical details. A permissions bundle is generated automatically for each section's models.",
          )}
        </p>
        <p className="mt-2 text-xs text-emerald-900/80 leading-relaxed">
          <strong>{l("القسم الثاني — تفصيلي:", "Bolum 2 - Ayrintili:", "Section 2 - Detailed:")}</strong>{" "}
          {l(
            "اختياري لإضافة صلاحيات دقيقة (أو موديلات أخرى) فوق اختيارك للأقسام.",
            "Bolum seciminize ek olarak ayrintili izinler (veya baska modeller) eklemek icin istege baglidir.",
            "Optional to add granular permissions (or other models) on top of your section selection.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.users}</h1>
          <p className="text-sm text-zinc-500">{t.usersSubtitle}</p>
        </div>
        <ImportExportActions
          exportUrl={`${API_BASE}/users/export/`}
          importUrl={`${API_BASE}/users/import_xlsx/`}
          onImported={loadData}
        />
      </div>
      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="mb-2">
          <FieldLabel
            icon={<SearchIcon className="h-4 w-4" />}
            text={l("بحث", "Ara", "Search")}
            hint={l(
              "ابحث داخل المستخدمين حسب الاسم/البريد/الهاتف/الدور.",
              "Kullanicilarda ad/e-posta/telefon/role gore ara.",
              "Search users by name/email/phone/role.",
            )}
          />
        </div>
        <input
          className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
          placeholder={l(
            "بحث في المستخدمين (اسم، بريد، هاتف، دور)...",
            "Kullanicilarda ara (ad, e-posta, telefon, rol)...",
            "Search users (name, email, phone, role)...",
          )}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {loading && <div className="text-sm text-zinc-500">{t.commonLoading}</div>}
      {status && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={addUser} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">{t.usersNewUser}</h2>
          <div className="space-y-1">
            <FieldLabel
              icon={<UserIcon className="h-4 w-4" />}
              text={t.username}
              hint={l("اسم الدخول للمستخدم.", "Kullanici giris adi.", "User login name.")}
            />
            <input
              className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
              placeholder={t.username}
              value={userForm.username}
              onChange={(e) => setUserForm((prev) => ({ ...prev, username: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <FieldLabel
              icon={<LockIcon className="h-4 w-4" />}
              text={t.password}
              hint={l("كلمة المرور للحساب الجديد.", "Yeni hesap sifresi.", "Password for the new account.")}
            />
            <input
              type="password"
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.password}
              value={userForm.password}
              onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={l("الاسم الأول", "Ad", "First name")} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={l("الاسم الأول", "Ad", "First name")}
                value={userForm.first_name}
                onChange={(e) => setUserForm((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel icon={<IdCardIcon className="h-4 w-4" />} text={l("الاسم الأخير", "Soyad", "Last name")} />
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                placeholder={l("الاسم الأخير", "Soyad", "Last name")}
                value={userForm.last_name}
                onChange={(e) => setUserForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel
              icon={<MailIcon className="h-4 w-4" />}
              text={t.clientsEmail}
              hint={l(
                "اختياري للتواصل واسترجاع الحساب.",
                "Iletisim ve hesap kurtarma icin istege bagli.",
                "Optional for communication and account recovery.",
              )}
            />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.clientsEmail}
              value={userForm.email}
              onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel icon={<PhoneIcon className="h-4 w-4" />} text={l("الهاتف", "Telefon", "Phone")} />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={l("الهاتف", "Telefon", "Phone")}
              value={userForm.phone}
              onChange={(e) => setUserForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <FieldLabel
              icon={<RoleIcon className="h-4 w-4" />}
              text={t.usersSelectRole}
              hint={l("الدور يحدد صلاحيات المستخدم.", "Rol kullanici izinlerini belirler.", "Role determines user permissions.")}
            />
            <TypeableSelect
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              value={userForm.role}
              onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="">{t.usersSelectRole}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </TypeableSelect>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={userForm.is_active}
                onChange={(e) => setUserForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              {l("مفعل", "Aktif", "Active")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={userForm.is_staff}
                onChange={(e) => setUserForm((prev) => ({ ...prev, is_staff: e.target.checked }))}
              />
              {l("موظف إداري", "Personel", "Staff member")}
            </label>
          </div>
          <div className="space-y-2 rounded-md border border-zinc-100 p-3">
            <div className="text-xs font-semibold text-zinc-700">
              {l("صلاحيات إضافية مباشرة للمستخدم", "Kullaniciya dogrudan ek izinler", "Direct additional permissions for user")}
            </div>
            <div className="max-h-44 space-y-3 overflow-y-auto text-xs">
              {permissionGroups.map(([group, perms]) => (
                <div key={`u-create-${group}`}>
                  <div className="mb-1 font-semibold text-zinc-700">{group}</div>
                  <div className="space-y-1">
                    {perms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={userForm.user_permissions.includes(perm.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...userForm.user_permissions, perm.id]
                              : userForm.user_permissions.filter((id) => id !== perm.id);
                            setUserForm((prev) => ({ ...prev, user_permissions: next }));
                          }}
                        />
                        <span>{perm.codename}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
            {t.commonSave}
          </button>
        </form>

        <form onSubmit={addRole} className="rounded-lg mb-card mb-tech-border mb-card-ai flex flex-col gap-3 p-6 shadow-sm">
          <h2 className="text-sm font-semibold">{t.usersNewRole}</h2>
          <div className="space-y-1">
            <FieldLabel
              icon={<RoleIcon className="h-4 w-4" />}
              text={t.usersRoleName}
              hint={l("اسم الدور (مثال: محاسب، مبيعات...).", "Rol adi (ornek: muhasebe, satis...).", "Role name (e.g. accountant, sales...).")}
            />
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.usersRoleName}
              value={roleForm.name}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <FieldLabel
              icon={<IdCardIcon className="h-4 w-4" />}
              text={t.usersRoleDesc}
              hint={l("وصف مختصر لمهام هذا الدور.", "Bu rolun gorevleri icin kisa aciklama.", "Short description of this role duties.")}
            />
            <textarea
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder={t.usersRoleDesc}
              value={roleForm.description}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="rounded-md border border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white p-3">
            <p className="text-xs font-semibold text-emerald-900">
              {l("١ — أقسام النظام (القائمة الجانبية)", "1 - Sistem bolumleri (yan menu)", "1 - System sections (sidebar)")}
            </p>
            <p className="mb-2 mt-1 text-[11px] leading-relaxed text-emerald-800/90">
              {l(
                "حدد من أي أقسام يرى المستخدم (بدون أسماء صلاحيات). اترك الكل بدون اختيار إن أردت الاعتماد فقط على القسم التفصيلي أدناه.",
                "Kullanicinin gorecegi bolumleri secin (izin adlari olmadan). Yalnizca asagidaki ayrintili bolume dayanmak isterseniz hepsini bos birakin.",
                "Choose which sections the user can see (without permission names). Leave all unselected if you want to rely only on the detailed section below.",
              )}
            </p>
            <div className="max-h-52 space-y-1.5 overflow-y-auto">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {NAV_LINK_CONFIG.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2 rounded border border-emerald-100/90 bg-white px-2.5 py-1.5 text-xs shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={roleForm.sectionKeys.includes(item.key)}
                      onChange={(e) => {
                        const k = item.key;
                        setRoleForm((prev) => ({
                          ...prev,
                          sectionKeys: e.target.checked
                            ? [...prev.sectionKeys, k]
                            : prev.sectionKeys.filter((x) => x !== k),
                        }));
                      }}
                    />
                    <span className="font-medium text-zinc-800">{t[item.key as keyof typeof t]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
            <p className="text-xs font-semibold text-zinc-800">
              {l("٢ — صلاحيات تفصيلية (اختياري)", "2 - Ayrintili izinler (istege bagli)", "2 - Detailed permissions (optional)")}
            </p>
            <p className="mb-2 mt-1 text-[11px] text-zinc-600 leading-relaxed">
              {l(
                "إضافات دقيقة (مثلاً موديلات أخرى). تُدمج مع صلاحيات الأقسام تلقائياً.",
                "Ince ayarlar (ornegin baska modeller). Bolum izinleriyle otomatik birlestirilir.",
                "Granular additions (e.g. other models). They are merged automatically with section permissions.",
              )}
            </p>
            <div className="space-y-3 text-xs text-zinc-600 max-h-48 overflow-y-auto">
              {permissionGroups.map(([group, perms]) => (
                <div key={group}>
                  <div className="mb-1 font-semibold text-zinc-700">{group}</div>
                  <div className="space-y-1">
                    {perms.map((perm) => (
                      <label key={perm.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={roleForm.permissions.includes(perm.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...roleForm.permissions, perm.id]
                              : roleForm.permissions.filter((id) => id !== perm.id);
                            setRoleForm((prev) => ({ ...prev, permissions: next }));
                          }}
                        />
                        <span>{perm.codename}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {!permissions.length && <p>{t.commonNoData}</p>}
            </div>
          </div>
          <div className="pt-1">
            <button type="submit" className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white">
              {t.commonSave}
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">{t.usersList}</h2>
          <div className="space-y-2 text-sm max-h-[440px] overflow-y-auto">
            {filteredUsers.map((user) => (
              <div key={user.id} className="border-b border-zinc-100 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{user.username}</div>
                    <div className="text-xs text-zinc-500">{user.email || "—"}</div>
                    <div className="text-xs text-zinc-500">
                      {l("الدور", "Rol", "Role")}: {roles.find((r) => r.id === user.role)?.name || "—"} |{" "}
                      {user.is_active ? l("مفعل", "Aktif", "Active") : l("موقوف", "Pasif", "Inactive")} |{" "}
                      {user.is_staff ? l("موظف", "Personel", "Staff") : l("مستخدم", "Kullanici", "User")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs"
                      aria-label={t.bookingEdit}
                      title={t.bookingEdit}
                      onClick={() => openUserEdit(user)}
                    >
                      <PencilGlyph className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                      onClick={() => void removeUser(user)}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!filteredUsers.length && <p className="text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
        <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">{t.usersRolesList}</h2>
          <div className="space-y-2 text-sm max-h-[440px] overflow-y-auto">
            {roles.map((role) => (
              <div key={role.id} className="border-b border-zinc-100 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{role.name}</div>
                    <div className="text-xs text-zinc-500">{role.description || "—"}</div>
                    <div className="text-xs text-zinc-500">
                      {Array.isArray(role.allowed_section_keys) && role.allowed_section_keys.length > 0 ? (
                        <span>
                          {l("أقسام", "Bolumler", "Sections")}: {role.allowed_section_keys.length} (
                          {role.allowed_section_keys.join(", ")}) · {l("إجمالي صلاحيات مربوطة", "Toplam bagli izin", "Total linked permissions")}:{" "}
                          {permissionCountByRole.get(role.id) || 0}
                        </span>
                      ) : (
                        <span>
                          {l("صلاحيات تفصيلية فقط", "Yalnizca ayrintili izinler", "Detailed permissions only")} -{" "}
                          {l("عدد السجلات", "Kayit sayisi", "Records")}: {permissionCountByRole.get(role.id) || 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs"
                      aria-label={t.bookingEdit}
                      title={t.bookingEdit}
                      onClick={() => openRoleEdit(role)}
                    >
                      <PencilGlyph className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                      onClick={() => void removeRole(role)}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!roles.length && <p className="text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveUserEdit} className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{l("تعديل مستخدم", "Kullaniciyi duzenle", "Edit user")}</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setEditingUser(null)}>
                {t.commonClose}
              </button>
            </div>
            <input className="w-full rounded-md border px-3 py-2 text-sm" value={editUserForm.username} onChange={(e) => setEditUserForm((p) => ({ ...p, username: e.target.value }))} required />
            <div className="grid gap-3 md:grid-cols-2">
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder={l("الاسم الأول", "Ad", "First name")} value={editUserForm.first_name} onChange={(e) => setEditUserForm((p) => ({ ...p, first_name: e.target.value }))} />
              <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder={l("الاسم الأخير", "Soyad", "Last name")} value={editUserForm.last_name} onChange={(e) => setEditUserForm((p) => ({ ...p, last_name: e.target.value }))} />
            </div>
            <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder={l("البريد", "E-posta", "Email")} value={editUserForm.email} onChange={(e) => setEditUserForm((p) => ({ ...p, email: e.target.value }))} />
            <input className="w-full rounded-md border px-3 py-2 text-sm" placeholder={l("الهاتف", "Telefon", "Phone")} value={editUserForm.phone} onChange={(e) => setEditUserForm((p) => ({ ...p, phone: e.target.value }))} />
            <TypeableSelect className="w-full rounded-md border px-3 py-2 text-sm" value={editUserForm.role} onChange={(e) => setEditUserForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="">{t.usersSelectRole}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </TypeableSelect>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={l("كلمة مرور جديدة (اختياري)", "Yeni sifre (istege bagli)", "New password (optional)")}
              value={editUserForm.password}
              onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))}
            />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editUserForm.is_active} onChange={(e) => setEditUserForm((p) => ({ ...p, is_active: e.target.checked }))} />
                {l("مفعل", "Aktif", "Active")}
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editUserForm.is_staff} onChange={(e) => setEditUserForm((p) => ({ ...p, is_staff: e.target.checked }))} />
                {l("موظف", "Personel", "Staff")}
              </label>
            </div>
            <div className="space-y-2 rounded-md border border-zinc-100 p-3">
              <div className="text-xs font-semibold text-zinc-700">
                {l("صلاحيات إضافية مباشرة للمستخدم", "Kullaniciya dogrudan ek izinler", "Direct additional permissions for user")}
              </div>
              <div className="max-h-44 space-y-3 overflow-y-auto text-xs">
                {permissionGroups.map(([group, perms]) => (
                  <div key={`u-edit-${group}`}>
                    <div className="mb-1 font-semibold text-zinc-700">{group}</div>
                    <div className="space-y-1">
                      {perms.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editUserForm.user_permissions.includes(perm.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editUserForm.user_permissions, perm.id]
                                : editUserForm.user_permissions.filter((id) => id !== perm.id);
                              setEditUserForm((p) => ({ ...p, user_permissions: next }));
                            }}
                          />
                          <span>{perm.codename}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setEditingUser(null)}>
                {t.commonCancel}
              </button>
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                {t.commonSave}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={saveRoleEdit}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between">
              <h3 className="text-base font-semibold">{l("تعديل دور", "Rolu duzenle", "Edit role")}</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setEditingRole(null)}>
                {t.commonClose}
              </button>
            </div>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={editRoleForm.name}
              onChange={(e) => setEditRoleForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={editRoleForm.description}
              onChange={(e) => setEditRoleForm((p) => ({ ...p, description: e.target.value }))}
            />
            <div className="rounded-md border border-emerald-200 bg-gradient-to-b from-emerald-50/90 to-white p-3">
              <p className="text-xs font-semibold text-emerald-900">
                {l("١ — أقسام النظام (القائمة الجانبية)", "1 - Sistem bolumleri (yan menu)", "1 - System sections (sidebar)")}
              </p>
              <p className="mb-2 mt-1 text-[11px] leading-relaxed text-emerald-800/90">
                {l(
                  "حدد الأقسام التي يظهرها المستخدم في القائمة. اتركها كلها بدون اختيار للاعتماد فقط على التفصيلي.",
                  "Listede kullaniciya gosterilecek bolumleri secin. Sadece ayrintili izinlere dayanmak icin hepsini bos birakin.",
                  "Choose sections shown to the user in the menu. Leave all unselected to rely only on detailed permissions.",
                )}
              </p>
              <div className="max-h-52 overflow-y-auto">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {NAV_LINK_CONFIG.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2 rounded border border-emerald-100/90 bg-white px-2.5 py-1.5 text-xs shadow-sm"
                    >
                      <input
                        type="checkbox"
                        checked={editRoleForm.sectionKeys.includes(item.key)}
                        onChange={(e) => {
                          const k = item.key;
                          setEditRoleForm((prev) => ({
                            ...prev,
                            sectionKeys: e.target.checked
                              ? [...prev.sectionKeys, k]
                              : prev.sectionKeys.filter((x) => x !== k),
                          }));
                        }}
                      />
                      <span className="font-medium text-zinc-800">{t[item.key as keyof typeof t]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
              <p className="text-xs font-semibold text-zinc-800">
                {l("٢ — صلاحيات تفصيلية (اختياري)", "2 - Ayrintili izinler (istege bagli)", "2 - Detailed permissions (optional)")}
              </p>
              <p className="mb-2 mt-1 text-[11px] text-zinc-600 leading-relaxed">
                {l("يُدمج مع صلاحيات الأقسام.", "Bolum izinleriyle birlestirilir.", "Merged with section permissions.")}
              </p>
              <div className="max-h-56 space-y-3 overflow-y-auto border-0 p-0 text-xs">
                {permissionGroups.map(([group, perms]) => (
                  <div key={group}>
                    <div className="mb-1 font-semibold text-zinc-700">{group}</div>
                    <div className="space-y-1 text-xs">
                      {perms.map((perm) => (
                        <label key={perm.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editRoleForm.permissions.includes(perm.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editRoleForm.permissions, perm.id]
                                : editRoleForm.permissions.filter((id) => id !== perm.id);
                              setEditRoleForm((p) => ({ ...p, permissions: next }));
                            }}
                          />
                          <span>{perm.codename}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-100 pt-3">
              <button type="button" className="rounded-md border px-4 py-2 text-sm" onClick={() => setEditingRole(null)}>
                {t.commonCancel}
              </button>
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                {t.commonSave}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}



