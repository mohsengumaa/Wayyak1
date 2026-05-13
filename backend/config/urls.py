"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from accounts.views import (
    EmailOrUsernameObtainAuthToken,
    MeView,
    PermissionViewSet,
    RoleViewSet,
    UserViewSet,
)
from accounting.views import AccountEntryViewSet, InvoiceViewSet, LedgerEntryViewSet
from accounting.views import (
    AccountingPeriodViewSet,
    BranchViewSet,
    ChartAccountViewSet,
    CostCenterViewSet,
    InvoiceLineViewSet,
    JournalEntryViewSet,
    JournalLineViewSet,
    PaymentAllocationViewSet,
    PaymentViewSet,
    TaxCodeViewSet,
)
from bookings.views import (
    BookingViewSet,
    VoucherGuestListPdfView,
    VoucherPdfView,
    VoucherReservationViewSet,
    VoucherViewSet,
)
from core.views import ClientViewSet, DashboardViewSet, ExchangeRateViewSet
from core.views import ReferrerViewSet, ReminderViewSet, SupplierViewSet
from expenses.views import ExpenseViewSet
from fleet.views import CarRentalViewSet, CarViewSet, FlightTicketViewSet
from hotels.views import HotelViewSet, RoomTypeViewSet, SeasonalPricingViewSet
from hr.views import (
    EmployeeExpenseViewSet,
    EmployeeSalaryViewSet,
    EmployeeTaskViewSet,
    EmployeeViewSet,
    SalesRecordViewSet,
)
from settingsapp.views import (
    AppSettingViewSet,
    DropdownCategoryViewSet,
    DropdownOptionViewSet,
    PdfAssetViewSet,
    PdfSettingsPreviewView,
)


# Avoid slash/no-slash redirect loops behind Next.js rewrites.
router = DefaultRouter(trailing_slash=False)
router.register("roles", RoleViewSet, basename="role")
router.register("users", UserViewSet, basename="user")
router.register("permissions", PermissionViewSet, basename="permission")
router.register("clients", ClientViewSet, basename="client")
router.register("referrers", ReferrerViewSet, basename="referrer")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("reminders", ReminderViewSet, basename="reminder")
router.register("exchange-rates", ExchangeRateViewSet, basename="exchange-rate")
router.register("dashboard", DashboardViewSet, basename="dashboard")
router.register("hotels", HotelViewSet, basename="hotel")
router.register("room-types", RoomTypeViewSet, basename="room-type")
router.register("seasonal-pricing", SeasonalPricingViewSet, basename="seasonal-pricing")
router.register("bookings", BookingViewSet, basename="booking")
router.register("vouchers", VoucherViewSet, basename="voucher")
router.register("voucher-reservations", VoucherReservationViewSet, basename="voucher-reservation")
router.register("cars", CarViewSet, basename="car")
router.register("car-rentals", CarRentalViewSet, basename="car-rental")
router.register("flight-tickets", FlightTicketViewSet, basename="flight-ticket")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("employee-tasks", EmployeeTaskViewSet, basename="employee-task")
router.register("employee-salaries", EmployeeSalaryViewSet, basename="employee-salary")
router.register("employee-expenses", EmployeeExpenseViewSet, basename="employee-expense")
router.register("sales-records", SalesRecordViewSet, basename="sales-record")
router.register("ledger-entries", LedgerEntryViewSet, basename="ledger-entry")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("invoice-lines", InvoiceLineViewSet, basename="invoice-line")
router.register("account-entries", AccountEntryViewSet, basename="account-entry")
router.register("payments", PaymentViewSet, basename="payment")
router.register("payment-allocations", PaymentAllocationViewSet, basename="payment-allocation")
router.register("branches", BranchViewSet, basename="branch")
router.register("cost-centers", CostCenterViewSet, basename="cost-center")
router.register("chart-accounts", ChartAccountViewSet, basename="chart-account")
router.register("accounting-periods", AccountingPeriodViewSet, basename="accounting-period")
router.register("tax-codes", TaxCodeViewSet, basename="tax-code")
router.register("journal-entries", JournalEntryViewSet, basename="journal-entry")
router.register("journal-lines", JournalLineViewSet, basename="journal-line")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("dropdown-categories", DropdownCategoryViewSet, basename="dropdown-category")
router.register("dropdown-options", DropdownOptionViewSet, basename="dropdown-option")
router.register("app-settings", AppSettingViewSet, basename="app-setting")
router.register("pdf-assets", PdfAssetViewSet, basename="pdf-asset")

urlpatterns = [
    path('admin/', admin.site.urls),
    path(
        "api/pdf-settings/preview",
        PdfSettingsPreviewView.as_view(),
        name="pdf-settings-preview-no-slash",
    ),
    path(
        "api/pdf-settings/preview/",
        PdfSettingsPreviewView.as_view(),
        name="pdf-settings-preview",
    ),
    path("api/", include(router.urls)),
    # Accept both with and without trailing slash for auth endpoints.
    path(
        "api/auth/login",
        EmailOrUsernameObtainAuthToken.as_view(),
        name="api-login-no-slash",
    ),
    path(
        "api/auth/login/",
        EmailOrUsernameObtainAuthToken.as_view(),
        name="api-login",
    ),
    path("api/auth/me", MeView.as_view(), name="api-me-no-slash"),
    path("api/auth/me/", MeView.as_view(), name="api-me"),
    path(
        "api/vouchers/<str:voucher_nr>/pdf/<str:template>",
        VoucherPdfView.as_view(),
        name="voucher-pdf-no-slash",
    ),
    path(
        "api/vouchers/<str:voucher_nr>/pdf/<str:template>/",
        VoucherPdfView.as_view(),
        name="voucher-pdf",
    ),
    path(
        "api/vouchers/<str:voucher_nr>/guests/pdf",
        VoucherGuestListPdfView.as_view(),
        name="voucher-guest-list-pdf-no-slash",
    ),
    path(
        "api/vouchers/<str:voucher_nr>/guests/pdf/",
        VoucherGuestListPdfView.as_view(),
        name="voucher-guest-list-pdf",
    ),
]
