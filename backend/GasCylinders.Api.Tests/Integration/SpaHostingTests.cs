using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace GasCylinders.Api.Tests.Integration;

/// <summary>
/// Hosts the API with a real web root (index.html + hashed asset), like the production image where
/// the built SPA is copied into wwwroot. Regression guard: the SPA fallback must not swallow assets.
/// </summary>
public sealed class SpaHostFactory : WebApplicationFactory<Program>
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"spa-root-{Guid.NewGuid():N}");
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"cylinders-spa-{Guid.NewGuid():N}.db");

    public SpaHostFactory()
    {
        Directory.CreateDirectory(Path.Combine(_root, "assets"));
        File.WriteAllText(Path.Combine(_root, "index.html"),
            "<!doctype html><html><body><div id=\"root\"></div><script type=\"module\" src=\"/assets/index-abc.js\"></script></body></html>");
        File.WriteAllText(Path.Combine(_root, "assets", "index-abc.js"), "console.log('spa')");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Production);
        builder.UseWebRoot(_root);
        builder.ConfigureAppConfiguration((_, config) =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = $"Data Source={_dbPath}"
            }));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        try
        {
            Directory.Delete(_root, recursive: true);
            if (File.Exists(_dbPath)) File.Delete(_dbPath);
        }
        catch (IOException)
        {
        }
    }
}

public class SpaHostingTests : IClassFixture<SpaHostFactory>
{
    private readonly HttpClient _client;

    public SpaHostingTests(SpaHostFactory factory) =>
        _client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task Asset_IsServedAsJavaScript_NotIndexHtml()
    {
        using var response = await _client.GetAsync("/assets/index-abc.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/javascript", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("console.log('spa')", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/cylinders")]
    [InlineData("/cylinders/5")]
    public async Task ClientRoutes_FallBackToIndexHtml(string path)
    {
        using var response = await _client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("id=\"root\"", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task MissingAsset_Returns404_NotIndexHtml()
    {
        using var response = await _client.GetAsync("/assets/missing-123.js");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UnknownApiRoute_StaysJson_WithSpaHosted()
    {
        using var response = await _client.GetAsync("/api/typo");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
