namespace GasCylinders.Api.Services;

/// <summary>Outcome of a service operation, translated to ProblemDetails by the controller.</summary>
public sealed class ServiceResult<T>
{
    private ServiceResult(T? value, int statusCode)
    {
        Value = value;
        StatusCode = statusCode;
    }

    public T? Value { get; }

    public int StatusCode { get; }

    public bool IsSuccess => StatusCode is >= 200 and < 300;

    public string? Title { get; private init; }

    public string? Detail { get; private init; }

    public Dictionary<string, string[]>? Errors { get; private init; }

    /// <summary>True for field validation failures (ValidationProblemDetails); false for other ProblemDetails.</summary>
    public bool IsValidationProblem { get; private init; }

    public static ServiceResult<T> Ok(T value) => new(value, StatusCodes.Status200OK);

    public static ServiceResult<T> Created(T value) => new(value, StatusCodes.Status201Created);

    public static ServiceResult<T> NotFound(string detail) =>
        new(default, StatusCodes.Status404NotFound) { Title = "Data tidak ditemukan", Detail = detail };

    public static ServiceResult<T> Conflict(string detail, Dictionary<string, string[]>? errors = null) =>
        new(default, StatusCodes.Status409Conflict) { Title = "Konflik data", Detail = detail, Errors = errors };

    public static ServiceResult<T> Validation(Dictionary<string, string[]> errors, string? detail = null) =>
        new(default, StatusCodes.Status400BadRequest)
        {
            Title = "Validasi gagal",
            Detail = detail ?? "Data yang dikirim tidak valid.",
            Errors = errors,
            IsValidationProblem = true
        };

    /// <summary>
    /// Invalid status transition: RFC 7807 ProblemDetails (not ValidationProblemDetails) whose
    /// title/detail are human Bahasa Indonesia, with <c>errors.status</c> for the UI.
    /// </summary>
    public static ServiceResult<T> InvalidTransition(string detail, string message) =>
        new(default, StatusCodes.Status400BadRequest)
        {
            Title = "Transisi status tidak valid",
            Detail = detail,
            Errors = new Dictionary<string, string[]> { ["status"] = new[] { message } }
        };
}
