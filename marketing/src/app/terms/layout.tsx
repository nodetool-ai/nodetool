import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | NodeTool",
  description:
    "Terms of use for the NodeTool website, desktop application, and related services.",
  alternates: {
    canonical: "/terms",
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
