import type { Metadata } from "next";
import MarketingPageShell from "@/components/MarketingPageShell";
import AdLibraryOverview from "@/components/AdLibraryOverview";
import JsonLd from "@/components/JsonLd";
import { adLibraryEntries, adRecipes } from "@/data/adLibrary";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";

const entry = adLibraryEntries[0];
export const metadata: Metadata = {
  title: entry.title,
  description: entry.description,
  alternates: { canonical: "https://nodetool.ai/ad-library" },
  openGraph: {
    images: DEFAULT_OG_IMAGES,
    title: entry.title,
    description: entry.description,
    url: "https://nodetool.ai/ad-library"
  }
};

export default function AdLibraryPage() {
  return (
    <MarketingPageShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Social media ad library",
          itemListElement: adRecipes.map((recipe, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: recipe.title,
            url: `https://nodetool.ai${recipe.route}`
          }))
        }}
      />
      <AdLibraryOverview />
    </MarketingPageShell>
  );
}
