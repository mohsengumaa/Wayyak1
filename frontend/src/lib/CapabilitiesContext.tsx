"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { getToken } from "./auth";

type MeResponse = {
  permission_codenames?: string[];
  is_superuser?: boolean;
  /** From role: if non-empty, sidebar shows only these section keys. `null` = use `permission_codenames` only. */
  allowed_section_keys?: string[] | null;
};

export type NavAccessItem = { key: string; permission: readonly string[] };

type CapabilitiesValue = {
  ready: boolean;
  /** `true` if user has at least one of the codenames (or full access). Empty list = false (no codenames to match). */
  canAny: (codenames: readonly string[]) => boolean;
  /**
   * Sidebar item: if role uses `allowed_section_keys`, only those keys appear; else uses `permission` codenames.
   */
  hasNavAccess: (item: NavAccessItem) => boolean;
  /** Every codename must be present (or superuser). Empty list = allow. */
  canEvery: (codenames: readonly string[]) => boolean;
};

const CapabilitiesContext = createContext<CapabilitiesValue>({
  ready: false,
  canAny: () => true,
  hasNavAccess: () => true,
  canEvery: () => true,
});

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  /** `null` = superuser full access only. */
  const [codes, setCodes] = useState<Set<string> | null>(new Set());
  /**
   * `null` = do not filter nav by role sections (use permission_codenames on each item).
   * Non-empty = show only these sidebar keys (set on Role in admin).
   */
  const [sectionKeys, setSectionKeys] = useState<string[] | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setCodes(new Set());
      setSectionKeys(null);
      setReady(true);
      return;
    }

    api
      .get<MeResponse>("/auth/me/")
      .then((me) => {
        if (me.is_superuser || me.permission_codenames?.includes("*")) {
          setCodes(null);
          setSectionKeys(null);
          return;
        }
        if (me.permission_codenames === undefined) {
          setCodes(new Set());
          setSectionKeys(null);
          return;
        }
        setCodes(new Set(me.permission_codenames));
        const sk = me.allowed_section_keys;
        setSectionKeys(
          Array.isArray(sk) && sk.length > 0 ? sk : null
        );
      })
      .catch(() => {
        // Fail closed to avoid exposing pages/controls accidentally.
        setCodes(new Set());
        setSectionKeys(null);
      })
      .finally(() => setReady(true));
  }, []);

  const canAny = useCallback(
    (codenames: readonly string[]) => {
      if (codes === null) return true;
      return codenames.some((c) => codes.has(c));
    },
    [codes]
  );

  const hasNavAccess = useCallback(
    (item: NavAccessItem) => {
      if (codes === null) return true;
      if (sectionKeys != null && sectionKeys.length > 0) {
        return sectionKeys.includes(item.key);
      }
      if (!item.permission || item.permission.length === 0) return true;
      return item.permission.some((c) => codes!.has(c));
    },
    [codes, sectionKeys]
  );

  const canEvery = useCallback(
    (codenames: readonly string[]) => {
      if (codes === null) return true;
      if (codenames.length === 0) return true;
      return codenames.every((c) => codes.has(c));
    },
    [codes]
  );

  const value = useMemo(
    () => ({ ready, canAny, hasNavAccess, canEvery }),
    [ready, canAny, hasNavAccess, canEvery]
  );

  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}

export function useCapabilities(): CapabilitiesValue {
  return useContext(CapabilitiesContext);
}

/**
 * Redirects to `/dashboard` if the user lacks every listed permission codename.
 * Skips until capabilities are loaded and a token exists.
 */
export function useRequireAnyPermission(required: readonly string[]): void {
  const router = useRouter();
  const { ready, canAny } = useCapabilities();
  const key = required.join("\0");

  useEffect(() => {
    if (!ready || !getToken()) return;
    if (required.length === 0) return;
    if (!canAny(required)) {
      router.replace("/dashboard");
    }
  }, [ready, key, canAny, router, required.length]);
}

/**
 * Redirects to `/dashboard` if the user lacks any of the listed permission codenames (all are required).
 */
export function useRequireAllPermissions(required: readonly string[]): void {
  const router = useRouter();
  const { ready, canEvery } = useCapabilities();
  const key = required.join("\0");

  useEffect(() => {
    if (!ready || !getToken()) return;
    if (required.length === 0) return;
    if (!canEvery(required)) {
      router.replace("/dashboard");
    }
  }, [ready, key, canEvery, router, required.length]);
}
