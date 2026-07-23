import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MicroManus — Deep Research Agent",
  description: "Bring your own key. Get a research agent that searches, reads, and writes reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  );
}
