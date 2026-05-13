"use client";

type PdfOpenMode = "preview" | "print";

type OpenPdfOptions = {
  mode?: PdfOpenMode;
  downloadFileName?: string;
  windowFeatures?: string;
};

export function openPdfUrlWithFallback(url: string, options: OpenPdfOptions = {}): boolean {
  const mode = options.mode || "preview";
  const opened = window.open(url, "_blank", options.windowFeatures || "noopener,noreferrer");
  if (opened) {
    if (mode === "print") {
      const triggerPrint = () => {
        try {
          opened.focus();
          opened.print();
        } catch {
          // no-op
        }
      };
      window.setTimeout(triggerPrint, 1200);
    }
    return true;
  }

  if (mode === "print") {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = url;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 1200);
    }, 250);
    return false;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = options.downloadFileName || `document-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return false;
}

export function openPdfBlobWithFallback(blob: Blob, options: OpenPdfOptions = {}): boolean {
  const url = URL.createObjectURL(blob);
  const opened = openPdfUrlWithFallback(url, options);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return opened;
}
