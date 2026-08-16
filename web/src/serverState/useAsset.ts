import { useCallback } from "react";
import { Asset, Video, Audio, Image, Document, Model3DRef } from "../stores/ApiTypes";
import { useAssetStore } from "../stores/AssetStore";
import { useQuery } from "@tanstack/react-query";
import { fileUriToHttpUrl } from "../utils/localFile";
import { assetIdFromLocator } from "../utils/mediaRef";

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
    typeof assetResource?.asset_id === "string" &&
    assetResource.asset_id.trim() !== ""
      ? assetResource.asset_id.trim()
      : undefined;
  const assetId =
    declaredId ??
    assetIdFromLocator(
      typeof assetResource?.uri === "string" ? assetResource.uri : undefined
    );

  const load = useCallback(async () => {
    if (assetId) {
      return await getAsset(assetId);
    } else {
      return undefined;
    }
  }, [assetId, getAsset]);

  const { data: asset } = useQuery({
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
  const uri =
    fileHttpUrl ??
    (!resourceUri || resourceUri.startsWith("asset://")
      ? asset?.get_url || resourceUri || undefined
      : resourceUri);

  return { asset, uri };
}
