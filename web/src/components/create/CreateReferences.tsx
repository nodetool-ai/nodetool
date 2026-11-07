/**
 * The references tray above the Create prompt: the pictures, clips and frames
 * a mode works from, each labelled with the role the mode gives it ("Source
 * image", "Start frame", "Source clip", "Reference"). Empty, it says what the
 * mode needs, so a mode that cannot run from a prompt alone explains itself.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  MediaThumbnail,
  SPACING,
  ToolbarIconButton
} from "../ui_primitives";
import {
  referenceKind,
  type CreateMode,
  type CreateReference
} from "../../stores/CreateViewStore";
import { CREATE_INPUT_NEEDS } from "./createRequest";

/** Side of one reference tile, in theme spacing units. */
const TILE_SIZE = 9;

type ReferenceRole = "source" | "startFrame" | "sourceClip" | "reference" | "unused";

/**
 * The role a reference plays in `mode`, by its place among the references of
 * its media family. Mirrors where `wireRequest` sends each one.
 */
export const referenceRole = (
  mode: CreateMode,
  reference: CreateReference,
  references: readonly CreateReference[]
): ReferenceRole => {
  const kind = referenceKind(reference);
  const sameKind = references.filter((item) => referenceKind(item) === kind);
  const first = sameKind[0]?.assetId === reference.assetId;
  switch (mode) {
    case "image_edit":
      return kind === "image" ? (first ? "source" : "reference") : "unused";
    case "image_to_video":
      return kind === "image" && first ? "startFrame" : "unused";
    case "reference_to_video":
      return kind === "image" || kind === "video" ? "reference" : "unused";
    case "retake":
      if (kind === "video") {
        return first ? "sourceClip" : "unused";
      }
      return kind === "image" ? "reference" : "unused";
    case "extend":
      return kind === "video" && first ? "sourceClip" : "unused";
    default:
      return "unused";
  }
};

/** Whether `mode` reads any attached references. */
export const modeTakesReferences = (mode: CreateMode): boolean =>
  CREATE_INPUT_NEEDS[mode] !== undefined;

interface CreateReferencesProps {
  mode: CreateMode;
  references: readonly CreateReference[];
  uploading: boolean;
  onAdd: () => void;
  onRemove: (assetId: string) => void;
}

const CreateReferences = ({
  mode,
  references,
  uploading,
  onAdd,
  onRemove
}: CreateReferencesProps) => {
  const { t } = useTranslation();
  const need = CREATE_INPUT_NEEDS[mode];

  if (!need && references.length === 0) {
    return null;
  }

  return (
    <FlexColumn gap={SPACING.xs} aria-label={t("create_view.references.label")} role="group">
      <FlexRow gap={SPACING.sm} align="flex-end" wrap sx={{ rowGap: SPACING.sm }}>
        {references.map((reference) => {
          const role = referenceRole(mode, reference, references);
          return (
            <FlexColumn
              key={reference.assetId}
              gap={SPACING.micro}
              data-testid="create-reference"
              sx={{ width: (theme) => theme.spacing(TILE_SIZE), opacity: role === "unused" ? 0.5 : 1 }}
            >
              <MediaThumbnail
                locator={{ asset_id: reference.assetId }}
                contentType={reference.contentType}
                alt={reference.name}
                aspectRatio="1/1"
                borderRadius={BORDER_RADIUS.sm}
                actions={
                  <ToolbarIconButton
                    icon={<CloseOutlinedIcon fontSize="inherit" />}
                    tooltip={t("create_view.references.remove")}
                    ariaLabel={t("create_view.references.removeLabel", { name: reference.name })}
                    onClick={() => onRemove(reference.assetId)}
                  />
                }
              />
              <Caption color={role === "unused" ? "muted" : "secondary"} noWrap>
                {t(`create_view.references.role.${role}`)}
              </Caption>
            </FlexColumn>
          );
        })}
        {need && (
          <Box sx={{ pb: SPACING.lg }}>
            <EditorButton
              variant="outlined"
              color="inherit"
              density="normal"
              startIcon={<AddOutlinedIcon fontSize="small" />}
              loading={uploading}
              onClick={onAdd}
            >
              {t(`create_view.references.add.${need}`)}
            </EditorButton>
          </Box>
        )}
      </FlexRow>
      {need && references.length === 0 && (
        <Caption color="secondary">{t(`create_view.references.hint.${mode}`)}</Caption>
      )}
    </FlexColumn>
  );
};

export default memo(CreateReferences);
