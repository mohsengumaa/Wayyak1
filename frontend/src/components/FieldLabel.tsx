import type { ReactNode } from "react";

export default function FieldLabel({
  icon,
  text,
  hint,
}: {
  icon?: ReactNode;
  text: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
        {icon ? <span className="text-zinc-500">{icon}</span> : null}
        <span>{text}</span>
      </div>
      {hint ? <div className="text-[11px] leading-relaxed text-zinc-500">{hint}</div> : null}
    </div>
  );
}

