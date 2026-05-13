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

export function UserBadgeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
      <path d="M19 6h2M20 5v2" />
    </BaseIcon>
  );
}

export function DepartmentIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M7 7v14M17 7v14" />
      <path d="M5 21h14" />
      <path d="M9 11h2M13 11h2M9 15h2M13 15h2" />
    </BaseIcon>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M4 13h16" />
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

export function ClockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
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

export function NotesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 3h8l3 3v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M16 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </BaseIcon>
  );
}

export function TaskTitleIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 7h14" />
      <path d="M7 12h14" />
      <path d="M7 17h10" />
      <path d="M3.5 7.5l1 1 2-2" />
      <path d="M3.5 12.5l1 1 2-2" />
      <path d="M3.5 17.5l1 1 2-2" />
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

export function PriorityIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3l7 7-7 7-7-7 7-7z" />
      <path d="M12 7v6" />
      <path d="M12 17h0.01" />
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

export function MonthIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4" />
      <path d="M3 9h18" />
      <path d="M7 13h4M7 17h6" />
    </BaseIcon>
  );
}

export function PlusMinusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 7h10" />
      <path d="M12 12v8" />
      <path d="M7 12h10" />
      <path d="M7 17h10" />
    </BaseIcon>
  );
}

