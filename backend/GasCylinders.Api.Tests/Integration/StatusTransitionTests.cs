using System.Net;
using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

public class StatusTransitionTests : IClassFixture<ApiFactory>
{
    private static readonly string[] AllStatuses =
        { "Empty", "Filled", "Delivered", "InMaintenance", "Retired" };

    private readonly HttpClient _client;

    public StatusTransitionTests(ApiFactory factory) => _client = factory.CreateApiClient();

    private static readonly HashSet<(string, string)> Allowed = new()
    {
        ("Empty", "Filled"),
        ("Empty", "InMaintenance"),
        ("Empty", "Retired"),
        ("Filled", "Delivered"),
        ("Filled", "InMaintenance"),
        ("Filled", "Retired"),
        ("Delivered", "Empty"),
        ("InMaintenance", "Empty"),
        ("InMaintenance", "Retired")
    };

    public static TheoryData<string, string> AllowedPairs()
    {
        var data = new TheoryData<string, string>();
        foreach (var (from, to) in Allowed)
        {
            data.Add(from, to);
        }

        return data;
    }

    public static TheoryData<string, string> InvalidPairs()
    {
        var data = new TheoryData<string, string>();
        foreach (var from in AllStatuses)
        {
            foreach (var to in AllStatuses)
            {
                if (!Allowed.Contains((from, to)))
                {
                    data.Add(from, to);
                }
            }
        }

        return data;
    }

    private async Task<int> CreateCylinderAsync()
    {
        var serial = Serials.Next();
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders", new { serialNumber = serial, gasType = "Oxygen" });
        Assert.Equal(HttpStatusCode.Created, status);
        return body.RootElement.GetProperty("id").GetInt32();
    }

    /// <summary>Creates a cylinder and drives it to the requested status through legal transitions.</summary>
    private async Task<int> CreateInStatusAsync(string target)
    {
        var id = await CreateCylinderAsync();
        foreach (var step in PathTo(target))
        {
            var (status, body) = await _client.SendJsonAsync(
                HttpMethod.Post,
                $"/api/cylinders/{id}/status",
                new { status = step, customerName = step == "Delivered" ? "PT Uji Transisi" : null });
            Assert.Equal(HttpStatusCode.OK, status);
            Assert.Equal(step, body.RootElement.GetProperty("status").GetString());
        }

        return id;
    }

    private static IEnumerable<string> PathTo(string target) => target switch
    {
        "Empty" => Array.Empty<string>(),
        "Filled" => new[] { "Filled" },
        "Delivered" => new[] { "Filled", "Delivered" },
        "InMaintenance" => new[] { "InMaintenance" },
        "Retired" => new[] { "Retired" },
        _ => throw new ArgumentOutOfRangeException(nameof(target))
    };

    [Theory]
    [MemberData(nameof(AllowedPairs))]
    public async Task AllowedTransition_Returns200(string from, string to)
    {
        var id = await CreateInStatusAsync(from);

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post,
            $"/api/cylinders/{id}/status",
            new { status = to, customerName = to == "Delivered" ? "PT Pelanggan Baru" : "diabaikan" });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(to, body.RootElement.GetProperty("status").GetString());

        if (to == "Delivered")
        {
            Assert.Equal("PT Pelanggan Baru", body.RootElement.GetProperty("customerName").GetString());
        }
        else
        {
            Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("customerName").ValueKind);
        }
    }

    [Theory]
    [MemberData(nameof(InvalidPairs))]
    public async Task InvalidTransition_Returns400_WithStatusError(string from, string to)
    {
        var id = await CreateInStatusAsync(from);

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post,
            $"/api/cylinders/{id}/status",
            new { status = to, customerName = "PT Apa Saja" });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Transisi status tidak valid", body.RootElement.GetProperty("title").GetString());
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("detail").GetString()));
        Assert.True(body.Errors().TryGetProperty("status", out var messages));
        Assert.NotEmpty(messages.EnumerateArray());
    }

    [Fact]
    public async Task UnknownStatus_Returns400()
    {
        var id = await CreateCylinderAsync();

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, $"/api/cylinders/{id}/status", new { status = "Bogus" });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.True(body.Errors().TryGetProperty("status", out _));
    }

    [Fact]
    public async Task ChangeStatus_Returns404_WhenMissing()
    {
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, "/api/cylinders/999999/status", new { status = "Filled" });

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Data tidak ditemukan", body.RootElement.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Delivered_WithoutCustomerName_Returns400()
    {
        var id = await CreateInStatusAsync("Filled");

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, $"/api/cylinders/{id}/status", new { status = "Delivered" });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.True(body.Errors().TryGetProperty("customerName", out _));
    }

    [Fact]
    public async Task Delivered_WithBlankCustomerName_Returns400()
    {
        var id = await CreateInStatusAsync("Filled");

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post, $"/api/cylinders/{id}/status", new { status = "Delivered", customerName = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.True(body.Errors().TryGetProperty("customerName", out _));
    }

    [Fact]
    public async Task Delivered_WithTooLongCustomerName_Returns400()
    {
        var id = await CreateInStatusAsync("Filled");

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post,
            $"/api/cylinders/{id}/status",
            new { status = "Delivered", customerName = new string('A', 121) });

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.True(body.Errors().TryGetProperty("customerName", out _));
    }

    [Fact]
    public async Task Delivered_With120CharCustomerName_IsAccepted_AndTrimmed()
    {
        var id = await CreateInStatusAsync("Filled");
        var name = new string('B', 120);

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post,
            $"/api/cylinders/{id}/status",
            new { status = "Delivered", customerName = $"  {name}  " });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(name, body.RootElement.GetProperty("customerName").GetString());
    }

    [Fact]
    public async Task CustomerName_IsCleared_WhenLeavingDelivered()
    {
        var id = await CreateInStatusAsync("Delivered");

        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Post,
            $"/api/cylinders/{id}/status",
            new { status = "Empty", customerName = "PT Tidak Dipakai" });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("Empty", body.RootElement.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, body.RootElement.GetProperty("customerName").ValueKind);

        // Confirm persisted, not just echoed.
        var (getStatus, stored) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders/{id}", null);
        Assert.Equal(HttpStatusCode.OK, getStatus);
        Assert.Equal(JsonValueKind.Null, stored.RootElement.GetProperty("customerName").ValueKind);
    }

    [Fact]
    public async Task ChangeStatus_UpdatesLastUpdated()
    {
        var id = await CreateCylinderAsync();
        var (_, before) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders/{id}", null);
        var previous = before.RootElement.GetProperty("lastUpdated").GetString()!;

        await Task.Delay(1100);

        var (status, after) = await _client.SendJsonAsync(
            HttpMethod.Post, $"/api/cylinders/{id}/status", new { status = "Filled" });

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.True(DateTime.Parse(after.RootElement.GetProperty("lastUpdated").GetString()!) >
                    DateTime.Parse(previous));
    }
}
