namespace Alamida.Calendar.Core.Models;

public sealed record DetailSnapshot
{
    /// <summary>Erhöhen erzwingt einmalig volle Firestore-Synchronisation nach Agent-Update.</summary>
    public const int SyncPayloadVersion = 5;

    public string? SterbefallId { get; init; }
    public string? VerstorbenerName { get; init; }
    public string? VerstorbenerVorname { get; init; }
    public string? VerstorbenerNachname { get; init; }
    public string? Sterbeort { get; init; }
    public string? Sterbedatum { get; init; }
    public string? Abholort { get; init; }
    public bool AbholortIstKrankenhaus { get; init; }
    public string? Bestattungsart { get; init; }
    public string? Endziel { get; init; }
    public string? EndzielTyp { get; init; }
    public string? BeisetzungsDatum { get; init; }
    public string? BeisetzungsZeit { get; init; }
    public string? TrauerfeierDatum { get; init; }
    public string? TrauerfeierZeit { get; init; }
    public string? TrauerfeierOrt { get; init; }
    public string? Trauerfeier2Datum { get; init; }
    public string? Trauerfeier2Zeit { get; init; }
    public string? Trauerfeier2Ort { get; init; }
    public string? RosenkranzDatum { get; init; }
    public string? RosenkranzZeit { get; init; }
    public string? RosenkranzOrt { get; init; }
    /// <summary>Trauergespräch / Aufnahmetermin (Tab Termine).</summary>
    public string? AufnahmeDatum { get; init; }
    public string? AufnahmeZeit { get; init; }
    public string? AufnahmeOrt { get; init; }
    public bool ImAnschluss { get; init; }
    public bool InHistory { get; init; }
    public DateTime? SichtbarBis { get; init; }
    public string? HistorieGrund { get; init; }
    public string? Kuehlraum { get; init; }
    public string? Kuehlplatz { get; init; }
    public string? AktuellePosition { get; init; }
    public string? AktuellePositionTyp { get; init; }
    public int? AktuelleZeile { get; init; }
    public string? AktuellerSchrittTyp { get; init; }
    public string? VonOrt { get; init; }
    public string? NachOrt { get; init; }
    public string? TerminAm { get; init; }
    public string? NaechsterSchrittAm { get; init; }
    public string? NaechsterSchrittVon { get; init; }
    public string? NaechsterSchrittNach { get; init; }
    public string? NaechsterSchrittTyp { get; init; }
    /// <summary>detail_ueberfuehrung | neuer_sterbefall</summary>
    public string? QuelleMaske { get; init; }
    /// <summary>detail | neu_erfassung</summary>
    public string? ErfassungsPhase { get; init; }
    public bool IstNeuerFall { get; init; }
    /// <summary>Stabiler Schlüssel vor vergebener Sterbefall-ID.</summary>
    public string? ErfassungSchluessel { get; init; }
    public IReadOnlyList<UeberfuehrungSchritt> Schritte { get; init; } = [];
    public IReadOnlyList<PositionEintrag> Verlauf { get; init; } = [];
    public IReadOnlyList<AusstehendeUeberfuehrung> Ausstehend { get; init; } = [];

    public string ContentHash()
    {
        var schritte = string.Join(";",
            Schritte.OrderBy(e => e.Zeile).Select(e =>
                $"{e.Zeile}|{e.SchrittTyp}|{e.VonOrt}|{e.NachOrt}|{e.TerminAm}|{e.Kuehlraum}"));
        var verlauf = string.Join(";",
            Verlauf.Select(v => $"{v.Nummer}|{v.Typ}|{v.Ort}|{v.TerminAm}"));
        var ausstehend = string.Join(";",
            Ausstehend.Select(a =>
                $"{a.Zeile}|{a.SchrittTyp}|{a.VonOrt}|{a.NachOrt}|{a.TerminAm}|{a.Status}"));
        return string.Join("|",
            SyncPayloadVersion.ToString(),
            QuelleMaske ?? "",
            ErfassungsPhase ?? "",
            SterbefallId ?? "",
            ErfassungSchluessel ?? "",
            VerstorbenerName ?? "",
            VerstorbenerVorname ?? "",
            VerstorbenerNachname ?? "",
            Sterbeort ?? "",
            Sterbedatum ?? "",
            Abholort ?? "",
            AbholortIstKrankenhaus ? "kh" : "",
            Bestattungsart ?? "",
            Endziel ?? "",
            BeisetzungsDatum ?? "",
            BeisetzungsZeit ?? "",
            TrauerfeierDatum ?? "",
            TrauerfeierZeit ?? "",
            TrauerfeierOrt ?? "",
            Trauerfeier2Datum ?? "",
            Trauerfeier2Zeit ?? "",
            Trauerfeier2Ort ?? "",
            RosenkranzDatum ?? "",
            RosenkranzZeit ?? "",
            RosenkranzOrt ?? "",
            AufnahmeDatum ?? "",
            AufnahmeZeit ?? "",
            AufnahmeOrt ?? "",
            ImAnschluss ? "1" : "",
            InHistory ? "hist" : "",
            Kuehlraum ?? "",
            Kuehlplatz ?? "",
            AktuellePosition ?? "",
            NaechsterSchrittAm ?? "",
            schritte,
            verlauf,
            ausstehend);
    }

    public bool HasMinimumData =>
        !string.IsNullOrWhiteSpace(SterbefallId) ||
        !string.IsNullOrWhiteSpace(VerstorbenerName) ||
        (!string.IsNullOrWhiteSpace(VerstorbenerVorname) &&
         !string.IsNullOrWhiteSpace(VerstorbenerNachname));

    public bool IsDetailMaske =>
        string.Equals(QuelleMaske, "detail_ueberfuehrung", StringComparison.Ordinal);

    /// <summary>Verlässliche Detail-Erfassung mit Sterbeort oder Überführungszeilen.</summary>
    public bool IsReliableDetailCapture =>
        IsDetailMaske &&
        (Schritte.Count > 0 || !string.IsNullOrWhiteSpace(Sterbeort));
}
