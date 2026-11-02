using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Profiles;

public static class AusstehendeUeberfuehrungenResolver
{
    public static IReadOnlyList<AusstehendeUeberfuehrung> Resolve(
        string? sterbeort,
        IReadOnlyList<UeberfuehrungSchritt> schritte,
        DateTime heute)
    {
        var list = new List<AusstehendeUeberfuehrung>();
        var hatAbgeschlossene = schritte.Any(s =>
            s.HasRoute && AlamidaFieldParser.TryParseDatum(s.TerminAm, out var d) && d.Date <= heute.Date);

        var ersteAbholung = schritte.FirstOrDefault(s => s.HasRoute && s.SchrittTyp == "abholung");
        if (!string.IsNullOrWhiteSpace(sterbeort) && !hatAbgeschlossene && ersteAbholung == null)
        {
            list.Add(new AusstehendeUeberfuehrung
            {
                Zeile = 0,
                SchrittTyp = "abholung",
                VonOrt = sterbeort,
                NachOrt = "—",
                Status = "abholung_noetig",
                IstAbholungVomSterbeort = true,
            });
        }

        foreach (var s in schritte.Where(x => x.HasRoute).OrderBy(x => x.Zeile))
        {
            var status = "geplant";
            if (AlamidaFieldParser.TryParseDatum(s.TerminAm, out var d))
            {
                if (d.Date < heute.Date) continue;
                status = d.Date == heute.Date ? "heute" : "geplant";
            }

            list.Add(new AusstehendeUeberfuehrung
            {
                Zeile = s.Zeile,
                SchrittTyp = s.SchrittTyp,
                VonOrt = s.VonOrt,
                NachOrt = s.NachOrt,
                TerminAm = s.TerminAm,
                Status = status,
                IstAbholungVomSterbeort = s.SchrittTyp == "abholung" &&
                    !string.IsNullOrWhiteSpace(sterbeort) &&
                    !hatAbgeschlossene,
            });
        }

        return list;
    }
}
