from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import VoucherGuest, VoucherReservation


def _mark_voucher_reservations_amended(voucher_id: int | None) -> None:
    if not voucher_id:
        return
    VoucherReservation.objects.filter(voucher_id=voucher_id).update(amended_on_voucher_pdf=True)


@receiver(post_save, sender=VoucherGuest)
def voucherguest_saved_mark_amended(sender, instance, **kwargs):
    _mark_voucher_reservations_amended(instance.voucher_id)


@receiver(post_delete, sender=VoucherGuest)
def voucherguest_deleted_mark_amended(sender, instance, **kwargs):
    vid = getattr(instance, "voucher_id", None)
    if vid and VoucherReservation.objects.filter(voucher_id=vid).exists():
        _mark_voucher_reservations_amended(vid)


@receiver(post_delete, sender=VoucherReservation)
def voucherreservation_deleted_mark_amended(sender, instance, **kwargs):
    vid = getattr(instance, "voucher_id", None)
    if vid and VoucherReservation.objects.filter(voucher_id=vid).exists():
        _mark_voucher_reservations_amended(vid)
