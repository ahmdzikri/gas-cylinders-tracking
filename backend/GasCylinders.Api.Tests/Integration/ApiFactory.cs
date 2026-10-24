using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace GasCylinders.Api.Tests.Integration;

/// <summary>
/// Boots the real API against a unique temporary SQLite file so each test run is isolated.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"cylinders-tests-{Guid.NewGuid():N}.db");

    public string DatabasePath => _dbPath;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = $"Data Source={_dbPath}",
                ["Cors:Origins:0"] = "http://localhost:3000"
            });
        });
    }

    public HttpClient CreateApiClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false
    });

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing)
        {
            return;
        }

        try
        {
            if (File.Exists(_dbPath))
            {
                File.Delete(_dbPath);
            }
        }
        catch (IOException)
        {
            // Best effort cleanup.
        }
    }
}

public static class ApiClientExtensions
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<(System.Net.HttpStatusCode Status, JsonDocument Body)> SendJsonAsync(
        this HttpClient client,
        HttpMethod method,
        string url,
        object? body)
    {
        using var request = new HttpRequestMessage(method, url);
        if (body is not null)
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(body, JsonOptions),
                Encoding.UTF8,
                "application/json");
        }

        using var response = await client.SendAsync(request);
        var payload = await response.Content.ReadAsStringAsync();
        var document = string.IsNullOrWhiteSpace(payload)
            ? JsonDocument.Parse("{}")
            : JsonDocument.Parse(payload);

        return (response.StatusCode, document);
    }

    public static async Task<JsonDocument> GetJsonAsync(this HttpClient client, string url)
    {
        using var response = await client.GetAsync(url);
        var payload = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(payload);
    }

    public static async Task<T?> GetFromJsonAsync<T>(this HttpClient client, string url) =>
        await client.GetFromJsonAsync<T>(url, JsonOptions);
}
