export type DeleteConfirmFn = (message: string) => Promise<boolean>;

declare global {
  interface Window {
    __mbConfirmDeleteDialog?: DeleteConfirmFn;
  }
}

export function requestDeleteConfirm(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (typeof window.__mbConfirmDeleteDialog === "function") {
    return window.__mbConfirmDeleteDialog(message);
  }
  // Safe fallback if host dialog is not mounted yet.
  return Promise.resolve(window.confirm(message));
}

