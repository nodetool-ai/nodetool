using MessagePack;

namespace Nodetool.Types.Core;

/// <summary>
/// Represents a node in a workflow graph.
/// </summary>
[MessagePackObject]
public record GraphNode
{
    [Key("id")]
    public string Id { get; init; } = string.Empty;

    [Key("type")]
    public string Type { get; init; } = string.Empty;

    [Key("data")]
    public NodeData? Data { get; init; }
}

/// <summary>
/// Data associated with a workflow node.
/// </summary>
[MessagePackObject]
public record NodeData
{
    [Key("workflow_id")]
    public string? WorkflowId { get; init; }

    [Key("properties")]
    public Dictionary<string, object>? Properties { get; init; }

    [Key("title")]
    public string? Title { get; init; }

    [Key("parent_id")]
    public string? ParentId { get; init; }
}

/// <summary>
/// Represents an edge (connection) between nodes in a workflow graph.
/// </summary>
[MessagePackObject]
public record GraphEdge
{
    [Key("id")]
    public string Id { get; init; } = string.Empty;

    [Key("source")]
    public string Source { get; init; } = string.Empty;

    [Key("target")]
    public string Target { get; init; } = string.Empty;

    [Key("sourceHandle")]
    public string? SourceHandle { get; init; }

    [Key("targetHandle")]
    public string? TargetHandle { get; init; }
}

/// <summary>
/// Represents the graph structure of a workflow.
/// </summary>
[MessagePackObject]
public record WorkflowGraph
{
    [Key("nodes")]
    public List<GraphNode> Nodes { get; init; } = new();

    [Key("edges")]
    public List<GraphEdge> Edges { get; init; } = new();
}

/// <summary>
/// Represents a complete workflow definition.
/// </summary>
[MessagePackObject]
public record Workflow
{
    [Key("id")]
    public string Id { get; init; } = string.Empty;

    [Key("name")]
    public string Name { get; init; } = string.Empty;

    [Key("description")]
    public string? Description { get; init; }

    [Key("graph")]
    public WorkflowGraph? Graph { get; init; }

    [Key("created_at")]
    public string? CreatedAt { get; init; }

    [Key("updated_at")]
    public string? UpdatedAt { get; init; }

    [Key("user_id")]
    public string? UserId { get; init; }

    [Key("access")]
    public string? Access { get; init; }

    [Key("thumbnail")]
    public string? Thumbnail { get; init; }
}

/// <summary>
/// Request to run a workflow job.
/// </summary>
[MessagePackObject]
public record RunJobRequest
{
    [Key("type")]
    public string Type { get; init; } = "run_job_request";

    [Key("api_url")]
    public string ApiUrl { get; init; } = string.Empty;

    [Key("user_id")]
    public string UserId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string WorkflowId { get; init; } = string.Empty;

    [Key("auth_token")]
    public string AuthToken { get; init; } = string.Empty;

    [Key("job_type")]
    public string JobType { get; init; } = "workflow";

    [Key("execution_strategy")]
    public string ExecutionStrategy { get; init; } = "threaded";

    [Key("params")]
    public Dictionary<string, object>? Params { get; init; }

    [Key("explicit_types")]
    public bool ExplicitTypes { get; init; } = false;

    [Key("graph")]
    public WorkflowGraph? Graph { get; init; }

    [Key("resource_limits")]
    public ResourceLimits? ResourceLimits { get; init; }
}

/// <summary>
/// Resource limits for workflow execution.
/// </summary>
[MessagePackObject]
public record ResourceLimits
{
    [Key("max_memory_mb")]
    public int? MaxMemoryMb { get; init; }

    [Key("max_time_seconds")]
    public int? MaxTimeSeconds { get; init; }

    [Key("max_gpu_memory_mb")]
    public int? MaxGpuMemoryMb { get; init; }
}

/// <summary>
/// WebSocket command wrapper.
/// </summary>
[MessagePackObject]
public record WebSocketCommand
{
    [Key("type")]
    public string Type { get; init; } = string.Empty;

    [Key("command")]
    public string Command { get; init; } = string.Empty;

    [Key("data")]
    public object? Data { get; init; }
}

/// <summary>
/// Reconnect job request.
/// </summary>
[MessagePackObject]
public record ReconnectJobRequest
{
    [Key("job_id")]
    public string JobId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string WorkflowId { get; init; } = string.Empty;
}

/// <summary>
/// Cancel job request.
/// </summary>
[MessagePackObject]
public record CancelJobRequest
{
    [Key("job_id")]
    public string JobId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string WorkflowId { get; init; } = string.Empty;
}

/// <summary>
/// Stream input request for sending streaming data to a running workflow.
/// </summary>
[MessagePackObject]
public record StreamInputRequest
{
    [Key("input")]
    public string Input { get; init; } = string.Empty;

    [Key("value")]
    public object? Value { get; init; }

    [Key("handle")]
    public string? Handle { get; init; }

    [Key("job_id")]
    public string JobId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string WorkflowId { get; init; } = string.Empty;
}

/// <summary>
/// End input stream request.
/// </summary>
[MessagePackObject]
public record EndInputStreamRequest
{
    [Key("input")]
    public string Input { get; init; } = string.Empty;

    [Key("handle")]
    public string? Handle { get; init; }

    [Key("job_id")]
    public string JobId { get; init; } = string.Empty;

    [Key("workflow_id")]
    public string WorkflowId { get; init; } = string.Empty;
}
