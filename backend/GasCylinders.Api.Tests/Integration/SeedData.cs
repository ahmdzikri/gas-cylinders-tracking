using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

internal sealed record SeedRow(
    int Id,
    string SerialNumber,
    string GasType,
    string Status,
    string? CustomerName,
    DateTime LastUpdated);

internal static class SeedData
{
    private static readonly Lazy<IReadOnlyList<SeedRow>> Rows = new(LoadCore);

    /// <summary>Seed rows ordered exactly like the API: lastUpdated DESC, id DESC (file order = id).</summary>
    public static IReadOnlyList<SeedRow> Load() => Rows.Value;

    public static SeedRow BySerial(string serial) =>
        Rows.Value.Single(r => r.SerialNumber == serial);

    private static IReadOnlyList<SeedRow> LoadCore()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");
        using var stream = File.OpenRead(path);
        using var doc = JsonDocument.Parse(stream);

        var rows = new List<(SeedRow Row, int Index)>();
        var id = 1;
        foreach (var element in doc.RootElement.EnumerateArray())
        {
            rows.Add((new SeedRow(
                id,
                element.GetProperty("serialNumber").GetString()!,
                element.GetProperty("gasType").GetString()!,
                element.GetProperty("status").GetString()!,
                element.GetProperty("customerName").ValueKind == JsonValueKind.Null
                    ? null
                    : element.GetProperty("customerName").GetString(),
                DateTime.Parse(
                    element.GetProperty("lastUpdated").GetString()!,
                    null,
                    System.Globalization.DateTimeStyles.AdjustToUniversal |
                    System.Globalization.DateTimeStyles.AssumeUniversal)), id));
            id++;
        }

        return rows
            .OrderByDescending(pair => pair.Row.LastUpdated)
            .ThenByDescending(pair => pair.Row.Id)
            .Select(pair => pair.Row)
            .ToArray();
    }
}
