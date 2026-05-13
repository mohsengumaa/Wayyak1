"""
Maps sidebar section keys to Django models; all permissions (add/change/delete/view) for
those models are applied when a role is restricted to specific sections.
Keys must match `NAV_LINK_CONFIG` in the frontend.
"""

from __future__ import annotations

from collections.abc import Iterator

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType

from accounting.models import (
    AccountEntry,
    AccountingPeriod,
    Branch,
    ChartAccount,
    CostCenter,
    Invoice,
    InvoiceLine,
    JournalEntry,
    JournalLine,
    LedgerEntry,
    Payment,
    PaymentAllocation,
    TaxCode,
)
from bookings.models import Booking, Voucher, VoucherReservation
from core.models import Client, ClientDocument, Reminder
from expenses.models import Expense
from fleet.models import Car, CarRental, FlightTicket
from hotels.models import Hotel, RoomType, SeasonalPricing
from hr.models import Employee, EmployeeExpense, EmployeeSalary, EmployeeTask, SalesRecord
from settingsapp.models import AppSetting, DropdownCategory, DropdownOption

from .models import Role

User = get_user_model()

# Valid section keys (order matches typical nav).
VALID_SECTION_KEYS: tuple[str, ...] = (
    "dashboard",
    "clients",
    "reminders",
    "vouchers",
    "bookings",
    "hotels",
    "flights",
    "fleet",
    "accounting",
    "hr",
    "expenses",
    "users",
    "settings",
)

_SECTION_TO_MODELS: dict[str, tuple[type, ...]] = {
    "dashboard": (),
    "clients": (Client, ClientDocument),
    "reminders": (Reminder,),
    "vouchers": (Voucher, VoucherReservation),
    "bookings": (Booking,),
    "hotels": (Hotel, RoomType, SeasonalPricing),
    "flights": (FlightTicket,),
    "fleet": (Car, CarRental),
    "accounting": (
        AccountEntry,
        AccountingPeriod,
        Branch,
        ChartAccount,
        CostCenter,
        Invoice,
        InvoiceLine,
        JournalEntry,
        JournalLine,
        LedgerEntry,
        Payment,
        PaymentAllocation,
        TaxCode,
    ),
    "hr": (Employee, EmployeeTask, EmployeeSalary, EmployeeExpense, SalesRecord),
    "expenses": (Expense,),
    "users": (User, Role),
    "settings": (AppSetting, DropdownCategory, DropdownOption),
}


def iter_models_for_sections(keys: list[str]) -> Iterator[type]:
    for key in keys:
        for model in _SECTION_TO_MODELS.get(key, ()):
            yield model


def merged_role_permission_pks(allowed_keys: list[str] | None, extra_permission_pks) -> list[int]:
    """
    Union of: automatic permissions for selected sidebar sections, plus any extra from the details list.
    `extra_permission_pks` may be primary keys or Permission model instances (from DRF).
    """
    base: set[int] = set(permission_ids_for_section_keys(allowed_keys) if allowed_keys else [])
    extra: set[int] = set()
    for x in extra_permission_pks or []:
        extra.add(int(getattr(x, "pk", x)))
    return list(base | extra)


def permission_ids_for_section_keys(keys: list[str]) -> list[int]:
    """Return primary keys of all Permission objects for the given section keys (add/change/delete/view)."""
    seen: set[int] = set()
    for model in iter_models_for_sections(keys):
        ct = ContentType.objects.get_for_model(model)
        for pk in Permission.objects.filter(content_type=ct).values_list("id", flat=True):
            if pk not in seen:
                seen.add(pk)
    return list(seen)
