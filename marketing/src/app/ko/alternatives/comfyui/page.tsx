import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ko", "/alternatives/comfyui");

export default function Page() {
  return <LocalizedPage locale="ko" route="/alternatives/comfyui" />;
}
