import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import { CommandPalette } from "@/components/shell/CommandPalette";
import { LiveTail } from "@/components/shell/LiveTail";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

import { PREFERENCES_SCRIPT } from "@/lib/preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rewind",
    template: "%s · Rewind",
  },
  description:
    "An open-source engineering flight recorder for modern software.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      // The preferences script sets data-theme and data-density before
      // React hydrates, so the attributes can differ from the server's.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>

      <body className="bg-canvas text-ink">
        <div className="flex min-h-screen">
          <Sidebar />

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar>
              <CommandPalette />
              <span className="flex-1" />
              <LiveTail />
            </TopBar>

            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
