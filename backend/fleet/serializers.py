from rest_framework import serializers

from .models import Car, CarRental, FlightTicket


class CarSerializer(serializers.ModelSerializer):
    class Meta:
        model = Car
        fields = [
            "id",
            "make",
            "model",
            "year",
            "plate_number",
            "daily_rate",
            "status",
            "location",
        ]


class CarRentalSerializer(serializers.ModelSerializer):
    class Meta:
        model = CarRental
        fields = [
            "id",
            "car",
            "client",
            "assigned_employee",
            "start_date",
            "end_date",
            "pickup_location",
            "dropoff_location",
            "price_per_day",
            "total_price",
            "booked_at",
        ]
        read_only_fields = ["total_price", "booked_at"]


class FlightTicketSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    assigned_employee_username = serializers.CharField(source="assigned_employee.username", read_only=True)

    class Meta:
        model = FlightTicket
        fields = [
            "id",
            "client",
            "client_name",
            "assigned_employee",
            "assigned_employee_username",
            "passenger_name",
            "passport_number",
            "airline",
            "ticket_number",
            "pnr",
            "trip_type",
            "departure_airport",
            "arrival_airport",
            "departure_datetime",
            "return_datetime",
            "buying_price",
            "buying_currency",
            "selling_price",
            "selling_currency",
            "currency",
            "service_fee",
            "service_fee_currency",
            "total_price",
            "net_profit",
            "status",
            "notes",
            "booked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["total_price", "net_profit", "booked_at", "created_at", "updated_at"]
