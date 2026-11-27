import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/alternatives/lm-studio");

export default function Page() {
  return <LocalizedPage locale="zh" route="/alternatives/lm-studio" />;
}
