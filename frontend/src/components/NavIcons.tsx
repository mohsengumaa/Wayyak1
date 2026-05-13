import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function BaseIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    />
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 13h7V3H3v10zM14 21h7V11h-7v10zM14 3h7v5h-7V3zM3 18h7v3H3v-3z" />
    </BaseIcon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.6-2-3.5-2.4 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6H9l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.6a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.6 2 3.5 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h6l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6z" />
    </BaseIcon>
  );
}

export function ClientIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    </BaseIcon>
  );
}

export function ReminderIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </BaseIcon>
  );
}

export function VoucherIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 4h16v5a2 2 0 0 1 0 6v5H4v-5a2 2 0 0 0 0-6V4z" />
      <path d="M9 9h6M9 15h6" />
    </BaseIcon>
  );
}

export function BookingIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 10h18" />
      <path d="M7 3v4M17 3v4" />
      <rect x="3" y="6" width="18" height="15" rx="2" />
      <path d="M7 14h4" />
    </BaseIcon>
  );
}

export function HotelIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-4h6v4" />
      <path d="M9 9h.01M12 9h.01M15 9h.01" />
    </BaseIcon>
  );
}

export function FlightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 16l20-5-20-5 5 5-5 5z" />
      <path d="M10 11v8" />
    </BaseIcon>
  );
}

export function FleetIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 16l1-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2l1 5" />
      <path d="M7 16h10" />
      <circle cx="8" cy="16.5" r="1.5" />
      <circle cx="16" cy="16.5" r="1.5" />
    </BaseIcon>
  );
}

export function AccountingIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M8.5 7h7" />
      <path d="M8.5 11h2M13 11h2" />
      <path d="M8.5 15h2M13 15h2" />
    </BaseIcon>
  );
}

export function HrIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
      <path d="M19 8h2M20 7v2" />
    </BaseIcon>
  );
}

export function ExpenseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 2h12v20H6z" />
      <path d="M9 6h6M9 10h6M9 14h6" />
    </BaseIcon>
  );
}

