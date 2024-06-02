import { Asset, Video, Audio, Image } from "../stores/ApiTypes";
import { useAssetStore } from "../hooks/AssetStore";
import { useQuery } from "react-query";

type UseAssetProps = {
  audio?: Audio;
  image?: Image;
  video?: Video;
};

const assetResourceFromType = (props: UseAssetProps) => {
  if (props.audio) {
    return props.audio;
  } else if (props.image) {
    return props.image;
  } else if (props.video) {
    return props.video;
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

  const { data: asset } = useQuery(["asset", assetResource?.asset_id], load, {
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
