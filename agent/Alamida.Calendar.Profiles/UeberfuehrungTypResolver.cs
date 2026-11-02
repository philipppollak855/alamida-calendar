namespace Alamida.Calendar.Profiles;

/// <summary>
/// Alamida: Schritte Abholung, Überführung, Kremation (aus Überführungsorten).
/// Zeile 1 = Abholung; Kremation wenn von/nach Krematorium (Feba, Innermanzing, …).
/// </summary>
public static class UeberfuehrungTypResolver
{
    /// <param name="zeile">FileMaker-Zeile 1..n (1 = UI „Abholung“).</param>
    public static string Classify(int zeile, string? vonOrt, string? nachOrt)
    {
        if (zeile == 1)
            return "abholung";

        if (OrtSchluesselwoerter.IstKrematorium(vonOrt) || OrtSchluesselwoerter.IstKrematorium(nachOrt))
            return "kremation";

        return "ueberfuehrung";
    }

    public static string AnzeigeLabel(string typ) => typ switch
    {
        "abholung" => "Abholung",
        "kremation" => "Kremation",
        "ueberfuehrung" => "Überführung",
        _ => typ,
    };

    /// <summary>„von“ der Abholungszeile — Abholort (oft Krankenhaus: UK, KH, …).</summary>
    public static string? AbholortAusErsterZeile(string? vonErsteZeile)
    {
        if (string.IsNullOrWhiteSpace(vonErsteZeile)) return null;
        var trimmed = vonErsteZeile.Trim();
        var (von, _, _) = AlamidaFieldParser.ParseUeberfuehrungText(trimmed);
        return string.IsNullOrWhiteSpace(von) ? trimmed : von.Trim();
    }

    public static bool IstKrankenhausAbholort(string? ort) =>
        OrtSchluesselwoerter.IstKrankenhaus(ort);
}
