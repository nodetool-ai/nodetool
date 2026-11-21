import type { ReactNode } from "react";
import {
  Checklist,
  Field,
  Note,
  Panel,
  Row,
  Shots,
  StepDiagram,
  Still,
  Tags,
  Timeline
} from "./StepDiagram";

/*
 * Run 2026-09-10-marketing-recipes-01, multilingual-video-dubber. Lines come
 * from documents/source-en.srt and target-es.txt, line windows from
 * documents/line-map.json, and Script settings from the recorded captures.
 */

const english = [
  "Start with a short brief. Review the words, choose a voice, and listen before you export.",
  "When one line needs a change, edit that line and record it again.",
  "Your script stays editable, so the next version starts from work you already have."
];

const spanish = [
  "Empieza con una breve descripción. Revisa el texto, elige una voz y escucha el resultado antes de exportarlo.",
  "Si necesitas cambiar una frase, edítala y vuelve a grabarla.",
  "Tu guion sigue siendo editable, así que la siguiente versión parte del trabajo que ya tienes."
];

const directions = [
  "Claro y didáctico.",
  "Natural, directo y cálido.",
  "Tranquilizador, con cierre positivo."
];

function SpanishLines({
  withDirection = false,
  take
}: {
  readonly withDirection?: boolean;
  readonly take?: (index: number) => ReactNode;
}) {
  return (
    <Shots
      items={spanish.map((line, index) => ({
        label: "Narrator",
        text: (
          <span lang="es">
            {line}
            {withDirection && (
              <span className="mt-1 block text-xs italic text-slate-400">
                {directions[index]}
              </span>
            )}
            {take && (
              <span className="mt-1 block text-xs not-italic">{take(index)}</span>
            )}
          </span>
        )
      }))}
    />
  );
}

const sourceFrame = (
  <Still
    src="dub/source-en.webp"
    alt="The English presenter speaking to camera."
    width={480}
    height={272}
    size="lg"
    label="English source · 22.6s"
  />
);

export const multilingualVideoSteps: Record<string, ReactNode> = {
  translation: (
    <StepDiagram
      give={
        <>
          {sourceFrame}
          <Shots
            items={english.map((line) => ({ label: "English", text: line }))}
          />
        </>
      }
      does={{
        where: "Agent",
        title: "Transcribe, then translate",
        notes: [
          "Compare the transcript with the audio",
          "Check meaning, names, and pronunciation before Script"
        ]
      }}
      get={
        <Shots
          items={spanish.map((line) => ({
            label: "Spanish",
            text: <span lang="es">{line}</span>
          }))}
        />
      }
    />
  ),
  idea: (
    <StepDiagram
      give={<Tags items={["Three reviewed Spanish lines"]} />}
      does={{
        where: "Script · Idea",
        title: "Import your words as written",
        notes: ["Choose Script when you create the project", "Keep the imported words"]
      }}
      get={<SpanishLines />}
    />
  ),
  format: (
    <StepDiagram
      give={<SpanishLines />}
      does={{
        where: "Script · Format",
        title: "Choose voiceover narration",
        notes: ["Set a target close to the source video"]
      }}
      get={
        <Panel title="Format">
          <Field label="Format">Voiceover narration</Field>
          <Field label="Target length">Custom, 23 seconds</Field>
          <Field label="Source video">22.6 seconds</Field>
          <Note>The real voice length is measured after voicing.</Note>
        </Panel>
      }
    />
  ),
  review: (
    <StepDiagram
      give={<Tags items={["Speaker per line", "Wording per line"]} />}
      does={{
        where: "Script · Format · Review",
        title: "Read every line before you pay to voice it",
        notes: ["Fix language here, not after voicing"]
      }}
      get={<SpanishLines withDirection />}
    />
  ),
  voices: (
    <StepDiagram
      give={<SpanishLines />}
      does={{
        where: "Script · Voices",
        title: "Audition a voice on your own words",
        notes: [
          "Choosing Spanish here does not translate the script",
          "Check pronunciation before voicing every line"
        ]
      }}
      get={
        <Panel title="Narrator">
          <Field label="Language and pace">Spanish, Normal</Field>
          <Field label="Voice model">Kokoro Spanish (fal)</Field>
          <Field label="Voice">ef_dora</Field>
          <Field label="Audition reads">
            <span lang="es">“Empieza con una breve descripción…”</span>
          </Field>
        </Panel>
      }
    />
  ),
  takes: (
    <StepDiagram
      give={<Tags items={["Kokoro Spanish · ef_dora", "Three lines"]} />}
      does={{
        where: "Script editor · Voice all",
        title: "Voice every line",
        notes: ["Listen to each line on its own"]
      }}
      get={
        <>
          <SpanishLines take={() => "Voiced"} />
          <Note>
            16.3 seconds of voice against a 22.6-second source. Fit it on the
            timeline, not by the target length.
          </Note>
        </>
      }
    />
  ),
  revise: (
    <StepDiagram
      give={
        <Shots
          items={[
            {
              label: "Line 2",
              text: <span lang="es">{spanish[1]}</span>
            }
          ]}
        />
      }
      does={{
        where: "Script editor · Line 2",
        title: "Redirect one line and voice it again",
        notes: ["Lines 1 and 3 keep their accepted takes"]
      }}
      get={
        <SpanishLines
          take={(index) =>
            index === 1 ? (
              <span className="text-amber-200">Take 1 · Take 2, choose one</span>
            ) : (
              "Accepted take kept"
            )
          }
        />
      }
    />
  ),
  timeline: (
    <StepDiagram
      wideResult
      give={
        <Row>
          {sourceFrame}
          <Tags items={["Three Spanish takes"]} />
        </Row>
      }
      does={{
        where: "Timeline",
        title: "Fit the voice to the picture",
        notes: [
          "Mute the original speech",
          "Align each line inside its English window",
          "Export captions with the final timing"
        ]
      }}
      get={
        <Timeline
          duration={22.625}
          tracks={[
            {
              label: "Picture",
              clips: [{ start: 0, end: 22.625, src: "dub/source-en.webp", label: "Source video" }]
            },
            {
              label: "English",
              clips: [
                { start: 0, end: 9, tone: "muted", label: "Line 1" },
                { start: 9, end: 15.5, tone: "muted", label: "Line 2" },
                { start: 15.5, end: 22.625, tone: "muted", label: "Line 3" }
              ]
            },
            {
              label: "Spanish",
              clips: [
                { start: 0, end: 8.22, tone: "voice", label: "Línea 1" },
                { start: 9, end: 14.04, tone: "voice", label: "Línea 2" },
                { start: 15.5, end: 21.84, tone: "voice", label: "Línea 3" }
              ]
            }
          ]}
          caption="Line windows from the comparison cut: each Spanish line starts where its English line starts and ends before the next."
        />
      }
    />
  ),
  "lip-sync": (
    <StepDiagram
      give={
        <Row>
          {sourceFrame}
          <Tags items={["Accepted Spanish audio"]} />
        </Row>
      }
      does={{
        where: "Agent · Lip sync",
        title: "Pick the delivery",
        notes: ["Lip sync is a separate pass on the source picture"]
      }}
      get={
        <>
          <Row align="start">
            <div className="min-w-0 flex-1">
              <Still
                src="dub/voiceover-es.webp"
                alt="Spanish voiceover cut with captions."
                width={480}
                height={272}
                label="Voiceover cut"
              />
            </div>
            <div className="min-w-0 flex-1">
              <Still
                src="dub/lipsync-es.webp"
                alt="Spanish lip-sync cut with captions."
                width={480}
                height={272}
                label="Lip-sync cut"
              />
            </div>
          </Row>
          <Checklist
            pending
            items={["Mouth movement, timing, and pronunciation still need a human review in this example"]}
          />
        </>
      }
    />
  )
};
