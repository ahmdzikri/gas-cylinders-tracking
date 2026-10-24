using GasCylinders.Api.Models;
using GasCylinders.Api.Services;

namespace GasCylinders.Api.Tests.Unit;

public class CylinderRulesTests
{
    [Theory]
    [InlineData(" cyl-123456 ", "CYL-123456")]
    [InlineData("CYL-000001", "CYL-000001")]
    [InlineData("  CYL-999999  ", "CYL-999999")]
    public void NormalizeSerial_TrimsAndUppercases(string input, string expected)
    {
        Assert.Equal(expected, CylinderRules.NormalizeSerial(input));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("CYL-12345")]
    [InlineData("CYL-1234567")]
    [InlineData("CYL-12345A")]
    [InlineData("ABC-123456")]
    [InlineData("123456")]
    public void IsValidSerial_RejectsInvalid(string? input)
    {
        Assert.False(CylinderRules.IsValidSerial(CylinderRules.NormalizeSerial(input)));
    }

    [Theory]
    [InlineData("CYL-123456")]
    [InlineData("cyl-123456")]
    [InlineData(" CYL-000000 ")]
    public void IsValidSerial_AcceptsValid(string input)
    {
        Assert.True(CylinderRules.IsValidSerial(CylinderRules.NormalizeSerial(input)));
    }

    [Theory]
    [InlineData("oxygen", "Oxygen")]
    [InlineData("NITROGEN", "Nitrogen")]
    [InlineData(" carbon dioxide ", "Carbon Dioxide")]
    [InlineData("Acetylene", "Acetylene")]
    [InlineData("argon", "Argon")]
    [InlineData("hydrogen", "Hydrogen")]
    public void NormalizeGasType_ReturnsCanonicalSpelling(string input, string expected)
    {
        Assert.Equal(expected, CylinderRules.NormalizeGasType(input));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Helium")]
    [InlineData("CarbonMonoxide")]
    public void NormalizeGasType_RejectsUnknown(string? input)
    {
        Assert.Null(CylinderRules.NormalizeGasType(input));
    }

    [Theory]
    [InlineData("empty", CylinderStatus.Empty)]
    [InlineData("FILLED", CylinderStatus.Filled)]
    [InlineData("Delivered", CylinderStatus.Delivered)]
    [InlineData("inmaintenance", CylinderStatus.InMaintenance)]
    [InlineData(" Retired ", CylinderStatus.Retired)]
    public void TryParseStatus_IsCaseInsensitive(string input, CylinderStatus expected)
    {
        Assert.True(CylinderRules.TryParseStatus(input, out var parsed));
        Assert.Equal(expected, parsed);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Deliverd")]
    [InlineData("In Maintenance")]
    public void TryParseStatus_RejectsUnknown(string? input)
    {
        Assert.False(CylinderRules.TryParseStatus(input, out _));
    }

    [Fact]
    public void TransitionTable_MatchesSpecification()
    {
        var expected = new Dictionary<CylinderStatus, CylinderStatus[]>
        {
            [CylinderStatus.Empty] = new[] { CylinderStatus.Filled, CylinderStatus.InMaintenance, CylinderStatus.Retired },
            [CylinderStatus.Filled] = new[] { CylinderStatus.Delivered, CylinderStatus.InMaintenance, CylinderStatus.Retired },
            [CylinderStatus.Delivered] = new[] { CylinderStatus.Empty },
            [CylinderStatus.InMaintenance] = new[] { CylinderStatus.Empty, CylinderStatus.Retired },
            [CylinderStatus.Retired] = Array.Empty<CylinderStatus>()
        };

        foreach (var (from, allowed) in expected)
        {
            Assert.Equal(allowed, CylinderRules.AllowedTransitions(from));
        }
    }

    [Fact]
    public void CanTransition_AllowsExactlyTheSpecifiedPairs()
    {
        var allowed = new HashSet<(CylinderStatus, CylinderStatus)>
        {
            (CylinderStatus.Empty, CylinderStatus.Filled),
            (CylinderStatus.Empty, CylinderStatus.InMaintenance),
            (CylinderStatus.Empty, CylinderStatus.Retired),
            (CylinderStatus.Filled, CylinderStatus.Delivered),
            (CylinderStatus.Filled, CylinderStatus.InMaintenance),
            (CylinderStatus.Filled, CylinderStatus.Retired),
            (CylinderStatus.Delivered, CylinderStatus.Empty),
            (CylinderStatus.InMaintenance, CylinderStatus.Empty),
            (CylinderStatus.InMaintenance, CylinderStatus.Retired)
        };

        foreach (var from in Enum.GetValues<CylinderStatus>())
        {
            foreach (var to in Enum.GetValues<CylinderStatus>())
            {
                Assert.Equal(allowed.Contains((from, to)), CylinderRules.CanTransition(from, to));
            }
        }
    }

    [Theory]
    [InlineData(CylinderStatus.Retired, CylinderStatus.Empty)]
    [InlineData(CylinderStatus.Retired, CylinderStatus.Filled)]
    [InlineData(CylinderStatus.Retired, CylinderStatus.Retired)]
    [InlineData(CylinderStatus.Delivered, CylinderStatus.Filled)]
    [InlineData(CylinderStatus.Filled, CylinderStatus.Filled)]
    [InlineData(CylinderStatus.Delivered, CylinderStatus.Delivered)]
    public void CanTransition_RejectsRepresentativeInvalidPairs(CylinderStatus from, CylinderStatus to)
    {
        Assert.False(CylinderRules.CanTransition(from, to));
    }

    [Fact]
    public void NormalizeCustomerName_KeepsValueOnlyForDelivered()
    {
        Assert.Equal("PT Maju", CylinderRules.NormalizeCustomerName(CylinderStatus.Delivered, "  PT Maju  "));
        Assert.Null(CylinderRules.NormalizeCustomerName(CylinderStatus.Filled, "PT Maju"));
        Assert.Null(CylinderRules.NormalizeCustomerName(CylinderStatus.Empty, "PT Maju"));
        Assert.Null(CylinderRules.NormalizeCustomerName(CylinderStatus.Delivered, "   "));
        Assert.Null(CylinderRules.NormalizeCustomerName(CylinderStatus.Delivered, null));
    }

    [Fact]
    public void ValidateCustomerName_EnforcesRequiredAndMaxLength()
    {
        Assert.NotNull(CylinderRules.ValidateCustomerName(null));
        Assert.NotNull(CylinderRules.ValidateCustomerName("   "));
        Assert.Null(CylinderRules.ValidateCustomerName(new string('x', 120)));
        Assert.NotNull(CylinderRules.ValidateCustomerName(new string('x', 121)));
        Assert.Null(CylinderRules.ValidateCustomerName("  O'Brien & Sons  "));
    }

    [Fact]
    public void BuildMeta_ExposesCanonicalValuesAndTransitions()
    {
        var meta = CylinderRules.BuildMeta();

        Assert.Equal(6, meta.GasTypes.Count);
        Assert.Equal(
            new[] { "Empty", "Filled", "Delivered", "InMaintenance", "Retired" },
            meta.Statuses);
        Assert.Equal(new[] { "Empty" }, meta.Transitions["Delivered"]);
        Assert.Empty(meta.Transitions["Retired"]);
        Assert.Equal(5, meta.Transitions.Count);
    }
}
