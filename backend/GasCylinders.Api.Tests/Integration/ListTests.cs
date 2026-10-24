using System.Net;
using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

public class ListTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public ListTests(ApiFactory factory) => _client = factory.CreateApiClient();

    [Fact]
    public async Task DefaultPaging_ReturnsFirstPageOf87_SortedByLastUpdatedThenIdDesc()
    {
        using var doc = await _client.GetJsonAsync("/api/cylinders");
        var root = doc.RootElement;

        Assert.Equal(87, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.Equal(10, root.GetProperty("pageSize").GetInt32());

        var items = root.GetProperty("items");
        Assert.Equal(10, items.GetArrayLength());

        var expected = SeedData.Load().Take(10).Select(c => c.SerialNumber).ToArray();
        var actual = items.EnumerateArray().Select(i => i.GetProperty("serialNumber").GetString()).ToArray();
        Assert.Equal(expected, actual);

        // lastUpdated must be descending across the page.
        var dates = items.EnumerateArray()
            .Select(i => DateTime.Parse(i.GetProperty("lastUpdated").GetString()!, null,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal))
            .ToArray();
        Assert.Equal(dates.OrderByDescending(d => d), dates);
    }

    [Fact]
    public async Task Search_IsCaseInsensitive_OnSerialNumber()
    {
        using var doc = await _client.GetJsonAsync("/api/cylinders?search=cyl-703757");
        var root = doc.RootElement;

        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        var item = root.GetProperty("items")[0];
        Assert.Equal("CYL-703757", item.GetProperty("serialNumber").GetString());
    }

    [Fact]
    public async Task Search_IsCaseInsensitive_AndHandlesApostrophe_InCustomerName()
    {
        using var doc = await _client.GetJsonAsync("/api/cylinders?search=o%27brien");
        var root = doc.RootElement;

        Assert.Equal(3, root.GetProperty("totalCount").GetInt32());
        foreach (var item in root.GetProperty("items").EnumerateArray())
        {
            Assert.Contains("O'Brien", item.GetProperty("customerName").GetString());
        }
    }

    [Fact]
    public async Task Search_TreatsLikeWildcardsLiterally()
    {
        using var percent = await _client.GetJsonAsync("/api/cylinders?search=%25");
        Assert.Equal(0, percent.RootElement.GetProperty("totalCount").GetInt32());

        using var underscore = await _client.GetJsonAsync("/api/cylinders?search=_");
        Assert.Equal(0, underscore.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task StatusFilter_IsExactAndCaseInsensitive()
    {
        using var doc = await _client.GetJsonAsync("/api/cylinders?status=delivered&pageSize=50");
        var root = doc.RootElement;

        Assert.Equal(32, root.GetProperty("totalCount").GetInt32());
        Assert.All(
            root.GetProperty("items").EnumerateArray(),
            item => Assert.Equal("Delivered", item.GetProperty("status").GetString()));

        using var upper = await _client.GetJsonAsync("/api/cylinders?status=DELIVERED&pageSize=50");
        Assert.Equal(32, upper.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task UnknownStatus_Returns400ValidationProblem()
    {
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, "/api/cylinders?status=Bogus", null);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Validasi gagal", body.RootElement.GetProperty("title").GetString());
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty("status", out _));
    }

    [Fact]
    public async Task StatusFilter_AcceptsJsonArray_AndIsCaseInsensitive()
    {
        var encoded = Uri.EscapeDataString("[\"empty\",\"FILLED\"]");
        using var doc = await _client.GetJsonAsync($"/api/cylinders?status={encoded}&pageSize=50");
        var root = doc.RootElement;

        var expectedCount = SeedData.Load().Count(r => r.Status is "Empty" or "Filled");
        Assert.Equal(expectedCount, root.GetProperty("totalCount").GetInt32());
        Assert.All(
            root.GetProperty("items").EnumerateArray(),
            item => Assert.Contains(item.GetProperty("status").GetString(), new[] { "Empty", "Filled" }));
    }

    [Fact]
    public async Task StatusFilter_DeduplicatesArrayEntries()
    {
        var encoded = Uri.EscapeDataString("[\"empty\",\"EMPTY\"]");
        using var doc = await _client.GetJsonAsync($"/api/cylinders?status={encoded}&pageSize=50");

        var expectedCount = SeedData.Load().Count(r => r.Status == "Empty");
        Assert.Equal(expectedCount, doc.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task StatusFilter_EmptyArray_MeansNoFilter()
    {
        var encoded = Uri.EscapeDataString("[]");
        using var doc = await _client.GetJsonAsync($"/api/cylinders?status={encoded}");

        Assert.Equal(87, doc.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task StatusFilter_RejectsUnknownArrayEntry()
    {
        var encoded = Uri.EscapeDataString("[\"empty\",\"bogus\"]");
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders?status={encoded}", null);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Validasi gagal", body.RootElement.GetProperty("title").GetString());
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty("status", out _));
    }

    [Fact]
    public async Task StatusFilter_RejectsMalformedArray()
    {
        var encoded = Uri.EscapeDataString("[\"empty\"");
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders?status={encoded}", null);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Validasi gagal", body.RootElement.GetProperty("title").GetString());
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty("status", out _));
    }

    [Fact]
    public async Task StatusFilter_NonStringArray_Returns400()
    {
        var encoded = Uri.EscapeDataString("[1,2]");
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders?status={encoded}", null);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty("status", out _));
    }

    [Fact]
    public async Task PageBeyondEnd_Returns200WithEmptyItems()
    {
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, "/api/cylinders?page=99", null);

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(0, body.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(87, body.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task HugePageNumber_DoesNotOverflow_Returns200WithEmptyItems()
    {
        var (status, body) = await _client.SendJsonAsync(
            HttpMethod.Get, "/api/cylinders?page=300000000&pageSize=50", null);

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(0, body.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(300000000, body.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(50, body.RootElement.GetProperty("pageSize").GetInt32());
        Assert.Equal(87, body.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Theory]
    [InlineData("caf%C3%A9", "PT Café Nusantara Ünggul")]
    [InlineData("CAF%C3%89", "PT Café Nusantara Ünggul")]
    [InlineData("%C3%BCnggul", "PT Café Nusantara Ünggul")]
    [InlineData("%C3%9CNGGUL", "PT Café Nusantara Ünggul")]
    public async Task Search_IsUnicodeCaseInsensitive(string encodedTerm, string expectedCustomer)
    {
        using var doc = await _client.GetJsonAsync($"/api/cylinders?search={encodedTerm}");
        var root = doc.RootElement;

        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.Equal(expectedCustomer, root.GetProperty("items")[0].GetProperty("customerName").GetString());
    }

    [Theory]
    [InlineData("?page=0", "page")]
    [InlineData("?pageSize=51", "pageSize")]
    [InlineData("?pageSize=0", "pageSize")]
    [InlineData("?page=abc", "page")]
    [InlineData("?pageSize=abc", "pageSize")]
    public async Task InvalidPaging_Returns400_WithFieldError(string query, string field)
    {
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, "/api/cylinders" + query, null);

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.Equal("Validasi gagal", body.RootElement.GetProperty("title").GetString());
        Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Get_ReturnsCylinderOr404()
    {
        var (found, body) = await _client.SendJsonAsync(HttpMethod.Get, "/api/cylinders/1", null);
        Assert.Equal(HttpStatusCode.OK, found);
        Assert.Equal(1, body.RootElement.GetProperty("id").GetInt32());

        var (missing, problem) = await _client.SendJsonAsync(HttpMethod.Get, "/api/cylinders/999999", null);
        Assert.Equal(HttpStatusCode.NotFound, missing);
        Assert.Equal("Data tidak ditemukan", problem.RootElement.GetProperty("title").GetString());
        Assert.False(string.IsNullOrWhiteSpace(problem.RootElement.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task Meta_ReturnsGasTypesStatusesAndTransitions()
    {
        using var doc = await _client.GetJsonAsync("/api/cylinders/meta");
        var root = doc.RootElement;

        var gasTypes = root.GetProperty("gasTypes").EnumerateArray().Select(v => v.GetString()).ToArray();
        Assert.Equal(
            new[] { "Oxygen", "Nitrogen", "Argon", "Carbon Dioxide", "Acetylene", "Hydrogen" },
            gasTypes);

        var statuses = root.GetProperty("statuses").EnumerateArray().Select(v => v.GetString()).ToArray();
        Assert.Equal(new[] { "Empty", "Filled", "Delivered", "InMaintenance", "Retired" }, statuses);

        var transitions = root.GetProperty("transitions");
        Assert.Equal(
            new[] { "Filled", "InMaintenance", "Retired" },
            transitions.GetProperty("Empty").EnumerateArray().Select(v => v.GetString()).ToArray());
        Assert.Empty(transitions.GetProperty("Retired").EnumerateArray());
        Assert.Equal(
            new[] { "Empty" },
            transitions.GetProperty("Delivered").EnumerateArray().Select(v => v.GetString()).ToArray());
    }

    [Fact]
    public async Task Health_ReturnsOk()
    {
        using var doc = await _client.GetJsonAsync("/api/health");
        Assert.Equal("ok", doc.RootElement.GetProperty("status").GetString());
    }
}
