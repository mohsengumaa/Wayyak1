import type { NavKey } from "@/lib/modulePermissions";

export type SettingValueType = "string" | "boolean" | "number" | "json";

export type ModuleSettingDef = {
  module: NavKey;
  key: string;
  label: string;
  description: string;
  valueType: SettingValueType;
  defaultValue: string;
};

export const MODULE_UI_SECTIONS: Array<{ key: NavKey; label: string }> = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "clients", label: "العملاء" },
  { key: "reminders", label: "التذكيرات" },
  { key: "vouchers", label: "الحجوزات" },
  { key: "bookings", label: "الحجوزات" },
  { key: "hotels", label: "الفنادق" },
  { key: "flights", label: "الطيران" },
  { key: "fleet", label: "السيارات" },
  { key: "accounting", label: "المحاسبة" },
  { key: "hr", label: "الموارد البشرية" },
  { key: "expenses", label: "المصاريف" },
  { key: "users", label: "المستخدمين" },
  { key: "settings", label: "الإعدادات" },
];

export const MODULE_SETTINGS_REGISTRY: ModuleSettingDef[] = [
  {
    module: "bookings",
    key: "page_title",
    label: "عنوان صفحة الحجوزات",
    description: "العنوان الرئيسي الظاهر أعلى صفحة الحجوزات.",
    valueType: "string",
    defaultValue: "",
  },
  {
    module: "bookings",
    key: "show_guest_list",
    label: "إظهار قسم قائمة النزلاء",
    description: "إظهار/إخفاء بطاقة النزلاء في واجهة الحجوزات.",
    valueType: "boolean",
    defaultValue: "true",
  },
  {
    module: "hotels",
    key: "page_title",
    label: "عنوان صفحة الفنادق",
    description: "العنوان الرئيسي الظاهر أعلى صفحة الفنادق.",
    valueType: "string",
    defaultValue: "",
  },
  {
    module: "hotels",
    key: "show_booking_filters",
    label: "إظهار فلاتر الحجوزات",
    description: "إظهار/إخفاء قسم فلاتر وإحصائيات حجوزات الفنادق.",
    valueType: "boolean",
    defaultValue: "true",
  },
  {
    module: "flights",
    key: "page_title",
    label: "عنوان صفحة الطيران",
    description: "عنوان صفحة تذاكر الطيران.",
    valueType: "string",
    defaultValue: "",
  },
  {
    module: "flights",
    key: "default_status",
    label: "الحالة الافتراضية للتذكرة",
    description: "القيمة الافتراضية لحالة التذكرة الجديدة.",
    valueType: "string",
    defaultValue: "draft",
  },
  {
    module: "expenses",
    key: "page_title",
    label: "عنوان صفحة المصاريف",
    description: "العنوان الرئيسي الظاهر أعلى صفحة المصاريف.",
    valueType: "string",
    defaultValue: "",
  },
  {
    module: "expenses",
    key: "default_payment_status",
    label: "حالة السداد الافتراضية",
    description: "الحالة الافتراضية لسداد المصروف عند الإنشاء.",
    valueType: "string",
    defaultValue: "unpaid",
  },
  {
    module: "accounting",
    key: "page_title",
    label: "عنوان صفحة المحاسبة",
    description: "العنوان الرئيسي الظاهر أعلى صفحة المحاسبة.",
    valueType: "string",
    defaultValue: "",
  },
  {
    module: "accounting",
    key: "default_tab",
    label: "التبويب الافتراضي",
    description: "التبويب الافتراضي عند فتح صفحة المحاسبة.",
    valueType: "string",
    defaultValue: "invoices",
  },
];

export function moduleSettingKey(moduleName: ModuleSettingDef["module"], key: string): string {
  return `${moduleName}.ui.${key}`;
}
