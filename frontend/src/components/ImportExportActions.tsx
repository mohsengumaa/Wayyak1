"use client";

import { useRef, useState } from "react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";

type Props = {
  exportUrl: string;
  importUrl?: string;
  onImported?: () => void;
};

export default function ImportExportActions({ exportUrl, importUrl, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState("");
  const { t } = useI18n();

  const getHeaders = (): Record<string, string> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Token ${token}`;
    }
    return headers;
  };

  const onExport = async () => {
    setStatus("");
    const response = await fetch(exportUrl, { headers: getHeaders() });
    if (!response.ok) {
      setStatus(t.commonExportFail);
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const cd = response.headers.get("content-disposition") || "";
    const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)["']?/i.exec(cd);
    const fileName = m?.[1] ? decodeURIComponent(m[1]) : "export.xlsx";
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!importUrl) return;
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setStatus(t.commonImporting);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(importUrl, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });
    if (!response.ok) {
      setStatus(t.commonImportFail);
      return;
    }
    setStatus(t.commonImportSuccess);
    if (onImported) {
      onImported();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onExport}
        className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100"
      >
        {t.commonExport}
      </button>
      <input ref={inputRef} type="file" className="hidden" onChange={onImport} />
      <button
        type="button"
        onClick={() => importUrl && inputRef.current?.click()}
        disabled={!importUrl}
        className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100"
      >
        {t.commonImport}
      </button>
      {status && <span className="text-xs text-zinc-500">{status}</span>}
    </div>
  );
}



