from rest_framework import serializers

from .models import Hotel, RoomType, SeasonalPricing


class HotelRoomTypeInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    room_kind = serializers.CharField(max_length=100, required=False, allow_blank=True)


class HotelSerializer(serializers.ModelSerializer):
    room_types = HotelRoomTypeInputSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Hotel
        fields = [
            "id",
            "name",
            "address",
            "email_1",
            "email_2",
            "email_3",
            "phone_1",
            "phone_2",
            "room_types",
            "location",
            "contact_info",
            "description",
            "latitude",
            "longitude",
            "child_policy",
            "check_in_time",
            "check_out_time",
        ]

    def create(self, validated_data):
        room_types = validated_data.pop("room_types", [])
        hotel = Hotel.objects.create(**validated_data)
        for room in room_types:
            RoomType.objects.create(
                hotel=hotel,
                name=room.get("name", ""),
                room_kind=room.get("room_kind", ""),
                capacity=1,
                base_price=0,
                breakfast_price=0,
            )
        return hotel


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = ["id", "hotel", "name", "room_kind", "capacity", "base_price", "breakfast_price"]


class SeasonalPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeasonalPricing
        fields = ["id", "room_type", "start_date", "end_date", "price_per_night"]
