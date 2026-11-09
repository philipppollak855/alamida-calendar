namespace Alamida.Calendar.Core.GoogleCalendar;

/// <summary>
/// Entscheidet, wann ein Termin, der im Snapshot fehlt, wirklich im Kalender gelöscht wird.
/// Gelöscht wird nur, wenn das Datumsfeld des Termins in der Maske sichtbar und leer ist
/// (nicht bei anderem Reiter / anderer Maske), der Termin nicht in der Vergangenheit liegt
/// und er über die Wartezeit hinweg durchgehend fehlt (z. B. nicht beim Umtippen eines Datums).
/// </summary>
public sealed class LoeschSchutz
{
    public static readonly TimeSpan Wartezeit = TimeSpan.FromSeconds(20);

    private readonly Dictionary<string, DateTime> _fehltSeit = new(StringComparer.Ordinal);

    public sealed record Fehlend(string Schluessel, DateTime? Start);

    public static string Art(string schluessel)
    {
        var i = schluessel.IndexOf('|');
        return i < 0 ? schluessel : schluessel[(i + 1)..];
    }

    public List<string> Pruefen(string fallId, IReadOnlyCollection<Fehlend> fehlend,
        IReadOnlySet<string>? vorhandeneArten, DateTime jetzt, bool sofort = false)
    {
        var praefix = fallId + "|";
        var aktuell = fehlend.Select(f => f.Schluessel).ToHashSet(StringComparer.Ordinal);
        foreach (var k in _fehltSeit.Keys.Where(k => k.StartsWith(praefix, StringComparison.Ordinal) && !aktuell.Contains(k)).ToList())
            _fehltSeit.Remove(k);

        var loeschen = new List<string>();
        foreach (var f in fehlend)
        {
            var sichtbar = vorhandeneArten != null && vorhandeneArten.Contains(Art(f.Schluessel));
            var vergangen = f.Start is { } s && s.Date < jetzt.Date;
            if (!sichtbar || vergangen)
            {
                _fehltSeit.Remove(f.Schluessel);
                continue;
            }
            if (!_fehltSeit.TryGetValue(f.Schluessel, out var seit))
            {
                _fehltSeit[f.Schluessel] = seit = jetzt;
            }
            if (sofort || jetzt - seit >= Wartezeit) loeschen.Add(f.Schluessel);
        }
        foreach (var k in loeschen) _fehltSeit.Remove(k);
        return loeschen;
    }

    /// <summary>Termin-Arten (Teil nach „|“ im Schlüssel), deren Datumsfelder in der Maske vorhanden sind.</summary>
    public static HashSet<string> ArtenAusFeldern(IEnumerable<string> feldSchluessel)
    {
        var felder = feldSchluessel.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var arten = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (feld, art) in new[]
                 {
                     ("trauerfeierdatum", "trauerfeier"), ("trauerfeier2datum", "trauerfeier2"),
                     ("rosenkranzdatum", "rosenkranz"), ("aufnahmedatum", "aufnahme"), ("beisetzungsdatum", "beisetzung"),
                 })
        {
            if (felder.Contains(feld)) arten.Add(art);
        }
        if (felder.Contains("ueberfuehrungText") && felder.Contains("abholungAm")) arten.Add("schritt1");
        for (var n = 2; n <= 20; n++)
        {
            if (felder.Contains($"ueberfuehrung{n}Text") && felder.Contains($"abholung{n}Am")) arten.Add($"schritt{n}");
        }
        return arten;
    }
}
