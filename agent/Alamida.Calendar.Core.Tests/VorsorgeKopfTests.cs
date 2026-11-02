using Alamida.Calendar.Core.Models;
using Xunit;

namespace Alamida.Calendar.Core.Tests;

public class VorsorgeKopfTests
{
    [Theory]
    [InlineData("Cockpit Sterbefälle Vorsorgen Tätigkeiten Administratorbereich Hilfe Spenden / 26424 | Monika Ziegler (71 ), ohne Bekenntnis", "26424", "Monika Ziegler")]
    [InlineData("26426 | Oberger (2025)", "26426", "Oberger")]
    [InlineData("26426 I Oberger", "26426", "Oberger")]
    public void LiestNummerUndName(string text, string nummer, string name)
    {
        var k = VorsorgeKopf.Parse(text);
        Assert.NotNull(k);
        Assert.Equal(nummer, k!.Value.Nummer);
        Assert.Equal(name, k.Value.Name);
    }

    [Theory]
    [InlineData("Cockpit Sterbefälle Vorsorgen")]
    [InlineData("")]
    [InlineData(null)]
    public void OhneKopf_Null(string? text) => Assert.Null(VorsorgeKopf.Parse(text));
}
