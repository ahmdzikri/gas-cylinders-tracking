using GasCylinders.Api.Persistence;
using GasCylinders.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Resolved lazily so test hosts can override ConnectionStrings:Default after the builder is created.
builder.Services.AddDbContext<AppDbContext>((serviceProvider, options) =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    var connectionString = configuration.GetConnectionString("Default") ?? "Data Source=data/cylinders.db";
    EnsureSqliteDirectory(connectionString);
    options.UseSqlite(connectionString);
});
builder.Services.AddScoped<CylinderService>();
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var errors = context.ModelState
                .Where(entry => entry.Value?.Errors.Count > 0)
                .ToDictionary(
                    entry => ToCamelCase(entry.Key),
                    entry => entry.Value!.Errors
                        .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                            ? "Nilai tidak valid."
                            : error.ErrorMessage)
                        .ToArray());

            var problem = new ValidationProblemDetails(errors)
            {
                Title = "Validasi gagal",
                Detail = "Data yang dikirim tidak valid.",
                Status = StatusCodes.Status400BadRequest,
                Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
            };

            return new ObjectResult(problem)
            {
                StatusCode = StatusCodes.Status400BadRequest,
                ContentTypes = { "application/problem+json" }
            };
        };
    })
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (corsOrigins.Length == 0)
        {
            // No configured origins means no cross-origin access at all.
            policy.SetIsOriginAllowed(_ => false);
        }
        else
        {
            policy.WithOrigins(corsOrigins);
        }

        policy.AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await DatabaseInitializer.InitializeAsync(db, logger, app.Environment.ContentRootPath);
}

app.UseExceptionHandler();

// Turns bare 404/405/415 (e.g. unmatched routes, wrong verbs) into RFC 7807 ProblemDetails.
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

var wwwRoot = app.Environment.WebRootPath;
if (!string.IsNullOrWhiteSpace(wwwRoot) && File.Exists(Path.Combine(wwwRoot, "index.html")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.MapControllers();

// Unmatched GET /api/* requests must stay JSON, never fall through to the SPA index.html.
// Only GET is mapped so a wrong verb on an existing route still yields a real 405 (formatted by
// UseStatusCodePages) instead of being masked as 404 by this catch-all.
app.MapMethods("/api/{**slug}", new[] { HttpMethods.Get }, (HttpContext context) =>
    Results.Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Endpoint tidak ditemukan",
        detail: $"Endpoint {context.Request.Path} tidak tersedia.",
        type: "https://tools.ietf.org/html/rfc7231#section-6.5.4"));

if (!string.IsNullOrWhiteSpace(wwwRoot) && File.Exists(Path.Combine(wwwRoot, "index.html")))
{
    // `nonfile` (the default MapFallbackToFile constraint) keeps real asset paths such as
    // /assets/index-*.js out of the fallback: endpoint routing runs before the static file
    // middleware, so without it every asset would be answered with index.html (text/html) and
    // the SPA would render blank. The negative lookahead keeps /api/* out as well.
    app.MapFallbackToFile("{*path:nonfile:regex(^(?!api/).*$)}", "index.html");
}

app.Run();

static void EnsureSqliteDirectory(string connectionString)
{
    var dataSource = new Microsoft.Data.Sqlite.SqliteConnectionStringBuilder(connectionString).DataSource;
    if (string.IsNullOrWhiteSpace(dataSource) ||
        dataSource.Equals(":memory:", StringComparison.OrdinalIgnoreCase) ||
        dataSource.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    var directory = Path.GetDirectoryName(Path.GetFullPath(dataSource));
    if (!string.IsNullOrWhiteSpace(directory))
    {
        Directory.CreateDirectory(directory);
    }
}

static string ToCamelCase(string key)
{
    if (string.IsNullOrEmpty(key))
    {
        return key;
    }

    // ModelState keys look like "SerialNumber" or "$.serialNumber".
    var cleaned = key.TrimStart('$', '.');
    if (cleaned.Length == 0)
    {
        return "body";
    }

    return char.ToLowerInvariant(cleaned[0]) + cleaned[1..];
}

public partial class Program
{
}
