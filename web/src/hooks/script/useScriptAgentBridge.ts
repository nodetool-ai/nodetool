/**
 * useScriptAgentBridge
 *
 * Registers a {@link ScriptAgentHandler} for the surrounding Script surface
 * while it is active, so the `ui_script_*` agent tools operate on this script.
 * Mirrors {@link useStoryboardAgentBridge}: only the active surface registers,
 * and the handler is cleared on unmount unless already replaced.
 */

import { useEffect, useMemo } from "react";

import {
  useScriptStore,
  effectiveVoice,
  lineStatus,
  type ScriptDraft,
  type ScriptLine,
  type ScriptSpeaker,
  type VoiceBinding
} from "../../stores/script/ScriptStore";
import { voiceLine, voiceAll } from "../../stores/script/scriptVoicing";
import { exportScriptSubtitles } from "../../stores/script/scriptSubtitles";
import { useAssembleScriptTimeline } from "./useAssembleScriptTimeline";
import {
  getScriptAgentHandler,
  hasScriptAgentHandler,
  setScriptAgentHandler,
  type ScriptAgentHandler,
  type ScriptLineNode,
  type ScriptSnapshot,
  type ScriptSpeakerNode
} from "../../components/script/scriptAgentBridge";

/** Flatten every line of the script with its section id and document index. */
const flatLines = (
  script: ScriptDraft
): Array<{ line: ScriptLine; sectionId: string; index: number }> => {
  const out: Array<{ line: ScriptLine; sectionId: string; index: number }> = [];
  let index = 0;
  for (const section of script.sections) {
    for (const line of section.lines) {
      out.push({ line, sectionId: section.id, index });
      index += 1;
    }
  }
  return out;
};

const toSpeakerNode = (speaker: ScriptSpeaker): ScriptSpeakerNode => ({
  id: speaker.id,
  name: speaker.name,
  color: speaker.color,
  voice: speaker.voice ?? null
});

export const useScriptAgentBridge = (
  scriptId: string,
  active: boolean
): void => {
  const { assemble } = useAssembleScriptTimeline();

  const handler = useMemo<ScriptAgentHandler>(() => {
    const store = () => useScriptStore.getState();

    const requireScript = (): ScriptDraft => {
      const script = store().getScript(scriptId);
      if (!script) {
        throw new Error("No script is open.");
      }
      return script;
    };

    /** Resolve a line by id or 0-based document index. */
    const requireLine = (
      target: string
    ): { line: ScriptLine; sectionId: string } => {
      const script = requireScript();
      const flat = flatLines(script);
      const byId = flat.find((f) => f.line.id === target);
      if (byId) return byId;
      const asIndex = Number(target);
      if (Number.isInteger(asIndex)) {
        const byIndex = flat.find((f) => f.index === asIndex);
        if (byIndex) return byIndex;
      }
      throw new Error(`Line not found in the script: ${target}`);
    };

    const requireSpeaker = (speakerId: string): ScriptSpeaker => {
      const speaker = requireScript().cast.find((s) => s.id === speakerId);
      if (!speaker) {
        throw new Error(`Speaker not found in the cast: ${speakerId}`);
      }
      return speaker;
    };

    const toLineNode = (
      line: ScriptLine,
      sectionId: string,
      index: number,
      cast: ScriptSpeaker[]
    ): ScriptLineNode => {
      const voice = effectiveVoice(line, cast);
      const take = line.takes.find((t) => t.id === line.currentTakeId);
      const speaker = cast.find((s) => s.id === line.speakerId);
      return {
        id: line.id,
        index,
        sectionId,
        speakerId: line.speakerId ?? null,
        speakerName: speaker?.name ?? null,
        text: line.text,
        direction: line.direction,
        pauseAfterMs: line.pauseAfterMs,
        status: lineStatus(line, voice),
        takeCount: line.takes.length,
        currentTakeDurationMs: take ? take.durationMs : null
      };
    };

    const reReadLine = (lineId: string): ScriptLineNode => {
      const script = requireScript();
      const flat = flatLines(script);
      const found = flat.find((f) => f.line.id === lineId);
      if (!found) {
        throw new Error(`Line ${lineId} disappeared after the edit.`);
      }
      return toLineNode(found.line, found.sectionId, found.index, script.cast);
    };

    const getSnapshot = (): ScriptSnapshot => {
      const script = requireScript();
      return {
        scriptId,
        title: script.title,
        cast: script.cast.map(toSpeakerNode),
        lines: flatLines(script).map((f) =>
          toLineNode(f.line, f.sectionId, f.index, script.cast)
        ),
        hasTimeline: script.timelineId !== null,
        timelineId: script.timelineId
      };
    };

    return {
      getSnapshot,

      addSpeaker(name: string, voice?: VoiceBinding) {
        requireScript();
        const id = crypto.randomUUID();
        const speaker: ScriptSpeaker = { id, name, voice: voice ?? null };
        store().addSpeaker(scriptId, speaker);
        const created = requireSpeaker(id);
        return toSpeakerNode(created);
      },

      setSpeakerVoice(speakerId: string, voice: VoiceBinding) {
        requireSpeaker(speakerId);
        store().updateSpeaker(scriptId, speakerId, { voice });
        return toSpeakerNode(requireSpeaker(speakerId));
      },

      addLine(input) {
        const script = requireScript();
        // Insert before the line currently at `index`; append when omitted or
        // out of range. Anchor to that line's section so it lands nearby.
        const flat = flatLines(script);
        const anchor =
          input.index !== undefined ? flat[input.index] : undefined;
        const lineId = store().addLine(scriptId, anchor?.sectionId);
        store().patchLine(scriptId, lineId, {
          text: input.text,
          speakerId: input.speakerId ?? null,
          direction: input.direction
        });
        if (anchor) {
          // The new line was appended to the anchor's section; move it to sit
          // just before the anchor within that section.
          const section = store()
            .getScript(scriptId)
            ?.sections.find((s) => s.id === anchor.sectionId);
          if (section) {
            const others = section.lines
              .filter((l) => l.id !== lineId)
              .map((l) => l.id);
            const at = others.indexOf(anchor.line.id);
            others.splice(at >= 0 ? at : others.length, 0, lineId);
            store().reorderLines(scriptId, section.id, others);
          }
        }
        return reReadLine(lineId);
      },

      setLineText(target, text) {
        const { line } = requireLine(target);
        store().patchLine(scriptId, line.id, { text });
        return reReadLine(line.id);
      },

      setLineSpeaker(target, speakerId) {
        const { line } = requireLine(target);
        if (speakerId !== null) requireSpeaker(speakerId);
        store().patchLine(scriptId, line.id, { speakerId });
        return reReadLine(line.id);
      },

      async voiceLine(target) {
        const { line } = requireLine(target);
        await voiceLine(scriptId, line.id);
        return reReadLine(line.id);
      },

      async voiceAll() {
        const voiced = await voiceAll(scriptId);
        return { voiced };
      },

      async sendToTimeline() {
        const result = await assemble(scriptId);
        return {
          sequenceId: result.sequenceId,
          clipCount: result.clipCount,
          skippedLineIds: result.skippedLineIds,
          reassembled: result.reassembled
        };
      },

      exportSubtitles(options) {
        const script = requireScript();
        const result = exportScriptSubtitles(script, options);
        if (!result) {
          throw new Error(
            "No voiced lines to export — voice at least one line first."
          );
        }
        return {
          text: result.text,
          format: result.format,
          cueCount: result.cueCount
        };
      }
    };
  }, [scriptId, assemble]);

  useEffect(() => {
    if (!active) return;
    setScriptAgentHandler(handler);
    return () => {
      if (hasScriptAgentHandler() && getScriptAgentHandler() === handler) {
        setScriptAgentHandler(null);
      }
    };
  }, [active, handler]);
};

export default useScriptAgentBridge;
