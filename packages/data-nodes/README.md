# @nodetool-ai/data-nodes

Dataframe, CSV, RSS, and chart nodes for [NodeTool](https://nodetool.ai).

Load, transform, and save tabular data in visual AI workflows: parse CSV, run
dataframe operations (filter, join, aggregate, pivot), fetch RSS feeds, and
render charts to images.

## Install

```bash
npm install @nodetool-ai/data-nodes
```

## Nodes

**Dataframe** (`nodetool.data.*`) — load and shape tabular data: `ImportCSV`,
`LoadCSVFile`, `LoadCSVURL`, `LoadCSVAssets`, `JSONToDataframe`, `FromList`,
`ToList`, `SaveDataframe`, `SaveCSVDataframeFile`. Column operations:
`SelectColumn`, `ExtractColumn`, `AddColumn`, `Rename`. Rows and filtering:
`Filter`, `FilterNone`, `Slice`, `FindRow`, `SortByColumn`, `DropDuplicates`,
`DropNA`, `FillNA`, `ForEachRow`. Combine and reshape: `Merge`, `Append`,
`Join`, `Aggregate`, `Pivot`. Inspect: `Schema`, `Describe`.

**RSS** (`lib.rss.*`) — `FetchRSSFeed`, `ExtractFeedMetadata`.

**Charts** (`lib.charts.ChartRenderer`) — render a Chart.js chart definition to
a PNG image.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
