# Workflow Output Type Inference

This module provides client-side inference of workflow output types, addressing the SDK Types issue where workflow outputs are currently hardcoded to `"any"` in the backend.

## Overview

The `workflowOutputTypeInference.ts` utility and `useInferredOutputTypes` hook enable type-safe access to workflow outputs by analyzing the graph structure and resolving types from node metadata.

## Problem Addressed

The backend currently sets all workflow outputs to `"type": "any"` in `output_schema`, which:
- Prevents SDKs from providing strongly typed workflow outputs
- Makes enums show up as plain strings
- Results in BaseTypes showing raw JSON payloads instead of typed objects

## Solution: Client-Side Type Inference

This implementation provides **Option B** from the SDK Types issue: infer workflow output types on the client side using:

1. The workflow graph (nodes + edges)
2. Node metadata from `/api/nodes/metadata`
3. Output slot definitions from node metadata

## Usage

### Basic Usage

```typescript
import { useInferredOutputSchema, useTypedWorkflowOutputs } from "../hooks/useInferredOutputTypes";

const MyComponent = ({ workflow }) => {
  // Get the complete inferred output schema
  const schema = useInferredOutputSchema(workflow.graph);
  
  if (schema) {
    Object.entries(schema.properties).forEach(([name, type]) => {
      console.log(`Output "${name}" has type: ${type.type}`);
      if (type.typeName) {
        console.log(`  Enum type: ${type.typeName}`);
      }
      if (type.values) {
        console.log(`  Allowed values: ${type.values.join(", ")}`);
      }
    });
  }
};
```

### SDK-Style Usage

```typescript
import { useTypedWorkflowOutputs } from "../hooks/useInferredOutputTypes";

const TypedWorkflowOutputs = ({ workflow }) => {
  const { 
    schema, 
    hasTypedOutputs, 
    outputTypes, 
    getOutputType, 
    isRequired 
  } = useTypedWorkflowOutputs(workflow.graph);
  
  if (!hasTypedOutputs) {
    return <div>No typed outputs available</div>;
  }
  
  return (
    <div>
      <h3>Workflow Outputs ({outputTypes.length})</h3>
      {outputTypes.map(output => (
        <div key={output.name}>
          <span>{output.name}: {output.type}</span>
          {output.typeName && <span> ({output.typeName})</span>}
          {isRequired(output.name) && <span> *required</span>}
        </div>
      ))}
    </div>
  );
};
```

### Specific Output Type Check

```typescript
const DateTimeOutput = ({ workflow }) => {
  const datetimeType = useInferredOutputType(workflow.graph, "datetime_result");
  
  if (datetimeType?.type === "datetime") {
    return <DateTimeDisplay value={datetimeType} />;
  }
  
  return null;
};
```

## API Reference

### `inferWorkflowOutputSchema(graph: Graph): InferredOutputSchema | undefined`

Analyzes a workflow graph and returns an inferred output schema.

**Parameters:**
- `graph`: The workflow graph containing nodes and edges

**Returns:** An inferred output schema with typed properties, or `undefined` if no typed outputs found

### `useInferredOutputSchema(graph): InferredOutputSchema | undefined`

React hook wrapper for `inferWorkflowOutputSchema`.

### `useInferredOutputType(graph, outputName): InferredOutputType | undefined`

Gets the inferred type for a specific output by name.

### `useInferredOutputTypes(graph): InferredOutputType[]`

Gets all inferred output types as an array.

### `useHasTypedOutputs(graph): boolean`

Checks if the workflow has any typed outputs.

### `useTypedWorkflowOutputs(graph)`

Comprehensive hook returning:
- `schema`: The full inferred output schema
- `hasTypedOutputs`: Boolean indicating if typed outputs exist
- `outputTypes`: Array of all inferred output types
- `getOutputType(name)`: Function to get a specific output type
- `isRequired(name)`: Function to check if an output is required

## Type Definitions

```typescript
interface InferredOutputType {
  name: string;              // Output name
  type: string;              // Type identifier (e.g., "datetime", "image", "enum")
  typeName?: string;         // Enum type name (for enum types)
  values?: (string|number)[]; // Allowed values (for enum types)
  optional: boolean;         // Whether the output is optional
  stream: boolean;           // Whether the output is streamed
}

interface InferredOutputSchema {
  type: "object";
  properties: Record<string, InferredOutputType>;
  required: string[];
}
```

## How It Works

1. **Find Output Nodes**: Identifies all `nodetool.output.*` nodes in the graph
2. **Trace Connections**: For each output node, finds the incoming edge
3. **Resolve Source**: Identifies the source node and output handle
4. **Lookup Metadata**: Retrieves node metadata to get the output slot definition
5. **Build Schema**: Constructs a typed output schema from the resolved types

## Example Workflow Type Inference

Given a workflow with:
- A `DateTimeNode` (type: `nodetool.process.GetDateTime`) with output `{name: "result", type: "datetime"}`
- A `ValueOutput` node connected to the DateTimeNode's "result" output

The inference produces:
```json
{
  "type": "object",
  "properties": {
    "result": {
      "name": "result",
      "type": "datetime",
      "optional": false,
      "stream": false
    }
  },
  "required": ["result"]
}
```

## Integration Points

### Mini Apps

The hooks can be used in mini apps to provide better output type information:

```typescript
// In MiniAppResults or similar component
const { hasTypedOutputs, outputTypes } = useTypedWorkflowOutputs(workflow.graph);

// Display typed output information
outputTypes.forEach(output => {
  if (output.type === "image") {
    // Use image-specific rendering
  } else if (output.type === "enum" && output.typeName === "ModelType") {
    // Use enum dropdown for selection
  }
});
```

### Workflow Editor

The inferred types can be used to enhance the workflow editor with type-aware features:
- Type-aware autocomplete for workflow connections
- Type validation hints
- SDK code generation preview

### API Enhancement

Until the backend is updated to provide typed output schemas, these utilities serve as a client-side fallback. When the backend is improved (Option A), these utilities can be replaced or enhanced with the backend-provided types.

## Limitations

1. **Dynamic Types**: Cannot infer types for dynamically-generated outputs
2. **Multiple Connections**: Assumes single connection to output nodes
3. **Metadata Availability**: Requires node metadata to be loaded
4. **Backend Update Needed**: This is a workaround; the proper fix is backend schema enhancement

## Future Enhancements

- Integration with backend output schema when it's improved
- Caching of inferred schemas
- Support for union types
- Type validation against actual runtime values
