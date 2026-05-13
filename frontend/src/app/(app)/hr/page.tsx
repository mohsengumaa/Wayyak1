"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "@/lib/api";
import { useRequireAnyPermission } from "@/lib/CapabilitiesContext";
import { PERMS_VIEW } from "@/lib/modulePermissions";
import { useRequireAuth } from "@/lib/useAuth";
import { useI18n } from "@/lib/useI18n";
import { useCurrency } from "@/lib/useCurrency";
import { formatCurrency } from "@/lib/currency";
import ImportExportActions from "@/components/ImportExportActions";
import TypeableSelect from "@/components/TypeableSelect";
import { TrashGlyph } from "@/components/ActionGlyphs";
import { DROPDOWN_CATEGORY_KEYS, fetchDropdownOptionsMap, type DropdownOptionRow } from "@/lib/dropdownOptions";
import { useReloadOnNavigateOrTabVisible } from "@/lib/useReloadOnNavigateOrTabVisible";
import PopupYmdDatePicker from "@/components/PopupYmdDatePicker";
import {
  BriefcaseIcon,
  CalendarIcon,
  ClockIcon,
  DepartmentIcon,
  MoneyIcon,
  MonthIcon,
  NotesIcon,
  PriorityIcon,
  StatusIcon,
  TagIcon,
  TaskTitleIcon,
  UserBadgeIcon,
} from "@/components/HrFieldIcons";

type UserOption = { id: number; username: string; full_name: string; has_employee_profile: boolean };
type Employee = {
  id: number;
  user: number;
  user_username?: string;
  department?: string;
  position: string;
  salary: number;
  hours_per_week: number;
  employment_status: string;
  monthly_salary: number;
  notes: string;
};
type SalesRecord = {
  id: number;
  employee: number;
  employee_name?: string;
  source_type: string;
  booking_count: number;
  gross_amount: number;
  net_profit: number;
  sale_date: string;
};
type EmployeeTask = {
  id: number;
  employee: number;
  title: string;
  task_type: string;
  status: string;
  priority: string;
  due_date?: string | null;
};
type EmployeeSalary = {
  id: number;
  employee: number;
  salary_type: string;
  period_month: string;
  base_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  net_amount: number;
  status: string;
};
type EmployeeExpense = {
  id: number;
  employee: number;
  expense_type: string;
  amount: number;
  expense_date: string;
  status: string;
};
type SelectOption = { value: string; label: string };

export default function HrPage() {
  useRequireAuth();
  useRequireAnyPermission([...PERMS_VIEW.hr]);
  const { t, lang } = useI18n();
  const { currency } = useCurrency();
  const l = (ar: string, tr: string, en: string) => (lang === "ar" ? ar : lang === "tr" ? tr : en);
  const [tab, setTab] = useState<"employees" | "tasks" | "salaries" | "expenses" | "sales">("employees");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sales, setSales] = useState<SalesRecord[]>([]);
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [expenses, setExpenses] = useState<EmployeeExpense[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<SelectOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<SelectOption[]>([]);
  const [taskTypeOptions, setTaskTypeOptions] = useState<SelectOption[]>([]);
  const [salaryTypeOptions, setSalaryTypeOptions] = useState<SelectOption[]>([]);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<SelectOption[]>([]);
  const [employeeForm, setEmployeeForm] = useState({
    user: "",
    department: "",
    position: "",
    salary: 0,
    hours_per_week: 40,
    employment_status: "active",
    monthly_salary: 0,
    notes: "",
  });
  const [taskForm, setTaskForm] = useState({
    employee: "",
    title: "",
    task_type: "",
    status: "todo",
    priority: "medium",
    due_date: "",
    description: "",
  });
  const [salaryForm, setSalaryForm] = useState({
    employee: "",
    salary_type: "",
    period_month: "",
    base_amount: 0,
    bonus_amount: 0,
    deduction_amount: 0,
    status: "draft",
    notes: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    employee: "",
    expense_type: "",
    amount: 0,
    expense_date: "",
    status: "submitted",
    notes: "",
  });

  const applyHrDropdowns = useCallback((dropdownMap: Record<string, DropdownOptionRow[]>) => {
    setDepartmentOptions((dropdownMap[DROPDOWN_CATEGORY_KEYS.hrDepartment] || []).map((row) => ({ value: row.value, label: row.label })));
    setPositionOptions((dropdownMap[DROPDOWN_CATEGORY_KEYS.hrPosition] || []).map((row) => ({ value: row.value, label: row.label })));
    setTaskTypeOptions((dropdownMap[DROPDOWN_CATEGORY_KEYS.hrTaskType] || []).map((row) => ({ value: row.value, label: row.label })));
    setSalaryTypeOptions((dropdownMap[DROPDOWN_CATEGORY_KEYS.hrSalaryType] || []).map((row) => ({ value: row.value, label: row.label })));
    setExpenseTypeOptions((dropdownMap[DROPDOWN_CATEGORY_KEYS.hrExpenseType] || []).map((row) => ({ value: row.value, label: row.label })));
  }, []);

  const loadData = async () => {
    const [userRows, employeeRows, salesRows, taskRows, salaryRows, expenseRows] = await Promise.all([
      api.get<UserOption[]>("/employees/user-options"),
      api.get<Employee[]>("/employees"),
      api.get<SalesRecord[]>("/sales-records"),
      api.get<EmployeeTask[]>("/employee-tasks"),
      api.get<EmployeeSalary[]>("/employee-salaries"),
      api.get<EmployeeExpense[]>("/employee-expenses"),
    ]);
    setUsers(userRows);
    setEmployees(employeeRows);
    setSales(salesRows);
    setTasks(taskRows);
    setSalaries(salaryRows);
    setExpenses(expenseRows);
  };

  useReloadOnNavigateOrTabVisible(() => {
    void fetchDropdownOptionsMap([
      DROPDOWN_CATEGORY_KEYS.hrDepartment,
      DROPDOWN_CATEGORY_KEYS.hrPosition,
      DROPDOWN_CATEGORY_KEYS.hrTaskType,
      DROPDOWN_CATEGORY_KEYS.hrSalaryType,
      DROPDOWN_CATEGORY_KEYS.hrExpenseType,
    ]).then(applyHrDropdowns);
  });

  useEffect(() => {
    loadData().catch((err) => setError(err instanceof Error ? err.message : l("تعذر تحميل بيانات الموارد البشرية.", "IK verileri yuklenemedi.", "Unable to load HR data.")));
  }, []);

  const addEmployee = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const row = await api.post<Employee>("/employees", {
        ...employeeForm,
        user: Number(employeeForm.user),
        salary: Number(employeeForm.salary),
        hours_per_week: Number(employeeForm.hours_per_week),
        monthly_salary: Number(employeeForm.monthly_salary || employeeForm.salary || 0),
      });
      setEmployees((prev) => [row, ...prev]);
      setStatus(l("تمت إضافة الموظف.", "Calisan eklendi.", "Employee added."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إضافة الموظف.", "Calisan eklenemedi.", "Unable to add employee."));
    }
  };

  const addTask = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const row = await api.post<EmployeeTask>("/employee-tasks", {
        ...taskForm,
        employee: Number(taskForm.employee),
      });
      setTasks((prev) => [row, ...prev]);
      setStatus(l("تمت إضافة المهمة.", "Gorev eklendi.", "Task added."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إضافة المهمة.", "Gorev eklenemedi.", "Unable to add task."));
    }
  };

  const addSalary = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const row = await api.post<EmployeeSalary>("/employee-salaries", {
        ...salaryForm,
        employee: Number(salaryForm.employee),
        base_amount: Number(salaryForm.base_amount),
        bonus_amount: Number(salaryForm.bonus_amount),
        deduction_amount: Number(salaryForm.deduction_amount),
      });
      setSalaries((prev) => [row, ...prev]);
      setStatus(l("تمت إضافة مسير الراتب.", "Maas bordrosu eklendi.", "Payroll entry added."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إضافة مسير الراتب.", "Maas bordrosu eklenemedi.", "Unable to add payroll entry."));
    }
  };

  const addExpense = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const row = await api.post<EmployeeExpense>("/employee-expenses", {
        ...expenseForm,
        employee: Number(expenseForm.employee),
        amount: Number(expenseForm.amount),
      });
      setExpenses((prev) => [row, ...prev]);
      setStatus(l("تمت إضافة مصروف الموظف.", "Calisan gideri eklendi.", "Employee expense added."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر إضافة مصروف الموظف.", "Calisan gideri eklenemedi.", "Unable to add employee expense."));
    }
  };

  const syncSales = async () => {
    setError("");
    try {
      await api.post("/sales-records/sync-from-sources", {});
      const rows = await api.get<SalesRecord[]>("/sales-records");
      setSales(rows);
      setStatus(l("تمت مزامنة سجل المبيعات تلقائياً من الحجوزات والتأجير.", "Satis kayitlari rezervasyon ve kiralamalardan otomatik senkronize edildi.", "Sales records synced automatically from bookings and rentals."));
    } catch (err) {
      setError(err instanceof Error ? err.message : l("تعذر مزامنة سجل المبيعات.", "Satis kayitlari senkronize edilemedi.", "Unable to sync sales records."));
    }
  };

  const deleteEmployee = async (row: Employee) => {
    setError("");
    try {
      await api.delete(`/employees/${row.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف الموظف", "Calisani silmeyi onayliyor musunuz", "Confirm deleting employee") + ` ${row.user_username || `#${row.id}`}?`,
      });
      setEmployees((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر حذف الموظف.", "Calisan silinemedi.", "Unable to delete employee."));
    }
  };

  const deleteTask = async (row: EmployeeTask) => {
    setError("");
    try {
      await api.delete(`/employee-tasks/${row.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف المهمة", "Gorevi silmeyi onayliyor musunuz", "Confirm deleting task") + ` ${row.title}?`,
      });
      setTasks((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر حذف المهمة.", "Gorev silinemedi.", "Unable to delete task."));
    }
  };

  const deleteSalary = async (row: EmployeeSalary) => {
    setError("");
    try {
      await api.delete(`/employee-salaries/${row.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف مسير الراتب رقم", "Maas bordrosu kaydini silmeyi onayliyor musunuz", "Confirm deleting payroll entry") + ` ${row.id}?`,
      });
      setSalaries((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر حذف مسير الراتب.", "Maas bordrosu silinemedi.", "Unable to delete payroll entry."));
    }
  };

  const deleteEmployeeExpense = async (row: EmployeeExpense) => {
    setError("");
    try {
      await api.delete(`/employee-expenses/${row.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف مصروف الموظف رقم", "Calisan giderini silmeyi onayliyor musunuz", "Confirm deleting employee expense") + ` ${row.id}?`,
      });
      setExpenses((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر حذف مصروف الموظف.", "Calisan gideri silinemedi.", "Unable to delete employee expense."));
    }
  };

  const deleteSalesRecord = async (row: SalesRecord) => {
    setError("");
    try {
      await api.delete(`/sales-records/${row.id}/`, {
        confirmMessage: l("هل تريد تأكيد حذف سجل المبيعات رقم", "Satis kaydini silmeyi onayliyor musunuz", "Confirm deleting sales record") + ` ${row.id}?`,
      });
      setSales((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err) {
      if (err instanceof Error && err.message === "DELETE_CANCELLED_BY_USER") return;
      setError(err instanceof Error ? err.message : l("تعذر حذف سجل المبيعات.", "Satis kaydi silinemedi.", "Unable to delete sales record."));
    }
  };

  const salesSummary = useMemo(() => {
    const totalBookings = sales.reduce((sum, row) => sum + Number(row.booking_count || 0), 0);
    const gross = sales.reduce((sum, row) => sum + Number(row.gross_amount || 0), 0);
    const profit = sales.reduce((sum, row) => sum + Number(row.net_profit || 0), 0);
    return { totalBookings, gross, profit };
  }, [sales]);

  const freeUsers = users.filter((u) => !u.has_employee_profile);
  const employeeName = (id: number) => {
    const row = employees.find((e) => e.id === id);
    return row?.user_username || `#${id}`;
  };

  const employeeStatusLabel = (value?: string) => {
    if (!value) return "";
    if (value === "active") return l("نشط", "Aktif", "Active");
    if (value === "on_leave") return l("إجازة", "Izinde", "On leave");
    if (value === "inactive") return l("غير نشط", "Pasif", "Inactive");
    return value;
  };

  const Label = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700">
      <span className="text-zinc-500">{icon}</span>
      <span>{text}</span>
    </span>
  );

  return (
    <div className="space-y-6" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.hr}</h1>
          <p className="text-sm text-zinc-500">{t.hrSubtitle}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {l(
              "الأقسام/الوظائف/أنواع المهام/أنواع الرواتب/أنواع المصاريف تتحكم بها من الإعدادات > القوائم المنسدلة.",
              "Departman/pozisyon/gorev tipi/maas tipi/gider tipi ayarlardan > acilir listelerden yonetilir.",
              "Departments/positions/task types/salary types/expense types are managed from Settings > Dropdown lists.",
            )}
          </p>
        </div>
        <ImportExportActions
          exportUrl={`${API_BASE}/employees/export/`}
          importUrl={`${API_BASE}/employees/import_xlsx/`}
          onImported={() => api.get<Employee[]>("/employees").then(setEmployees)}
        />
      </div>
      {status && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</div>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2 rounded-lg bg-white/50 p-2 mb-tech-border">
        {[
          ["employees", t.hrEmployees],
          ["tasks", l("المهام", "Gorevler", "Tasks")],
          ["salaries", l("الرواتب", "Maaslar", "Salaries")],
          ["expenses", l("مصاريف الموظفين", "Calisan giderleri", "Employee expenses")],
          ["sales", t.hrSales],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`rounded-md px-3 py-2 text-sm transition ${tab === key ? "bg-mb-highlight text-white shadow-sm" : "bg-white/80 hover:bg-white"}`}
            onClick={() => setTab(key as typeof tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "employees" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={addEmployee} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{t.hrNewEmployee}</h2>
                <p className="mt-1 text-xs text-zinc-500">{l("أنشئ ملف موظف مرتبط بحساب مستخدم، وحدد القسم/الوظيفة والراتب والحالة.", "Kullanici hesabina bagli calisan profili olusturun; departman/pozisyon/maas/durum secin.", "Create an employee profile linked to a user account and set department/position/salary/status.")}</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<UserBadgeIcon className="h-4 w-4" />} text={t.hrSelectUser} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("اختر الحساب الذي سيتم إنشاء ملف موظف له.", "Calisan profili olusturulacak hesabi secin.", "Choose the account to create an employee profile for.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={employeeForm.user} onChange={(e) => setEmployeeForm((p) => ({ ...p, user: e.target.value }))} required>
                <option value="">{t.hrSelectUser}</option>
                {freeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<DepartmentIcon className="h-4 w-4" />} text={l("القسم (اختياري)", "Departman (opsiyonel)", "Department (optional)")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("لتصنيف الموظف ضمن قسم/إدارة.", "Calisani departman altinda siniflandirmak icin.", "To classify employee under a department.")}</p>
                <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={employeeForm.department} onChange={(e) => setEmployeeForm((p) => ({ ...p, department: e.target.value }))}>
                  <option value="">{l("اختر القسم", "Departman secin", "Select department")}</option>
                  {departmentOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<BriefcaseIcon className="h-4 w-4" />} text={t.hrPosition} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("مسمى وظيفة الموظف (للتنظيم والتقارير).", "Calisanin pozisyon unvani (duzen ve raporlama icin).", "Employee job title (for organization and reporting).")}</p>
                <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={employeeForm.position} onChange={(e) => setEmployeeForm((p) => ({ ...p, position: e.target.value }))} required>
                  <option value="">{l("اختر الوظيفة", "Pozisyon secin", "Select position")}</option>
                  {positionOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </TypeableSelect>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("الراتب الأساسي", "Temel maas", "Base salary")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("الرقم الأساسي المرجعي لراتب الموظف.", "Calisan maasi icin temel referans tutar.", "Base reference amount for employee salary.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("مثال: 500", "Ornek: 500", "Example: 500")} value={employeeForm.salary} onChange={(e) => setEmployeeForm((p) => ({ ...p, salary: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("الراتب الشهري (اختياري)", "Aylik maas (opsiyonel)", "Monthly salary (optional)")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("راتب الدفع الشهري إذا كان مختلفًا عن الأساسي.", "Temel maastan farkliysa aylik odeme maasi.", "Monthly payout salary if different from base.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("اتركه فارغًا لاعتماد الأساسي", "Temel maasi kullanmak icin bos birakin", "Leave empty to use base salary")} value={employeeForm.monthly_salary} onChange={(e) => setEmployeeForm((p) => ({ ...p, monthly_salary: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<ClockIcon className="h-4 w-4" />} text={t.hrHours} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("عدد ساعات دوام الموظف أسبوعيًا (افتراضي 40).", "Haftalik calisma saati (varsayilan 40).", "Employee weekly working hours (default 40).")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("مثال: 40", "Ornek: 40", "Example: 40")} value={employeeForm.hours_per_week} onChange={(e) => setEmployeeForm((p) => ({ ...p, hours_per_week: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<StatusIcon className="h-4 w-4" />} text={l("حالة الموظف", "Calisan durumu", "Employee status")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("نشط/إجازة/غير نشط للتنظيم والمتابعة.", "Duzen ve takip icin aktif/izinli/pasif.", "Active/on-leave/inactive for organization and tracking.")}</p>
                <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={employeeForm.employment_status} onChange={(e) => setEmployeeForm((p) => ({ ...p, employment_status: e.target.value }))}>
                  <option value="active">{l("نشط", "Aktif", "Active")}</option>
                  <option value="on_leave">{l("إجازة", "Izinde", "On leave")}</option>
                  <option value="inactive">{l("غير نشط", "Pasif", "Inactive")}</option>
                </TypeableSelect>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<NotesIcon className="h-4 w-4" />} text={l("ملاحظات (اختياري)", "Notlar (opsiyonel)", "Notes (optional)")} />
              </label>
              <textarea className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("أي تفاصيل إضافية عن الموظف", "Calisanla ilgili ek detaylar", "Any additional employee details")} value={employeeForm.notes} onChange={(e) => setEmployeeForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-black">{t.commonSave}</button>
          </form>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">{t.hrEmployees}</h2>
            <div className="space-y-2 text-sm">
              {employees.map((employee) => (
                <div key={employee.id} className="border-b border-zinc-100 pb-2">
                  <div className="flex items-center justify-between">
                    <span>{employee.user_username || `#${employee.user}`}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(employee.monthly_salary || employee.salary, currency, lang)}</span>
                      <button
                        type="button"
                        onClick={() => void deleteEmployee(employee)}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600">
                    {[
                      employee.department,
                      employee.position,
                      employeeStatusLabel(employee.employment_status),
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                  </div>
                </div>
              ))}
              {!employees.length && <p className="py-6 text-center text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={addTask} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
            <div>
              <h2 className="text-sm font-semibold">{l("إضافة مهمة", "Gorev ekle", "Add task")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{l("سجّل مهمة وربطها بموظف مع الحالة والأولوية وتاريخ الاستحقاق.", "Bir gorev kaydedin ve calisana durum/oncelik/son tarih ile baglayin.", "Log a task and assign it to an employee with status, priority, and due date.")}</p>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<UserBadgeIcon className="h-4 w-4" />} text={l("الموظف", "Calisan", "Employee")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("إسناد المهمة لموظف محدد.", "Gorevi belirli bir calisana atayin.", "Assign task to a specific employee.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={taskForm.employee} onChange={(e) => setTaskForm((p) => ({ ...p, employee: e.target.value }))} required>
                <option value="">{l("اختر الموظف", "Calisan secin", "Select employee")}</option>
                {employees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.user_username || `#${row.id}`}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<TaskTitleIcon className="h-4 w-4" />} text={l("عنوان المهمة", "Gorev basligi", "Task title")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("اسم مختصر وواضح للمهمة.", "Gorev icin kisa ve net ad.", "Short and clear task name.")}</p>
              <input className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("مثال: متابعة حجوزات اليوم", "Ornek: bugunun rezervasyonlarini takip et", "Example: follow up today's bookings")} value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<TagIcon className="h-4 w-4" />} text={l("نوع المهمة (اختياري)", "Gorev tipi (opsiyonel)", "Task type (optional)")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("لتصنيف المهام (يتحدد من الإعدادات).", "Gorevleri siniflandirmak icin (ayarlardan yonetilir).", "To classify tasks (managed from settings).")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={taskForm.task_type} onChange={(e) => setTaskForm((p) => ({ ...p, task_type: e.target.value }))}>
                <option value="">{l("اختر نوع المهمة", "Gorev tipi secin", "Select task type")}</option>
                {taskTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<StatusIcon className="h-4 w-4" />} text={l("الحالة", "Durum", "Status")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("أين وصلت المهمة الآن.", "Gorevin su anki durumu.", "Current task progress status.")}</p>
                <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="todo">{l("جديدة", "Yeni", "New")}</option>
                  <option value="in_progress">{l("قيد التنفيذ", "Devam ediyor", "In progress")}</option>
                  <option value="done">{l("منجزة", "Tamamlandi", "Done")}</option>
                  <option value="cancelled">{l("ملغاة", "Iptal edildi", "Cancelled")}</option>
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<PriorityIcon className="h-4 w-4" />} text={l("الأولوية", "Oncelik", "Priority")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("درجة الأهمية لتحديد ما يُنجز أولاً.", "Once neyin yapilacagini belirlemek icin onem seviyesi.", "Importance level to prioritize work.")}</p>
                <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}>
                  <option value="low">{l("منخفضة", "Dusuk", "Low")}</option>
                  <option value="medium">{l("متوسطة", "Orta", "Medium")}</option>
                  <option value="high">{l("عالية", "Yuksek", "High")}</option>
                </TypeableSelect>
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<CalendarIcon className="h-4 w-4" />} text={l("تاريخ الاستحقاق (اختياري)", "Son tarih (opsiyonel)", "Due date (optional)")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("آخر موعد مطلوب لإنهاء المهمة.", "Gorevin tamamlanmasi icin son tarih.", "Final date expected to complete task.")}</p>
                <PopupYmdDatePicker
                  value={taskForm.due_date}
                  onChange={(nextIso) => setTaskForm((p) => ({ ...p, due_date: nextIso }))}
                  className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  name="hr_task_due_date"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">{l("الوصف (اختياري)", "Aciklama (opsiyonel)", "Description (optional)")}</label>
              <textarea className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("تفاصيل إضافية عن المهمة", "Gorevle ilgili ek detaylar", "Additional details about the task")} value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-black">{t.commonSave}</button>
          </form>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-2 text-sm">
            {tasks.map((row) => (
              <div key={row.id} className="border-b border-zinc-100 pb-2">
                <div className="flex items-center justify-between">
                  <span>{row.title}</span>
                  <div className="flex items-center gap-2">
                    <span>{employeeName(row.employee)}</span>
                    <button
                      type="button"
                      onClick={() => void deleteTask(row)}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-zinc-600">{[row.task_type, row.status, row.priority, row.due_date || ""].filter(Boolean).join(" - ")}</div>
              </div>
            ))}
            {!tasks.length && <p className="py-6 text-center text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
      )}

      {tab === "salaries" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={addSalary} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
            <div>
              <h2 className="text-sm font-semibold">{l("إضافة مسير راتب", "Maas bordrosu ekle", "Add payroll entry")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{l("مسير الراتب يحسب الصافي = الأساسي + الحوافز − الخصومات.", "Net maas = temel + bonus - kesinti.", "Payroll net = base + bonuses - deductions.")}</p>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<UserBadgeIcon className="h-4 w-4" />} text={l("الموظف", "Calisan", "Employee")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("حدد الموظف الذي سيتم إنشاء مسير راتب له.", "Maas bordrosu olusturulacak calisani secin.", "Select employee to create payroll entry for.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={salaryForm.employee} onChange={(e) => setSalaryForm((p) => ({ ...p, employee: e.target.value }))} required>
                <option value="">{l("اختر الموظف", "Calisan secin", "Select employee")}</option>
                {employees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.user_username || `#${row.id}`}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<TagIcon className="h-4 w-4" />} text={l("نوع الراتب/الاستحقاق (اختياري)", "Maas/odeme tipi (opsiyonel)", "Salary/payment type (optional)")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("لتصنيف المسير (يتحدد من الإعدادات).", "Bordroyu siniflandirmak icin (ayarlardan yonetilir).", "To classify payroll entry (managed from settings).")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={salaryForm.salary_type} onChange={(e) => setSalaryForm((p) => ({ ...p, salary_type: e.target.value }))}>
                <option value="">{l("اختر النوع", "Tur secin", "Select type")}</option>
                {salaryTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<MonthIcon className="h-4 w-4" />} text={l("شهر المسير", "Bordro ayi", "Payroll month")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("اختر الشهر الذي يخصه المسير (مثال: 2026-05).", "Bordronun ait oldugu ayi secin (ornek: 2026-05).", "Select payroll month (example: 2026-05).")}</p>
              <input type="month" className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={salaryForm.period_month} onChange={(e) => setSalaryForm((p) => ({ ...p, period_month: e.target.value }))} required />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("أساسي", "Temel", "Base")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("المبلغ الأساسي ضمن هذا المسير.", "Bu bordrodaki temel tutar.", "Base amount in this payroll.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={salaryForm.base_amount} onChange={(e) => setSalaryForm((p) => ({ ...p, base_amount: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("حوافز", "Bonuslar", "Bonuses")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("إضافات مثل بونص/عمولة.", "Bonus/komisyon gibi ekler.", "Additions like bonus/commission.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={salaryForm.bonus_amount} onChange={(e) => setSalaryForm((p) => ({ ...p, bonus_amount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("خصومات", "Kesintiler", "Deductions")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("اقتطاعات مثل غياب/سلفة.", "Devamsizlik/avans gibi kesintiler.", "Deductions like absence/advance.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={salaryForm.deduction_amount} onChange={(e) => setSalaryForm((p) => ({ ...p, deduction_amount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<StatusIcon className="h-4 w-4" />} text={l("حالة المسير", "Bordro durumu", "Payroll status")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("مسودة/معتمد/مدفوع حسب مرحلة الإجراء.", "Taslak/onayli/odendi durumuna gore.", "Draft/approved/paid by workflow stage.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={salaryForm.status} onChange={(e) => setSalaryForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="draft">{l("مسودة", "Taslak", "Draft")}</option>
                <option value="approved">{l("معتمد", "Onayli", "Approved")}</option>
                <option value="paid">{l("مدفوع", "Odendi", "Paid")}</option>
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">{l("ملاحظات (اختياري)", "Notlar (opsiyonel)", "Notes (optional)")}</label>
              <textarea className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("أي ملاحظات تتعلق بالمسير", "Bordroyla ilgili notlar", "Any notes related to payroll")} value={salaryForm.notes} onChange={(e) => setSalaryForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-black">{t.commonSave}</button>
          </form>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-2 text-sm">
            {salaries.map((row) => (
              <div key={row.id} className="border-b border-zinc-100 pb-2">
                <div className="flex items-center justify-between">
                  <span>{employeeName(row.employee)}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(row.net_amount, currency, lang)}</span>
                    <button
                      type="button"
                      onClick={() => void deleteSalary(row)}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-zinc-600">{[row.salary_type, row.period_month, row.status].filter(Boolean).join(" - ")}</div>
              </div>
            ))}
            {!salaries.length && <p className="py-6 text-center text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
      )}

      {tab === "expenses" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={addExpense} className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-3">
            <div>
              <h2 className="text-sm font-semibold">{l("إضافة مصروف موظف", "Calisan gideri ekle", "Add employee expense")}</h2>
              <p className="mt-1 text-xs text-zinc-500">{l("سجّل مصروف مرتبط بموظف (سلفة، بدل، مواصلات… إلخ) مع الحالة.", "Calisana bagli gider kaydi (avans, odeme, ulasim vb.) ve durum secimi.", "Log employee-related expense (advance, allowance, transport, etc.) with status.")}</p>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<UserBadgeIcon className="h-4 w-4" />} text={l("الموظف", "Calisan", "Employee")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("حدد الموظف الذي يخصه المصروف.", "Giderin ait oldugu calisani secin.", "Select employee this expense belongs to.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={expenseForm.employee} onChange={(e) => setExpenseForm((p) => ({ ...p, employee: e.target.value }))} required>
                <option value="">{l("اختر الموظف", "Calisan secin", "Select employee")}</option>
                {employees.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.user_username || `#${row.id}`}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<TagIcon className="h-4 w-4" />} text={l("نوع المصروف (اختياري)", "Gider tipi (opsiyonel)", "Expense type (optional)")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("لتصنيف المصروف (يتحدد من الإعدادات).", "Gideri siniflandirmak icin (ayarlardan yonetilir).", "To classify expense (managed from settings).")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={expenseForm.expense_type} onChange={(e) => setExpenseForm((p) => ({ ...p, expense_type: e.target.value }))}>
                <option value="">{l("اختر نوع المصروف", "Gider tipi secin", "Select expense type")}</option>
                {expenseTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </TypeableSelect>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<MoneyIcon className="h-4 w-4" />} text={l("المبلغ", "Tutar", "Amount")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("قيمة المصروف المطلوب تسجيله.", "Kaydedilecek gider tutari.", "Expense amount to be recorded.")}</p>
                <input type="number" min={0} className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder="0" value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-1">
                <label className="block">
                  <Label icon={<CalendarIcon className="h-4 w-4" />} text={l("تاريخ المصروف", "Gider tarihi", "Expense date")} />
                </label>
                <p className="text-[11px] text-zinc-500">{l("متى تم دفع/حدوث المصروف.", "Giderin odendigi/olustugu tarih.", "When the expense was paid/incurred.")}</p>
                <PopupYmdDatePicker
                  value={expenseForm.expense_date}
                  onChange={(nextIso) => setExpenseForm((p) => ({ ...p, expense_date: nextIso }))}
                  className="w-full rounded-md mb-input-raised px-3 py-2 text-sm"
                  name="hr_employee_expense_date"
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block">
                <Label icon={<StatusIcon className="h-4 w-4" />} text={l("الحالة", "Durum", "Status")} />
              </label>
              <p className="text-[11px] text-zinc-500">{l("مرفوع/موافق/مرفوض/تم التعويض.", "Gonderildi/onaylandi/reddedildi/geri odendi.", "Submitted/approved/rejected/reimbursed.")}</p>
              <TypeableSelect className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" value={expenseForm.status} onChange={(e) => setExpenseForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="submitted">{l("مرفوع", "Gonderildi", "Submitted")}</option>
                <option value="approved">{l("موافق عليه", "Onaylandi", "Approved")}</option>
                <option value="rejected">{l("مرفوض", "Reddedildi", "Rejected")}</option>
                <option value="reimbursed">{l("تم التعويض", "Geri odendi", "Reimbursed")}</option>
              </TypeableSelect>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">{l("ملاحظات (اختياري)", "Notlar (opsiyonel)", "Notes (optional)")}</label>
              <textarea className="w-full rounded-md mb-input-raised px-3 py-2 text-sm" placeholder={l("أي تفاصيل عن المصروف", "Giderle ilgili detaylar", "Any details about expense")} value={expenseForm.notes} onChange={(e) => setExpenseForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-black">{t.commonSave}</button>
          </form>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm space-y-2 text-sm">
            {expenses.map((row) => (
              <div key={row.id} className="border-b border-zinc-100 pb-2">
                <div className="flex items-center justify-between">
                  <span>{employeeName(row.employee)}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(row.amount, currency, lang)}</span>
                    <button
                      type="button"
                      onClick={() => void deleteEmployeeExpense(row)}
                      className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      aria-label={t.commonDelete}
                      title={t.commonDelete}
                    >
                      <TrashGlyph className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-zinc-600">{[row.expense_type, row.expense_date, row.status].filter(Boolean).join(" - ")}</div>
              </div>
            ))}
            {!expenses.length && <p className="py-6 text-center text-zinc-400">{t.commonNoData}</p>}
          </div>
        </div>
      )}

      {tab === "sales" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-md bg-mb-highlight px-4 py-2 text-sm text-white" onClick={syncSales}>
              {l("مزامنة تلقائية من الحجوزات والتأجير", "Rezervasyon ve kiralamadan otomatik senkronize et", "Auto sync from bookings and rentals")}
            </button>
            <span className="text-sm text-zinc-700">{l("عدد العمليات", "Islem sayisi", "Transactions")}: {salesSummary.totalBookings}</span>
            <span className="text-sm text-zinc-700">{l("الإجمالي", "Toplam", "Total")}: {formatCurrency(salesSummary.gross, currency, lang)}</span>
            <span className="text-sm text-zinc-700">{l("صافي الربح", "Net kar", "Net profit")}: {formatCurrency(salesSummary.profit, currency, lang)}</span>
          </div>
          <div className="rounded-lg mb-card mb-tech-border mb-card-ai p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">{t.hrSales}</h2>
            <div className="space-y-2 text-sm">
              {sales.map((record) => (
                <div key={record.id} className="border-b border-zinc-100 pb-2">
                  <div className="flex items-center justify-between">
                    <span>{record.employee_name || employeeName(record.employee)}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(record.net_profit, currency, lang)}</span>
                      <button
                        type="button"
                        onClick={() => void deleteSalesRecord(record)}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                        aria-label={t.commonDelete}
                        title={t.commonDelete}
                      >
                        <TrashGlyph className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600">
                    {[record.source_type, record.sale_date, `${l("الحجوزات", "Rezervasyonlar", "Bookings")}: ${record.booking_count}`].join(" - ")}
                  </div>
                </div>
              ))}
              {!sales.length && <p className="text-zinc-400">{t.commonNoData}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



