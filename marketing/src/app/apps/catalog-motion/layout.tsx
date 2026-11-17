import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema, howToSchema } from "../../../lib/jsonld";
import {
  CATALOG_MOTION_ROUTE,
  CATALOG_MOTION_STEPS,
} from "../../../data/catalogMotionPage";
import type { Metadata, Viewport } from "next";

const TITLE = "Product Catalog to Video | Catalog Motion for NodeTool";
const DESCRIPTION =
  "Upload a product catalog CSV and animate every product's own photo into a short clip with one look for the whole range. Test one row, then render the batch on your own video model keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: { canonical: CATALOG_MOTION_ROUTE },
  keywords: [
    "product catalog video",
    "CSV to video",
    "Shopify product video",
    "image to video batch",
    "e-commerce product video",
    "NodeTool mini app",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `https://nodetool.ai${CATALOG_MOTION_ROUTE}`,
    siteName: "NodeTool",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your product catalog, as product videos",
    description:
      "One CSV in, one clip per product out, with the same look across the range.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function CatalogMotionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const breadcrumb = breadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Catalog Motion", url: CATALOG_MOTION_ROUTE },
  ]);
  const howTo = howToSchema({
    name: "Turn a product catalog CSV into product videos",
    description: DESCRIPTION,
    url: CATALOG_MOTION_ROUTE,
    tools: ["NodeTool Studio", "An image-to-video model"],
    steps: CATALOG_MOTION_STEPS.map((step) => ({
      name: step.title,
      text: step.body,
    })),
  });
  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={howTo} />
      {children}
    </>
  );
}
