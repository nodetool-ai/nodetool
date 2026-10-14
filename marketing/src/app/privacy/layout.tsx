import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

export const metadata: Metadata = {
  title: "Privacy Policy | NodeTool",
  description:
    "How NodeTool collects, processes, and protects your personal data. GDPR privacy policy for nodetool.ai, the NodeTool desktop application, and the hosted service at app.nodetool.ai.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Privacy Policy | NodeTool",
    description:
      "How NodeTool collects, processes, and protects your personal data. GDPR privacy policy for nodetool.ai, the NodeTool desktop application, and the hosted service at app.nodetool.ai.",
    url: "https://nodetool.ai/privacy",
    type: "website",
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
