"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Research" },
  { href: "/desk", label: "Results" },
  { href: "/inbox", label: "Capture" },
  { href: "/evidence", label: "Evidence" },
  { href: "/policy", label: "Policy" },
  { href: "/profile", label: "Profile" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isResearchSurface = pathname === "/" || pathname.startsWith("/runs/");

  if (isResearchSurface) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight text-slate-950">
            Flow Desk
          </Link>
          <nav className="flex gap-5 overflow-x-auto text-sm text-slate-500">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-slate-950">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
}
