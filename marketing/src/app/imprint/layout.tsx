import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Imprint | NodeTool",
  description:
    "Legal information about NodeTool B.V. pursuant to § 5 DDG and Art. 13 GDPR.",
  alternates: {
    canonical: "/imprint",
  },
  robots: { index: true, follow: true },
};

export default function ImprintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
