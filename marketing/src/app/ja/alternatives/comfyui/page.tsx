import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/alternatives/comfyui");

export default function Page() {
  return <LocalizedPage locale="ja" route="/alternatives/comfyui" />;
}
