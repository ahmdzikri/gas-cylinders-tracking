using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GasCylinders.Api.Persistence;

/// <summary>
/// Design-time factory so `dotnet ef migrations add` works without booting the app.
/// Points at a throwaway file outside the repository (the schema is all EF needs).
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var path = Path.Combine(Path.GetTempPath(), "gas-cylinders-design.db");
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={path}")
            .Options;

        return new AppDbContext(options);
    }
}
