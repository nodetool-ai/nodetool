import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

export const metadata: Metadata = {
  title: "Terms of Use | NodeTool",
  description:
    "Terms of use for the NodeTool website, desktop application, and related services.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
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
