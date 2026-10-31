import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_PARTICLE_PRESET_IDS, gameParticleEmitter, gameParticleIssues, gameParticles, getGameParticlePreset, type GameParticleEmitter } from "@nodetool-ai/protocol";

import { Caption, CurveEditor, EditorButton, FlexColumn, FlexRow, GradientEditor, InspectorFieldRow, InspectorSection, InspectorSelect, SPACING } from "../../../ui_primitives";
import ErrorBanner from "../../../support/ErrorBanner";
import SchemaFields from "../SchemaFields";
import type { GameComponentEditorProps } from "../componentEditors";
import ParticlePreview from "./ParticlePreview";

const CURVE_FIELDS = ["sizeOverLifetime", "speedOverLifetime", "opacityOverLifetime"] as const;
const CUSTOM_FIELDS = new Set<string>([...CURVE_FIELDS, "colorOverLifetime"]);
// The multiplicative identity is game data and must not change with the editor theme.
const IDENTITY_GRADIENT_COLOR = "#ffffff";

export default function ParticleEditor({ value, onChange, schema, assets, dimension, path, issuePath, issues }: GameComponentEditorProps) {
  const { t } = useTranslation();
  const parsed = useMemo(() => gameParticles.safeParse(value), [value]);
  const [selected, setSelected] = useState(0);
  const [preset, setPreset] = useState("");
  const [error, setError] = useState<string | null>(null);
  const emitterSchema = schema.properties?.emitters?.items ?? { type: "object" };
  const genericSchema = useMemo(() => ({ ...emitterSchema,
    properties: Object.fromEntries(Object.entries(emitterSchema.properties ?? {}).filter(([key]) => !CUSTOM_FIELDS.has(key))),
    required: emitterSchema.required?.filter((key) => !CUSTOM_FIELDS.has(key))
  }), [emitterSchema]);

  if (!parsed.success) {
    return <SchemaFields schema={schema} value={value} onChange={onChange} assets={assets} path={path} issuePath={issuePath} issues={issues} />;
  }
  const particles = parsed.data;
  const curves = CURVE_FIELDS.map((field) => ({ field, label: t(`i18n-next2.particleEditor.curves.${field}`) }));
  const index = Math.min(selected, particles.emitters.length - 1);
  const emitter = particles.emitters[index];
  const commit = (next: unknown): void => {
    const checked = gameParticles.safeParse(next);
    const problems = checked.success ? gameParticleIssues(checked.data) : checked.error.issues;
    if (problems.length > 0) { setError(problems.map((problem) => problem.message).join(". ")); return; }
    if (checked.success) { setError(null); onChange(checked.data); }
  };
  const replaceEmitter = (next: unknown): void => {
    const checked = gameParticleEmitter.safeParse(next);
    if (!checked.success) { setError(checked.error.issues.map((problem) => problem.message).join(". ")); return; }
    const updated = particles.emitters.map((item, position) => position === index ? checked.data : item);
    commit({ emitters: updated.map((item) => ({ ...item, onDeath: item.onDeath.map((target) =>
      target.emitter === emitter.id ? { ...target, emitter: checked.data.id } : target) })) });
  };
  const change = (patch: Partial<GameParticleEmitter>): void => replaceEmitter({ ...emitter, ...patch });
  const add = (): void => {
    const names = new Set(particles.emitters.map((item) => item.id));
    let suffix = 1;
    while (names.has(`emitter-${suffix}`)) { suffix += 1; }
    commit({ emitters: [...particles.emitters, gameParticleEmitter.parse({ id: `emitter-${suffix}` })] });
    setSelected(particles.emitters.length);
  };
  const remove = (): void => {
    commit({ emitters: particles.emitters.filter((_, position) => position !== index).map((item) =>
      ({ ...item, onDeath: item.onDeath.filter((target) => target.emitter !== emitter.id) })) });
    setSelected(Math.max(0, index - 1));
  };

  return <FlexColumn gap={SPACING.sm}>
    <InspectorFieldRow label={t("i18n-next2.particleEditor.preset")}>
      <InspectorSelect grow label={t("i18n-next2.particleEditor.particlePreset")} value={preset} options={[
        { value: "", label: t("i18n-next2.particleEditor.choosePreset") }, ...GAME_PARTICLE_PRESET_IDS.map((id) => ({ value: id, label: t(`i18n-next2.particleEditor.presetNames.${id}`) }))
      ]} onChange={setPreset} />
      <EditorButton disabled={!preset} sx={{ flexShrink: 0, whiteSpace: "nowrap" }} onClick={() => { commit(getGameParticlePreset(preset, dimension)); setSelected(0); }}>{t("i18n-next2.particleEditor.applyPreset")}</EditorButton>
    </InspectorFieldRow>
    <Caption>{t("i18n-next2.particleEditor.presetHint")}</Caption>
    <ParticlePreview particles={particles} dimension={dimension} assets={assets} />
    <InspectorFieldRow label={t("i18n-next2.particleEditor.emitter")}>
      <InspectorSelect grow label={t("i18n-next2.particleEditor.particleEmitter")} value={String(index)} options={particles.emitters.map((item, position) =>
        ({ value: String(position), label: item.id }))} onChange={(next) => setSelected(Number(next))} />
    </InspectorFieldRow>
    <FlexRow gap={SPACING.sm}>
      <EditorButton disabled={particles.emitters.length >= 8} onClick={add}>{t("i18n-next2.particleEditor.addEmitter")}</EditorButton>
      <EditorButton disabled={particles.emitters.length <= 1} onClick={remove}>{t("i18n-next2.particleEditor.removeEmitter")}</EditorButton>
    </FlexRow>
    <SchemaFields schema={genericSchema} value={emitter} onChange={replaceEmitter} assets={assets}
      path={`${path}.emitters.${index}`} issuePath={[...issuePath, "emitters", index]} issues={issues} />
    {curves.map(({ field, label }) => <InspectorSection key={field} title={label}>
      {emitter[field] ? <>
        <CurveEditor label={label} value={emitter[field]} onChange={(keys) => change({ [field]: keys })} />
        <EditorButton onClick={() => { const next = { ...emitter }; delete next[field]; replaceEmitter(next); }}>{t("i18n-next2.particleEditor.removeCurve", { curve: label })}</EditorButton>
      </> : <EditorButton onClick={() => change({ [field]: [{ t: 0, value: 1 }, { t: 1, value: 1 }] })}>{t("i18n-next2.particleEditor.addCurve", { curve: label })}</EditorButton>}
    </InspectorSection>)}
    <InspectorSection title={t("i18n-next2.particleEditor.colorOverLifetime")}>
      {emitter.colorOverLifetime ? <>
        <GradientEditor label={t("i18n-next2.particleEditor.particleColorOverLifetime")} value={emitter.colorOverLifetime} onChange={(keys) => change({ colorOverLifetime: keys })} />
        <EditorButton onClick={() => { const next = { ...emitter }; delete next.colorOverLifetime; replaceEmitter(next); }}>{t("i18n-next2.particleEditor.removeColorOverLifetime")}</EditorButton>
      </> : <EditorButton onClick={() => change({ colorOverLifetime: [{ t: 0, color: IDENTITY_GRADIENT_COLOR }] })}>{t("i18n-next2.particleEditor.addColorOverLifetime")}</EditorButton>}
    </InspectorSection>
    {error && <ErrorBanner report={{ source: "panel-crash", summary: t("i18n-next2.particleEditor.invalidSettings"), errorText: error }}>{error}</ErrorBanner>}
  </FlexColumn>;
}
