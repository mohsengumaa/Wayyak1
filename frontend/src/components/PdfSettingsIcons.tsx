import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

export function PdfDocIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
    </svg>
  );
}

export function PdfLayersIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfImageIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfUploadIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfEyeIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PdfTypeIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M4 7V4h16v3M9 20h6M12 4v16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfContrastIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" strokeLinecap="round" />
    </svg>
  );
}

export function PdfDropletIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfTextLinesIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h6M9 9h2" strokeLinecap="round" />
    </svg>
  );
}

export function PdfRulerIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M21.3 8.7l-5.6-5.6a2 2 0 0 0-2.8 0L2.7 13.3a2 2 0 0 0 0 2.8l5.6 5.6a2 2 0 0 0 2.8 0L21.3 11.5a2 2 0 0 0 0-2.8z" strokeLinejoin="round" />
      <path d="M7.5 10.5L14 4M10 14l4-4" strokeLinecap="round" />
    </svg>
  );
}

export function PdfUserIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfCreditCardIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <path d="M1 10h22" />
    </svg>
  );
}

export function PdfBedIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M2 4v16M2 12h18a2 2 0 0 1 2 2v4M2 8h7l3 3h10M7 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfShieldIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfUsersIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfSparklesIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function PdfInfoIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

export function PdfSigmaIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M18 7V5H7l5 7-5 7h11v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PdfFooterIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 17h18M8 21h8" strokeLinecap="round" />
    </svg>
  );
}

export function PdfHotelIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9h.01M15 9h.01M12 9h.01" strokeLinecap="round" />
    </svg>
  );
}

export function PdfLangIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function PdfPlusLineIcon({ className = "h-4 w-4", ...p }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden {...p}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
