# @nodetool-ai/data-nodes

Dataframe iteration and chart nodes for [NodeTool](https://nodetool.ai).

Iterate tabular data and render charts to images in visual AI workflows. CSV
parsing and dataframe shaping (filter, join, aggregate, pivot) now happen
inside a `nodetool.code.Code` node via the `@nodetool-ai/sandbox-csv`
(papaparse) sandbox pack instead of dedicated node classes.

## Install

```bash
npm install @nodetool-ai/data-nodes
```

## Nodes

**Dataframe** (`nodetool.data.*`) — `ForEachRow` (stream rows of a dataframe),
`LoadCSVAssets` (load dataframes from an asset folder).

**Charts** (`lib.charts.ChartRenderer`) — render a Chart.js chart definition to
a PNG image.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
