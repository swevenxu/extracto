"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, email: form.get("email"), password: form.get("password"), name: form.get("name") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not sign in");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <form onSubmit={submit} className="login-frame grid gap-5">
        <div>
          <span className="brand-logo brand-logo-login">
            <Image src="/brand/extracto-wordmark.png" alt="Extracto" width={1700} height={310} priority />
          </span>
          <h1 className="mt-2 text-2xl font-medium text-ink">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted">Manage and review your document extractions.</p>
        </div>
        {mode === "signup" && <label className="grid gap-1 text-sm text-ink-2">Name<input name="name" autoComplete="name" maxLength={80} className="field-control" /></label>}
        <label className="grid gap-1 text-sm text-ink-2">Email<input name="email" type="email" autoComplete="email" required className="field-control" /></label>
        <label className="grid gap-1 text-sm text-ink-2">Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={10} maxLength={200} required className="field-control" /></label>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <button disabled={busy} className="btn-primary w-full">{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        <p className="text-center text-sm text-muted">{mode === "signin" ? "New to Extracto?" : "Already have an account?"}{" "}<button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }} className="font-medium text-accent underline">{mode === "signin" ? "Create an account" : "Sign in"}</button></p>
      </form>
    </main>
  );
}
