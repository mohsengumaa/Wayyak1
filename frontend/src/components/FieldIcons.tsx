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

export function UserIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </BaseIcon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 8l9 6 9-6" />
    </BaseIcon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2A19 19 0 0 1 3.1 6.2 2 2 0 0 1 5 4h3a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l.9-1.1a2 2 0 0 1 2.1-.5c.7.3 1.5.5 2.3.6A2 2 0 0 1 22 16.9z" />
    </BaseIcon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </BaseIcon>
  );
}

export function RoleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 2l7 4v6c0 5-3 9-7 10C8 21 5 17 5 12V6l7-4z" />
      <path d="M9 12l2 2 4-5" />
    </BaseIcon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </BaseIcon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 13l-7 7-10-10V3h7l10 10z" />
      <path d="M7.5 7.5h.01" />
    </BaseIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4" />
      <path d="M3 9h18" />
    </BaseIcon>
  );
}

export function IdCardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h6" />
      <path d="M7 9h.01" />
      <path d="M15 9h2" />
      <path d="M15 13h2" />
    </BaseIcon>
  );
}

export function PlaneIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2 16l20-5-20-5 5 5-5 5z" />
      <path d="M10 11v8" />
    </BaseIcon>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 1 0-4V7z" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </BaseIcon>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </BaseIcon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </BaseIcon>
  );
}

export function MoneyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M17 14h.01" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </BaseIcon>
  );
}

export function NotesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3h8l3 3v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M16 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </BaseIcon>
  );
}

export function StatusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3v18" />
      <path d="M12 4l7 4-7 4-7-4 7-4z" />
    </BaseIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </BaseIcon>
  );
}

export function PriorityIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3l7 7-7 7-7-7 7-7z" />
      <path d="M12 7v6" />
      <path d="M12 17h0.01" />
    </BaseIcon>
  );
}

