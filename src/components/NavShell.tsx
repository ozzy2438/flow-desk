import Link from "next/link";
import { isDemoMode } from "@/server/env";

const LINKS = [
  { href: "/", label: "Research" },
  { href: "/desk", label: "Daily Desk" },
  { href: "/inbox", label: "Capture" },
  { href: "/evidence", label: "Evidence" },
  { href: "/policy", label: "Policy" },
  { href: "/profile", label: "Profile" },
];

export function NavShell({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-5 px-5 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-5 lg:gap-8">
            <Link href="/" className="flex-none text-lg font-semibold tracking-[-0.03em] text-slate-950">
              Flow Desk
            </Link>
            <nav className="flex gap-3 overflow-x-auto text-sm text-slate-500 lg:gap-5">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-slate-900">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="hidden flex-none items-center gap-2 sm:flex">
            {demo ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                Demo · read-only
              </span>
            ) : (
              <span className="rounded-full bg-[#eefbe7] px-3 py-1 text-xs font-semibold text-[#32752a]">
                Live JEV · read-only
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
}
