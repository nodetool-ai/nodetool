# @nodetool-ai/automation-nodes

Browser, OS, filesystem, and automation nodes for [NodeTool](https://nodetool.ai).

Automate the local system from visual AI workflows: fetch and crawl web pages,
read and write files, run SQLite queries, read and write Excel workbooks, OCR
images, classify and detect objects with TensorFlow.js, schedule triggers, and
drive macOS apps via AppleScript.

## Install

```bash
npm install @nodetool-ai/automation-nodes
```

## Nodes

**Browser** (`lib.browser.*`) — `WebFetch`, `DownloadFile`, `Browser`,
`Screenshot`, `SpiderCrawl`.

**OS / filesystem** (`lib.os.*`) — file operations (`ListFiles`, `CopyFile`,
`MoveFile`, `CreateDirectory`, `FileExists`, `GetFileSize`), read/write
(`ReadTextFile`, `WriteTextFile`, `ReadBinaryFile`, `WriteBinaryFile`), path
helpers (`JoinPaths`, `Basename`, `Dirname`, `SplitPath`, `NormalizePath`,
`RelativePath`), timestamps, and `ShowNotification`.

**SQLite** (`lib.sqlite.*`) — `CreateTable`, `Insert`, `Query`, `Update`,
`Delete`, `ExecuteSQL`, `GetDatabasePath`.

**Excel** (`lib.excel.*`) — `CreateWorkbook`, `ExcelToDataFrame`,
`DataFrameToExcel`, `FormatCells`, `AutoFitColumns`, `SaveWorkbook`.

**OCR** (`lib.ocr.*`) — Tesseract-backed `ExtractText`, `ExtractData`.

**TensorFlow.js** (`lib.tensorflow.*`) — `MobileNetClassify`,
`MobileNetEmbedding`, `CocoSsdDetect`, `Qna`.

**Triggers** (`nodetool.triggers.*`) — `Wait`, `ManualTrigger`,
`IntervalTrigger`, `WebhookTrigger`, `FileWatchTrigger`.

**Apple** (`lib.apple.*`) — macOS automation via AppleScript: Calendar, Notes,
Reminders, Messages, Mail, Contacts, Safari control, clipboard, and
notifications (`CreateCalendarEvent`, `CreateNote`, `SendMessage`,
`SearchContacts`, `OpenSafariURL`, `SetClipboardText`, `SayText`, …).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
