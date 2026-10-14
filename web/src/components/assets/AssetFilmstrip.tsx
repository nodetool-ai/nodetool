import { memo } from "react";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Asset } from "../../stores/ApiTypes";
import AssetItem from "./AssetItem";
import {
  EditorButton,
  FlexRow,
  SPACING,
  ToolbarIconButton
} from "../ui_primitives";
import type { FilmstripThumb, FilmstripWindow } from "./assetViewerModel";

type AssetFilmstripProps = {
  current: Asset | undefined;
  strip: FilmstripWindow;
  /** Compare mode hides the prev and next buttons; thumbnails pick the second image. */
  compareMode: boolean;
  compareSelectedId: string | undefined;
  onPrev: () => void;
  onNext: () => void;
  onThumbnail: (asset: Asset, index: number) => void;
};

const Thumbnail = ({ asset }: { asset: Asset }) => (
  <AssetItem
    asset={asset}
    draggable={false}
    isParent={false}
    showDeleteButton={false}
    enableContextMenu={false}
    showName={false}
    showDuration={true}
    showFiletype={true}
  />
);

/**
 * The strip along the bottom of the asset viewer: the current asset in the
 * middle, its neighbours on either side. Styled by the viewer's dialog css.
 */
const AssetFilmstrip = ({
  current,
  strip,
  compareMode,
  compareSelectedId,
  onPrev,
  onNext,
  onThumbnail
}: AssetFilmstripProps) => {
  const renderThumb = ({ asset, index }: FilmstripThumb) => (
    <EditorButton
      className={`item ${compareSelectedId === asset.id ? "compare-selected" : ""}`}
      key={asset.id || index}
      onMouseDown={() => onThumbnail(asset, index)}
      density="compact"
    >
      <Thumbnail asset={asset} />
    </EditorButton>
  );

  return (
    <>
      {!compareMode && (
        <>
          <ToolbarIconButton
            icon={<KeyboardArrowLeftIcon />}
            tooltip="Previous asset"
            onClick={onPrev}
            disabled={!strip.hasPrev}
            className="prev-next-button left"
            nodrag={false}
          />
          <ToolbarIconButton
            icon={<KeyboardArrowRightIcon />}
            tooltip="Next asset"
            onClick={onNext}
            disabled={!strip.hasNext}
            className="prev-next-button right"
            nodrag={false}
          />
        </>
      )}
      <FlexRow
        className="asset-navigation"
        align="flex-end"
        justify="center"
        gap={SPACING.xs}
      >
        <FlexRow
          className="prev-next-items left"
          align="center"
          justify="flex-end"
          gap={SPACING.micro}
        >
          {strip.before.map(renderThumb)}
        </FlexRow>
        <FlexRow
          key={current?.id}
          className={`prev-next-items current ${
            compareSelectedId !== undefined && compareSelectedId === current?.id
              ? "compare-selected"
              : ""
          }`}
          align="center"
          justify="center"
        >
          <Thumbnail asset={current as Asset} />
        </FlexRow>
        <FlexRow
          className="prev-next-items right"
          align="center"
          justify="flex-start"
          gap={SPACING.micro}
        >
          {strip.after.map(renderThumb)}
        </FlexRow>
      </FlexRow>
    </>
  );
};

export default memo(AssetFilmstrip);
