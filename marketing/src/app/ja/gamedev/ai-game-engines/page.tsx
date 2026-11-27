import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/gamedev/ai-game-engines");

export default function Page() {
  return <LocalizedPage locale="ja" route="/gamedev/ai-game-engines" />;
}
