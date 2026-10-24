using System.Text.Json;
using GasCylinders.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GasCylinders.Api.Persistence;

public static class DatabaseInitializer
{
    private sealed record SeedRecord(
        string? SerialNumber,
        string? GasType,
        string? Status,
        string? CustomerName,
        DateTime? LastUpdated);

    public static async Task InitializeAsync(
        AppDbContext db,
        ILogger logger,
        string? contentRootPath = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await db.Database.MigrateAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            // Fail fast: a schema created by EnsureCreated would drift from the migrations and
            // hide real migration errors (e.g. a missing migration assembly in a deployment).
            logger.LogError(ex, "Gagal menerapkan migrasi database. Aplikasi dihentikan.");
            throw;
        }

        if (await db.Cylinders.AnyAsync(cancellationToken))
        {
            await BackfillSearchKeysAsync(db, logger, cancellationToken);
            return;
        }

        var seedPath = ResolveSeedPath(logger, contentRootPath);
        if (seedPath is null)
        {
            logger.LogWarning("Berkas seed tidak ditemukan; database dibiarkan kosong.");
            return;
        }

        List<SeedRecord>? records;
        try
        {
            await using var stream = File.OpenRead(seedPath);
            records = await JsonSerializer.DeserializeAsync<List<SeedRecord>>(
                stream,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true },
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gagal membaca berkas seed {Path}.", seedPath);
            return;
        }

        if (records is null || records.Count == 0)
        {
            return;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var entities = new List<Cylinder>();

        for (var index = 0; index < records.Count; index++)
        {
            var record = records[index];
            var serial = Services.CylinderRules.NormalizeSerial(record.SerialNumber);
            if (!Services.CylinderRules.IsValidSerial(serial))
            {
                logger.LogWarning("Seed dilewati: nomor seri tidak valid '{Serial}'.", record.SerialNumber);
                continue;
            }

            if (!seen.Add(serial))
            {
                logger.LogWarning("Seed dilewati: nomor seri duplikat '{Serial}'.", serial);
                continue;
            }

            var gasType = Services.CylinderRules.NormalizeGasType(record.GasType);
            if (gasType is null)
            {
                logger.LogWarning("Seed dilewati: jenis gas tidak valid '{GasType}' ({Serial}).", record.GasType, serial);
                continue;
            }

            if (!Services.CylinderRules.TryParseStatus(record.Status, out var status))
            {
                logger.LogWarning("Seed dilewati: status tidak valid '{Status}' ({Serial}).", record.Status, serial);
                continue;
            }

            var customerName = Services.CylinderRules.NormalizeCustomerName(status, record.CustomerName);
            if (status == CylinderStatus.Delivered &&
                Services.CylinderRules.ValidateCustomerName(customerName) is not null)
            {
                logger.LogWarning("Seed dilewati: nama pelanggan tidak valid untuk status Delivered ({Serial}).", serial);
                continue;
            }

            var lastUpdated = record.LastUpdated ?? DateTime.UtcNow;
            lastUpdated = DateTime.SpecifyKind(
                lastUpdated.Kind == DateTimeKind.Utc ? lastUpdated : lastUpdated.ToUniversalTime(),
                DateTimeKind.Utc);

            entities.Add(new Cylinder
            {
                // Ids follow the file position so a skipped row does not shift later ids.
                Id = index + 1,
                SerialNumber = serial,
                GasType = gasType,
                Status = status,
                CustomerName = customerName,
                LastUpdated = lastUpdated,
                SearchKey = Services.CylinderRules.BuildSearchKey(serial, customerName)
            });
        }

        db.Cylinders.AddRange(entities);
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Seed selesai: {Count} silinder dimuat.", entities.Count);
    }

    /// <summary>
    /// Fills <c>SearchKey</c> for rows created before the column existed (the migration adds it
    /// with an empty default). Runs in bounded batches so startup stays cheap.
    /// </summary>
    private static async Task BackfillSearchKeysAsync(
        AppDbContext db,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        var stale = await db.Cylinders
            .Where(c => c.SearchKey == string.Empty)
            .Take(5000)
            .ToListAsync(cancellationToken);

        if (stale.Count == 0)
        {
            return;
        }

        foreach (var cylinder in stale)
        {
            cylinder.SearchKey = Services.CylinderRules.BuildSearchKey(
                cylinder.SerialNumber,
                cylinder.CustomerName);
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Backfill SearchKey selesai: {Count} baris diperbarui.", stale.Count);
    }

    private static string? ResolveSeedPath(ILogger logger, string? contentRootPath)
    {
        var candidates = new List<string>
        {
            Path.Combine(AppContext.BaseDirectory, "Data", "seed.json"),
            Path.Combine(AppContext.BaseDirectory, "seed.json")
        };

        if (!string.IsNullOrWhiteSpace(contentRootPath))
        {
            candidates.Add(Path.Combine(contentRootPath, "Data", "seed.json"));
            candidates.Add(Path.Combine(contentRootPath, "..", "..", "docs", "data.json"));
        }

        candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), "Data", "seed.json"));
        candidates.Add(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "docs", "data.json"));

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        logger.LogWarning("Kandidat seed tidak ditemukan: {Candidates}", string.Join(", ", candidates));
        return null;
    }
}
