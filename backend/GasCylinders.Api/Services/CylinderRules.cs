using System.Text.RegularExpressions;
using GasCylinders.Api.Models;

namespace GasCylinders.Api.Services;

/// <summary>
/// Pure domain rules: normalization, validation and the status transition table.
/// Kept free of EF Core so it can be unit tested directly.
/// </summary>
public static class CylinderRules
{
    public const int MaxCustomerNameLength = 120;

    public static readonly IReadOnlyList<string> GasTypes = new[]
    {
        "Oxygen",
        "Nitrogen",
        "Argon",
        "Carbon Dioxide",
        "Acetylene",
        "Hydrogen"
    };

    public static readonly IReadOnlyList<CylinderStatus> Statuses = Enum.GetValues<CylinderStatus>();

    private static readonly Regex SerialPattern = new("^CYL-\\d{6}$", RegexOptions.Compiled);

    private static readonly IReadOnlyDictionary<CylinderStatus, IReadOnlyList<CylinderStatus>> Transitions =
        new Dictionary<CylinderStatus, IReadOnlyList<CylinderStatus>>
        {
            [CylinderStatus.Empty] = new[] { CylinderStatus.Filled, CylinderStatus.InMaintenance, CylinderStatus.Retired },
            [CylinderStatus.Filled] = new[] { CylinderStatus.Delivered, CylinderStatus.InMaintenance, CylinderStatus.Retired },
            [CylinderStatus.Delivered] = new[] { CylinderStatus.Empty },
            [CylinderStatus.InMaintenance] = new[] { CylinderStatus.Empty, CylinderStatus.Retired },
            [CylinderStatus.Retired] = Array.Empty<CylinderStatus>()
        };

    public static IReadOnlyList<CylinderStatus> AllowedTransitions(CylinderStatus from) =>
        Transitions.TryGetValue(from, out var allowed) ? allowed : Array.Empty<CylinderStatus>();

    public static bool CanTransition(CylinderStatus from, CylinderStatus to) =>
        AllowedTransitions(from).Contains(to);

    /// <summary>Trims and upper-cases the serial. Returns the normalized value (may be invalid).</summary>
    public static string NormalizeSerial(string? serialNumber) =>
        (serialNumber ?? string.Empty).Trim().ToUpperInvariant();

    public static bool IsValidSerial(string? serialNumber) =>
        serialNumber is not null && SerialPattern.IsMatch(serialNumber);

    /// <summary>Returns the canonical gas type spelling, or null when unknown.</summary>
    public static string? NormalizeGasType(string? gasType)
    {
        if (string.IsNullOrWhiteSpace(gasType))
        {
            return null;
        }

        var trimmed = gasType.Trim();
        return GasTypes.FirstOrDefault(g => string.Equals(g, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    public static bool TryParseStatus(string? value, out CylinderStatus status)
    {
        status = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var trimmed = value.Trim();
        foreach (var candidate in Statuses)
        {
            if (string.Equals(candidate.ToString(), trimmed, StringComparison.OrdinalIgnoreCase))
            {
                status = candidate;
                return true;
            }
        }

        return false;
    }

    /// <summary>Customer name is only kept when the target status is Delivered.</summary>
    public static string? NormalizeCustomerName(CylinderStatus status, string? customerName)
    {
        if (status != CylinderStatus.Delivered)
        {
            return null;
        }

        var trimmed = customerName?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    public static string? ValidateCustomerName(string? customerName)
    {
        var trimmed = customerName?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "Nama pelanggan wajib diisi untuk status Delivered.";
        }

        if (trimmed.Length > MaxCustomerNameLength)
        {
            return $"Nama pelanggan maksimal {MaxCustomerNameLength} karakter.";
        }

        return null;
    }

    /// <summary>
    /// Builds the persisted, invariant-lowercased search key: serial and customer name joined by
    /// a newline so a term can never match across the field boundary.
    /// </summary>
    public static string BuildSearchKey(string? serialNumber, string? customerName) =>
        ((serialNumber ?? string.Empty) + "\n" + (customerName ?? string.Empty)).ToLowerInvariant();

    public static MetaResponse BuildMeta() => new()
    {
        GasTypes = GasTypes,
        Statuses = Statuses.Select(s => s.ToString()).ToArray(),
        Transitions = Statuses.ToDictionary(
            s => s.ToString(),
            s => (IReadOnlyList<string>)AllowedTransitions(s).Select(t => t.ToString()).ToArray())
    };
}
