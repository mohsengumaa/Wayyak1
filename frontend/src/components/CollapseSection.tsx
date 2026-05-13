"use client";

import { ReactNode, useState } from "react";

type CollapseSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export default function CollapseSection({ title, children, defaultOpen = false }: CollapseSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg border border-zinc-100 bg-zinc-50/50">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-start"
      >
        <span className="text-sm font-semibold text-zinc-800">{title}</span>
        <span className="text-xs text-zinc-500">{open ? "إخفاء" : "عرض"}</span>
      </button>
      {open && <div className="border-t border-zinc-100 p-4">{children}</div>}
    </section>
  );
}
