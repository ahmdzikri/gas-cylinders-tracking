using System.Text.Json;
using GasCylinders.Api.Models;
using GasCylinders.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace GasCylinders.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CylindersController : ControllerBase
{
    private const int DefaultPageSize = 10;
    private const int MaxPageSize = 50;

    private readonly CylinderService _service;

    public CylindersController(CylinderService service)
    {
        _service = service;
    }

    [HttpGet]
    [ProducesResponseType(typeof(CylinderListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] string? page,
        [FromQuery] string? pageSize,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortDir,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();

        var pageValue = 1;
        if (!string.IsNullOrWhiteSpace(page))
        {
            if (!int.TryParse(page, out pageValue))
            {
                errors["page"] = new[] { "Halaman harus berupa angka bulat." };
            }
        }

        var pageSizeValue = DefaultPageSize;
        if (!string.IsNullOrWhiteSpace(pageSize))
        {
            if (!int.TryParse(pageSize, out pageSizeValue))
            {
                errors["pageSize"] = new[] { "Ukuran halaman harus berupa angka bulat." };
            }
        }

        if (!errors.ContainsKey("page"))
        {
            if (pageValue < 1)
            {
                errors["page"] = new[] { "Halaman minimal 1." };
            }
        }

        if (!errors.ContainsKey("pageSize"))
        {
            if (pageSizeValue < 1)
            {
                errors["pageSize"] = new[] { "Ukuran halaman minimal 1." };
            }
            else if (pageSizeValue > MaxPageSize)
            {
                errors["pageSize"] = new[] { $"Ukuran halaman maksimal {MaxPageSize}." };
            }
        }

        // `status` accepts either the legacy single value (`?status=Empty`) or a JSON array
        // (`?status=["empty","filled"]`). Values are case-insensitive and deduplicated.
        IReadOnlyCollection<CylinderStatus>? statusFilter = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (TryParseStatusFilter(status, out var parsedStatuses))
            {
                statusFilter = parsedStatuses.Count > 0 ? parsedStatuses : null;
            }
            else
            {
                errors["status"] = new[] { "Status tidak dikenal atau format status tidak valid." };
            }
        }

        // Default order (spec): lastUpdated desc, then id.
        var sortField = CylinderSortField.LastUpdated;
        if (!string.IsNullOrWhiteSpace(sortBy) &&
            (!Enum.TryParse(sortBy.Trim(), ignoreCase: true, out sortField) ||
             !Enum.IsDefined(sortField) ||
             int.TryParse(sortBy, out _)))
        {
            errors["sortBy"] = new[]
            {
                "Kolom urut harus salah satu dari: serialNumber, gasType, status, customerName, lastUpdated."
            };
        }

        // With an explicit column sort the default direction is ascending; without sortBy the
        // list keeps its own default of lastUpdated DESC.
        var descending = string.IsNullOrWhiteSpace(sortBy);
        if (!string.IsNullOrWhiteSpace(sortDir))
        {
            var dir = sortDir.Trim().ToLowerInvariant();
            if (dir is "asc" or "desc")
            {
                descending = dir == "desc";
            }
            else
            {
                errors["sortDir"] = new[] { "Arah urut harus asc atau desc." };
            }
        }

        if (errors.Count > 0)
        {
            return ValidationProblem(errors, "Parameter permintaan tidak valid.");
        }

        var result = await _service.ListAsync(
            search, statusFilter, pageValue, pageSizeValue, cancellationToken, sortField, descending);
        return Ok(result);
    }

    /// <summary>
    /// Parses the `status` query value: a legacy single status or a JSON array of statuses.
    /// Returns false when the JSON is malformed, the array holds non-strings, or any value is
    /// not a known status. An empty array yields an empty collection (= no filter).
    /// </summary>
    private static bool TryParseStatusFilter(string raw, out IReadOnlyCollection<CylinderStatus> statuses)
    {
        statuses = Array.Empty<CylinderStatus>();
        var trimmed = raw.Trim();
        if (trimmed.Length == 0) return true;

        IReadOnlyList<string> values;
        if (trimmed.StartsWith('['))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<string[]>(trimmed);
                if (parsed is null) return false;
                values = parsed;
            }
            catch (JsonException)
            {
                return false;
            }
        }
        else
        {
            values = new[] { trimmed };
        }

        var result = new List<CylinderStatus>();
        foreach (var value in values)
        {
            if (!CylinderRules.TryParseStatus(value, out var parsedStatus)) return false;
            if (!result.Contains(parsedStatus)) result.Add(parsedStatus);
        }

        statuses = result;
        return true;
    }

    [HttpGet("meta")]
    [ProducesResponseType(typeof(MetaResponse), StatusCodes.Status200OK)]
    public IActionResult Meta() => Ok(CylinderRules.BuildMeta());

    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(Cylinder), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(int id, CancellationToken cancellationToken)
    {
        var cylinder = await _service.GetAsync(id, cancellationToken);
        if (cylinder is null)
        {
            return NotFoundProblem($"Silinder dengan id {id} tidak ditemukan.");
        }

        return Ok(cylinder);
    }

    [HttpPost]
    [ProducesResponseType(typeof(Cylinder), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        [FromBody] CreateCylinderRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return ValidationProblem(
                new Dictionary<string, string[]> { ["body"] = new[] { "Body permintaan wajib diisi." } });
        }

        var result = await _service.CreateAsync(request, cancellationToken);
        if (!result.IsSuccess)
        {
            return ToProblem(result);
        }

        return CreatedAtAction(nameof(Get), new { id = result.Value!.Id }, result.Value);
    }

    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(Cylinder), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        int id,
        [FromBody] UpdateCylinderRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return ValidationProblem(
                new Dictionary<string, string[]> { ["body"] = new[] { "Body permintaan wajib diisi." } });
        }

        var result = await _service.UpdateAsync(id, request, cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : ToProblem(result);
    }

    [HttpPost("{id:int}/status")]
    [ProducesResponseType(typeof(Cylinder), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ChangeStatus(
        int id,
        [FromBody] ChangeStatusRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return ValidationProblem(
                new Dictionary<string, string[]> { ["body"] = new[] { "Body permintaan wajib diisi." } });
        }

        var result = await _service.ChangeStatusAsync(id, request, cancellationToken);
        return result.IsSuccess ? Ok(result.Value) : ToProblem(result);
    }

    private IActionResult ToProblem<T>(ServiceResult<T> result)
    {
        if (result.StatusCode == StatusCodes.Status400BadRequest && result.IsValidationProblem)
        {
            return ValidationProblem(result.Errors ?? new Dictionary<string, string[]>(), result.Detail);
        }

        if (result.StatusCode == StatusCodes.Status400BadRequest && result.Errors is { Count: > 0 })
        {
            // e.g. invalid status transition: ProblemDetails + errors.status for the UI.
            var problem = new ProblemDetails
            {
                Status = result.StatusCode,
                Title = result.Title,
                Detail = result.Detail,
                Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
            };
            problem.Extensions["errors"] = result.Errors;
            return new ObjectResult(problem)
            {
                StatusCode = result.StatusCode,
                ContentTypes = { "application/problem+json" }
            };
        }

        if (result.StatusCode == StatusCodes.Status409Conflict && result.Errors is { Count: > 0 })
        {
            // Conflict still uses ProblemDetails, but keep field errors available for the UI.
            var problem = new ProblemDetails
            {
                Status = result.StatusCode,
                Title = result.Title,
                Detail = result.Detail,
                Type = "https://tools.ietf.org/html/rfc7231#section-6.5.8"
            };
            problem.Extensions["errors"] = result.Errors;
            return new ObjectResult(problem)
            {
                StatusCode = result.StatusCode,
                ContentTypes = { "application/problem+json" }
            };
        }

        return Problem(
            statusCode: result.StatusCode,
            title: result.Title,
            detail: result.Detail,
            type: result.StatusCode == StatusCodes.Status404NotFound
                ? "https://tools.ietf.org/html/rfc7231#section-6.5.4"
                : "https://tools.ietf.org/html/rfc7231#section-6.5.8");
    }

    private IActionResult ValidationProblem(Dictionary<string, string[]> errors, string? detail = null)
    {
        var problem = new ValidationProblemDetails(errors)
        {
            Title = "Validasi gagal",
            Detail = detail ?? "Data yang dikirim tidak valid.",
            Status = StatusCodes.Status400BadRequest,
            Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
        };

        return new ObjectResult(problem)
        {
            StatusCode = StatusCodes.Status400BadRequest,
            ContentTypes = { "application/problem+json" }
        };
    }

    private IActionResult NotFoundProblem(string detail) =>
        Problem(
            statusCode: StatusCodes.Status404NotFound,
            title: "Data tidak ditemukan",
            detail: detail,
            type: "https://tools.ietf.org/html/rfc7231#section-6.5.4");
}
