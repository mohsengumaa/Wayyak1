/**
 * View-level permission codenames aligned with backend `RoleBasedPermission`:
 * GET → `view_<model_name>` (Django auth.Permission codename).
 *
 * - **Section (nav)**: one or more codenames; user sees the section if they have *any* (`canAny` / `hasNavAccess`).
 * - **Sub-pages**: use the narrowest set (e.g. fleet rentals → `view_carrental`).
 */
export const PERMS_VIEW = {
  /** Always shown for any logged-in user (matches dashboard API: authenticated only). */
  dashboard: [] as const,
  clients: ["view_client"] as const,
  reminders: ["view_reminder"] as const,
  vouchers: ["view_voucher"] as const,
  bookings: ["view_booking"] as const,
  hotels: ["view_hotel"] as const,
  /** Room types, seasonal pricing under a hotel */
  hotelRoomType: ["view_roomtype"] as const,
  /** Fleet list / cars */
  fleet: ["view_car"] as const,
  /** Single car detail */
  fleetCar: ["view_car"] as const,
  /** Car rentals under a car */
  fleetRentals: ["view_carrental"] as const,
  /** Flight tickets */
  flights: ["view_flightticket"] as const,
  /**
   * Accounting area: any view permission in the module opens the section
   * (invoices, ledger, journals, etc.).
   */
  accounting: [
    "view_invoice",
    "view_ledgerentry",
    "view_accountentry",
    "view_chartaccount",
    "view_journalentry",
    "view_payment",
    "view_branch",
    "view_costcenter",
    "view_accountingperiod",
    "view_taxcode",
  ] as const,
  /**
   * HR: employees and related resources.
   */
  hr: [
    "view_employee",
    "view_employeetask",
    "view_employeesalary",
    "view_employeeexpense",
    "view_salesrecord",
  ] as const,
  /** Expenses module (company expenses, not HR employee expenses). */
  expenses: ["view_expense"] as const,
  /** Users / roles admin screens */
  users: ["view_user", "view_role"] as const,
  /**
   * Settings: backend uses `IsAuthenticated` only. Keep empty = visible to all logged-in users.
   */
  settings: [] as const,
} as const;

/** Sidebar items: `permission` controls visibility (empty = any authenticated user with capabilities loaded). */
export const NAV_LINK_CONFIG = [
  { href: "/dashboard" as const, key: "dashboard" as const, permission: PERMS_VIEW.dashboard },
  { href: "/clients" as const, key: "clients" as const, permission: PERMS_VIEW.clients },
  { href: "/reminders" as const, key: "reminders" as const, permission: PERMS_VIEW.reminders },
  { href: "/vouchers" as const, key: "vouchers" as const, permission: PERMS_VIEW.vouchers },
  { href: "/bookings" as const, key: "bookings" as const, permission: PERMS_VIEW.bookings },
  { href: "/hotels" as const, key: "hotels" as const, permission: PERMS_VIEW.hotels },
  { href: "/flights" as const, key: "flights" as const, permission: PERMS_VIEW.flights },
  { href: "/fleet" as const, key: "fleet" as const, permission: PERMS_VIEW.fleet },
  { href: "/accounting" as const, key: "accounting" as const, permission: PERMS_VIEW.accounting },
  { href: "/hr" as const, key: "hr" as const, permission: PERMS_VIEW.hr },
  { href: "/expenses" as const, key: "expenses" as const, permission: PERMS_VIEW.expenses },
  { href: "/users" as const, key: "users" as const, permission: PERMS_VIEW.users },
  { href: "/settings" as const, key: "settings" as const, permission: PERMS_VIEW.settings },
] as const;

export type NavKey = (typeof NAV_LINK_CONFIG)[number]["key"];
