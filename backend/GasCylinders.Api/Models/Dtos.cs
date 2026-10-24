using System.Text.Json.Serialization;

namespace GasCylinders.Api.Models;

public sealed class CreateCylinderRequest
{
    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; set; }

    [JsonPropertyName("gasType")]
    public string? GasType { get; set; }
}

public sealed class UpdateCylinderRequest
{
    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; set; }

    [JsonPropertyName("gasType")]
    public string? GasType { get; set; }
}

public sealed class ChangeStatusRequest
{
    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("customerName")]
    public string? CustomerName { get; set; }
}

public sealed class CylinderListResponse
{
    public IReadOnlyList<Cylinder> Items { get; init; } = Array.Empty<Cylinder>();

    public int Page { get; init; }

    public int PageSize { get; init; }

    public int TotalCount { get; init; }
}

public sealed class MetaResponse
{
    public IReadOnlyList<string> GasTypes { get; init; } = Array.Empty<string>();

    public IReadOnlyList<string> Statuses { get; init; } = Array.Empty<string>();

    public IReadOnlyDictionary<string, IReadOnlyList<string>> Transitions { get; init; } =
        new Dictionary<string, IReadOnlyList<string>>();
}
