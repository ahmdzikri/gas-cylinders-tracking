using System.Text.Json.Serialization;

namespace GasCylinders.Api.Models;

public enum CylinderStatus
{
    Empty,
    Filled,
    Delivered,
    InMaintenance,
    Retired
}

/// <summary>Columns the list endpoint can sort by (query <c>sortBy</c>).</summary>
public enum CylinderSortField
{
    LastUpdated,
    SerialNumber,
    GasType,
    Status,
    CustomerName
}

public class Cylinder
{
    public int Id { get; set; }

    public string SerialNumber { get; set; } = string.Empty;

    public string GasType { get; set; } = string.Empty;

    public CylinderStatus Status { get; set; }

    public string? CustomerName { get; set; }

    public DateTime LastUpdated { get; set; }

    /// <summary>
    /// Lower-cased "serialNumber\ncustomerName" used for case-insensitive, unicode-aware
    /// server-side search. SQLite's lower() only folds ASCII, so the value is folded in C#
    /// before it is persisted (see AppDbContext.SaveChanges).
    /// </summary>
    [JsonIgnore]
    public string SearchKey { get; set; } = string.Empty;
}
