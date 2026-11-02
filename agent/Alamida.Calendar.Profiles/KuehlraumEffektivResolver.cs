using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Profiles;

/// <summary>
/// Kühlraum/Platz nur wenn die aktuelle Position im Kühlraum liegt (nicht historische Etappen).
/// Vorgebuchter Platz ohne Datum oder nach Weiterführung (z. B. Wien) zählt nicht.
/// </summary>
public static class KuehlraumEffektivResolver
{
    public static (string? Kuehlraum, string? Platz) Resolve(
        PositionEintrag? aktuellePosition,
        string? kuehlraumRawAlamida,
        string? kuehlplatzFieldAlamida)
    {
        if (aktuellePosition?.Typ == "sterbeort")
            return (null, null);

        var ausAktuell = PositionsResolver.ResolveKuehlraumAusPosition(aktuellePosition);
        if (!string.IsNullOrWhiteSpace(ausAktuell))
            return KuehlplatzResolver.Parse(ausAktuell, kuehlplatzFieldAlamida);

        return (null, null);
    }
}
