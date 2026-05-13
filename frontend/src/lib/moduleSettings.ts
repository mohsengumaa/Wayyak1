"use client";

import { api } from "@/lib/api";
import { moduleSettingKey, MODULE_SETTINGS_REGISTRY, type ModuleSettingDef, type SettingValueType } from "@/lib/moduleSettingsRegistry";
import type { NavKey } from "@/lib/modulePermissions";

type AppSettingRow = {
  id: number;
  section: string;
  key: string;
  value: string;
};

let cache: AppSettingRow[] | null = null;
let cacheAt = 0;
const CACHE_MS = 30_000;

function parseTyped(value: string, valueType: SettingValueType, fallback: string) {
  const raw = String(value ?? "");
  if (valueType === "boolean") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return ["1", "true", "yes", "on"].includes(String(fallback || "").trim().toLowerCase());
  }
  if (valueType === "number") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    const fallbackNum = Number(fallback);
    return Number.isFinite(fallbackNum) ? fallbackNum : 0;
  }
  if (valueType === "json") {
    try {
      return raw ? JSON.parse(raw) : JSON.parse(fallback || "{}");
    } catch {
      return {};
    }
  }
  return raw || fallback || "";
}

export function invalidateModuleSettingsCache() {
  cache = null;
  cacheAt = 0;
}

export async function loadModuleSettingRows(force = false): Promise<AppSettingRow[]> {
  const now = Date.now();
  if (!force && cache && now - cacheAt < CACHE_MS) return cache;
  const rows = await api.get<AppSettingRow[]>("/app-settings/?section=ui");
  cache = rows || [];
  cacheAt = now;
  return cache;
}

export async function loadModuleSettings(moduleName: NavKey) {
  const rows = await loadModuleSettingRows();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const defs = MODULE_SETTINGS_REGISTRY.filter((row) => row.module === moduleName);
  const result: Record<string, unknown> = {};
  for (const def of defs) {
    const fullKey = moduleSettingKey(moduleName, def.key);
    const value = byKey.get(fullKey);
    result[def.key] = parseTyped(value ?? "", def.valueType, def.defaultValue);
  }
  return result;
}
