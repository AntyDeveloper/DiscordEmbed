import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetterEmbeds",
  description: "Discord Components V2 message builder."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
