using System.Globalization;
using System.Text.RegularExpressions;

namespace Alamida.Calendar.Profiles;

public static class AlamidaFieldParser
{
    private static readonly Regex SterbefallHeaderRegex =
        new(@"^(\d+)\s*\|\s*(.+?)(?:\s*\(|$)", RegexOptions.Compiled);

    public static (string? Id, string? Name) ParseSterbefallHeader(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, null);
        var m = SterbefallHeaderRegex.Match(text.Trim());
        if (!m.Success) return (null, text.Trim());
        return (m.Groups[1].Value.Trim(), m.Groups[2].Value.Trim());
    }

    private static readonly Regex UeberfuehrungNachUeber = new(
        @"\s+(?:nach|über|ueber)\s+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex UkKhPrefixRegex = new(
        @"^(uk|kh)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>
    /// z.B. "UK Neunkirchen / Kühlr. Grafenbach", "UK - Neunkirchen / Kühl. Grafenbach".
    /// Slash zuerst — „ - “ in „UK - Neunkirchen“ ist kein Routen-Trenner.
    /// </summary>
    public static (string? Von, string? Nach, string? Kuehlraum) ParseUeberfuehrungText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return (null, null, null);

        var trimmed = text.Trim();

        var slashIdx = trimmed.IndexOf(" / ", StringComparison.Ordinal);
        if (slashIdx >= 0)
        {
            var von = trimmed[..slashIdx].Trim();
            var nach = trimmed[(slashIdx + 3)..].Trim();
            return (von, nach, ExtractKuehlraum(nach));
        }

        var nachMatch = UeberfuehrungNachUeber.Match(trimmed);
        if (nachMatch.Success)
        {
            var von = trimmed[..nachMatch.Index].Trim();
            var nach = trimmed[(nachMatch.Index + nachMatch.Length)..].Trim();
            return (von, nach, ExtractKuehlraum(nach));
        }

        // „A - B“ nur ohne UK-/KH-Präfix (nicht „UK - Neunkirchen“)
        if (!UkKhPrefixRegex.IsMatch(trimmed))
        {
            var dashIdx = trimmed.IndexOf(" - ", StringComparison.Ordinal);
            if (dashIdx > 0)
            {
                var von = trimmed[..dashIdx].Trim();
                var nach = trimmed[(dashIdx + 3)..].Trim();
                return (von, nach, ExtractKuehlraum(nach));
            }
        }

        return (trimmed, null, ExtractKuehlraum(trimmed));
    }

    /// <summary>
    /// Liefert den Ort unverändert wie in Alamida, z. B. „Kühlr. Grafenbach“.
    /// </summary>
    private static string? ExtractKuehlraum(string? part)
    {
        if (string.IsNullOrWhiteSpace(part)) return null;
        if (!part.Contains("Kühlr", StringComparison.OrdinalIgnoreCase) &&
            !part.Contains("Kuehlr", StringComparison.OrdinalIgnoreCase))
            return null;

        return part.Trim();
    }

    public static bool TryParseDatum(string? text, out DateTime datum)
    {
        datum = default;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var s = text.Trim();
        if (DateTime.TryParseExact(s, "dd.MM.yyyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out datum))
            return true;

        if (DateTime.TryParse(s, CultureInfo.GetCultureInfo("de-AT"), DateTimeStyles.None, out datum))
            return true;

        return false;
    }

    /// <summary>Datum + optionale Uhrzeit (Felder oder kombiniert „dd.MM.yyyy HH:mm“).</summary>
    public static bool TryParseDatumZeit(
        string? datumText,
        string? zeitText,
        out DateTime ergebnis,
        out bool hatExpliziteUhrzeit)
    {
        ergebnis = default;
        hatExpliziteUhrzeit = false;

        if (!string.IsNullOrWhiteSpace(datumText) &&
            TryParseDatumZeitKombiniert(datumText.Trim(), out ergebnis, out hatExpliziteUhrzeit))
            return true;

        if (!TryParseDatum(datumText, out var datumOnly))
            return false;

        ergebnis = datumOnly;
        if (string.IsNullOrWhiteSpace(zeitText))
            return true;

        if (!TryParseUhrzeit(zeitText, out var h, out var m))
            return true;

        ergebnis = datumOnly.Date.AddHours(h).AddMinutes(m);
        hatExpliziteUhrzeit = true;
        return true;
    }

    private static bool TryParseDatumZeitKombiniert(string s, out DateTime ergebnis, out bool hatUhrzeit)
    {
        hatUhrzeit = false;
        ergebnis = default;

        var formats = new[]
        {
            "dd.MM.yyyy HH:mm",
            "dd.MM.yyyy H:mm",
            "dd.MM.yyyy HH:mm:ss",
        };
        foreach (var fmt in formats)
        {
            if (DateTime.TryParseExact(s, fmt, CultureInfo.InvariantCulture, DateTimeStyles.None, out ergebnis))
            {
                hatUhrzeit = ergebnis.TimeOfDay != TimeSpan.Zero;
                return true;
            }
        }

        if (TryParseDatum(s, out ergebnis))
            return true;

        return false;
    }

    private static bool TryParseUhrzeit(string? text, out int stunden, out int minuten)
    {
        stunden = 0;
        minuten = 0;
        if (string.IsNullOrWhiteSpace(text)) return false;

        var s = text.Trim();
        var m = Regex.Match(s, @"^(\d{1,2})[:\.](\d{2})");
        if (!m.Success) return false;

        stunden = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        minuten = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        return stunden is >= 0 and < 24 && minuten is >= 0 and < 60;
    }
}
