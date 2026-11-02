namespace Alamida.Calendar.Profiles;

public sealed record HistorieErgebnis(bool InHistory, DateTime? SichtbarBis, string Grund);

/// <summary>
/// Fall verschwindet aus Disposition/Wall nach Beisetzung bzw. Trauerfeier — jeweils + 2 Stunden bei gesetzter Uhrzeit.
/// Nur Beisetzungsdatum ohne Uhrzeit: sichtbar bis Tagesende.
/// </summary>
public static class SterbefallHistorieResolver
{
    public static HistorieErgebnis Resolve(
        string? beisetzungsDatum,
        string? beisetzungsZeit,
        string? trauerfeierDatum,
        string? trauerfeierZeit,
        string? imAnschlussRaw,
        DateTime jetzt)
    {
        if (IstImAnschluss(imAnschlussRaw) &&
            HatGueltigesDatum(trauerfeierDatum) &&
            AlamidaFieldParser.TryParseDatumZeit(trauerfeierDatum, trauerfeierZeit, out var trauerfeier, out _))
        {
            var sichtbarBis = trauerfeier.AddHours(2);
            return jetzt >= sichtbarBis
                ? new HistorieErgebnis(true, sichtbarBis, "trauerfeier_im_anschluss")
                : new HistorieErgebnis(false, sichtbarBis, "");
        }

        if (HatGueltigesDatum(beisetzungsDatum) &&
            AlamidaFieldParser.TryParseDatumZeit(beisetzungsDatum, beisetzungsZeit, out var beisetzung, out var hatUhrzeit))
        {
            var sichtbarBis = hatUhrzeit
                ? beisetzung.AddHours(2)
                : beisetzung.Date.AddDays(1).AddSeconds(-1);
            return jetzt >= sichtbarBis
                ? new HistorieErgebnis(true, sichtbarBis, "beisetzung")
                : new HistorieErgebnis(false, sichtbarBis, "");
        }

        return new HistorieErgebnis(false, null, "");
    }

    public static bool IstImAnschluss(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var t = raw.Trim().ToLowerInvariant();
        return t is "1" or "ja" or "yes" or "true" or "x" ||
               t.Contains("im anschluss", StringComparison.Ordinal) ||
               t.Contains("im anschluß", StringComparison.Ordinal);
    }

    /// <summary>Nur echtes Kalenderdatum (dd.MM.yyyy) — kein versehentliches Archivieren.</summary>
    public static bool HatGueltigesDatum(string? raw) =>
        !string.IsNullOrWhiteSpace(raw) &&
        System.Text.RegularExpressions.Regex.IsMatch(
            raw.Trim(),
            @"\d{1,2}\.\d{1,2}\.\d{4}");
}
