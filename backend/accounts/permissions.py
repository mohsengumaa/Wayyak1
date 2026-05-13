from rest_framework.permissions import BasePermission, SAFE_METHODS


class RoleBasedPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        role = getattr(user, "role", None)

        if request.method in SAFE_METHODS:
            action = "view"
        elif request.method == "POST":
            action = "add"
        elif request.method in ("PUT", "PATCH"):
            action = "change"
        else:
            action = "delete"

        model = None
        if hasattr(view, "get_queryset"):
            queryset = view.get_queryset()
            model = queryset.model if queryset is not None else None
        if not model and hasattr(view, "queryset"):
            model = getattr(view.queryset, "model", None)

        if not model:
            return True

        codename = f"{action}_{model._meta.model_name}"
        if role and role.permissions.filter(codename=codename).exists():
            return True
        return user.user_permissions.filter(codename=codename).exists()
