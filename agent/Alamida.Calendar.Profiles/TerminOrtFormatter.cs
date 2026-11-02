namespace Alamida.Calendar.Profiles;

/// <summary>
/// Kombiniert FileMaker-Terminort (Kategorie) und Zusatz (z. B. „Aufbahrungshalle“ + „Pottschach“).
/// </summary>
public static class TerminOrtFormatter
{
    public static string? Combine(string? ort, string? zusatz)
    {
        var o = Normalize(ort);
        var z = Normalize(zusatz);
        if (string.IsNullOrEmpty(o)) return z;
        if (string.IsNullOrEmpty(z)) return o;
        if (o.Equals(z, StringComparison.OrdinalIgnoreCase)) return o;
        if (z.StartsWith(o, StringComparison.OrdinalIgnoreCase)) return z;
        if (z.Contains(o, StringComparison.OrdinalIgnoreCase)) return z;
        return $"{o} {z}";
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return value.Trim();
    }
}
