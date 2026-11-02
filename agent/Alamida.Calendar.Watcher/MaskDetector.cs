using Alamida.Calendar.Profiles;
using FlaUI.Core.AutomationElements;

namespace Alamida.Calendar.Watcher;

public static class MaskDetector
{
    public static readonly string[] NeuerSterbefallNameMarkers =
    [
        "Neuer Sterbefall",
        "Neuer Sterbefalls",
        "Sterbefall anlegen",
        "Neuen Sterbefall",
    ];

    public static readonly string[] NeuerSterbefallAutomationMarkers =
    [
        "Neuer_Sterbefall",
        "Sterbefall_Neu",
        "Neu_Sterbefall",
        "NeuerSterbefall",
        "Sterbefall anlegen",
    ];

    public static bool LooksLikeOpenSterbefallHeader(string? text) =>
        !string.IsNullOrWhiteSpace(AlamidaFieldParser.ParseSterbefallHeader(text).Id);

    public static bool LooksLikeSterbefallHeader(string? text) => LooksLikeOpenSterbefallHeader(text);

    public static bool WindowHasOpenSterbefallHeader(AutomationElement window)
    {
        foreach (var el in window.FindAllDescendants())
        {
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";
            var value = UiaValueReader.Read(el);
            if (LooksLikeOpenSterbefallHeader(name) || LooksLikeOpenSterbefallHeader(value))
                return true;
        }

        return false;
    }

    public static MaskKind Detect(AutomationElement window)
    {
        var scoreDetail = 0;
        var scoreNeu = 0;
        var hatUeberfuehrung1 = false;
        var hatOffenenSterbefall = false;

        foreach (var el in window.FindAllDescendants())
        {
            var aid = UiaValueReader.SafeGet(() => el.AutomationId) ?? "";
            var name = UiaValueReader.SafeGet(() => el.Name) ?? "";
            var value = UiaValueReader.Read(el);

            if (aid.Contains("Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase)
                || aid.Contains("Field: sfl 2::Termin_Überführung1_Text", StringComparison.OrdinalIgnoreCase))
            {
                scoreDetail += 1000;
                hatUeberfuehrung1 = true;
            }
            else if (aid.Contains("Termin_Trauerfeier1", StringComparison.OrdinalIgnoreCase)
                     || aid.Contains("Termin_Beisetzung", StringComparison.OrdinalIgnoreCase)
                     || aid.Contains("Termin_Rosenkranz", StringComparison.OrdinalIgnoreCase))
            {
                scoreDetail += 480;
            }
            else if (aid.Contains("Field: sfl 2::Termin_", StringComparison.OrdinalIgnoreCase)
                     || aid.Contains("Termin_Überführung", StringComparison.OrdinalIgnoreCase))
            {
                scoreDetail += 350;
            }

            if (!hatOffenenSterbefall)
            {
                if (LooksLikeOpenSterbefallHeader(name) || LooksLikeOpenSterbefallHeader(value))
                {
                    scoreDetail += 500;
                    hatOffenenSterbefall = true;
                }
            }

            foreach (var marker in NeuerSterbefallNameMarkers)
            {
                if (name.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    scoreNeu += 1500;
            }

            foreach (var marker in NeuerSterbefallAutomationMarkers)
            {
                if (aid.Contains(marker, StringComparison.OrdinalIgnoreCase))
                    scoreNeu += 900;
            }

            if (!hatOffenenSterbefall && !hatUeberfuehrung1 &&
                (aid.Contains("Verstorben_Vorname", StringComparison.OrdinalIgnoreCase) ||
                 aid.Contains("Verstorben_Nachname", StringComparison.OrdinalIgnoreCase) ||
                 aid.Contains("Verstorben_Zuname", StringComparison.OrdinalIgnoreCase)))
                scoreNeu += 120;
        }

        if (scoreNeu > scoreDetail && scoreNeu >= 400)
            return MaskKind.NeuerSterbefall;

        if (scoreDetail >= 400)
            return MaskKind.DetailUeberfuehrung;

        if (scoreNeu >= 200)
            return MaskKind.NeuerSterbefall;

        return MaskKind.Unbekannt;
    }
}
