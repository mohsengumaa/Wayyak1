"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Re-run when the route changes or the browser tab becomes visible again (e.g. after editing settings in another tab). */
export function useReloadOnNavigateOrTabVisible(effect: () => void | Promise<void>) {
  const ref = useRef(effect);
  ref.current = effect;
  const pathname = usePathname();

  useEffect(() => {
    void ref.current();
  }, [pathname]);

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    document.addEventListener("visibilitychange", run);
    return () => document.removeEventListener("visibilitychange", run);
  }, []);
}
