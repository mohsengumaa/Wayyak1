"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type LoginResponse = { token: string };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<LoginResponse>("/auth/login/", {
        username,
        password,
      });
      setToken(data.token);
      router.replace("/dashboard");
    } catch {
      setError(t.loginError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mb-primary px-4 py-12 text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-center gap-8 lg:flex-row">
        <div className="w-full max-w-sm space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-mb-highlight" />
            {t.secureAccessTag}
          </div>
          <h1 className="text-3xl font-semibold">{t.appTitle}</h1>
          <p className="text-sm text-white/70">{t.loginTagline}</p>
        </div>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">{t.loginTitle}</h2>
              <p className="text-sm text-white/70">{t.loginSubtitle}</p>
            </div>
            <LanguageSwitcher variant="dark" />
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm">{t.loginUsernameOrEmail}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-mb-highlight"
                placeholder={t.loginUsernameOrEmail}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">{t.password}</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-mb-highlight"
                required
              />
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-mb-highlight px-3 py-2 text-sm font-medium text-white shadow hover:bg-mb-highlight-hover disabled:opacity-70 transition"
            >
              {loading ? t.commonLoading : t.loginBtn}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}



