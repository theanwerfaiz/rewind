import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rewind",
  description:
    "An open-source engineering flight recorder for modern software.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}