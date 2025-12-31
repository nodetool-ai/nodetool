using MessagePack;

namespace Nodetool.Types.Messages;

/// <summary>
/// Job status update message from the server.
/// </summary>
[MessagePackObject]
public record JobUpdate
{
    [Key("type")]
    public string Type { get; init; } = "job_update";

    [Key("job_id")]
    public string? JobId { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("status")]
    public string Status { get; init; } = string.Empty;

    [Key("message")]
    public string? Message { get; init; }

    [Key("error")]
    public string? Error { get; init; }

    [Key("result")]
    public Dictionary<string, object>? Result { get; init; }
}

/// <summary>
/// Node status update message from the server.
/// </summary>
[MessagePackObject]
public record NodeUpdate
{
    [Key("type")]
    public string Type { get; init; } = "node_update";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("node_name")]
    public string? NodeName { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("status")]
    public string Status { get; init; } = string.Empty;

    [Key("error")]
    public string? Error { get; init; }

    [Key("result")]
    public Dictionary<string, object>? Result { get; init; }

    [Key("properties")]
    public Dictionary<string, object>? Properties { get; init; }
}

/// <summary>
/// Node progress update message from the server.
/// </summary>
[MessagePackObject]
public record NodeProgress
{
    [Key("type")]
    public string Type { get; init; } = "node_progress";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("progress")]
    public int Progress { get; init; }

    [Key("total")]
    public int Total { get; init; }
}

/// <summary>
/// Output update message from the server.
/// </summary>
[MessagePackObject]
public record OutputUpdate
{
    [Key("type")]
    public string Type { get; init; } = "output_update";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("value")]
    public object? Value { get; init; }
}

/// <summary>
/// Preview update message from the server.
/// </summary>
[MessagePackObject]
public record PreviewUpdate
{
    [Key("type")]
    public string Type { get; init; } = "preview_update";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("value")]
    public object? Value { get; init; }
}

/// <summary>
/// Edge status update message from the server.
/// </summary>
[MessagePackObject]
public record EdgeUpdate
{
    [Key("type")]
    public string Type { get; init; } = "edge_update";

    [Key("edge_id")]
    public string EdgeId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("status")]
    public string Status { get; init; } = string.Empty;

    [Key("counter")]
    public int? Counter { get; init; }
}

/// <summary>
/// Log update message from the server.
/// </summary>
[MessagePackObject]
public record LogUpdate
{
    [Key("type")]
    public string Type { get; init; } = "log_update";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("node_name")]
    public string? NodeName { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("content")]
    public string Content { get; init; } = string.Empty;

    [Key("severity")]
    public string Severity { get; init; } = "info";
}

/// <summary>
/// Planning update message from the server (for agent workflows).
/// </summary>
[MessagePackObject]
public record PlanningUpdate
{
    [Key("type")]
    public string Type { get; init; } = "planning_update";

    [Key("node_id")]
    public string? NodeId { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("plan")]
    public object? Plan { get; init; }
}

/// <summary>
/// Task update message from the server.
/// </summary>
[MessagePackObject]
public record TaskUpdate
{
    [Key("type")]
    public string Type { get; init; } = "task_update";

    [Key("node_id")]
    public string? NodeId { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("task")]
    public object? Task { get; init; }
}

/// <summary>
/// Tool call update message from the server.
/// </summary>
[MessagePackObject]
public record ToolCallUpdate
{
    [Key("type")]
    public string Type { get; init; } = "tool_call_update";

    [Key("node_id")]
    public string? NodeId { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("tool_name")]
    public string? ToolName { get; init; }

    [Key("arguments")]
    public Dictionary<string, object>? Arguments { get; init; }

    [Key("result")]
    public object? Result { get; init; }
}

/// <summary>
/// Prediction/model inference update message.
/// </summary>
[MessagePackObject]
public record Prediction
{
    [Key("type")]
    public string Type { get; init; } = "prediction";

    [Key("node_id")]
    public string NodeId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("status")]
    public string Status { get; init; } = string.Empty;

    [Key("logs")]
    public string? Logs { get; init; }
}

/// <summary>
/// Notification message from the server.
/// </summary>
[MessagePackObject]
public record Notification
{
    [Key("type")]
    public string Type { get; init; } = "notification";

    [Key("severity")]
    public string Severity { get; init; } = "info";

    [Key("content")]
    public string Content { get; init; } = string.Empty;
}

/// <summary>
/// Text chunk for streaming responses.
/// </summary>
[MessagePackObject]
public record Chunk
{
    [Key("type")]
    public string Type { get; init; } = "chunk";

    [Key("node_id")]
    public string? NodeId { get; init; }

    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("content")]
    public string Content { get; init; } = string.Empty;
}
