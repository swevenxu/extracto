"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

const nav = [
  { name: "Dashboard", href: "/" },
  { name: "Documents", href: "/documents" },
  { name: "Upload", href: "/upload" },
  { name: "Analytics", href: "/analytics" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="shell-nav">
      <Link href="/" className="shell-brand" aria-label="Extracto home">
        <span className="brand-logo">
          <Image src="/brand/extracto-wordmark.png" alt="Extracto" width={1700} height={310} priority />
        </span>
      </Link>
      <nav className="shell-links" aria-label="Main navigation">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="shell-link" aria-current={pathname === item.href ? "page" : undefined}>
            {item.name}
          </Link>
        ))}
        <Link href="/settings" className="shell-link" aria-current={pathname === "/settings" ? "page" : undefined}>Settings</Link>
        <button
          type="button"
          className="shell-signout"
          onClick={async () => {
            await fetch("/api/auth/signout", { method: "POST" });
            router.replace("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
