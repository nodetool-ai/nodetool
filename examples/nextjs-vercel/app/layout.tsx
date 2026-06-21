import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NodeTool · Server-side Workflow Runner (Vercel)",
  description:
    "Run NodeTool workflows server-side in a Next.js route, deployable to Vercel."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
