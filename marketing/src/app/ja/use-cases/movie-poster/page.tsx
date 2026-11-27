import LocalizedPage, { localizedMetadata } from "@/components/localized/LocalizedPage";

export const metadata = localizedMetadata("ja", "/use-cases/movie-poster");

export default function Page() {
  return <LocalizedPage locale="ja" route="/use-cases/movie-poster" />;
}
