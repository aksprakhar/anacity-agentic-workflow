import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANACITY | Move requests",
  description: "Community move-in and move-out workflow prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#content" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-5 border-b border-gray-200 bg-white px-6 py-4 text-sm"
        >
          <Link href="/" className="font-bold">
            ANACITY
          </Link>
          <Link href="/resident" className="underline">
            Resident
          </Link>
          <Link href="/admin" className="underline">
            Admin
          </Link>
        </nav>
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
          Prototype with shared demo accounts and no login. Use demo data
          only.
        </div>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
