import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | NodeTool",
  description:
    "How NodeTool collects, processes, and protects your personal data. GDPR-compliant privacy policy for nodetool.ai and the NodeTool desktop application.",
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
