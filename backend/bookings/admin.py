from django.contrib import admin

from .models import Voucher, VoucherGuest, VoucherReservation


class VoucherGuestInline(admin.TabularInline):
    model = VoucherGuest
    extra = 0


class VoucherReservationInline(admin.TabularInline):
    model = VoucherReservation
    extra = 0


@admin.register(Voucher)
class VoucherAdmin(admin.ModelAdmin):
    list_display = ("voucher_nr", "issued_at", "client_name")
    search_fields = ("voucher_nr", "client_name")
    inlines = [VoucherGuestInline, VoucherReservationInline]

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        voucher = form.instance
        if change:
            voucher.reservations.update(amended_on_voucher_pdf=True)
        else:
            voucher.reservations.update(
                amended_on_voucher_pdf=False,
                hotel_pdf_previous_snapshot={},
            )
