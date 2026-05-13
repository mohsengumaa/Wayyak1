from django.db.models.deletion import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from core.mixins import ImportExportModelViewSetMixin
from accounts.permissions import RoleBasedPermission
from .models import Hotel, RoomType, SeasonalPricing
from .serializers import (
    HotelSerializer,
    RoomTypeSerializer,
    SeasonalPricingSerializer,
)


class HotelViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Hotel.objects.all()
    serializer_class = HotelSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "name",
        "address",
        "email_1",
        "email_2",
        "email_3",
        "phone_1",
        "phone_2",
    ]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ProtectedError:
            return Response(
                {
                    "detail": "لا يمكن حذف الفندق لأنه مرتبط بحجوزات/قسائم أو أنواع غرف موجودة."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class RoomTypeViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "hotel", "name", "capacity", "base_price", "breakfast_price"]
    filterset_fields = ["hotel"]

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ProtectedError:
            return Response(
                {
                    "detail": "لا يمكن حذف نوع الغرفة لأنه مستخدم في حجوزات/قسائم سابقة."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


class SeasonalPricingViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = SeasonalPricing.objects.all()
    serializer_class = SeasonalPricingSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "room_type", "start_date", "end_date", "price_per_night"]
