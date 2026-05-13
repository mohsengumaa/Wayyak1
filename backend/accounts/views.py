from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework import status, viewsets
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from openpyxl import load_workbook

from .models import Role
from core.mixins import ImportExportModelViewSetMixin
from .permissions import RoleBasedPermission
from .serializers import (
    EmailOrUsernameAuthTokenSerializer,
    PermissionSerializer,
    RoleSerializer,
    UserCreateSerializer,
    UserSerializer,
)

User = get_user_model()


class EmailOrUsernameObtainAuthToken(ObtainAuthToken):
    serializer_class = EmailOrUsernameAuthTokenSerializer


class RoleViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [RoleBasedPermission]
    export_fields = ["id", "name", "description"]


class UserViewSet(ImportExportModelViewSetMixin, viewsets.ModelViewSet):
    queryset = User.objects.select_related("role").prefetch_related("user_permissions", "role__permissions")
    permission_classes = [RoleBasedPermission]
    export_fields = [
        "id",
        "username",
        "email",
        "first_name",
        "last_name",
        "phone",
        "role",
        "is_active",
        "is_staff",
    ]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        # Only superusers can create another superuser.
        if (
            not self.request.user.is_superuser
            and serializer.validated_data.get("is_superuser")
        ):
            serializer.validated_data["is_superuser"] = False
        serializer.save()

    def perform_update(self, serializer):
        # Only superusers can grant/revoke superuser flag.
        if (
            not self.request.user.is_superuser
            and "is_superuser" in serializer.validated_data
        ):
            serializer.validated_data["is_superuser"] = serializer.instance.is_superuser
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def import_xlsx(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response(
                {"detail": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        wb = load_workbook(file_obj)
        ws = wb.active
        headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]

        created = 0
        for row in ws.iter_rows(min_row=2, values_only=True):
            data = dict(zip(headers, row))
            username = data.get("username")
            if not username:
                continue
            password = data.get("password") or User.objects.make_random_password()
            role_id = data.get("role")
            user = User(
                username=username,
                email=data.get("email") or "",
                first_name=data.get("first_name") or "",
                last_name=data.get("last_name") or "",
                phone=data.get("phone") or "",
                is_active=bool(data.get("is_active", True)),
                is_staff=bool(data.get("is_staff", False)),
            )
            if role_id:
                user.role_id = int(role_id)
            user.set_password(str(password))
            user.save()
            created += 1

        return Response({"created": created})

    @action(detail=True, methods=["post"])
    def set_password(self, request, pk=None):
        user = self.get_object()
        raw = str(request.data.get("password") or "").strip()
        if len(raw) < 6:
            return Response(
                {"detail": "Password must be at least 6 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(raw)
        user.save(update_fields=["password"])
        return Response({"detail": "Password updated."})


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = (
            User.objects.select_related("role")
            .prefetch_related("role__permissions", "user_permissions")
            .get(pk=request.user.pk)
        )
        return Response(UserSerializer(user).data)
