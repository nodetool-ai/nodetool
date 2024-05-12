import { useState } from "react";
import { Asset } from "../../stores/ApiTypes";
import WaveRecorder from "../audio/WaveRecorder";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { useAsset } from "../../serverState/useAsset";
import AudioPlayer from "../audio/AudioPlayer";
import PropertyLabel from "../node/PropertyLabel";
import AssetViewer from "../assets/AssetViewer";
import { PropertyProps } from "../node/PropertyInput";

export default function AudioProperty(props: PropertyProps) {
  const id = `audio-${props.property.name}-${props.propertyIndex}`;
  const onChangeAsset = (asset: Asset) => props.onChange({ asset_id: asset.id, uri: asset.get_url, type: "audio" });
  const { onDrop, onDragOver, filename } = useFileDrop({
    onChangeAsset,
    uploadAsset: true,
    type: "audio"
  });
  const { asset, uri } = useAsset({ audio: props.value });
  const [openViewer, setOpenViewer] = useState(false);

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id} />

      <WaveRecorder onChange={onChangeAsset} />
      <div id={id} aria-labelledby={id} className="audio-drop">
        <div
          className={`dropzone ${uri ? "dropped" : ""}`}
          style={{
            borderWidth: uri === "" ? "2px" : "0px"
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {asset || uri ? (
            <>
              <AssetViewer
                contentType="audio/*"
                asset={asset ? asset : undefined}
                url={uri ? uri : undefined}
                open={openViewer}
                onClose={() => setOpenViewer(false)} />
              <audio
                style={{ width: "100%", height: "20px" }}
                onVolumeChange={(e) => (e.currentTarget.volume = 1)}
                src={uri as string}
              >
                Your browser does not support the audio element.
              </audio>
              <p className="centered uppercase">{filename}</p>
              <AudioPlayer filename={filename} url={uri as string} />
            </>
          ) : (
            <p className="centered uppercase">Drop audio</p>
          )}
        </div>
      </div>
    </>
  );
}
