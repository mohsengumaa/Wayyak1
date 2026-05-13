from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from bookings.models import Booking
from expenses.models import Expense
from fleet.models import CarRental

from .models import ChartAccount, Invoice, Payment, PaymentAllocation, LedgerEntry
from .posting import post_invoice, post_payment


@receiver(post_save, sender=Booking)
def create_booking_ledger(sender, instance, created, **kwargs):
    if not created:
        return
    LedgerEntry.objects.create(
        date=instance.booked_at.date(),
        description=f"Booking revenue: {instance.hotel.name}",
        debit=0,
        credit=instance.total_price,
        reference_type="booking",
        reference_id=instance.id,
    )


@receiver(post_save, sender=CarRental)
def create_car_rental_ledger(sender, instance, created, **kwargs):
    if not created:
        return
    LedgerEntry.objects.create(
        date=instance.booked_at.date(),
        description=f"Car rental revenue: {instance.car}",
        debit=0,
        credit=instance.total_price,
        reference_type="car_rental",
        reference_id=instance.id,
    )


@receiver(post_save, sender=Expense)
def create_expense_ledger(sender, instance, created, **kwargs):
    if not created:
        return
    desc = f"Expense: {instance.category.label}"
    if instance.account_id:
        try:
            desc += f" [{ChartAccount.objects.only('code').get(pk=instance.account_id).code}]"
        except ChartAccount.DoesNotExist:
            pass
    if instance.vendor_name:
        desc += f" ({instance.vendor_name})"
    elif instance.company_name:
        desc += f" ({instance.company_name})"
    LedgerEntry.objects.create(
        date=instance.date,
        description=desc[:255],
        debit=instance.amount,
        credit=0,
        reference_type="expense",
        reference_id=instance.id,
    )


@receiver(post_save, sender=Invoice)
def post_invoice_to_gl(sender, instance, created, **kwargs):
    # Post when created/updated (non-draft)
    try:
        post_invoice(instance.id)
    except Exception:
        # Keep API responsive; strict period enforcement added later
        return


@receiver(post_save, sender=Payment)
def post_payment_to_gl(sender, instance, created, **kwargs):
    try:
        post_payment(instance.id)
    except Exception:
        return


@receiver(post_save, sender=PaymentAllocation)
def update_invoice_status_on_allocation(sender, instance, created, **kwargs):
    # If invoice fully allocated -> mark as paid
    inv = instance.invoice
    allocated = inv.allocations.aggregate(s=models.Sum("amount")).get("s") or 0
    if allocated >= inv.total_amount and inv.status != "paid":
        Invoice.objects.filter(id=inv.id).update(status="paid")
