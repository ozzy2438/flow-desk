import Link from "next/link";
import { isDemoMode } from "@/server/env";

const LINKS = [
  { href: "/", label: "Research" },
  { href: "/inbox", label: "Job Inbox" },
  { href: "/desk", label: "Daily Desk" },
  { href: "/profile", label: "Candidate Profile" },
  { href: "/evidence", label: "Evidence Library" },
  { href: "/policy", label: "Policy Inspector" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold tracking-tight">Flow Desk</span>
            <nav className="flex gap-4 text-sm text-slate-600">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-slate-900">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {demo ? (
              <span className="badge bg-indigo-100 text-indigo-800">Demo mode · read-only</span>
            ) : (
              <span className="badge bg-green-100 text-green-800">Live mode · read-only</span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
