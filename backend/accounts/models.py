from django.contrib.auth.models import AbstractUser, Permission
from django.db import models


class Role(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True)
    # null = do not filter UI by section (use `permissions` only). Non-null list = restrict sidebar + auto-sync perms.
    allowed_section_keys = models.JSONField(null=True, blank=True, default=None)

    def __str__(self) -> str:
        return self.name


class User(AbstractUser):
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self) -> str:
        return self.get_username()
