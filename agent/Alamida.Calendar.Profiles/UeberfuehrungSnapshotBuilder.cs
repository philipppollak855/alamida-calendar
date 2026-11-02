using Alamida.Calendar.Core.Models;



namespace Alamida.Calendar.Profiles;



public static class UeberfuehrungSnapshotBuilder

{

    public static DetailSnapshot Build(

        string? sterbefallId,

        string? verstorbenerName,

        string? sterbeort,

        string? bestattungsart,

        string? beisetzungsort,

        string? krematoriumOrt,

        string? feuerbestattungOrt,

        string? kuehlraumRaw,

        string? kuehlplatzField,

        string? beisetzungsDatum,

        string? beisetzungsZeit,

        string? trauerfeierDatum,

        string? trauerfeierZeit,

        string? trauerfeierOrt,

        string? trauerfeier2Datum,

        string? trauerfeier2Zeit,

        string? trauerfeier2Ort,

        string? rosenkranzDatum,

        string? rosenkranzZeit,

        string? rosenkranzOrt,

        string? aufnahmeDatum,

        string? aufnahmeZeit,

        string? aufnahmeOrt,

        string? imAnschlussRaw,

        IReadOnlyList<(string? RouteText, string? Datum)> rohdaten)

    {

        var schritte = new List<UeberfuehrungSchritt>();

        for (var i = 0; i < rohdaten.Count; i++)

        {

            var (route, datum) = rohdaten[i];

            if (string.IsNullOrWhiteSpace(route))

                continue;



            var zeile = i + 1;

            var (von, nach, kr) = AlamidaFieldParser.ParseUeberfuehrungText(route);

            var typ = UeberfuehrungTypResolver.Classify(zeile, von, nach);

            schritte.Add(new UeberfuehrungSchritt

            {

                Zeile = zeile,

                SchrittTyp = typ,

                VonOrt = von,

                NachOrt = nach,

                TerminAm = string.IsNullOrWhiteSpace(datum) ? null : datum.Trim(),

                Kuehlraum = kr,

            });

        }



        // Sterbeort nur aus Abholung (Tab Termine, Zeile 1) — nicht aus „Angabe zum Sterbeort“ (Verstorbener).
        var ersteAbholung = schritte.FirstOrDefault(s => s.SchrittTyp == "abholung");
        var abholort = UeberfuehrungTypResolver.AbholortAusErsterZeile(ersteAbholung?.VonOrt);
        if (string.IsNullOrWhiteSpace(abholort) && ersteAbholung != null)
        {
            var routeText = string.Join(
                " nach ",
                new[] { ersteAbholung.VonOrt, ersteAbholung.NachOrt }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));
            abholort = UeberfuehrungTypResolver.AbholortAusErsterZeile(routeText);
        }
        if (string.IsNullOrWhiteSpace(abholort))
            abholort = InferKhAbholortAusSchritten(schritte);
        var abholortIstKh = UeberfuehrungTypResolver.IstKrankenhausAbholort(abholort);
        var effektiverSterbeort = abholort;



        var heute = DateTime.Today;

        var (art, endziel, endzielTyp) = BestattungsartResolver.Resolve(

            bestattungsart, beisetzungsort, krematoriumOrt, feuerbestattungOrt);



        var verlauf = PositionsResolver.BuildVerlauf(effektiverSterbeort, schritte);

        var (aktuell, naechste) = PositionsResolver.ResolveAktuell(effektiverSterbeort, schritte, heute);

        var (kuehlraum, platz) = KuehlraumEffektivResolver.Resolve(aktuell, kuehlraumRaw, kuehlplatzField);

        var ausstehend = AusstehendeUeberfuehrungenResolver.Resolve(effektiverSterbeort, schritte, heute);

        var historie = SterbefallHistorieResolver.Resolve(
            beisetzungsDatum,
            beisetzungsZeit,
            trauerfeierDatum,
            trauerfeierZeit,
            imAnschlussRaw,
            DateTime.Now);



        return new DetailSnapshot

        {

            SterbefallId = sterbefallId,

            VerstorbenerName = verstorbenerName,

            Sterbeort = effektiverSterbeort,

            Abholort = abholort,
            AbholortIstKrankenhaus = abholortIstKh,

            Bestattungsart = bestattungsart ?? art.ToString(),

            Endziel = endziel,

            EndzielTyp = endzielTyp,

            Kuehlraum = kuehlraum,

            Kuehlplatz = platz,

            Verlauf = verlauf,

            Ausstehend = ausstehend,

            AktuellePosition = aktuell?.Ort,

            AktuellePositionTyp = aktuell?.Typ,

            AktuelleZeile = aktuell?.Nummer,

            AktuellerSchrittTyp = aktuell?.Typ,

            VonOrt = aktuell?.VonOrt ?? aktuell?.Ort,

            NachOrt = aktuell?.NachOrt,

            TerminAm = aktuell?.TerminAm,

            Schritte = schritte,

            NaechsterSchrittAm = naechste?.TerminAm,

            NaechsterSchrittVon = naechste?.VonOrt,

            NaechsterSchrittNach = naechste?.NachOrt,

            NaechsterSchrittTyp = naechste?.SchrittTyp,

            BeisetzungsDatum = beisetzungsDatum,

            BeisetzungsZeit = beisetzungsZeit,

            TrauerfeierDatum = trauerfeierDatum,

            TrauerfeierZeit = trauerfeierZeit,

            TrauerfeierOrt = trauerfeierOrt,

            Trauerfeier2Datum = trauerfeier2Datum,

            Trauerfeier2Zeit = trauerfeier2Zeit,

            Trauerfeier2Ort = trauerfeier2Ort,

            RosenkranzDatum = rosenkranzDatum,

            RosenkranzZeit = rosenkranzZeit,

            RosenkranzOrt = rosenkranzOrt,

            AufnahmeDatum = aufnahmeDatum,

            AufnahmeZeit = aufnahmeZeit,

            AufnahmeOrt = aufnahmeOrt,

            ImAnschluss = SterbefallHistorieResolver.IstImAnschluss(imAnschlussRaw),

            InHistory = historie.InHistory,

            SichtbarBis = historie.SichtbarBis,

            HistorieGrund = historie.Grund,

        };

    }



    public static bool TryParseDatum(string? text, out DateTime datum) =>

        AlamidaFieldParser.TryParseDatum(text, out datum);

    /// <summary>
    /// Abholort aus UK/KH → eigenes KR, wenn Zeile 1 (Abholung) fehlt aber Route in späterer Zeile steht.
    /// </summary>
    private static string? InferKhAbholortAusSchritten(IReadOnlyList<UeberfuehrungSchritt> schritte)
    {
        foreach (var s in schritte.Where(x => x.HasRoute).OrderBy(x => x.Zeile))
        {
            var vonRaw = s.VonOrt?.Trim();
            if (string.IsNullOrWhiteSpace(vonRaw))
                continue;

            var (von, nachAusVon, _) = AlamidaFieldParser.ParseUeberfuehrungText(vonRaw);
            var nachZiel = s.NachOrt?.Trim() ?? nachAusVon?.Trim();
            if (string.IsNullOrWhiteSpace(nachZiel) || OrtErkennung.MatchEigenerKuehlraum(nachZiel) == null)
                continue;

            var khVon = von?.Trim() ?? vonRaw;
            if (!UeberfuehrungTypResolver.IstKrankenhausAbholort(khVon))
                continue;

            return UeberfuehrungTypResolver.AbholortAusErsterZeile(khVon);
        }

        return null;
    }

}

