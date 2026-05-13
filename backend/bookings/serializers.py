from rest_framework import serializers

from core.models import Referrer
from core.serializers import ReferrerMinimalSerializer

from .models import Booking, Passenger, Voucher, VoucherGuest, VoucherReservation, VoucherRoom
from .reservation_pdf_snapshot import build_reservation_display_snapshot
from .voucher_numbering import allocate_voucher_nr


class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = [
            "id",
            "hotel",
            "room_type",
            "client",
            "assigned_employee",
            "check_in",
            "check_out",
            "commission_percent",
            "discount_percent",
            "discount_value",
            "extra_charge",
            "include_breakfast",
            "breakfast_price",
            "room_price_per_night",
            "total_price",
            "net_profit",
            "status",
            "booked_at",
        ]
        read_only_fields = ["total_price", "net_profit", "booked_at"]


class VoucherGuestSerializer(serializers.ModelSerializer):
    reservation_index = serializers.IntegerField(write_only=True, required=False)
    room_number = serializers.IntegerField(write_only=True, required=False)
    room_reservation_id = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VoucherGuest
        fields = [
            "id",
            "salutation",
            "full_name",
            "passport_number",
            "child_age",
            "is_leader",
            "room",
            "room_reservation_id",
            "reservation_index",
            "room_number",
        ]

    @staticmethod
    def get_room_reservation_id(obj):
        if getattr(obj, "room_id", None):
            return obj.room.reservation_id
        return None


class VoucherReservationSerializer(serializers.ModelSerializer):
    amended_on_voucher_pdf = serializers.BooleanField(read_only=True)
    hotel_pdf_previous_snapshot = serializers.JSONField(read_only=True)

    def validate(self, attrs):
        merged_status = attrs.get("reservation_status", None)
        merged_conf = attrs.get("confirmation_number", None)
        if self.instance is not None:
            if merged_status is None:
                merged_status = self.instance.reservation_status
            if merged_conf is None:
                merged_conf = self.instance.confirmation_number
        else:
            merged_status = merged_status or ""
            merged_conf = merged_conf or ""
        st = (merged_status or "").strip().lower()
        conf = (merged_conf or "").strip()
        if st == "confirmed" and not conf:
            raise serializers.ValidationError(
                "لا يمكن وضع حالة Confirmed دون رقم تأكيد (رقم الحجز)."
            )
        return attrs

    class Meta:
        model = VoucherReservation
        fields = [
            "id",
            "hotel",
            "room_type",
            "room_type_code",
            "board_code",
            "room_code",
            "room_count",
            "selling_date",
            "adult_count",
            "child_count",
            "infant_count",
            "extra_bed",
            "promotion_room",
            "honey_moons",
            "free_of_charge",
            "check_in",
            "check_out",
            "confirmation_number",
            "hotel_invoice_ref",
            "room_nr",
            "external_voucher_no",
            "buying_price",
            "buying_currency",
            "selling_price",
            "selling_currency",
            "reservation_notes",
            "hotel_note",
            "internal_note",
            "transfer_note",
            "operator_note",
            "allotment_type",
            "hotel_confirmation",
            "operator_confirmation",
            "reservation_status",
            "reservation_type",
            "print_option",
            "special_code",
            "code_2",
            "code_3",
            "code_4",
            "spo_spec_code",
            "package_splitting",
            "index_nr",
            "bubble",
            "passive",
            "free_sale",
            "local_service",
            "voucher_form_printing",
            "confirmation_form_print",
            "arrival_transfer",
            "arrival_transfer_date",
            "arrival_transfer_type",
            "departure_transfer",
            "departure_transfer_date",
            "departure_transfer_type",
            "handling_fee_type",
            "extras_prices",
            "amended_on_voucher_pdf",
            "hotel_pdf_previous_snapshot",
        ]

    def create(self, validated_data):
        validated_data.pop("hotel_pdf_previous_snapshot", None)
        instance = super().create(validated_data)
        VoucherReservation.objects.filter(voucher_id=instance.voucher_id).update(
            amended_on_voucher_pdf=True
        )
        return instance

    def update(self, instance, validated_data):
        validated_data.pop("amended_on_voucher_pdf", None)
        validated_data.pop("hotel_pdf_previous_snapshot", None)
        inst = (
            VoucherReservation.objects.filter(pk=instance.pk)
            .select_related("room_type", "hotel", "voucher")
            .first()
        )
        prev = build_reservation_display_snapshot(inst) if inst else {}
        instance = super().update(instance, validated_data)
        if prev:
            VoucherReservation.objects.filter(pk=instance.pk).update(hotel_pdf_previous_snapshot=prev)
        VoucherReservation.objects.filter(voucher_id=instance.voucher_id).update(amended_on_voucher_pdf=True)
        return instance


class VoucherSerializer(serializers.ModelSerializer):
    reservations = VoucherReservationSerializer(many=True)
    guests = VoucherGuestSerializer(many=True)
    referrer_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    referrer = serializers.PrimaryKeyRelatedField(
        queryset=Referrer.objects.all(), allow_null=True, required=False
    )
    referrer_display = ReferrerMinimalSerializer(source="referrer", read_only=True)

    class Meta:
        model = Voucher
        fields = [
            "voucher_nr",
            "issued_at",
            "sale_date",
            "destination_code",
            "sequence_number",
            "referrer",
            "referrer_display",
            "referrer_code",
            "client",
            "client_title",
            "client_name",
            "adult_count",
            "child_count",
            "infant_count",
            "extra_bed_count",
            "transfer_fee",
            "transfer_buying_price",
            "transfer_currency",
            "handling_fee_per_pax",
            "handling_currency",
            "exchange_rate_eur_to_usd",
            "notes",
            "flight_details",
            "data_entry_confirmed",
            "voucher_issued",
            "client_confirmed",
            "reservations",
            "guests",
        ]
        extra_kwargs = {
            "voucher_nr": {"required": False, "allow_blank": True},
        }

    def validate_guests(self, value):
        leader_count = sum(1 for guest in value if guest.get("is_leader"))
        if leader_count > 1:
            raise serializers.ValidationError("Only one guest can be marked as leader.")
        return value

    @staticmethod
    def _assign_reservation_serials(reservations_data: list) -> None:
        """Always set booking serial by row order: 0000001, 0000002, …"""
        for idx, res in enumerate(reservations_data):
            res["index_nr"] = f"{idx + 1:07d}"

    def create(self, validated_data):
        reservations_data = validated_data.pop("reservations", [])
        guests_data = validated_data.pop("guests", [])
        self._assign_reservation_serials(reservations_data)
        self._consume_referrer_code(validated_data)
        if not validated_data.get("sale_date") and reservations_data:
            first_check_in = min(
                (reservation.get("check_in") for reservation in reservations_data if reservation.get("check_in")),
                default=None,
            )
            if first_check_in:
                validated_data["sale_date"] = first_check_in
        self._ensure_voucher_nr(validated_data)
        voucher = Voucher.objects.create(**validated_data)
        reservations = []
        for reservation in reservations_data:
            reservations.append(VoucherReservation.objects.create(voucher=voucher, **reservation))
        room_index = {}
        for idx, reservation in enumerate(reservations):
            for number in range(1, reservation.room_count + 1):
                room = VoucherRoom.objects.create(
                    reservation=reservation,
                    room_number=number,
                    room_code=reservation.room_code,
                )
                room_index[(idx, number)] = room
        self._create_guests(voucher, guests_data, room_index)
        self._sync_sale_date(voucher)
        voucher.reservations.update(amended_on_voucher_pdf=False, hotel_pdf_previous_snapshot={})
        return voucher

    def update(self, instance, validated_data):
        self._consume_referrer_code(validated_data)
        reservations_data = validated_data.pop("reservations", None)
        guests_data = validated_data.pop("guests", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if reservations_data is not None:
            self._assign_reservation_serials(reservations_data)
            old_first = (
                instance.reservations.order_by("id")
                .select_related("room_type", "hotel", "voucher")
                .first()
            )
            prev_snap = build_reservation_display_snapshot(old_first) if old_first else {}
            instance.reservations.all().delete()
            reservations = []
            for reservation in reservations_data:
                reservations.append(VoucherReservation.objects.create(voucher=instance, **reservation))
            room_index = {}
            for idx, reservation in enumerate(reservations):
                for number in range(1, reservation.room_count + 1):
                    room = VoucherRoom.objects.create(
                        reservation=reservation,
                        room_number=number,
                        room_code=reservation.room_code,
                    )
                    room_index[(idx, number)] = room
            if reservations and prev_snap:
                VoucherReservation.objects.filter(pk=reservations[0].pk).update(
                    hotel_pdf_previous_snapshot=prev_snap
                )
        if guests_data is not None:
            instance.guests.all().delete()
            self._create_guests(instance, guests_data, room_index if reservations_data else {})
        self._sync_sale_date(instance)
        instance.reservations.update(amended_on_voucher_pdf=True)
        return instance

    def _consume_referrer_code(self, validated_data):
        if "referrer_code" not in validated_data:
            return
        code = (validated_data.pop("referrer_code") or "").strip()
        if validated_data.get("referrer"):
            return
        if not code:
            return
        ref = Referrer.objects.filter(referrer_code__iexact=code).first()
        if not ref:
            raise serializers.ValidationError({"referrer_code": "Unknown referrer code."})
        validated_data["referrer"] = ref

    def _ensure_voucher_nr(self, validated_data):
        raw_nr = (validated_data.get("voucher_nr") or "").strip()
        if raw_nr:
            validated_data["voucher_nr"] = raw_nr
            return
        validated_data.pop("voucher_nr", None)
        ref = validated_data.get("referrer")
        sale_date = validated_data.get("sale_date")
        voucher_nr, seq, year = allocate_voucher_nr(ref, sale_date)
        validated_data["voucher_nr"] = voucher_nr
        validated_data["sequence_number"] = seq
        validated_data["destination_code"] = year

    def _create_guests(self, voucher, guests_data, room_index):
        reservations_ordered = list(voucher.reservations.all().order_by("id"))
        for guest in guests_data:
            reservation_index = guest.pop("reservation_index", None)
            room_number = guest.pop("room_number", None)
            room_pk = guest.pop("room", None)
            guest.pop("id", None)
            passport_number = guest.get("passport_number") or None
            passenger = None
            if passport_number:
                passenger, _ = Passenger.objects.get_or_create(
                    passport_number=passport_number,
                    defaults={"full_name": guest.get("full_name", "")},
                )
            room = None
            if reservation_index is not None and room_number is not None:
                room = room_index.get((reservation_index, room_number))
                if room is None and reservations_ordered and 0 <= reservation_index < len(
                    reservations_ordered
                ):
                    room = VoucherRoom.objects.filter(
                        reservation=reservations_ordered[reservation_index],
                        room_number=room_number,
                    ).first()
            if room is None and room_pk is not None:
                # Nested validation turns `room` JSON into a VoucherRoom instance, not a raw pk.
                pk = room_pk.pk if isinstance(room_pk, VoucherRoom) else room_pk
                room = VoucherRoom.objects.filter(pk=pk, reservation__voucher=voucher).first()
            VoucherGuest.objects.create(
                voucher=voucher,
                passenger=passenger,
                room=room,
                **guest,
            )

    def _sync_sale_date(self, voucher):
        first_check_in = (
            voucher.reservations.order_by("check_in").values_list("check_in", flat=True).first()
        )
        if first_check_in and voucher.sale_date != first_check_in:
            voucher.sale_date = first_check_in
            voucher.save(update_fields=["sale_date"])
