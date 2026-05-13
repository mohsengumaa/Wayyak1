"use client";

import { useEffect, useState } from "react";
import { loadModuleSettings } from "@/lib/moduleSettings";
import type { NavKey } from "@/lib/modulePermissions";

export function useModuleUiSettings(moduleName: NavKey) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadModuleSettings(moduleName);
        if (!cancelled) setSettings(rows);
      } catch {
        if (!cancelled) setSettings({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleName]);

  return settings;
}
