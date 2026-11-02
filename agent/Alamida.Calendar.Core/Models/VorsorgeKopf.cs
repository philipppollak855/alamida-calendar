using System.Text.RegularExpressions;

namespace Alamida.Calendar.Core.Models;

/// <summary>Kopfzeile der Vorsorge-Masken, z.B. „26424 | Monika Ziegler (71), ohne Bekenntnis“ (auch aus Texterkennung).</summary>
public static class VorsorgeKopf
{
    private static readonly Regex Muster = new(
        @"(?<!\d)(\d{4,6})\s*[|Il!]\s+(\S[^(,|]*?)\s*(?:\(|,|$)",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static (string Nummer, string Name)? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var m = Muster.Match(Regex.Replace(text, @"\s+", " "));
        if (!m.Success) return null;
        var name = m.Groups[2].Value.Trim();
        return name.Length == 0 ? null : (m.Groups[1].Value, name);
    }
}
