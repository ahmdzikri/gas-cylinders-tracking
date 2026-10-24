using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

internal static class Serials
{
    private static readonly Lazy<HashSet<string>> SeedSerials = new(() =>
        SeedData.Load().Select(r => r.SerialNumber).ToHashSet(StringComparer.OrdinalIgnoreCase));

    private static readonly HashSet<string> Issued = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object Gate = new();
    private static int _next = 1;

    /// <summary>
    /// Generates a valid six-digit serial that is neither in the seed nor handed out twice in
    /// this run (seed serials are spread over the whole range, so they are skipped explicitly).
    /// </summary>
    public static string Next()
    {
        lock (Gate)
        {
            while (true)
            {
                var serial = $"CYL-{_next:D6}";
                _next = _next >= 999_999 ? 1 : _next + 1;

                if (SeedSerials.Value.Contains(serial) || !Issued.Add(serial))
                {
                    continue;
                }

                return serial;
            }
        }
    }
}

internal static class JsonHelpers
{
    public static string? Str(this JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    public static JsonElement Errors(this JsonDocument document) =>
        document.RootElement.GetProperty("errors");
}

public class CreateCylinderTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public CreateCylinderTests(ApiFactory factory) => _client = factory.CreateApiClient();

    [Fact]
    public async Task Create_NormalizesSerialAndDefaultsToEmpty_WithLocationHeader()
    {
        var serial = Serials.Next();
        var lower = serial.ToLowerInvariant();

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/cylinders")
        {
            Content = JsonContent.Create(new { serialNumber = $"  {lower}  ", gasType = "oxygen" })
        };

        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        Assert.Equal(serial, root.Str("serialNumber"));
        Assert.Equal("Oxygen", root.Str("gasType"));
        Assert.Equal("Empty", root.Str("status"));
        Assert.Equal(JsonValueKind.Null, root.GetProperty("customerName").ValueKind);
        Assert.True(root.GetProperty("id").GetInt32() > 87);
        Assert.EndsWith("Z", root.Str("lastUpdated"));
    }

    [Fact]
    public async Task Create_DuplicateDifferingOnlyByCase_Returns409()
    {
        var serial = Serials.Next();
        var (first, _) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders", new { serialNumber = serial, gasType = "Argon" });
        Assert.Equal(HttpStatusCode.Created, first);

        var (duplicate, body) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders", new { serialNumber = serial.ToLowerInvariant(), gasType = "Argon" });

        Assert.Equal(HttpStatusCode.Conflict, duplicate);
        Assert.Equal("Konflik data", body.RootElement.Str("title"));
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.Str("detail")));
    }

    [Theory]
    [InlineData("CYL-123", "Oxygen", "serialNumber")]
    [InlineData("ABC-123456", "Oxygen", "serialNumber")]
    [InlineData("", "Oxygen", "serialNumber")]
    [InlineData("CYL-123456", "Helium", "gasType")]
    [InlineData("CYL-123456", "", "gasType")]
    public async Task Create_InvalidInput_Returns400_WithFieldErrors(string serial, string gasType, string field)
    {
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders", new { serialNumber = serial, gasType });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Validasi gagal", body.RootElement.Str("title"));
        Assert.True(body.Errors().TryGetProperty(field, out var messages));
        Assert.NotEmpty(messages.EnumerateArray());
    }

    [Fact]
    public async Task Create_MalformedJson_Returns400ValidationProblem()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/cylinders")
        {
            Content = new StringContent("{ not json", System.Text.Encoding.UTF8, "application/json")
        };

        using var response = await _client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Validasi gagal", body.RootElement.Str("title"));
        Assert.True(body.RootElement.TryGetProperty("errors", out var errors));
        Assert.NotEmpty(errors.EnumerateObject());
    }

    [Fact]
    public async Task Create_MissingBody_Returns400ValidationProblem()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/cylinders");
        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Validasi gagal", body.RootElement.Str("title"));
    }
}

public class UpdateCylinderTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public UpdateCylinderTests(ApiFactory factory) => _client = factory.CreateApiClient();

    private async Task<JsonDocument> CreateAsync(string gasType = "Nitrogen")
    {
        var serial = Serials.Next();
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders", new { serialNumber = serial, gasType });
        Assert.Equal(HttpStatusCode.Created, status);
        return body;
    }

    [Fact]
    public async Task Update_Returns404_WhenMissing()
    {
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Put, "/api/cylinders/999999", new { serialNumber = "CYL-111111", gasType = "Oxygen" });

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Data tidak ditemukan", body.RootElement.Str("title"));
    }

    [Fact]
    public async Task Update_Returns409_WhenSerialBelongsToAnotherCylinder()
    {
        using var first = await CreateAsync();
        using var second = await CreateAsync();
        var firstSerial = first.RootElement.Str("serialNumber");
        var secondId = second.RootElement.GetProperty("id").GetInt32();

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Put,
            $"/api/cylinders/{secondId}",
            new { serialNumber = firstSerial!.ToLowerInvariant(), gasType = "Argon" });

        Assert.Equal(HttpStatusCode.Conflict, status);
        Assert.Equal("Konflik data", body.RootElement.Str("title"));
    }

    [Fact]
    public async Task Update_Returns400_ForInvalidFields()
    {
        using var created = await CreateAsync();
        var id = created.RootElement.GetProperty("id").GetInt32();

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Put, $"/api/cylinders/{id}", new { serialNumber = "nope", gasType = "Unobtainium" });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        var errors = body.Errors();
        Assert.True(errors.TryGetProperty("serialNumber", out _));
        Assert.True(errors.TryGetProperty("gasType", out _));
    }

    [Fact]
    public async Task Update_Returns200_NormalizesAndKeepsStatusAndCustomer()
    {
        using var created = await CreateAsync("Carbon Dioxide");
        var id = created.RootElement.GetProperty("id").GetInt32();
        var originalUpdated = created.RootElement.Str("lastUpdated");

        // Move to Delivered so we can assert status/customer are untouched by PUT.
        var (moved, _) = await _client.SendJsonAsync(
            HttpMethod.Post, $"/api/cylinders/{id}/status", new { status = "Filled" });
        Assert.Equal(HttpStatusCode.OK, moved);

        var newSerial = Serials.Next();
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Put,
            $"/api/cylinders/{id}",
            new { serialNumber = $" {newSerial.ToLowerInvariant()} ", gasType = "hydrogen" });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(newSerial, body.RootElement.Str("serialNumber"));
        Assert.Equal("Hydrogen", body.RootElement.Str("gasType"));
        Assert.Equal("Filled", body.RootElement.Str("status"));
        Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("customerName").ValueKind);

        var updated = body.RootElement.Str("lastUpdated")!;
        Assert.True(
            DateTime.Parse(updated) >= DateTime.Parse(originalUpdated!),
            "lastUpdated should not go backwards");
    }

    [Fact]
    public async Task Update_ChangesLastUpdated()
    {
        using var created = await CreateAsync();
        var id = created.RootElement.GetProperty("id").GetInt32();
        var before = created.RootElement.Str("lastUpdated")!;

        await Task.Delay(1100);

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Put, $"/api/cylinders/{id}", new { serialNumber = created.RootElement.Str("serialNumber"), gasType = "Argon" });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.True(DateTime.Parse(body.RootElement.Str("lastUpdated")!) > DateTime.Parse(before));
    }
}
