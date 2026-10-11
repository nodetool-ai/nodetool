import { useCallback } from "react";
import { Video, Audio, Image, Document, Model3DRef } from "../stores/ApiTypes";
import { useAssetStore } from "../stores/AssetStore";
import { useQuery } from "@tanstack/react-query";
import { fileUriToHttpUrl } from "../utils/localFile";
import { assetIdFromLocator } from "../utils/mediaRef";
import { resolveStaticMediaUri } from "../utils/resolveMediaUri";

type UseAssetProps = {
  audio?: Audio;
  image?: Image;
  video?: Video;
  document?: Document;
  model3d?: Model3DRef;
};

const assetResourceFromType = (props: UseAssetProps) => {
  if (props.audio) {
    return props.audio;
  } else if (props.image) {
    return props.image;
  } else if (props.video) {
    return props.video;
  } else if (props.document) {
    return props.document;
  } else if (props.model3d) {
    return props.model3d;
  } else {
    return null;
  }
};

export function useAsset(props: UseAssetProps) {
  const getAsset = useAssetStore((state) => state.get);
  const assetResource = assetResourceFromType(props);

  const declaredId =
    assetResource?.asset_id != null &&
    assetResource.asset_id.trim() !== ""
      ? assetResource.asset_id.trim()
      : undefined;
  const assetId =
    declaredId ??
    assetIdFromLocator(
      assetResource?.uri
    );

  const load = useCallback(async () => {
    if (assetId) {
      return await getAsset(assetId);
    } else {
      return undefined;
    }
  }, [assetId, getAsset]);

  const { data: asset, isPending } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: load,
    enabled: Boolean(assetId)
  });

  const resourceUri = assetResource?.uri;
  // `file://` URIs (local-mode drops in Electron) can't be loaded directly by
  // the renderer under webSecurity — point them at the backend's
  // `/api/files/local` streaming endpoint, same as the output-rendering path's
  // `useSignedUrl`.
  const fileHttpUrl = fileUriToHttpUrl(resourceUri);
  // A `/api/storage/<key>` uri is one the server derived from the asset id. Its
  // key can be stale (flat, `.bin`) and the cloud backends serve the bytes only
  // through a signed URL, so the asset's own `get_url` wins whenever there is
  // an id to look up.
  const derivedFromAsset =
    !resourceUri ||
    resourceUri.startsWith("asset://") ||
    (assetId !== undefined && resourceUri.startsWith("/api/storage/"));
  // While the lookup is in flight there is no URL yet. Rendering the stored one
  // meanwhile fetched a URL known to fail and logged a broken image.
  const lookupPending = assetId !== undefined && isPending;
  const uri =
    fileHttpUrl ??
    (derivedFromAsset
      ? asset?.get_url ||
        (lookupPending ? undefined : resolveStaticMediaUri(resourceUri)) ||
        undefined
      : resolveStaticMediaUri(resourceUri) || undefined);

  return { asset, uri };
}
