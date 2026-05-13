from django.db import models

from core.models import TimeStampedModel


class Hotel(TimeStampedModel):
    name = models.CharField(max_length=200)
    location = models.CharField(max_length=200, blank=True, default="")
    contact_info = models.TextField(blank=True)
    description = models.TextField(blank=True)
    address = models.TextField(blank=True)
    email_1 = models.EmailField(blank=True)
    email_2 = models.EmailField(blank=True)
    email_3 = models.EmailField(blank=True)
    phone_1 = models.CharField(max_length=50, blank=True)
    phone_2 = models.CharField(max_length=50, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    child_policy = models.TextField(blank=True)
    check_in_time = models.CharField(max_length=20, blank=True)
    check_out_time = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    child_policy = models.TextField(blank=True)
    check_in_time = models.CharField(max_length=20, blank=True)
    check_out_time = models.CharField(max_length=20, blank=True)

    def __str__(self) -> str:
        return self.name


class RoomType(TimeStampedModel):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="room_types")
    name = models.CharField(max_length=150)
    room_kind = models.CharField(max_length=100, blank=True)
    capacity = models.PositiveIntegerField(default=1)
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    breakfast_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self) -> str:
        return f"{self.hotel.name} - {self.name}"


class SeasonalPricing(TimeStampedModel):
    room_type = models.ForeignKey(
        RoomType, on_delete=models.CASCADE, related_name="seasonal_prices"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    price_per_night = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self) -> str:
        return f"{self.room_type} ({self.start_date} - {self.end_date})"
