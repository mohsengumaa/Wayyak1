from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import AppSetting


class AppSettingGuardrailsAndSnapshotTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_superuser(
            username="settings-admin",
            email="settings-admin@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(self.user)

    def test_app_setting_validates_slug_format(self):
        res = self.client.post(
            "/api/app-settings",
            {
                "section": "UI Settings",
                "key": "Bad Key",
                "label": "Bad",
                "value": "x",
                "description": "",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("section", res.data)

    def test_snapshot_import_export_and_reset_section(self):
        import_res = self.client.post(
            "/api/app-settings/snapshot-import",
            {
                "mode": "upsert",
                "section": "ui",
                "rows": [
                    {"section": "ui", "key": "bookings.ui.page_title", "label": "title", "value": "A", "description": ""},
                    {"section": "ui", "key": "hotels.ui.page_title", "label": "title", "value": "B", "description": ""},
                ],
            },
            format="json",
        )
        self.assertEqual(import_res.status_code, 200)
        self.assertEqual(AppSetting.objects.filter(section="ui").count(), 2)

        export_res = self.client.get("/api/app-settings/snapshot-export?section=ui")
        self.assertEqual(export_res.status_code, 200)
        self.assertEqual(export_res.data["section"], "ui")
        self.assertEqual(export_res.data["count"], 2)

        reset_res = self.client.post("/api/app-settings/reset-section", {"section": "ui"}, format="json")
        self.assertEqual(reset_res.status_code, 200)
        self.assertEqual(AppSetting.objects.filter(section="ui").count(), 0)
