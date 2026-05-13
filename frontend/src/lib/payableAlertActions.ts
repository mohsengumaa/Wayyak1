import { api } from "@/lib/api";

/** تحديث سجل المصروف في قسم المصاريف عند تأكيد «تم الدفع» من التنبيه. */
export function markExpensePaidFromAlert(expenseId: number) {
  return api.patch<unknown>(`/expenses/${expenseId}/`, { payment_status: "paid" });
}

/** تحديث فاتورة المورد (دفعة فندق) في المحاسبة عند تأكيد «تم الدفع» من التنبيه. */
export function markApBillPaidFromAlert(invoiceId: number) {
  return api.patch<unknown>(`/invoices/${invoiceId}/`, { status: "paid" });
}
