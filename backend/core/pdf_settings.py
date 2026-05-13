from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from django.conf import settings
from reportlab.pdfgen import canvas

from settingsapp.models import AppSetting, PdfAsset


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base or {})
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out.get(k) or {}, v)
        else:
            out[k] = v
    return out


def load_pdf_config(doc_key: str) -> dict[str, Any]:
    """
    Returns merged PDF config:
      - global: doc.global.config
      - per-doc: doc.<doc_key>.config (overrides global)
    """
    def _load(key: str) -> dict[str, Any]:
        row = AppSetting.objects.filter(section="pdf", key=key).first()
        if not row or not (row.value or "").strip():
            return {}
        try:
            parsed = json.loads(row.value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    global_cfg = _load("doc.global.config")
    doc_cfg = _load(f"doc.{doc_key}.config")
    return _deep_merge(global_cfg, doc_cfg)


def default_logo_path() -> str | None:
    candidates = [
        Path(settings.BASE_DIR).parent / "assets" / "logo.png",
        Path(settings.BASE_DIR).parent / "assets" / "logo.jpg",
        Path(settings.BASE_DIR).parent / "assets" / "logo.jpeg",
        Path(settings.BASE_DIR) / "static" / "logo.png",
    ]
    for p in candidates:
        try:
            if p.exists():
                return str(p)
        except Exception:
            continue
    return None


def logo_path_from_config(cfg: dict[str, Any]) -> str | None:
    asset_id = cfg.get("logo_asset_id")
    if not isinstance(asset_id, int):
        return None
    asset = PdfAsset.objects.filter(id=asset_id).first()
    if not asset or not getattr(asset, "file", None):
        return None
    try:
        return asset.file.path
    except Exception:
        return None


def effective_logo_path(cfg: dict[str, Any]) -> str | None:
    return logo_path_from_config(cfg) or default_logo_path()


def draw_watermark(pdf: canvas.Canvas, cfg: dict[str, Any], *, page_w: float, page_h: float, logo_path: str | None) -> None:
    wm = cfg.get("watermark") if isinstance(cfg.get("watermark"), dict) else {}
    if not wm or not wm.get("enabled"):
        return
    if not logo_path:
        return
    try:
        opacity = float(wm.get("opacity", 0.035))
        scale = float(wm.get("scale", 0.72))
    except Exception:
        opacity = 0.035
        scale = 0.72
    opacity = max(0.01, min(0.12, opacity))
    scale = max(0.2, min(1.2, scale))

    pdf.saveState()
    try:
        if hasattr(pdf, "setFillAlpha"):
            pdf.setFillAlpha(opacity)
    except Exception:
        pass
    size = min(page_w, page_h) * scale
    x = (page_w - size) / 2
    y = (page_h - size) / 2
    try:
        pdf.drawImage(str(logo_path), x, y, width=size, height=size, preserveAspectRatio=True, mask="auto")
    except Exception:
        pass
    pdf.restoreState()

