import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | NodeTool",
  description:
    "How NodeTool collects, processes, and protects your personal data. GDPR privacy policy for nodetool.ai, the NodeTool desktop application, and the hosted service at app.nodetool.ai.",
  alternates: {
    canonical: "/privacy",
  },
  robots: { index: true, follow: true },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
