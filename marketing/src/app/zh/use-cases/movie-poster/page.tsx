import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("zh", "/use-cases/movie-poster");

export default function Page() {
  return <LocalizedPage locale="zh" route="/use-cases/movie-poster" />;
}
