"use client";

import { useEffect, useState } from "react";
import type { DeleteConfirmFn } from "@/lib/deleteConfirm";

type PendingConfirm = {
  message: string;
  resolve: (accepted: boolean) => void;
};

export default function DeleteConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    const fn: DeleteConfirmFn = (message) =>
      new Promise<boolean>((resolve) => {
        setPending({ message, resolve });
      });

    window.__mbConfirmDeleteDialog = fn;
    return () => {
      delete window.__mbConfirmDeleteDialog;
    };
  }, []);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div className="text-base font-semibold text-zinc-900">تأكيد الحذف</div>
        <p className="mt-2 text-sm text-zinc-700">
          {pending.message || "هل تريد تأكيد الحذف؟"}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => {
              pending.resolve(false);
              setPending(null);
            }}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            onClick={() => {
              pending.resolve(true);
              setPending(null);
            }}
          >
            تأكيد الحذف
          </button>
        </div>
      </div>
    </div>
  );
}

