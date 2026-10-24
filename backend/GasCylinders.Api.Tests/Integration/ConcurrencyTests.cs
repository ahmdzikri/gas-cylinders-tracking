using System.Net;

namespace GasCylinders.Api.Tests.Integration;

public class ConcurrencyTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public ConcurrencyTests(ApiFactory factory) => _client = factory.CreateApiClient();

    [Fact]
    public async Task ParallelCreates_WithSameSerial_YieldExactlyOne201_AndFour409()
    {
        var serial = Serials.Next();

        var tasks = Enumerable.Range(0, 5).Select(async _ =>
        {
            var (status, body) = await _client.SendJsonAsync(
                HttpMethod.Post, "/api/cylinders", new { serialNumber = serial, gasType = "Oxygen" });
            return (status, body);
        });

        var results = await Task.WhenAll(tasks);

        Assert.Equal(1, results.Count(r => r.status == HttpStatusCode.Created));
        Assert.Equal(4, results.Count(r => r.status == HttpStatusCode.Conflict));

        foreach (var (status, body) in results.Where(r => r.status == HttpStatusCode.Conflict))
        {
            Assert.Equal("Konflik data", body.RootElement.GetProperty("title").GetString());
            Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("detail").GetString()));
            body.Dispose();
        }

        foreach (var (_, body) in results.Where(r => r.status == HttpStatusCode.Created))
        {
            body.Dispose();
        }
    }
}
