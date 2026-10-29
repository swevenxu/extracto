"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { UsageSnapshot } from "@/lib/plans";

const nav = [
  { name: "Dashboard", href: "/" },
  { name: "Documents", href: "/documents" },
  { name: "Upload", href: "/upload" },
  { name: "Analytics", href: "/analytics" },
];

interface WorkspaceOption {
  id: string;
  name: string;
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [activeId, setActiveId] = useState("");
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [secondaryOpen, setSecondaryOpen] = useState(false);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setWorkspaces(data.workspaces ?? []);
        setActiveId(data.workspace?.id ?? "");
      })
      .catch(() => {});
  }, []);

  // The allowance chip follows uploads and plan changes, not just navigation.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/usage")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data?.usage) setUsage(data.usage as UsageSnapshot);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("extracto:usage", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener("extracto:usage", load);
    };
  }, [pathname]);

  async function switchWorkspace(workspaceId: string) {
    const res = await fetch("/api/workspaces/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (!res.ok) return;
    setActiveId(workspaceId);
    // Records on the current page belong to the old workspace, so start clean.
    router.push("/");
    router.refresh();
  }

  return (
    <header className="top-nav">
      {/* Brand / logo */}
      <Link href="/" className="nav-brand" aria-label="Extracto home">
        <span className="brand-logo">
          <Image src="/brand/extracto-wordmark.png" alt="Extracto" width={1700} height={310} priority />
        </span>
      </Link>

      {/* Primary nav */}
      <nav className="nav-primary" aria-label="Main navigation">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="nav-link"
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {/* Evidence plate — centered, prominent */}
      {usage && (
        <Link
          href="/settings#billing"
          className="nav-evidence"
          data-level={usage.level}
          aria-label={`${usage.documents.used} of ${usage.documents.limit} documents used on the ${usage.planName} plan this month`}
          title={`${usage.documents.remaining} of ${usage.documents.limit} documents left this month on the ${usage.planName} plan`}
        >
          <span className="evidence-text">
            {usage.documents.used}/{usage.documents.limit} docs
          </span>
          <span
            className="evidence-bar"
            style={{ width: `${(usage.documents.used / usage.documents.limit) * 100}%` }}
            aria-hidden="true"
          />
        </Link>
      )}

      {/* Secondary actions (right side) */}
      <div className="nav-secondary">
        {workspaces.length > 1 && (
          <label className="workspace-switcher">
            <span className="visually-hidden">Workspace</span>
            <select
              value={activeId}
              onChange={(e) => void switchWorkspace(e.target.value)}
              className="field-control field-control-select"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
        )}
        <Link
          href="/settings"
          className="nav-link nav-link-secondary"
          aria-current={pathname === "/settings" ? "page" : undefined}
        >
          Settings
        </Link>
        <button
          type="button"
          className="nav-link nav-signout"
          onClick={async () => {
            await fetch("/api/auth/signout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
