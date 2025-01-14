import { Asset, Video, Audio, Image, Document } from "../stores/ApiTypes";
import { useAssetStore } from "../stores/AssetStore";
import { useQuery } from "@tanstack/react-query";

type UseAssetProps = {
  audio?: Audio;
  image?: Image;
  video?: Video;
  document?: Document;
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
  } else {
    return null;
  }
};

export function useAsset(props: UseAssetProps): {
  asset?: Asset;
  uri?: string;
} {
  const getAsset = useAssetStore((state) => state.get);
  const assetResource = assetResourceFromType(props);

  const load = async () => {
    if (assetResource?.asset_id) {
      return await getAsset(assetResource.asset_id);
    } else {
      return undefined;
    }
  };

  const { data: asset } = useQuery({
    queryKey: ["asset", assetResource?.asset_id],
    queryFn: load,
    enabled: !!assetResource?.asset_id
  });

  if (assetResource?.uri) {
    return {
      uri: assetResource.uri
    };
  } else {
    return { asset, uri: asset?.get_url || undefined };
  }
}
