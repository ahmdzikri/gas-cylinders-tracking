using System.Net;
using System.Text.Json;

namespace GasCylinders.Api.Tests.Integration;

public class RoutingTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public RoutingTests(ApiFactory factory) => _client = factory.CreateApiClient();

    [Fact]
    public async Task UnknownApiRoute_ReturnsProblemJson404()
    {
        using var response = await _client.GetAsync("/api/typo");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(404, body.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("title").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(body.RootElement.GetProperty("detail").GetString()));
    }

    [Fact]
    public async Task NonIntegerId_Returns404_NotHtml()
    {
        using var response = await _client.GetAsync("/api/cylinders/abc");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var payload = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("<html", payload, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task UnsupportedMethod_ReturnsProblemDetails405()
    {
        using var request = new HttpRequestMessage(HttpMethod.Patch, "/api/cylinders");
        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.MethodNotAllowed, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task UnmatchedNonApiRoute_ReturnsProblemDetails404()
    {
        // No wwwroot in the test host, so this is a bare 404 handled by UseStatusCodePages.
        using var response = await _client.GetAsync("/definitely-not-a-page");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
