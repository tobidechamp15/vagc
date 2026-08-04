import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Church Admin Dashboard",
  description: "Monitor member management and notification activity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
