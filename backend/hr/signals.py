from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from bookings.models import Booking
from fleet.models import CarRental

from .models import Employee, SalesRecord


def sync_booking_sales_record(instance: Booking) -> None:
    if not instance.assigned_employee:
        SalesRecord.objects.filter(booking_id=instance.id).delete()
        return
    try:
        employee = Employee.objects.get(user=instance.assigned_employee)
    except Employee.DoesNotExist:
        SalesRecord.objects.filter(booking_id=instance.id).delete()
        return
    SalesRecord.objects.update_or_create(
        booking_id=instance.id,
        defaults={
            "employee": employee,
            "source_type": "booking",
            "booking_count": 1,
            "gross_amount": instance.total_price,
            "net_profit": instance.net_profit,
            "sale_date": instance.booked_at.date(),
            "notes": f"Booking status: {instance.status}",
        },
    )


def sync_car_rental_sales_record(instance: CarRental) -> None:
    if not instance.assigned_employee:
        SalesRecord.objects.filter(car_rental_id=instance.id).delete()
        return
    try:
        employee = Employee.objects.get(user=instance.assigned_employee)
    except Employee.DoesNotExist:
        SalesRecord.objects.filter(car_rental_id=instance.id).delete()
        return
    SalesRecord.objects.update_or_create(
        car_rental_id=instance.id,
        defaults={
            "employee": employee,
            "source_type": "car_rental",
            "booking_count": 1,
            "gross_amount": instance.total_price,
            "net_profit": instance.total_price,
            "sale_date": instance.booked_at.date(),
            "notes": "Car rental sale",
        },
    )


@receiver(post_save, sender=Booking)
def create_booking_sales_record(sender, instance, **kwargs):
    sync_booking_sales_record(instance)


@receiver(post_delete, sender=Booking)
def delete_booking_sales_record(sender, instance, **kwargs):
    SalesRecord.objects.filter(booking_id=instance.id).delete()


@receiver(post_save, sender=CarRental)
def create_car_rental_sales_record(sender, instance, **kwargs):
    sync_car_rental_sales_record(instance)


@receiver(post_delete, sender=CarRental)
def delete_car_rental_sales_record(sender, instance, **kwargs):
    SalesRecord.objects.filter(car_rental_id=instance.id).delete()
