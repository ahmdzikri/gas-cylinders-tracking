using System.Net;
using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

public class SortingTests : IClassFixture<ApiFactory>
{
    private static readonly string[] StatusOrder = { "Empty", "Filled", "Delivered", "InMaintenance", "Retired" };

    private readonly HttpClient _client;

    public SortingTests(ApiFactory factory) => _client = factory.CreateApiClient();

    private async Task<List<JsonElement>> FetchAll(string sortBy, string sortDir)
    {
        var all = new List<JsonElement>();
        for (var page = 1; page <= 10; page++)
        {
            using var doc = await _client.GetJsonAsync(
                $"/api/cylinders?sortBy={sortBy}&sortDir={sortDir}&page={page}&pageSize=50");
            var items = doc.RootElement.GetProperty("items").EnumerateArray().Select(e => e.Clone()).ToList();
            if (items.Count == 0) break;
            all.AddRange(items);
        }

        return all;
    }

    private static string? Str(JsonElement e, string name) =>
        e.GetProperty(name).ValueKind == JsonValueKind.Null ? null : e.GetProperty(name).GetString();

    [Theory]
    [InlineData("serialNumber", "asc")]
    [InlineData("serialNumber", "desc")]
    [InlineData("gasType", "asc")]
    [InlineData("gasType", "desc")]
    [InlineData("status", "asc")]
    [InlineData("status", "desc")]
    [InlineData("customerName", "asc")]
    [InlineData("customerName", "desc")]
    [InlineData("lastUpdated", "asc")]
    [InlineData("lastUpdated", "desc")]
    public async Task SortedPages_AreOrdered_AndCoverEveryRowExactlyOnce(string sortBy, string sortDir)
    {
        var rows = await FetchAll(sortBy, sortDir);
        using var first = await _client.GetJsonAsync("/api/cylinders");
        var total = first.RootElement.GetProperty("totalCount").GetInt32();

        Assert.Equal(total, rows.Count);
        Assert.Equal(total, rows.Select(r => r.GetProperty("id").GetInt32()).Distinct().Count());

        var desc = sortDir == "desc";
        for (var i = 1; i < rows.Count; i++)
        {
            if (sortBy == "customerName")
            {
                var prevNull = Str(rows[i - 1], "customerName") is null;
                var curNull = Str(rows[i], "customerName") is null;
                // NULL (no customer) always sorts last, independent of direction.
                Assert.False(prevNull && !curNull, $"named row after NULL at {i}");
                if (prevNull != curNull) continue;
            }

            var cmp = Compare(sortBy, rows[i - 1], rows[i]);
            if (cmp == 0)
            {
                // Tie-break on id in the same direction keeps paging stable.
                cmp = rows[i - 1].GetProperty("id").GetInt32().CompareTo(rows[i].GetProperty("id").GetInt32());
                Assert.True(desc ? cmp > 0 : cmp < 0, $"tie-break broken at {i}");
                continue;
            }

            Assert.True(desc ? cmp > 0 : cmp < 0, $"order broken at {i} for {sortBy} {sortDir}");
        }
    }

    private static int Compare(string sortBy, JsonElement a, JsonElement b)
    {
        switch (sortBy)
        {
            case "status":
                return Array.IndexOf(StatusOrder, Str(a, "status")).CompareTo(Array.IndexOf(StatusOrder, Str(b, "status")));
            case "lastUpdated":
                return DateTime.Parse(Str(a, "lastUpdated")!).CompareTo(DateTime.Parse(Str(b, "lastUpdated")!));
            case "customerName":
                // Only called for two named or two NULL rows (mixed pairs handled by the caller).
                return string.Compare(
                    Str(a, "customerName")?.ToLowerInvariant(),
                    Str(b, "customerName")?.ToLowerInvariant(),
                    StringComparison.Ordinal);
            default:
                return string.Compare(Str(a, sortBy), Str(b, sortBy), StringComparison.Ordinal);
        }
    }

    [Theory]
    [InlineData("asc")]
    [InlineData("desc")]
    public async Task CustomerName_PutsCylindersWithoutCustomerLast(string sortDir)
    {
        var rows = await FetchAll("customerName", sortDir);
        var firstNull = rows.FindIndex(r => Str(r, "customerName") is null);

        Assert.True(firstNull > 0, "expected named rows first");
        Assert.All(rows.Skip(firstNull), r => Assert.Null(Str(r, "customerName")));
    }

    [Fact]
    public async Task SortParams_AreCaseInsensitive_AndDefaultMatchesLastUpdatedDesc()
    {
        using var a = await _client.GetJsonAsync("/api/cylinders?pageSize=20");
        using var b = await _client.GetJsonAsync("/api/cylinders?pageSize=20&sortBy=LASTUPDATED&sortDir=DESC");

        var idsA = a.RootElement.GetProperty("items").EnumerateArray().Select(e => e.GetProperty("id").GetInt32());
        var idsB = b.RootElement.GetProperty("items").EnumerateArray().Select(e => e.GetProperty("id").GetInt32());
        Assert.Equal(idsA, idsB);
    }

    [Fact]
    public async Task SortBy_WithoutSortDir_DefaultsToAscending()
    {
        using var implicitDir = await _client.GetJsonAsync("/api/cylinders?sortBy=serialNumber&pageSize=50");
        using var explicitAsc = await _client.GetJsonAsync("/api/cylinders?sortBy=serialNumber&sortDir=asc&pageSize=50");

        var implicitIds = implicitDir.RootElement.GetProperty("items").EnumerateArray()
            .Select(e => e.GetProperty("id").GetInt32());
        var ascIds = explicitAsc.RootElement.GetProperty("items").EnumerateArray()
            .Select(e => e.GetProperty("id").GetInt32());

        Assert.Equal(ascIds, implicitIds);
    }

    [Theory]
    [InlineData("sortBy=price", "sortBy")]
    [InlineData("sortBy=1", "sortBy")]
    [InlineData("sortDir=up", "sortDir")]
    public async Task InvalidSortParams_Return400_WithFieldError(string query, string field)
    {
        var (status, body) = await _client.SendJsonAsync(HttpMethod.Get, $"/api/cylinders?{query}", null);
        using (body)
        {
            Assert.Equal(HttpStatusCode.BadRequest, status);
            Assert.True(body.RootElement.GetProperty("errors").TryGetProperty(field, out _));
        }
    }

    [Fact]
    public async Task Sort_CombinesWithSearchAndStatusFilter()
    {
        using var doc = await _client.GetJsonAsync(
            "/api/cylinders?status=Delivered&search=pt&sortBy=customerName&sortDir=asc&pageSize=50");
        var names = doc.RootElement.GetProperty("items").EnumerateArray()
            .Select(e => e.GetProperty("customerName").GetString()!.ToLowerInvariant()).ToList();

        Assert.NotEmpty(names);
        Assert.Equal(names.OrderBy(n => n, StringComparer.Ordinal), names);
        Assert.All(doc.RootElement.GetProperty("items").EnumerateArray(),
            e => Assert.Equal("Delivered", e.GetProperty("status").GetString()));
    }
}
