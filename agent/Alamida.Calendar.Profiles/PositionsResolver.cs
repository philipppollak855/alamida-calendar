using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Profiles;

public static class PositionsResolver
{
    public static IReadOnlyList<PositionEintrag> BuildVerlauf(
        string? sterbeort,
        IReadOnlyList<UeberfuehrungSchritt> schritte)
    {
        var list = new List<PositionEintrag>();
        if (!string.IsNullOrWhiteSpace(sterbeort))
        {
            list.Add(new PositionEintrag
            {
                Nummer = 0,
                Typ = "sterbeort",
                Ort = sterbeort.Trim(),
            });
        }

        foreach (var s in schritte.OrderBy(x => x.Zeile))
        {
            if (!s.HasRoute) continue;
            list.Add(new PositionEintrag
            {
                Nummer = s.Zeile,
                Typ = s.SchrittTyp,
                VonOrt = s.VonOrt,
                NachOrt = s.NachOrt,
                Ort = s.NachOrt ?? s.VonOrt,
                TerminAm = s.TerminAm,
                Kuehlraum = s.Kuehlraum,
            });
        }

        return list;
    }

    /// <summary>
    /// Aktuelle Position: Ziel der letzten Zeile mit Datum &lt;= heute, sonst Sterbeort.
    /// Nächster Schritt: erste Zeile mit Datum &gt; heute.
    /// </summary>
    public static (PositionEintrag? Aktuell, UeberfuehrungSchritt? NaechsterGeplant) ResolveAktuell(
        string? sterbeort,
        IReadOnlyList<UeberfuehrungSchritt> schritte,
        DateTime heute)
    {
        UeberfuehrungSchritt? letzteAbgeschlossene = null;
        UeberfuehrungSchritt? naechste = null;

        foreach (var s in schritte.OrderBy(x => x.Zeile))
        {
            if (!AlamidaFieldParser.TryParseDatum(s.TerminAm, out var d))
                continue;

            if (d.Date <= heute.Date)
                letzteAbgeschlossene = s;
            else if (naechste == null)
                naechste = s;
        }

        if (letzteAbgeschlossene != null)
        {
            var ort = letzteAbgeschlossene.NachOrt ?? letzteAbgeschlossene.VonOrt;
            return (
                new PositionEintrag
                {
                    Nummer = letzteAbgeschlossene.Zeile,
                    Typ = letzteAbgeschlossene.SchrittTyp,
                    VonOrt = letzteAbgeschlossene.VonOrt,
                    NachOrt = letzteAbgeschlossene.NachOrt,
                    Ort = ort,
                    TerminAm = letzteAbgeschlossene.TerminAm,
                    Kuehlraum = letzteAbgeschlossene.Kuehlraum,
                },
                naechste);
        }

        if (!string.IsNullOrWhiteSpace(sterbeort))
        {
            return (
                new PositionEintrag
                {
                    Nummer = 0,
                    Typ = "sterbeort",
                    Ort = sterbeort.Trim(),
                },
                naechste ?? schritte.FirstOrDefault(e => e.HasRoute));
        }

        return (null, naechste);
    }

    public static string? ResolveKuehlraumAusPosition(PositionEintrag? aktuell) =>
        aktuell?.Kuehlraum
        ?? (ContainsKuehlraum(aktuell?.Ort) ? ExtractKuehlraumName(aktuell?.Ort) : null)
        ?? (ContainsKuehlraum(aktuell?.NachOrt) ? ExtractKuehlraumName(aktuell?.NachOrt) : null);

    private static bool ContainsKuehlraum(string? ort) =>
        !string.IsNullOrWhiteSpace(ort) &&
        (ort.Contains("Kühlr", StringComparison.OrdinalIgnoreCase) ||
         ort.Contains("Kuehlr", StringComparison.OrdinalIgnoreCase));

    private static string? ExtractKuehlraumName(string? ort) =>
        string.IsNullOrWhiteSpace(ort)
            ? null
            : AlamidaFieldParser.ParseUeberfuehrungText($"x / {ort}").Kuehlraum ?? ort.Trim();
}
