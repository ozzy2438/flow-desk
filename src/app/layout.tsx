import type { Metadata } from "next";
import { NavShell } from "@/components/NavShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow Desk",
  description: "Evidence-backed parallel job discovery workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
