from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailOrUsernameModelBackend(ModelBackend):
    """Resolve login by `username` field or by `email` (case-insensitive)."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if username is None or password is None:
            return None

        cred = str(username).strip()
        if not cred:
            return None

        user = None
        try:
            user = UserModel._default_manager.get_by_natural_key(cred)
        except UserModel.DoesNotExist:
            normalized = UserModel.objects.normalize_email(cred)
            user = UserModel.objects.filter(email__iexact=cred).first()
            if user is None and normalized:
                user = UserModel.objects.filter(email__iexact=normalized).first()

        if user is None:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
