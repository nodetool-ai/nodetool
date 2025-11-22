---
layout: page
title: "Dataframe Output"
node_type: "nodetool.output.DataframeOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.DataframeOutput`

**Namespace:** `nodetool.output`

## Description

Output node for structured data references, typically tabular ('DataframeRef').
    dataframe, table, structured, csv, tabular_data, rows, columns

    Use cases:
    - Outputting tabular data results from analysis or queries.
    - Passing structured datasets between processing or analysis steps.
    - Displaying data in a table format or making it available for download.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `dataframe` |  | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| description | `str` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.

