/** Input widgets: they write a bound value and fire the widget's events. */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  composeUserMessage,
  encodeBinding,
  messageText,
  messagesFrom,
  parseChoiceCardOptions
} from "@nodetool-ai/app-runtime";
import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useWidgetRuntime
} from "../runtime/context";
import { listModels, mediaUrl, uploadFile, type MediaKind, type ModelOption } from "../runtime/server";
import type { WorkflowInputIO } from "../runtime/workflowIO";
import { Markdown } from "./Markdown";
import { ValueView } from "./display";
import { FieldLabel, Placeholder, isRecord, numOr, str, type WidgetProps } from "./shared";

const clamp = (value: number, min?: number, max?: number): number =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

const optionValues = (raw: unknown): Array<{ value: string; label: string }> =>
  Array.isArray(raw)
    ? raw
        .map((option) =>
          typeof option === "string"
            ? { value: option, label: option }
            : isRecord(option)
              ? { value: str(option.value), label: str(option.label) || str(option.value) }
              : { value: "", label: "" }
        )
        .filter((option) => option.value !== "")
    : [];

export function TextInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const multiline = widget.props.multiline === true || widget.props.multiline === "yes";
  const common = {
    id,
    className: "nt-input",
    value: str(value),
    placeholder: str(widget.props.placeholder),
    disabled: widget.disabled,
    onBlur: () => emit("change", "commit")
  };
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      {multiline ? (
        <textarea
          {...common}
          rows={4}
          onChange={(event) => {
            setValue(event.target.value);
            emit("change");
          }}
        />
      ) : (
        <input
          {...common}
          type="text"
          onChange={(event) => {
            setValue(event.target.value);
            emit("change");
          }}
        />
      )}
      {str(widget.props.hint) ? <div className="nt-hint">{str(widget.props.hint)}</div> : null}
    </div>
  );
}

export function NumberInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const min = typeof widget.props.min === "number" ? widget.props.min : undefined;
  const max = typeof widget.props.max === "number" ? widget.props.max : undefined;
  const [text, setText] = useState(() => (value == null ? "" : String(value)));
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      <input
        id={id}
        className="nt-input"
        type="number"
        min={min}
        max={max}
        step={typeof widget.props.step === "number" ? widget.props.step : undefined}
        value={text}
        disabled={widget.disabled}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value === "" || Number.isNaN(parsed)) return;
          setValue(clamp(parsed, min, max));
          emit("change");
        }}
        onBlur={() => emit("change", "commit")}
      />
    </div>
  );
}

export function SliderWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const min = numOr(widget.props.min, 0);
  const max = numOr(widget.props.max, 100);
  const step = numOr(widget.props.step, 1);
  const current = typeof value === "number" ? value : min;
  return (
    <div className="nt-field">
      <div className="nt-row">
        <FieldLabel text={str(widget.props.label)} htmlFor={id} />
        <span className="nt-hint">{current}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={widget.disabled}
        onChange={(event) => {
          setValue(Number(event.target.value));
          emit("change");
        }}
        onPointerUp={() => emit("change", "commit")}
        onKeyUp={() => emit("change", "commit")}
      />
    </div>
  );
}

export function SwitchWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  return (
    <label className="nt-switch">
      <input
        type="checkbox"
        checked={value === true}
        disabled={widget.disabled}
        onChange={(event) => {
          setValue(event.target.checked);
          emit("change");
        }}
      />
      <span>{str(widget.props.label)}</span>
    </label>
  );
}

export function SelectWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const options = optionValues(widget.props.options);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      <select
        id={id}
        className="nt-input"
        value={str(value)}
        disabled={widget.disabled}
        onChange={(event) => {
          setValue(event.target.value);
          emit("change");
        }}
      >
        {value == null || value === "" ? <option value="">Choose…</option> : null}
        {options.map((option, index) => (
          <option key={`${option.value}-${index}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RadioGroupWidget(widget: WidgetProps): ReactNode {
  const name = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  return (
    <fieldset className="nt-field nt-choices">
      <legend className="nt-label">{str(widget.props.label)}</legend>
      {optionValues(widget.props.options).map((option, index) => (
        <label key={`${option.value}-${index}`} className="nt-chip">
          <input
            type="radio"
            name={name}
            checked={str(value) === option.value}
            disabled={widget.disabled}
            onChange={() => {
              setValue(option.value);
              emit("change");
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function CheckboxGroupWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const options = optionValues(widget.props.options);
  const checked = Array.isArray(value) ? value.map(str) : [];
  return (
    <fieldset className="nt-field nt-choices">
      <legend className="nt-label">{str(widget.props.label)}</legend>
      {options.map((option, index) => (
        <label key={`${option.value}-${index}`} className="nt-chip">
          <input
            type="checkbox"
            checked={checked.includes(option.value)}
            disabled={widget.disabled}
            onChange={() => {
              const on = checked.includes(option.value);
              setValue(
                options
                  .map((o) => o.value)
                  .filter((v) => (v === option.value ? !on : checked.includes(v)))
              );
              emit("change");
            }}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

export function DateInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const withTime = widget.props.withTime === true || widget.props.withTime === "yes";
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      <input
        id={id}
        className="nt-input"
        type={withTime ? "datetime-local" : "date"}
        value={str(value)}
        disabled={widget.disabled}
        onChange={(event) => {
          setValue(event.target.value === "" ? null : event.target.value);
          emit("change");
        }}
        onBlur={() => emit("change", "commit")}
      />
    </div>
  );
}

/** Color inputs carry either a hex string or a `{type: "color", value}` ref. */
export function ColorInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const asRef = isRecord(value) && value.type === "color";
  const hex = asRef ? str(value.value) : str(value);
  const write = (next: string) => {
    setValue(asRef ? { ...value, value: next } : next);
    emit("change");
  };
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label) || "Color"} htmlFor={id} />
      <div className="nt-row">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000"}
          disabled={widget.disabled}
          onChange={(event) => write(event.target.value)}
          aria-label="Pick color"
        />
        <input
          id={id}
          className="nt-input"
          value={hex}
          placeholder="#RRGGBB"
          disabled={widget.disabled}
          onChange={(event) => write(event.target.value)}
        />
      </div>
    </div>
  );
}

const ACCEPT: Record<MediaKind, string> = {
  image: "image/*",
  audio: "audio/*",
  video: "video/*",
  document: ".pdf,.txt,.md,.doc,.docx,.csv,.json,.html,.xlsx",
  model_3d: ".glb,.gltf,.obj,.fbx,.stl"
};

const MEDIA_LABEL: Record<MediaKind, string> = {
  image: "image",
  audio: "audio",
  video: "video",
  document: "document",
  model_3d: "3D model"
};

/** Upload a file, then write the ref the workflow input reads. */
export function MediaInputWidget(
  widget: WidgetProps & { kind: MediaKind; capture?: boolean; note?: string }
): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = mediaUrl(value);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label) || `${MEDIA_LABEL[widget.kind]} input`} htmlFor={id} />
      {url ? <ValueView value={isRecord(value) ? value : { type: widget.kind, uri: url }} /> : null}
      <input
        id={id}
        type="file"
        accept={ACCEPT[widget.kind]}
        {...(widget.capture ? { capture: "user" as const } : {})}
        disabled={widget.disabled || busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            setValue(await uploadFile(widget.kind, file));
            emit("change");
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy ? <div className="nt-hint">Uploading…</div> : null}
      {error ? <div className="nt-hint nt-status-error">{error}</div> : null}
      {widget.note ? <div className="nt-hint">{widget.note}</div> : null}
    </div>
  );
}

/** The four list inputs: several files, or several lines of text. */
export function MediaListInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const kind = str(widget.props.listKind) || "image";
  const items = Array.isArray(value) ? value : [];
  const [busy, setBusy] = useState(false);
  if (kind === "text") {
    return (
      <div className="nt-field">
        <FieldLabel text={str(widget.props.label)} htmlFor={id} />
        <textarea
          id={id}
          className="nt-input"
          rows={4}
          placeholder="One item per line"
          value={items.map(str).join("\n")}
          disabled={widget.disabled}
          onChange={(event) => {
            setValue(event.target.value.split("\n").filter((line) => line.trim() !== ""));
            emit("change");
          }}
        />
      </div>
    );
  }
  const mediaKind = (kind === "audio" || kind === "video" ? kind : "image") as MediaKind;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      {items.length > 0 ? <ValueView value={items} /> : null}
      <input
        id={id}
        type="file"
        multiple
        accept={ACCEPT[mediaKind]}
        disabled={widget.disabled || busy}
        onChange={async (event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length === 0) return;
          setBusy(true);
          try {
            setValue(await Promise.all(files.map((file) => uploadFile(mediaKind, file))));
            emit("change");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function PathInputWidget(widget: WidgetProps & { kind: "file" | "folder" }): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const raw = isRecord(value) ? str(value.path) : str(value);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label) || (widget.kind === "file" ? "File path" : "Folder path")} htmlFor={id} />
      <input
        id={id}
        className="nt-input"
        value={raw}
        placeholder={str(widget.props.placeholder) || (widget.kind === "file" ? "/path/to/file" : "/path/to/folder")}
        disabled={widget.disabled}
        onChange={(event) => {
          setValue(isRecord(value) ? { ...value, path: event.target.value } : event.target.value);
          emit("change");
        }}
        onBlur={() => emit("change", "commit")}
      />
      <div className="nt-hint">A path on the machine running this app's server.</div>
    </div>
  );
}

export function ImageSizeInputWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const size = isRecord(value) ? value : {};
  const field = (key: "width" | "height") => (
    <input
      className="nt-input"
      type="number"
      aria-label={key}
      placeholder={key}
      value={typeof size[key] === "number" ? String(size[key]) : ""}
      disabled={widget.disabled}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        setValue({ ...size, [key]: event.target.value === "" || Number.isNaN(parsed) ? undefined : parsed });
        emit("change");
      }}
    />
  );
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label) || "Image size"} />
      <div className="nt-row">
        {field("width")}
        <span className="nt-hint">×</span>
        {field("height")}
      </div>
    </div>
  );
}

/** A dataframe edited as JSON rows: `[{"column": value}, ...]`. */
export function DataFrameInputWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const rows = useMemo(() => {
    if (!isRecord(value) || !Array.isArray(value.data)) return [];
    const columns = (Array.isArray(value.columns) ? value.columns : []).map((c) => (isRecord(c) ? str(c.name) : str(c)));
    return value.data.map((row) =>
      Object.fromEntries(columns.map((column, at) => [column, Array.isArray(row) ? row[at] : undefined]))
    );
  }, [value]);
  const [text, setText] = useState(() => JSON.stringify(rows, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} htmlFor={id} />
      <textarea
        id={id}
        className="nt-input nt-mono"
        rows={8}
        value={text}
        disabled={widget.disabled}
        onChange={(event) => {
          setText(event.target.value);
          try {
            const parsed: unknown = JSON.parse(event.target.value);
            if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of rows");
            const columns = [...new Set(parsed.flatMap((row) => (isRecord(row) ? Object.keys(row) : [])))];
            setValue({
              type: "dataframe",
              columns: columns.map((name) => ({ name, data_type: "object" })),
              data: parsed.map((row) => columns.map((column) => (isRecord(row) ? row[column] : null)))
            });
            setError(null);
            emit("change");
          } catch (parseError) {
            setError(parseError instanceof Error ? parseError.message : "Invalid JSON");
          }
        }}
      />
      {error ? <div className="nt-hint nt-status-error">{error}</div> : null}
    </div>
  );
}

/** Model choices come from the models the app's own graphs already use. */
export function ModelSelectWidget(widget: WidgetProps): ReactNode {
  const id = useId();
  const { modelChoices } = useAppRuntimeContext();
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const kind = str(widget.props.modelKind) || (isRecord(value) ? str(value.type) : "") || "language_model";
  const task = str(widget.props.task) || undefined;
  const [offered, setOffered] = useState<ModelOption[]>([]);
  useEffect(() => {
    let live = true;
    void listModels(kind, task).then((models) => {
      if (live) setOffered(models);
    });
    return () => {
      live = false;
    };
  }, [kind, task]);
  const choices = useMemo(() => {
    // The graphs' own models first, then whatever the providers in .env offer.
    const list = [...(modelChoices[kind] ?? [])];
    for (const model of offered) {
      if (!list.some((m) => m.id === model.id && m.provider === model.provider)) list.push(model);
    }
    if (isRecord(value) && typeof value.id === "string" && value.id !== "" && !list.some((m) => m.id === value.id && m.provider === value.provider)) {
      list.unshift({ ...value, type: str(value.type) || kind, id: value.id });
    }
    return list;
  }, [kind, modelChoices, offered, value]);
  const keyOf = (model: { provider?: unknown; id: string }) => `${str(model.provider)}::${model.id}`;
  const current = isRecord(value) && typeof value.id === "string" && value.id !== "" ? keyOf({ provider: value.provider, id: value.id }) : "";
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label) || "Model"} htmlFor={id} />
      <select
        id={id}
        className="nt-input"
        value={current}
        disabled={widget.disabled || choices.length === 0}
        onChange={(event) => {
          const picked = choices.find((model) => keyOf(model) === event.target.value);
          if (!picked) return;
          setValue(picked);
          emit("change");
        }}
      >
        {current === "" ? <option value="">Choose a model…</option> : null}
        {choices.map((model) => (
          <option key={keyOf(model)} value={keyOf(model)}>
            {str(model.name) || model.id}
            {model.provider ? ` (${str(model.provider)})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ChoiceCardsWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const { value: bound } = useWidgetRuntime({
    id: `${widget.id}-options`,
    bindingMode: "read",
    binding: str(widget.props.optionsBinding) || undefined
  });
  const options = parseChoiceCardOptions(widget.props.optionsBinding ? bound : widget.props.options);
  const columns = numOr(widget.props.columns, 2);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <div className="nt-cards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup">
        {options.map((option, index) => {
          const selected = str(value) === option.value;
          const image = option.image ? mediaUrl(option.image) : null;
          return (
            <button
              key={`${option.value}-${index}`}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`nt-card${selected ? " nt-selected" : ""}`}
              disabled={widget.disabled || option.disabled === true}
              onClick={() => {
                setValue(option.value);
                emit("change");
              }}
            >
              {image ? <img src={image} alt="" /> : null}
              <strong>{option.title || option.value}</strong>
              {option.description ? <span className="nt-hint">{option.description}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StepperWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const steps = Array.isArray(widget.props.steps) ? widget.props.steps.filter(isRecord) : [];
  const found = steps.findIndex((step) => str(step.value) === str(value));
  const current = found >= 0 ? found : 0;
  const allowBack = widget.props.allowBack !== false && widget.props.allowBack !== "no";
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <ol className="nt-steps">
        {steps.map((step, index) => {
          const disabled = widget.disabled || step.disabled === true || (index < current && !allowBack);
          return (
            <li key={str(step.value) || index}>
              <button
                type="button"
                className={`nt-chip${index === current ? " nt-selected" : ""}`}
                aria-current={index === current ? "step" : undefined}
                disabled={disabled}
                onClick={() => {
                  setValue(str(step.value));
                  emit("change");
                }}
              >
                {step.completed === true ? "✓ " : ""}
                {str(step.title) || str(step.value)}
              </button>
            </li>
          );
        })}
      </ol>
      {steps[current] && str(steps[current].description) ? (
        <div className="nt-hint">{str(steps[current].description)}</div>
      ) : null}
    </div>
  );
}

export function ApprovalWidget(widget: WidgetProps): ReactNode {
  const { value, setValue, emit } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const choose = (next: "approved" | "rejected") => {
    setValue(next);
    emit("change");
  };
  return (
    <div className="nt-panel">
      <FieldLabel text={str(widget.props.label)} />
      {str(widget.props.description) ? <div className="nt-hint">{str(widget.props.description)}</div> : null}
      <div className="nt-row">
        <button
          type="button"
          className={`nt-button${value === "approved" ? "" : " nt-button-outlined"}`}
          disabled={widget.disabled}
          onClick={() => choose("approved")}
        >
          {str(widget.props.approveLabel) || "Approve"}
        </button>
        <button
          type="button"
          className={`nt-button${value === "rejected" ? "" : " nt-button-outlined"}`}
          disabled={widget.disabled}
          onClick={() => choose("rejected")}
        >
          {str(widget.props.rejectLabel) || "Needs changes"}
        </button>
      </div>
    </div>
  );
}

export function ChatThreadWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const stream = useBindingValue(useBindingRef(str(widget.props.streamBinding) || undefined, "read"));
  const messages = useMemo(
    () => [...messagesFrom(value), ...messagesFrom(stream).map((m) => ({ ...m, role: "assistant" }))],
    [stream, value]
  );
  if (messages.length === 0) return <Placeholder text={str(widget.props.placeholder) || "No messages yet"} />;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <div className="nt-thread" style={{ maxHeight: numOr(widget.props.maxHeight, 480) }}>
        {messages.map((message, index) => (
          <div key={index} className={`nt-bubble nt-bubble-${message.role === "user" ? "user" : "assistant"}`}>
            <Markdown text={messageText(message.content)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatComposerWidget(widget: WidgetProps): ReactNode {
  const { write } = useAppRuntimeContext();
  const { setValue, emit, running } = useWidgetRuntime({ ...widget, bindingMode: "write" });
  const historyRef = useBindingRef(str(widget.props.historyBinding) || undefined, "read");
  const history = useBindingValue(historyRef);
  const [draft, setDraft] = useState("");
  const format = str(widget.props.valueFormat) || "text";
  const canSend = draft.trim() !== "" && !running && !widget.disabled;
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const message = composeUserMessage(text);
    const next = [...messagesFrom(history), message];
    if (historyRef) write(historyRef, next);
    setValue(format === "history" ? next : format === "message" ? message : text);
    setDraft("");
    emit("click");
  };
  return (
    <form
      className="nt-field"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) send();
      }}
    >
      <FieldLabel text={str(widget.props.label)} />
      <textarea
        className="nt-input"
        rows={3}
        value={draft}
        placeholder={str(widget.props.placeholder) || "Write a message…"}
        disabled={widget.disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSend) send();
          }
        }}
      />
      <button type="submit" className="nt-button" disabled={!canSend}>
        {running ? "Working…" : str(widget.props.sendLabel) || "Send"}
      </button>
    </form>
  );
}

/** The control one Input node needs, picked by the node's kind. */
export function WorkflowInputControl({ input, ...widget }: WidgetProps & { input: WorkflowInputIO }): ReactNode {
  const props: WidgetProps = {
    ...widget,
    props: {
      ...widget.props,
      label: input.label,
      min: input.min,
      max: input.max,
      options: input.options,
      multiline: input.multiline ?? true
    }
  };
  switch (input.kind) {
    case "boolean":
      return <SwitchWidget {...props} />;
    case "integer":
    case "float":
      return input.min !== undefined && input.max !== undefined ? (
        <SliderWidget {...props} props={{ ...props.props, step: input.kind === "integer" ? 1 : 0.01 }} />
      ) : (
        <NumberInputWidget {...props} />
      );
    case "select":
      return <SelectWidget {...props} />;
    case "color":
      return <ColorInputWidget {...props} />;
    case "image":
    case "audio":
    case "video":
    case "document":
      return <MediaInputWidget {...props} kind={input.kind} />;
    case "model3d":
      return <MediaInputWidget {...props} kind="model_3d" />;
    case "image_size":
      return <ImageSizeInputWidget {...props} />;
    case "dataframe":
      return <DataFrameInputWidget {...props} />;
    case "file_path":
      return <PathInputWidget {...props} kind="file" />;
    case "folder_path":
    case "folder":
      return <PathInputWidget {...props} kind="folder" />;
    case "image_list":
    case "video_list":
    case "audio_list":
    case "text_list":
      return <MediaListInputWidget {...props} props={{ ...props.props, listKind: input.kind.replace("_list", "") }} />;
    case "language_model":
    case "image_model":
    case "video_model":
    case "tts_model":
    case "asr_model":
    case "music_model":
    case "embedding_model":
      return <ModelSelectWidget {...props} props={{ ...props.props, modelKind: input.kind }} />;
    default:
      return <TextInputWidget {...props} />;
  }
}

export function WorkflowInputWidget(widget: WidgetProps): ReactNode {
  const { ioFor } = useAppRuntimeContext();
  const ref = useBindingRef(widget.binding, "write");
  const input =
    ref?.kind === "input" ? ioFor(ref.operationId).inputs.find((i) => i.nodeId === ref.nodeId) : undefined;
  if (!input) {
    return <Placeholder text={`Unbound input: ${widget.binding ?? ""}`} />;
  }
  return <WorkflowInputControl {...widget} input={input} />;
}

export function WorkflowFormWidget(widget: WidgetProps): ReactNode {
  const { ioFor, scope } = useAppRuntimeContext();
  const operationId = str(widget.props.operationId) || scope.defaultOperationId;
  const inputs = ioFor(operationId).inputs;
  const showDescriptions = widget.props.showDescriptions !== "no" && widget.props.showDescriptions !== false;
  return (
    <div className="nt-stack">
      <FieldLabel text={str(widget.props.label)} />
      {inputs.length === 0 ? <div className="nt-hint">This operation has no inputs.</div> : null}
      {inputs.map((input) => (
        <div key={input.nodeId} className="nt-field">
          <WorkflowInputControl
            id={`${widget.id}:${input.nodeId}`}
            binding={encodeBinding({ kind: "input", operationId, nodeId: input.nodeId })}
            events={widget.events}
            disabled={widget.disabled}
            props={{}}
            input={input}
          />
          {showDescriptions && input.description ? <div className="nt-hint">{input.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
