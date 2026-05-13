from django.db import models


class AppSetting(models.Model):
    section = models.CharField(max_length=64, db_index=True)
    key = models.CharField(max_length=128)
    label = models.CharField(max_length=255, blank=True)
    value = models.TextField(blank=True)
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section", "key"]
        unique_together = ("section", "key")

    def __str__(self) -> str:
        return f"{self.section}.{self.key}"


class DropdownCategory(models.Model):
    name = models.CharField(max_length=150)
    key = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self) -> str:
        return self.name


class DropdownOption(models.Model):
    category = models.ForeignKey(
        DropdownCategory, on_delete=models.CASCADE, related_name="options"
    )
    label = models.CharField(max_length=255)
    value = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=32, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    meta = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "sort_order", "label"]
        unique_together = ("category", "value")

    def __str__(self) -> str:
        return f"{self.category.key}: {self.label}"


class PdfAsset(models.Model):
    """Uploaded assets to be used in PDF rendering (logos, watermark images)."""

    name = models.CharField(max_length=150, blank=True)
    file = models.ImageField(upload_to="pdf_assets/")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return self.name or f"PDF asset #{self.id}"
