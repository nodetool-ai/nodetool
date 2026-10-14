/** Display widgets: they read a bound value and render it. */
import { useMemo, useState, type ReactNode } from "react";
import {
  isOperationRunning,
  operationTranscript,
  parseBinding,
  type ActivityEntry
} from "@nodetool-ai/app-runtime";
import {
  useAppRuntimeContext,
  useBindingRef,
  useBindingValue,
  useRuntimeSelector,
  useWidgetRuntime
} from "../runtime/context";
import { mediaUrl } from "../runtime/server";
import { Markdown } from "./Markdown";
import {
  FieldLabel,
  Placeholder,
  asItems,
  cellText,
  isRecord,
  numOr,
  str,
  type WidgetProps
} from "./shared";

const NO_ACTIVITY: ReadonlyArray<ActivityEntry> = [];

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "model_3d", "model3d"]);

/** Any value a workflow can emit, rendered by its shape. */
export function ValueView({ value }: { value: unknown }): ReactNode {
  if (value == null || value === "") return null;
  if (typeof value === "string") return <Markdown text={value} />;
  if (typeof value === "number" || typeof value === "boolean") {
    return <div className="nt-text">{String(value)}</div>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="nt-stack">
        {value.map((item, index) => (
          <ValueView key={index} value={item} />
        ))}
      </div>
    );
  }
  if (isRecord(value) && typeof value.type === "string" && MEDIA_TYPES.has(value.type)) {
    return <MediaView value={value} />;
  }
  if (isRecord(value) && value.type === "dataframe") {
    return <DataTable value={value} />;
  }
  return <pre className="nt-code">{JSON.stringify(value, null, 2)}</pre>;
}

function MediaView({ value }: { value: Record<string, unknown> }): ReactNode {
  const url = mediaUrl(value);
  if (!url) return <Placeholder text={`${str(value.type)} (not available outside NodeTool)`} />;
  switch (value.type) {
    case "image":
      return <img className="nt-image" src={url} alt="" />;
    case "audio":
      return <audio className="nt-audio" src={url} controls />;
    case "video":
      return <video className="nt-video" src={url} controls />;
    default:
      return (
        <a className="nt-button nt-button-outlined" href={url} download target="_blank" rel="noreferrer">
          Open {value.type === "document" ? "document" : "file"}
        </a>
      );
  }
}

const tableColumns = (rows: ReadonlyArray<unknown>): string[] => {
  const columns: string[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  return columns;
};

function DataTable({ value }: { value: unknown }): ReactNode {
  let columns: string[];
  let rows: string[][];
  if (isRecord(value) && Array.isArray(value.data)) {
    const declared = Array.isArray(value.columns) ? value.columns : [];
    columns = declared.map((column) => (isRecord(column) ? str(column.name) : str(column)));
    rows = value.data.map((row) => (Array.isArray(row) ? row.map(cellText) : [cellText(row)]));
  } else {
    const items = asItems(value);
    columns = tableColumns(items);
    rows = items.map((row) =>
      columns.length === 0 ? [cellText(row)] : columns.map((column) => (isRecord(row) ? cellText(row[column]) : ""))
    );
  }
  return (
    <div className="nt-table-wrap">
      <table className="nt-table">
        {columns.length > 0 ? (
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, at) => (
                <td key={at}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeadingWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  const subtitle = str(widget.props.subtitle);
  if (!text && !subtitle) return null;
  const level = Math.min(Math.max(Number(widget.props.level) || 1, 1), 4);
  const Tag = `h${level}` as "h1";
  return (
    <header className="nt-heading">
      {text ? <Tag>{text}</Tag> : null}
      {subtitle ? <p className="nt-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function TextWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (str(value) || str(widget.props.text));
  if (!text) return null;
  const tone = str(widget.props.tone);
  return <p className={`nt-text${tone ? ` nt-tone-${tone}` : ""}`}>{text}</p>;
}

export function MarkdownWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text =
    widget.formattedValue ?? (asItems(value).map(cellText).join("") || str(widget.props.text));
  return text ? <Markdown text={text} /> : null;
}

function DownloadLink({ url, label, filename }: { url: string; label: string; filename?: string }): ReactNode {
  return (
    <a className="nt-button nt-button-outlined" href={url} download={filename || true} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

export function ImageWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const urls = asItems(value).map(mediaUrl).filter((url): url is string => url !== null);
  if (urls.length === 0) return <Placeholder text={str(widget.props.placeholder) || "No image yet"} />;
  const height = numOr(widget.props.height, 0);
  const caption = str(widget.props.caption);
  return (
    <figure className="nt-figure">
      {urls.map((url, index) => (
        <img
          key={`${url}-${index}`}
          className="nt-image"
          src={url}
          alt={caption}
          style={{
            objectFit: widget.props.fit === "cover" ? "cover" : "contain",
            ...(height > 0 ? { height } : {}),
            ...(str(widget.props.aspectRatio) ? { aspectRatio: str(widget.props.aspectRatio) } : {})
          }}
        />
      ))}
      {caption ? <figcaption>{caption}</figcaption> : null}
      {widget.props.download === true || widget.props.download === "yes" ? (
        <DownloadLink url={urls[0]} label="Download" filename={str(widget.props.filename)} />
      ) : null}
    </figure>
  );
}

/** Audio, Video, JSON and Output: whatever the value is, in its natural form. */
export function OutputWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  if (widget.formattedValue) return <Markdown text={widget.formattedValue} />;
  const items = asItems(value);
  if (items.length === 0) return <Placeholder text={str(widget.props.placeholder)} />;
  const shown = items.every((item) => typeof item === "string") ? items.join("") : value;
  const url = mediaUrl(items[0]);
  return (
    <div className="nt-stack">
      <ValueView value={shown} />
      {url && (widget.props.download === true || widget.props.download === "yes") ? (
        <DownloadLink url={url} label="Download" filename={str(widget.props.filename)} />
      ) : null}
    </div>
  );
}

export function JsonWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  if (widget.formattedValue) return <pre className="nt-code">{widget.formattedValue}</pre>;
  if (value === undefined) return null;
  return <pre className="nt-code">{JSON.stringify(value, null, 2)}</pre>;
}

export function TableWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const empty =
    value == null || (Array.isArray(value) && value.length === 0) || (isRecord(value) && Array.isArray(value.data) && value.data.length === 0);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      {empty ? <Placeholder text={str(widget.props.placeholder) || "No rows"} /> : <DataTable value={value} />}
    </div>
  );
}

export function ProgressWidget(widget: WidgetProps): ReactNode {
  const { value, running, progress, activity } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const ratio = typeof value === "number" ? value : progress;
  const label = (running ? activity : undefined) ?? str(widget.props.label);
  if (!running && ratio === undefined) return null;
  return (
    <div className="nt-field" role="status">
      {label ? <div className="nt-hint">{label}</div> : null}
      {ratio === undefined ? (
        <div className="nt-progress nt-progress-indeterminate">
          <div />
        </div>
      ) : (
        <div className="nt-progress">
          <div style={{ width: `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

const TOOL_STATUS: Record<string, string> = { running: "Running", done: "Done", error: "Failed" };

export function AgentActivityWidget(widget: WidgetProps): ReactNode {
  const ref = parseBinding(str(widget.props.binding));
  const operationId = ref?.kind === "execution" ? ref.operationId : null;
  const entries = useRuntimeSelector((state) =>
    operationId ? operationTranscript(state, operationId) : NO_ACTIVITY
  );
  const running = useRuntimeSelector((state) =>
    operationId ? isOperationRunning(state, operationId) : false
  );
  if (!running && entries.length === 0) return <Placeholder text={str(widget.props.placeholder)} />;
  const label = str(widget.props.label);
  return (
    <div className="nt-field">
      {label ? <div className="nt-label">{label}{running ? " · Working" : ""}</div> : null}
      <div className="nt-activity" style={{ maxHeight: numOr(widget.props.height, 360) }}>
        {entries.map((entry, index) =>
          entry.kind === "tool" ? (
            <div key={entry.id} className="nt-activity-tool">
              <div className="nt-row">
                <span>{entry.label}</span>
                <span className={`nt-hint nt-status-${entry.status}`}>{TOOL_STATUS[entry.status]}</span>
              </div>
              {entry.result ? <div className="nt-hint nt-clamp">{entry.result}</div> : null}
            </div>
          ) : (
            <Markdown key={`text-${index}`} text={entry.text} />
          )
        )}
      </div>
    </div>
  );
}

export function AlertWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text = widget.formattedValue ?? (cellText(value) || str(widget.props.text));
  if (!text) return null;
  const severity = str(widget.props.severity) || "info";
  const title = str(widget.props.title);
  return (
    <div className={`nt-alert nt-alert-${severity}`} role={severity === "error" ? "alert" : "status"}>
      {title ? <strong>{title}</strong> : null}
      <div>{text}</div>
    </div>
  );
}

export function CodeBlockWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const text =
    widget.formattedValue ?? (value != null ? asItems(value).map(cellText).join("\n") : str(widget.props.text));
  if (!text) return null;
  const maxHeight = numOr(widget.props.maxHeight, 0);
  return (
    <pre className="nt-code" style={maxHeight > 0 ? { maxHeight } : undefined}>
      <code>{text}</code>
    </pre>
  );
}

export function ListWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const items = (widget.formattedValue ? [widget.formattedValue] : asItems(value)).filter(
    (item) => item != null && item !== ""
  );
  if (items.length === 0) return <Placeholder text={str(widget.props.placeholder)} />;
  const List = widget.props.ordered === true || widget.props.ordered === "yes" ? "ol" : "ul";
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <List className="nt-list">
        {items.map((item, index) => (
          <li key={index}>{typeof item === "string" ? <Markdown text={item} /> : cellText(item)}</li>
        ))}
      </List>
    </div>
  );
}

export function KeyValueWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const entries: Array<[string, unknown]> = isRecord(value)
    ? Object.entries(value)
    : value == null || value === ""
      ? []
      : [["value", value]];
  if (entries.length === 0) return <Placeholder text={str(widget.props.placeholder)} />;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <dl className="nt-kv">
        {entries.map(([key, entry]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{cellText(entry)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StatWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const shown = widget.formattedValue ?? (value != null && value !== "" ? cellText(value) : "");
  const caption = str(widget.props.caption);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <div className="nt-stat">{shown || str(widget.props.placeholder) || "—"}</div>
      {caption ? <div className="nt-hint">{caption}</div> : null}
    </div>
  );
}

export function DownloadWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const url = mediaUrl(asItems(value)[0]);
  if (!url) return <Placeholder text={str(widget.props.placeholder)} />;
  return (
    <DownloadLink url={url} label={str(widget.props.label) || "Download"} filename={str(widget.props.filename)} />
  );
}

/** Model3D, Chart and PDF: shown as a file the browser can open. */
export function FileWidget(widget: WidgetProps & { title: string }): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const item = asItems(value)[0];
  if (item == null) return <Placeholder text={str(widget.props.placeholder) || `No ${widget.title} yet`} />;
  const url = mediaUrl(item);
  if (url && widget.title === "PDF") {
    return <iframe className="nt-pdf" src={url} title="PDF" style={{ height: numOr(widget.props.height, 480) }} />;
  }
  if (!url) return <ValueView value={value} />;
  return <DownloadLink url={url} label={`Open ${widget.title}`} />;
}

export function ChartWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  if (value == null) return <Placeholder text={str(widget.props.placeholder) || "No data yet"} />;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <DataTable value={value} />
    </div>
  );
}

const sameItem = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  const left = mediaUrl(a);
  const right = mediaUrl(b);
  if (left !== null && right !== null) return left === right;
  return isRecord(a) && isRecord(b) && JSON.stringify(a) === JSON.stringify(b);
};

export function GalleryWidget(widget: WidgetProps): ReactNode {
  const { write } = useAppRuntimeContext();
  const { value, emit } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const selectionRef = useBindingRef(
    typeof widget.props.selectionBinding === "string" ? widget.props.selectionBinding : undefined,
    "write"
  );
  const selected = useBindingValue(selectionRef);
  const [open, setOpen] = useState<string | null>(null);
  const tiles = useMemo(
    () =>
      asItems(value)
        .map((item) => ({ item, url: mediaUrl(item) }))
        .filter((tile): tile is { item: unknown; url: string } => tile.url !== null),
    [value]
  );
  if (tiles.length === 0) return <Placeholder text={str(widget.props.placeholder) || "No images yet"} />;
  const size = numOr(widget.props.tileSize, 160);
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <div className="nt-gallery" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
        {tiles.map(({ item, url }, index) => {
          const isSelected = selectionRef !== null && sameItem(selected, item);
          return (
            <button
              key={`${url}-${index}`}
              type="button"
              className={`nt-tile${isSelected ? " nt-selected" : ""}`}
              aria-pressed={selectionRef ? isSelected : undefined}
              disabled={widget.disabled}
              onClick={() => {
                if (!selectionRef) {
                  setOpen(url);
                  return;
                }
                write(selectionRef, item);
                emit("change");
              }}
            >
              <img src={url} alt={`Image ${index + 1} of ${tiles.length}`} />
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="nt-lightbox" role="dialog" onClick={() => setOpen(null)}>
          <img src={open} alt="" />
        </div>
      ) : null}
    </div>
  );
}

export function ImageCompareWidget(widget: WidgetProps): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  const compare = useBindingValue(
    useBindingRef(typeof widget.props.compareBinding === "string" ? widget.props.compareBinding : undefined, "read")
  );
  const [position, setPosition] = useState(50);
  const before = mediaUrl(asItems(value)[0]);
  const after = mediaUrl(asItems(compare)[0]);
  if (!before && !after) return <Placeholder text={str(widget.props.placeholder) || "Nothing to compare yet"} />;
  if (!before || !after) return <img className="nt-image" src={(before ?? after) as string} alt="" />;
  return (
    <div className="nt-field">
      <FieldLabel text={str(widget.props.label)} />
      <div className="nt-compare" style={{ height: numOr(widget.props.height, 360) }}>
        <img src={after} alt="After" />
        <img src={before} alt="Before" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Compare position"
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </div>
  );
}

/** Widgets that show a NodeTool document (sketch, timeline, storyboard). */
export function DocumentOnlyWidget(widget: WidgetProps & { title: string }): ReactNode {
  const { value } = useWidgetRuntime({ ...widget, bindingMode: "read" });
  if (value == null || value === "") return <Placeholder text={str(widget.props.placeholder)} />;
  return <Placeholder text={`${widget.title} results open in NodeTool.`} />;
}
