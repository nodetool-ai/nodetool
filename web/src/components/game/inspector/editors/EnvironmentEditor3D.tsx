import { gameEnvironment3D, gameHeightFog3D } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";
import { FlexColumn, InspectorFieldRow, InspectorSelect, SPACING } from "../../../ui_primitives";
import SchemaFields from "../SchemaFields";
import type { GameComponentEditorProps } from "../componentEditors";
import { gameSchemaFields } from "../schemaForm";

const BASE_FIELDS = gameSchemaFields(gameEnvironment3D.omit({ fog: true }));
const HEIGHT_FIELDS = gameSchemaFields(gameHeightFog3D.omit({ kind: true }));
const LINEAR_FIELDS = gameSchemaFields(gameEnvironment3D.shape.fog.unwrap().options[0]);

export default function EnvironmentEditor3D({ value, onChange, path, issuePath, issues, assets }: GameComponentEditorProps) {
  const { t } = useTranslation();
  const environment = gameEnvironment3D.parse(value);
  const { fog, ...base } = environment;
  const mode = !fog ? "none" : "kind" in fog ? "height" : "linear";
  const fogPath = path ? `${path}.fog` : "fog";
  return <FlexColumn gap={SPACING.sm}>
    <SchemaFields schema={BASE_FIELDS} value={base} path={path} issuePath={issuePath} issues={issues} assets={assets}
      onChange={(value) => {
        const next = gameEnvironment3D.parse(value);
        if (fog) { next.fog = fog; }
        onChange(next);
      }} />
    <InspectorFieldRow label={t("game.environment.fields.fogMode")}><InspectorSelect grow label={t("game.environment.fields.fogMode")} value={mode} options={[{ value: "none", label: t("game.environment.fog.none") }, { value: "linear", label: t("game.environment.fog.linear") }, { value: "height", label: t("game.environment.fog.height") }]}
      onChange={(mode) => {
        if (mode === "none") { onChange(base); return; }
        const color = fog?.color ?? "#ffffff";
        onChange({ ...base, fog: mode === "height" ? gameHeightFog3D.parse({ kind: "height", color }) : { color, near: 5, far: 50 } });
      }} /></InspectorFieldRow>
    {fog && <SchemaFields schema={mode === "height" ? HEIGHT_FIELDS : LINEAR_FIELDS} value={fog} path={fogPath}
      issuePath={[...issuePath, "fog"]} issues={issues} assets={assets} onChange={(value) => {
        const edited = mode === "height" ? gameHeightFog3D.parse(value) : value;
        onChange(gameEnvironment3D.parse({ ...base, fog: edited }));
      }} />}
  </FlexColumn>;
}
