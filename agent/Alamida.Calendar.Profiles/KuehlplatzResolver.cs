using System.Text.RegularExpressions;

namespace Alamida.Calendar.Profiles;

public static class KuehlplatzResolver
{
    private static readonly Regex PlatzRegex = new(
        @"(?:platz|pl\.?|nr\.?|nummer)\s*(\d+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static (string? KuehlraumName, string? PlatzNummer) Parse(string? kuehlraumRaw, string? kuehlplatzField)
    {
        if (!string.IsNullOrWhiteSpace(kuehlplatzField))
            return (ExtractKuehlraumName(kuehlraumRaw), kuehlplatzField.Trim());

        if (string.IsNullOrWhiteSpace(kuehlraumRaw))
            return (null, null);

        var text = kuehlraumRaw.Trim();
        var m = PlatzRegex.Match(text);
        if (m.Success)
        {
            var name = text[..m.Index].Trim().TrimEnd('-', ' ');
            return (string.IsNullOrWhiteSpace(name) ? text : name, m.Groups[1].Value);
        }

        return (text, null);
    }

    private static string? ExtractKuehlraumName(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!raw.Contains("Kühlr", StringComparison.OrdinalIgnoreCase) &&
            !raw.Contains("Kuehlr", StringComparison.OrdinalIgnoreCase))
            return raw.Trim();
        return raw.Trim();
    }
}
