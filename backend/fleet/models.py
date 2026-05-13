from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import Client, TimeStampedModel


class Car(TimeStampedModel):
    STATUS_CHOICES = [
        ("available", "Available"),
        ("rented", "Rented"),
        ("maintenance", "Maintenance"),
    ]

    make = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    year = models.PositiveIntegerField()
    plate_number = models.CharField(max_length=50, unique=True)
    daily_rate = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="available")
    location = models.CharField(max_length=150, blank=True)

    def __str__(self) -> str:
        return f"{self.make} {self.model} ({self.plate_number})"


class CarRental(TimeStampedModel):
    car = models.ForeignKey(Car, on_delete=models.PROTECT, related_name="rentals")
    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="car_rentals"
    )
    assigned_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="car_rentals",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    pickup_location = models.CharField(max_length=150)
    dropoff_location = models.CharField(max_length=150)
    price_per_day = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    booked_at = models.DateTimeField(default=timezone.now)

    def _days(self) -> int:
        return max((self.end_date - self.start_date).days, 1)

    def calculate_total(self) -> None:
        self.total_price = Decimal(self._days()) * self.price_per_day

    def save(self, *args, **kwargs):
        if not self.price_per_day:
            self.price_per_day = self.car.daily_rate
        self.calculate_total()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.client} - {self.car}"


class FlightTicket(TimeStampedModel):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("reserved", "Reserved"),
        ("issued", "Issued"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
    ]
    TRIP_TYPE_CHOICES = [
        ("one_way", "One way"),
        ("round_trip", "Round trip"),
        ("multi_city", "Multi city"),
    ]

    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="flight_tickets"
    )
    assigned_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="flight_tickets",
    )
    passenger_name = models.CharField(max_length=200)
    passport_number = models.CharField(max_length=80, blank=True)
    airline = models.CharField(max_length=120, blank=True)
    ticket_number = models.CharField(max_length=120, blank=True)
    pnr = models.CharField(max_length=80, blank=True)
    trip_type = models.CharField(max_length=20, choices=TRIP_TYPE_CHOICES, default="one_way")
    departure_airport = models.CharField(max_length=80)
    arrival_airport = models.CharField(max_length=80)
    departure_datetime = models.DateTimeField()
    return_datetime = models.DateTimeField(null=True, blank=True)
    buying_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    buying_currency = models.CharField(max_length=3, default="USD")
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_currency = models.CharField(max_length=3, default="USD")
    service_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_fee_currency = models.CharField(max_length=3, default="USD")
    currency = models.CharField(max_length=3, default="USD")
    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    notes = models.TextField(blank=True)
    booked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-departure_datetime", "-id"]

    def calculate_totals(self) -> None:
        self.total_price = Decimal(self.selling_price or 0) + Decimal(self.service_fee or 0)
        self.net_profit = self.total_price - Decimal(self.buying_price or 0)

    def save(self, *args, **kwargs):
        self.calculate_totals()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.passenger_name} {self.departure_airport}-{self.arrival_airport}"
