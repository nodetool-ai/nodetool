import { queryClient } from "../../queryClient";
import { restFetch } from "../rest-fetch";
import { setPresetCatalog } from "./catalog";

/** Run inside metadata boot, after auth and before catalogue consumers mount. */
export async function loadRuntimePresetCatalog(): Promise<void> {
  const data: unknown = await queryClient.fetchQuery({
    queryKey: ["presets", "catalog"],
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await restFetch("/api/presets", { signal });
      if (!response.ok) { throw new Error("Failed to load preset catalogue"); }
      return response.json();
    }
  });
  setPresetCatalog(data);
}
