using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Profiles;

public static class NeuerSterbefallSnapshotBuilder
{
    public static DetailSnapshot Build(IReadOnlyDictionary<string, string?> fields, int maxUeberfuehrungszeilen)
    {
        var header = fields.GetValueOrDefault("sterbefallHeader");
        var (headerId, headerName) = AlamidaFieldParser.ParseSterbefallHeader(header);

        var vorname = fields.GetValueOrDefault("verstorbenerVorname");
        var nachname = FirstNonEmpty(
            fields.GetValueOrDefault("verstorbenerNachname"),
            fields.GetValueOrDefault("verstorbenerZuname"));
        var name = FirstNonEmpty(
            fields.GetValueOrDefault("verstorbenerName"),
            headerName,
            CombineName(vorname, nachname));

        var id = FirstNonEmpty(fields.GetValueOrDefault("sterbefallId"), headerId);
        var sterbedatum = fields.GetValueOrDefault("sterbedatum");
        var sterbeort = fields.GetValueOrDefault("sterbeort");

        var rohdaten = AlamidaEtappenFields.CollectRohdaten(fields, maxUeberfuehrungszeilen);
        var snap = UeberfuehrungSnapshotBuilder.Build(
            id,
            name,
            sterbeort,
            fields.GetValueOrDefault("bestattungsart"),
            fields.GetValueOrDefault("beisetzungsort"),
            fields.GetValueOrDefault("krematoriumOrt"),
            fields.GetValueOrDefault("feuerbestattungOrt"),
            fields.GetValueOrDefault("kuehlraum"),
            fields.GetValueOrDefault("kuehlplatz"),
            fields.GetValueOrDefault("beisetzungsdatum"),
            fields.GetValueOrDefault("beisetzungszeit"),
            fields.GetValueOrDefault("trauerfeierdatum"),
            fields.GetValueOrDefault("trauerfeierzeit"),
            fields.GetValueOrDefault("trauerfeierort"),
            fields.GetValueOrDefault("trauerfeier2datum"),
            fields.GetValueOrDefault("trauerfeier2zeit"),
            fields.GetValueOrDefault("trauerfeier2ort"),
            fields.GetValueOrDefault("rosenkranzdatum"),
            fields.GetValueOrDefault("rosenkranzzeit"),
            fields.GetValueOrDefault("rosenkranzort"),
            fields.GetValueOrDefault("aufnahmedatum"),
            fields.GetValueOrDefault("aufnahmezeit"),
            fields.GetValueOrDefault("aufnahmeort"),
            fields.GetValueOrDefault("imAnschluss"),
            rohdaten);

        var erfassungSchluessel = !string.IsNullOrWhiteSpace(id)
            ? id.Trim()
            : $"NEU|{name ?? ""}|{sterbeort ?? ""}|{sterbedatum ?? ""}";

        return snap with
        {
            VerstorbenerVorname = vorname,
            VerstorbenerNachname = nachname,
            VerstorbenerName = name ?? snap.VerstorbenerName,
            Sterbedatum = sterbedatum,
            SterbefallId = string.IsNullOrWhiteSpace(id) ? null : id.Trim(),
            ErfassungSchluessel = erfassungSchluessel,
            QuelleMaske = "neuer_sterbefall",
            ErfassungsPhase = "neu_erfassung",
            IstNeuerFall = true,
            AktuellePosition = snap.AktuellePosition ?? sterbeort ?? name,
            AktuellePositionTyp = snap.AktuellePositionTyp ?? "neu_erfassung",
        };
    }

    private static string? CombineName(string? vorname, string? nachname)
    {
        var v = vorname?.Trim();
        var n = nachname?.Trim();
        if (string.IsNullOrEmpty(v) && string.IsNullOrEmpty(n)) return null;
        if (string.IsNullOrEmpty(v)) return n;
        if (string.IsNullOrEmpty(n)) return v;
        return $"{v} {n}";
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
            if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
        return null;
    }
}
