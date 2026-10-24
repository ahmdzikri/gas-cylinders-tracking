using GasCylinders.Api.Models;
using GasCylinders.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace GasCylinders.Api.Persistence;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Cylinder> Cylinders => Set<Cylinder>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        RefreshSearchKeys();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        RefreshSearchKeys();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>
    /// Keeps <see cref="Cylinder.SearchKey"/> in sync for every insert/update. Computing it here
    /// (rather than relying on SQLite's ASCII-only lower()) keeps unicode folding correct while
    /// search itself stays a server-side SQL predicate.
    /// </summary>
    private void RefreshSearchKeys()
    {
        foreach (var entry in ChangeTracker.Entries<Cylinder>())
        {
            if (entry.State is EntityState.Added or EntityState.Modified)
            {
                entry.Entity.SearchKey = CylinderRules.BuildSearchKey(
                    entry.Entity.SerialNumber,
                    entry.Entity.CustomerName);
            }
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var utcConverter = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

        modelBuilder.Entity<Cylinder>(entity =>
        {
            entity.ToTable("Cylinders");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Id).ValueGeneratedOnAdd();
            entity.Property(c => c.SerialNumber)
                .IsRequired()
                .HasMaxLength(10)
                .UseCollation("NOCASE");
            entity.HasIndex(c => c.SerialNumber).IsUnique();
            entity.Property(c => c.GasType).IsRequired().HasMaxLength(32);
            entity.Property(c => c.Status).IsRequired().HasConversion<string>().HasMaxLength(20);
            entity.Property(c => c.CustomerName).HasMaxLength(CylinderRulesMaxCustomerName);
            entity.Property(c => c.SearchKey).IsRequired().HasMaxLength(160);
            entity.Property(c => c.LastUpdated)
                .IsRequired()
                .HasConversion(utcConverter)
                .IsConcurrencyToken();
        });
    }

    private const int CylinderRulesMaxCustomerName = 120;
}
