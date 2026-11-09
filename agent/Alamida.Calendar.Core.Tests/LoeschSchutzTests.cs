using Alamida.Calendar.Core.GoogleCalendar;
using Xunit;

namespace Alamida.Calendar.Core.Tests;

public class LoeschSchutzTests
{
    private static readonly DateTime Jetzt = new(2026, 11, 9, 10, 0, 0);
    private static LoeschSchutz.Fehlend F(string k, DateTime? s = null) => new(k, s ?? Jetzt.AddDays(2));

    [Fact]
    public void AndererReiter_FeldNichtSichtbar_NieLoeschen()
    {
        var l = new LoeschSchutz();
        Assert.Empty(l.Pruefen("1", [F("1|trauerfeier")], new HashSet<string>(), Jetzt));
        Assert.Empty(l.Pruefen("1", [F("1|trauerfeier")], new HashSet<string>(), Jetzt.AddMinutes(5)));
        Assert.Empty(l.Pruefen("1", [F("1|trauerfeier")], null, Jetzt.AddMinutes(10), sofort: true));
    }

    [Fact]
    public void FeldSichtbarUndLeer_ErstNachWartezeit()
    {
        var l = new LoeschSchutz();
        var sichtbar = new HashSet<string> { "trauerfeier" };
        Assert.Empty(l.Pruefen("1", [F("1|trauerfeier")], sichtbar, Jetzt));
        Assert.Empty(l.Pruefen("1", [F("1|trauerfeier")], sichtbar, Jetzt.AddSeconds(5)));
        Assert.Equal(["1|trauerfeier"], l.Pruefen("1", [F("1|trauerfeier")], sichtbar, Jetzt.AddSeconds(21)));
    }

    [Fact]
    public void WiederDa_SetztWartezeitZurueck()
    {
        var l = new LoeschSchutz();
        var sichtbar = new HashSet<string> { "aufnahme" };
        l.Pruefen("1", [F("1|aufnahme")], sichtbar, Jetzt);
        l.Pruefen("1", [], sichtbar, Jetzt.AddSeconds(10));
        Assert.Empty(l.Pruefen("1", [F("1|aufnahme")], sichtbar, Jetzt.AddSeconds(25)));
    }

    [Fact]
    public void VergangeneTermine_BleibenStehen()
    {
        var l = new LoeschSchutz();
        var sichtbar = new HashSet<string> { "schritt1" };
        Assert.Empty(l.Pruefen("1", [F("1|schritt1", Jetzt.AddDays(-1))], sichtbar, Jetzt, sofort: true));
    }

    [Fact]
    public void ArtenAusFeldern_UeberfuehrungBrauchtTextUndDatum()
    {
        var a = LoeschSchutz.ArtenAusFeldern(["trauerfeierdatum", "ueberfuehrungText", "abholungAm", "ueberfuehrung2Text"]);
        Assert.Contains("trauerfeier", a);
        Assert.Contains("schritt1", a);
        Assert.DoesNotContain("schritt2", a);
    }
}
