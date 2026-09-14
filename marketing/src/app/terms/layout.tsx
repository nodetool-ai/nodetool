import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | NodeTool",
  description:
    "Terms of use for the NodeTool website, desktop application, and related services.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Use | NodeTool",
    description:
      "Terms of use for the NodeTool website, desktop application, and related services.",
    url: "https://nodetool.ai/terms",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
