using MessagePack;

namespace Nodetool.Types.Refs;

/// <summary>
/// Reference to an image asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record ImageRef
{
    [Key("type")]
    public string Type { get; init; } = "image";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Reference to an audio asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record AudioRef
{
    [Key("type")]
    public string Type { get; init; } = "audio";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Reference to a video asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record VideoRef
{
    [Key("type")]
    public string Type { get; init; } = "video";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Reference to a text/document asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record TextRef
{
    [Key("type")]
    public string Type { get; init; } = "text";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Reference to a document asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record DocumentRef
{
    [Key("type")]
    public string Type { get; init; } = "document";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Generic reference to any asset stored in NodeTool.
/// </summary>
[MessagePackObject]
public record AssetRef
{
    [Key("type")]
    public string Type { get; init; } = "asset";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("temp_id")]
    public string? TempId { get; init; }
}

/// <summary>
/// Reference to a dataframe.
/// </summary>
[MessagePackObject]
public record DataframeRef
{
    [Key("type")]
    public string Type { get; init; } = "dataframe";

    [Key("uri")]
    public string Uri { get; init; } = string.Empty;

    [Key("asset_id")]
    public string? AssetId { get; init; }

    [Key("columns")]
    public List<ColumnDef>? Columns { get; init; }

    [Key("data")]
    public List<Dictionary<string, object>>? Data { get; init; }
}

/// <summary>
/// Column definition for a dataframe.
/// </summary>
[MessagePackObject]
public record ColumnDef
{
    [Key("name")]
    public string Name { get; init; } = string.Empty;

    [Key("data_type")]
    public string DataType { get; init; } = "string";
}

/// <summary>
/// Reference to a workflow.
/// </summary>
[MessagePackObject]
public record WorkflowRef
{
    [Key("type")]
    public string Type { get; init; } = "workflow";

    [Key("id")]
    public string Id { get; init; } = string.Empty;
}

/// <summary>
/// Reference to a node within a workflow.
/// </summary>
[MessagePackObject]
public record NodeRef
{
    [Key("type")]
    public string Type { get; init; } = "node";

    [Key("id")]
    public string Id { get; init; } = string.Empty;
}
