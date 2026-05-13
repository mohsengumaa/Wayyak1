import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getToken } from "./auth";

export function useRequireAuth(): void {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
    }
  }, [router]);
}

export function useLogout(): () => void {
  const router = useRouter();
  return () => {
    clearToken();
    router.replace("/login");
  };
}
