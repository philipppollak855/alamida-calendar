using System.Globalization;
using System.Text.RegularExpressions;

namespace Alamida.Calendar.Profiles;

public static class AlamidaFieldNormalizer
{
    /// <summary>Zeilenumbrüche und Mehrfach-Leerzeichen (z. B. SD_Sterbeort_komplett).</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>Kalender-/Datumsfelder einheitlich als dd.MM.yyyy (für Web-Parsing).</summary>
    public static string? NormalizeDatum(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (AlamidaFieldParser.TryParseDatum(value, out var d))
            return d.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

        var m = Regex.Match(value.Trim(), @"(\d{1,2})\.(\d{1,2})\.(\d{4})");
        if (m.Success
            && int.TryParse(m.Groups[1].Value, out var tag)
            && int.TryParse(m.Groups[2].Value, out var monat)
            && int.TryParse(m.Groups[3].Value, out var jahr)
            && monat is >= 1 and <= 12
            && tag is >= 1 and <= 31)
        {
            return new DateTime(jahr, monat, tag).ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);
        }

        return Normalize(value);
    }

    /// <summary>Uhrzeit einheitlich als HH:mm.</summary>
    public static string? NormalizeZeit(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var m = Regex.Match(value.Trim(), @"(\d{1,2})[:\.](\d{2})");
        if (!m.Success) return null;
        var h = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        var min = m.Groups[2].Value;
        if (h is < 0 or > 23) return null;
        return $"{h:D2}:{min}";
    }
}
