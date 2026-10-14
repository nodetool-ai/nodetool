import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

export const metadata: Metadata = {
  title: "Imprint | NodeTool",
  description:
    "Legal information about NodeTool B.V. pursuant to § 5 DDG and Art. 13 GDPR.",
  alternates: {
    canonical: "/imprint",
  },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: "Imprint | NodeTool",
    description:
      "Legal information about NodeTool B.V. pursuant to § 5 DDG and Art. 13 GDPR.",
    url: "https://nodetool.ai/imprint",
    type: "website",
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
