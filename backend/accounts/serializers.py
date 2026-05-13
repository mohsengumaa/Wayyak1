from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import Permission
from rest_framework import serializers

from .models import Role
from .section_access import VALID_SECTION_KEYS, merged_role_permission_pks

User = get_user_model()


class PermissionSerializer(serializers.ModelSerializer):
    app_label = serializers.CharField(source="content_type.app_label", read_only=True)
    model = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        model = Permission
        fields = ["id", "name", "codename", "app_label", "model"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(), many=True, required=False
    )
    allowed_section_keys = serializers.ListField(
        child=serializers.CharField(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Role
        fields = ["id", "name", "description", "permissions", "allowed_section_keys"]

    def validate_allowed_section_keys(self, value):
        if value is None:
            return None
        if not isinstance(value, list):
            raise serializers.ValidationError("Expected a list of section keys or null.")
        if len(value) == 0:
            return None
        for key in value:
            if key not in VALID_SECTION_KEYS:
                raise serializers.ValidationError(f"Unknown section key: {key}")
        return list(dict.fromkeys(value))

    def create(self, validated_data):
        allowed = validated_data.pop("allowed_section_keys", None)
        perms = validated_data.pop("permissions", [])
        role = Role.objects.create(allowed_section_keys=allowed, **validated_data)
        role.permissions.set(merged_role_permission_pks(allowed, perms))
        return role

    def update(self, instance, validated_data):
        allowed = validated_data.pop("allowed_section_keys", serializers.empty)
        perms = validated_data.pop("permissions", serializers.empty)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if allowed is not serializers.empty:
            instance.allowed_section_keys = allowed
            extra = list(perms) if perms is not serializers.empty else list(
                instance.permissions.values_list("pk", flat=True)
            )
            instance.permissions.set(merged_role_permission_pks(allowed, extra))
        elif perms is not serializers.empty:
            if instance.allowed_section_keys:
                instance.permissions.set(
                    merged_role_permission_pks(list(instance.allowed_section_keys or []), perms)
                )
            else:
                instance.permissions.set(perms)

        instance.save()
        return instance


class UserSerializer(serializers.ModelSerializer):
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), required=False, allow_null=True
    )
    role_name = serializers.CharField(source="role.name", read_only=True)
    user_permissions = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(), many=True, required=False
    )
    permission_codenames = serializers.SerializerMethodField(read_only=True)
    allowed_section_keys = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "role_name",
            "user_permissions",
            "is_active",
            "is_staff",
            "is_superuser",
            "last_login",
            "date_joined",
            "permission_codenames",
            "allowed_section_keys",
        ]

    def get_allowed_section_keys(self, obj):
        if getattr(obj, "is_superuser", False):
            return None
        role = getattr(obj, "role", None)
        if role is None:
            return None
        return getattr(role, "allowed_section_keys", None)

    def get_permission_codenames(self, obj):
        if getattr(obj, "is_superuser", False):
            return ["*"]
        codes = set()
        role = getattr(obj, "role", None)
        if role is not None:
            codes.update(role.permissions.values_list("codename", flat=True))
        codes.update(obj.user_permissions.values_list("codename", flat=True))
        return sorted(codes)


class UserCreateSerializer(UserSerializer):
    password = serializers.CharField(write_only=True)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["password"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        # Many-to-many cannot be passed to User(); must set after save.
        perms = validated_data.pop("user_permissions", [])
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        user.user_permissions.set(perms)
        return user


class EmailOrUsernameAuthTokenSerializer(serializers.Serializer):
    """Same token payload as DRF AuthTokenSerializer; accepts username or email in `username`."""

    username = serializers.CharField()
    password = serializers.CharField(
        style={"input_type": "password"},
        trim_whitespace=False,
    )

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")
        if not username or not password:
            raise serializers.ValidationError(
                'Must include "username" and "password".',
                code="authorization",
            )
        request = self.context.get("request")
        cred = username.strip()
        user = authenticate(request=request, username=cred, password=password)
        if not user:
            raise serializers.ValidationError(
                "Unable to log in with provided credentials.",
                code="authorization",
            )
        attrs["user"] = user
        return attrs
