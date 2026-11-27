import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/gamedev/ai-game-engines");

export default function Page() {
  return <LocalizedPage locale="zh" route="/gamedev/ai-game-engines" />;
}
