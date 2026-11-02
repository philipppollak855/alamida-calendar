namespace Alamida.Calendar.Profiles;

/// <summary>
/// FileMaker-Zeilen für Überführungsorte (Termine-Layout, Alamida 9.2.1).
/// Zeile 1 = UI „Abholung“, Zeilen 2..n = weitere Überführungen/Kremation (Typ aus Orten).
/// </summary>
public static class AlamidaEtappenFields
{
    public const int DefaultMaxEtappen = 6;

    public static IEnumerable<(string RouteKey, string DatumKey)> MappingKeys(int maxEtappen = DefaultMaxEtappen)
    {
        yield return ("ueberfuehrungText", "abholungAm");
        for (var n = 2; n <= maxEtappen; n++)
            yield return ($"ueberfuehrung{n}Text", $"abholung{n}Am");
    }

    public static string RouteAutomationId(int nummer) =>
        $"Field: sfl 2::Termin_Überführung{nummer}_Text";

    public static string DatumAutomationId(int nummer) =>
        $"Field: sfl 2::Termin_Überführung{nummer}_Datum";

    public static List<(string? RouteText, string? Datum)> CollectRohdaten(
        IReadOnlyDictionary<string, string?> fields,
        int maxEtappen = DefaultMaxEtappen)
    {
        var list = new List<(string? RouteText, string? Datum)>(maxEtappen);
        foreach (var (routeKey, datumKey) in MappingKeys(maxEtappen))
            list.Add((fields.GetValueOrDefault(routeKey), fields.GetValueOrDefault(datumKey)));
        return list;
    }
}
