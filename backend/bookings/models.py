from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import Client, Referrer, TimeStampedModel
from hotels.models import Hotel, RoomType, SeasonalPricing


class Voucher(TimeStampedModel):
    voucher_nr = models.CharField(
        primary_key=True,
        max_length=56,
        db_column="Voucher_Nr",
        verbose_name="Voucher Nr",
    )
    issued_at = models.DateTimeField(default=timezone.now)
    sale_date = models.DateField(null=True, blank=True)
    destination_code = models.CharField(max_length=10, blank=True)
    sequence_number = models.PositiveIntegerField(null=True, blank=True)
    referrer = models.ForeignKey(
        Referrer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="vouchers",
    )
    client_title = models.CharField(
        max_length=2,
        blank=True,
        choices=[("mr", "Mr"), ("ms", "Ms")],
        help_text="Salutation before client name on prints (Mr / Ms).",
    )
    client = models.ForeignKey(
        Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="vouchers"
    )
    client_name = models.CharField(max_length=200, blank=True)
    adult_count = models.PositiveIntegerField(default=0)
    child_count = models.PositiveIntegerField(default=0)
    infant_count = models.PositiveIntegerField(default=0)
    extra_bed_count = models.PositiveIntegerField(default=0)

    transfer_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    transfer_buying_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    transfer_currency = models.CharField(max_length=3, default="USD")
    handling_fee_per_pax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    handling_currency = models.CharField(max_length=3, default="USD")
    exchange_rate_eur_to_usd = models.DecimalField(
        max_digits=12, decimal_places=4, default=Decimal("1.0000")
    )

    notes = models.TextField(blank=True)
    flight_details = models.TextField(blank=True)
    data_entry_confirmed = models.BooleanField(default=False)
    voucher_issued = models.BooleanField(default=False)
    client_confirmed = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Voucher {self.voucher_nr}"

    @property
    def total_pax(self) -> int:
        return self.adult_count + self.child_count + self.infant_count

    @property
    def handling_fee_total(self) -> Decimal:
        return Decimal(self.total_pax) * Decimal(self.handling_fee_per_pax)


class Passenger(TimeStampedModel):
    full_name = models.CharField(max_length=200)
    passport_number = models.CharField(max_length=50, unique=True)
    nationality = models.CharField(max_length=50, blank=True)
    birth_date = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.full_name} ({self.passport_number})"


class VoucherGuest(TimeStampedModel):
    voucher = models.ForeignKey(
        Voucher, on_delete=models.CASCADE, related_name="guests"
    )
    salutation = models.CharField(
        max_length=3,
        blank=True,
        choices=[
            ("mr", "Mr"),
            ("ms", "Ms"),
            ("chd", "طفل"),
            ("inf", "رضيع"),
        ],
        help_text="Shown before guest name on voucher prints.",
    )
    full_name = models.CharField(max_length=200)
    passport_number = models.CharField(max_length=50, blank=True)
    child_age = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Age in years when salutation is child (chd); shown on guest list PDF.",
    )
    is_leader = models.BooleanField(default=False)
    passenger = models.ForeignKey(
        Passenger, on_delete=models.SET_NULL, null=True, blank=True, related_name="voucher_guests"
    )
    room = models.ForeignKey(
        "VoucherRoom", on_delete=models.SET_NULL, null=True, blank=True, related_name="guests"
    )

    class Meta:
        ordering = ["-is_leader", "full_name"]

    def __str__(self) -> str:
        return self.full_name


class VoucherReservation(TimeStampedModel):
    voucher = models.ForeignKey(
        Voucher, on_delete=models.CASCADE, related_name="reservations"
    )
    hotel = models.ForeignKey(
        Hotel, on_delete=models.PROTECT, related_name="voucher_reservations"
    )
    room_type = models.ForeignKey(
        RoomType, on_delete=models.PROTECT, related_name="voucher_reservations"
    )
    room_type_code = models.CharField(max_length=10, default="GUES")
    board_code = models.CharField(max_length=10, default="BB")
    room_code = models.CharField(max_length=10, default="DBL")
    room_count = models.PositiveIntegerField(default=1)
    selling_date = models.DateField(null=True, blank=True)
    adult_count = models.PositiveIntegerField(default=0)
    child_count = models.PositiveIntegerField(default=0)
    infant_count = models.PositiveIntegerField(default=0)
    extra_bed = models.BooleanField(default=False)
    promotion_room = models.BooleanField(default=False)
    honey_moons = models.BooleanField(default=False)
    free_of_charge = models.BooleanField(default=False)

    check_in = models.DateField()
    check_out = models.DateField()
    confirmation_number = models.CharField(max_length=80, blank=True)
    hotel_invoice_ref = models.CharField(
        max_length=120,
        blank=True,
        verbose_name="Hotel invoice ref",
        help_text="رقم فاتورة الفندق كما يصدر من الأوتيل (مرجع خارجي، ليس رقم سند المحاسبة).",
    )
    room_nr = models.CharField(max_length=50, blank=True)
    external_voucher_no = models.CharField(max_length=80, blank=True)

    buying_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    buying_currency = models.CharField(max_length=3, default="EUR")
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_currency = models.CharField(max_length=3, default="USD")
    reservation_notes = models.TextField(blank=True)
    hotel_note = models.TextField(blank=True)
    internal_note = models.TextField(blank=True)
    transfer_note = models.TextField(blank=True)
    operator_note = models.TextField(blank=True)
    allotment_type = models.CharField(max_length=50, blank=True)
    hotel_confirmation = models.CharField(max_length=50, blank=True)
    operator_confirmation = models.CharField(max_length=50, blank=True)
    reservation_status = models.CharField(max_length=50, blank=True)
    reservation_type = models.CharField(max_length=50, blank=True)
    print_option = models.CharField(max_length=50, blank=True)
    special_code = models.CharField(max_length=50, blank=True)
    code_2 = models.CharField(max_length=50, blank=True)
    code_3 = models.CharField(max_length=50, blank=True)
    code_4 = models.CharField(max_length=50, blank=True)
    spo_spec_code = models.CharField(max_length=50, blank=True)
    package_splitting = models.BooleanField(default=False)
    index_nr = models.CharField(max_length=50, blank=True)
    bubble = models.BooleanField(default=False)
    passive = models.BooleanField(default=False)
    free_sale = models.BooleanField(default=False)
    local_service = models.BooleanField(default=False)
    voucher_form_printing = models.CharField(max_length=50, blank=True)
    confirmation_form_print = models.CharField(max_length=50, blank=True)
    arrival_transfer = models.BooleanField(default=False)
    arrival_transfer_date = models.DateField(null=True, blank=True)
    arrival_transfer_type = models.CharField(max_length=50, blank=True)
    departure_transfer = models.BooleanField(default=False)
    departure_transfer_date = models.DateField(null=True, blank=True)
    departure_transfer_type = models.CharField(max_length=50, blank=True)
    handling_fee_type = models.CharField(max_length=50, blank=True)
    extras_prices = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-extra prices keyed by extra field key, ex: {'extra_bed': {'buying_price': 10, 'selling_price': 15}}",
    )
    amended_on_voucher_pdf = models.BooleanField(
        default=False,
        help_text="True after this reservation row is updated via API; voucher PDF shows معدل.",
    )
    hotel_pdf_previous_snapshot = models.JSONField(
        default=dict,
        blank=True,
        help_text="Last values shown on hotel voucher before this row was edited (PDF «كان» hints).",
    )

    def __str__(self) -> str:
        return f"{self.voucher.voucher_nr} - {self.hotel.name}"


class VoucherRoom(TimeStampedModel):
    reservation = models.ForeignKey(
        VoucherReservation, on_delete=models.CASCADE, related_name="rooms"
    )
    room_number = models.PositiveIntegerField()
    room_code = models.CharField(max_length=10, default="DBL")

    class Meta:
        unique_together = ("reservation", "room_number")

    def __str__(self) -> str:
        return f"{self.reservation} Room {self.room_number}"


class Booking(TimeStampedModel):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    hotel = models.ForeignKey(Hotel, on_delete=models.PROTECT, related_name="bookings")
    room_type = models.ForeignKey(
        RoomType, on_delete=models.PROTECT, related_name="bookings"
    )
    client = models.ForeignKey(
        Client, on_delete=models.PROTECT, related_name="bookings"
    )
    assigned_employee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )

    check_in = models.DateField()
    check_out = models.DateField()

    commission_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=0
    )
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    extra_charge = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    include_breakfast = models.BooleanField(default=False)
    breakfast_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    room_price_per_night = models.DecimalField(max_digits=12, decimal_places=2)

    total_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    booked_at = models.DateTimeField(default=timezone.now)

    def _nights(self) -> int:
        return max((self.check_out - self.check_in).days, 1)

    def calculate_totals(self) -> None:
        nights = Decimal(self._nights())
        base = nights * self.room_price_per_night
        breakfast_total = (
            nights * self.breakfast_price if self.include_breakfast else Decimal("0")
        )
        commission_total = (self.commission_percent / Decimal("100")) * base
        discount_total = (
            (self.discount_percent / Decimal("100")) * (base + breakfast_total)
            + self.discount_value
        )
        total = base + breakfast_total + self.extra_charge + commission_total - discount_total
        net_profit = total - (base + breakfast_total)

        self.total_price = max(total, Decimal("0"))
        self.net_profit = max(net_profit, Decimal("0"))

    def save(self, *args, **kwargs):
        if not self.room_price_per_night:
            seasonal = (
                SeasonalPricing.objects.filter(
                    room_type=self.room_type,
                    start_date__lte=self.check_in,
                    end_date__gte=self.check_in,
                )
                .order_by("start_date")
                .first()
            )
            if seasonal:
                self.room_price_per_night = seasonal.price_per_night
        if not self.room_price_per_night:
            self.room_price_per_night = self.room_type.base_price
        if not self.breakfast_price:
            self.breakfast_price = self.room_type.breakfast_price
        self.calculate_totals()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.client} - {self.hotel} ({self.check_in})"
