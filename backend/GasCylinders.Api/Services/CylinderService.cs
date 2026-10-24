using GasCylinders.Api.Persistence;
using GasCylinders.Api.Models;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace GasCylinders.Api.Services;

public class CylinderService
{
    private readonly AppDbContext _db;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<CylinderService> _logger;

    public CylinderService(AppDbContext db, TimeProvider timeProvider, ILogger<CylinderService> logger)
    {
        _db = db;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<CylinderListResponse> ListAsync(
        string? search,
        IReadOnlyCollection<CylinderStatus>? statuses,
        int page,
        int pageSize,
        CancellationToken cancellationToken,
        CylinderSortField sortBy = CylinderSortField.LastUpdated,
        bool descending = true)
    {
        var query = _db.Cylinders.AsNoTracking();

        if (statuses is { Count: > 0 })
        {
            query = query.Where(c => statuses.Contains(c.Status));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            // SearchKey is folded in C# on save (SQLite lower() only handles ASCII), so unicode
            // terms such as "café" match while the predicate still runs server-side.
            query = query.Where(c => c.SearchKey.Contains(term));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        // Guard against int overflow for absurd page values: (page-1)*pageSize may exceed int.
        var skip = (long)(page - 1) * pageSize;
        if (skip >= totalCount)
        {
            return new CylinderListResponse
            {
                Items = Array.Empty<Cylinder>(),
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount
            };
        }

        var items = await ApplySort(query, sortBy, descending)
            .Skip((int)skip)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new CylinderListResponse
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        };
    }

    /// <summary>
    /// Sorts in SQL. Every order ends with Id in the same direction so rows that tie on the
    /// chosen column keep a stable position across pages. Status sorts by lifecycle order
    /// (Empty, Filled, Delivered, InMaintenance, Retired), not alphabetically, because it is
    /// stored as text. Customer name sorts case-insensitively and puts NULL (no customer) last
    /// in both directions.
    /// </summary>
    internal static IQueryable<Cylinder> ApplySort(
        IQueryable<Cylinder> query,
        CylinderSortField sortBy,
        bool descending)
    {
        switch (sortBy)
        {
            case CylinderSortField.SerialNumber:
                return descending
                    ? query.OrderByDescending(c => c.SerialNumber).ThenByDescending(c => c.Id)
                    : query.OrderBy(c => c.SerialNumber).ThenBy(c => c.Id);

            case CylinderSortField.GasType:
                return descending
                    ? query.OrderByDescending(c => c.GasType).ThenByDescending(c => c.Id)
                    : query.OrderBy(c => c.GasType).ThenBy(c => c.Id);

            case CylinderSortField.Status:
            {
                // Map the stored text to its lifecycle rank so SQLite orders by the enum order.
                IOrderedQueryable<Cylinder> ordered = descending
                    ? query.OrderByDescending(c =>
                        c.Status == CylinderStatus.Empty ? 0 :
                        c.Status == CylinderStatus.Filled ? 1 :
                        c.Status == CylinderStatus.Delivered ? 2 :
                        c.Status == CylinderStatus.InMaintenance ? 3 : 4)
                    : query.OrderBy(c =>
                        c.Status == CylinderStatus.Empty ? 0 :
                        c.Status == CylinderStatus.Filled ? 1 :
                        c.Status == CylinderStatus.Delivered ? 2 :
                        c.Status == CylinderStatus.InMaintenance ? 3 : 4);
                return descending ? ordered.ThenByDescending(c => c.Id) : ordered.ThenBy(c => c.Id);
            }

            case CylinderSortField.CustomerName:
            {
                // NULLs last in both directions; then case-insensitive name.
                var withNullsLast = query.OrderBy(c => c.CustomerName == null ? 1 : 0);
                return descending
                    ? withNullsLast.ThenByDescending(c => c.CustomerName!.ToLower()).ThenByDescending(c => c.Id)
                    : withNullsLast.ThenBy(c => c.CustomerName!.ToLower()).ThenBy(c => c.Id);
            }

            default:
                return descending
                    ? query.OrderByDescending(c => c.LastUpdated).ThenByDescending(c => c.Id)
                    : query.OrderBy(c => c.LastUpdated).ThenBy(c => c.Id);
        }
    }

    public Task<Cylinder?> GetAsync(int id, CancellationToken cancellationToken) =>
        _db.Cylinders.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

    public async Task<ServiceResult<Cylinder>> CreateAsync(
        CreateCylinderRequest request,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        var serial = CylinderRules.NormalizeSerial(request.SerialNumber);
        if (!CylinderRules.IsValidSerial(serial))
        {
            errors["serialNumber"] = new[] { "Nomor seri harus berformat CYL- diikuti 6 digit angka." };
        }

        var gasType = CylinderRules.NormalizeGasType(request.GasType);
        if (gasType is null)
        {
            errors["gasType"] = new[] { "Jenis gas tidak valid." };
        }

        if (errors.Count > 0)
        {
            return ServiceResult<Cylinder>.Validation(errors);
        }

        if (await _db.Cylinders.AnyAsync(c => c.SerialNumber == serial, cancellationToken))
        {
            return DuplicateSerial(serial);
        }

        var cylinder = new Cylinder
        {
            SerialNumber = serial,
            GasType = gasType!,
            Status = CylinderStatus.Empty,
            CustomerName = null,
            LastUpdated = UtcNow()
        };

        _db.Cylinders.Add(cylinder);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            _db.Entry(cylinder).State = EntityState.Detached;
            return DuplicateSerial(serial);
        }

        return ServiceResult<Cylinder>.Created(cylinder);
    }

    public async Task<ServiceResult<Cylinder>> UpdateAsync(
        int id,
        UpdateCylinderRequest request,
        CancellationToken cancellationToken)
    {
        var cylinder = await _db.Cylinders.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (cylinder is null)
        {
            return NotFound(id);
        }

        var errors = new Dictionary<string, string[]>();

        var serial = CylinderRules.NormalizeSerial(request.SerialNumber);
        if (!CylinderRules.IsValidSerial(serial))
        {
            errors["serialNumber"] = new[] { "Nomor seri harus berformat CYL- diikuti 6 digit angka." };
        }

        var gasType = CylinderRules.NormalizeGasType(request.GasType);
        if (gasType is null)
        {
            errors["gasType"] = new[] { "Jenis gas tidak valid." };
        }

        if (errors.Count > 0)
        {
            return ServiceResult<Cylinder>.Validation(errors);
        }

        if (await _db.Cylinders.AnyAsync(c => c.SerialNumber == serial && c.Id != id, cancellationToken))
        {
            return DuplicateSerial(serial);
        }

        cylinder.SerialNumber = serial;
        cylinder.GasType = gasType!;
        cylinder.LastUpdated = UtcNow();

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrencyConflict<Cylinder>();
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            return DuplicateSerial(serial);
        }

        return ServiceResult<Cylinder>.Ok(cylinder);
    }

    public async Task<ServiceResult<Cylinder>> ChangeStatusAsync(
        int id,
        ChangeStatusRequest request,
        CancellationToken cancellationToken)
    {
        var cylinder = await _db.Cylinders.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (cylinder is null)
        {
            return NotFound(id);
        }

        if (!CylinderRules.TryParseStatus(request.Status, out var target))
        {
            return ServiceResult<Cylinder>.Validation(
                new Dictionary<string, string[]> { ["status"] = new[] { "Status tidak dikenal." } },
                "Status tidak dikenal.");
        }

        if (!CylinderRules.CanTransition(cylinder.Status, target))
        {
            var message = $"Transisi status dari {cylinder.Status} ke {target} tidak diizinkan.";
            return ServiceResult<Cylinder>.InvalidTransition(message, message);
        }

        string? customerName = null;
        if (target == CylinderStatus.Delivered)
        {
            var customerError = CylinderRules.ValidateCustomerName(request.CustomerName);
            if (customerError is not null)
            {
                return ServiceResult<Cylinder>.Validation(
                    new Dictionary<string, string[]> { ["customerName"] = new[] { customerError } },
                    customerError);
            }

            customerName = CylinderRules.NormalizeCustomerName(target, request.CustomerName);
        }

        cylinder.Status = target;
        cylinder.CustomerName = customerName;
        cylinder.LastUpdated = UtcNow();

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrencyConflict<Cylinder>();
        }

        return ServiceResult<Cylinder>.Ok(cylinder);
    }

    private DateTime UtcNow()
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        return DateTime.SpecifyKind(now, DateTimeKind.Utc);
    }

    private static ServiceResult<Cylinder> NotFound(int id) =>
        ServiceResult<Cylinder>.NotFound($"Silinder dengan id {id} tidak ditemukan.");

    private static ServiceResult<Cylinder> DuplicateSerial(string serial) =>
        ServiceResult<Cylinder>.Conflict(
            $"Nomor seri {serial} sudah digunakan.",
            new Dictionary<string, string[]> { ["serialNumber"] = new[] { "Nomor seri sudah digunakan." } });

    private static ServiceResult<T> ConcurrencyConflict<T>() =>
        ServiceResult<T>.Conflict(
            "Data tabung telah diubah oleh pengguna lain. Muat ulang lalu coba lagi.");

    /// <summary>
    /// SQLite constraint failures surface as <see cref="SqliteException"/> with primary code 19;
    /// 2067 is SQLITE_CONSTRAINT_UNIQUE (the serial unique index).
    /// </summary>
    private static bool IsUniqueViolation(DbUpdateException exception)
    {
        return exception.InnerException is SqliteException { SqliteErrorCode: 19 } sqlite &&
               (sqlite.SqliteExtendedErrorCode == 2067 || sqlite.SqliteExtendedErrorCode == 1555);
    }
}
