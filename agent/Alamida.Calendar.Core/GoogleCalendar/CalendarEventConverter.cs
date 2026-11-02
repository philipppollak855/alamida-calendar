using System.Globalization;
using System.Text.RegularExpressions;
using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Core.GoogleCalendar;

public static class CalendarEventConverter
{
    private static readonly string[] DatumFormate =
    [
        "dd.MM.yyyy HH:mm", "d.M.yyyy H:mm", "dd.MM.yyyy HH:mm:ss", "dd.MM.yyyy", "d.M.yyyy", "dd.MM.yy", "yyyy-MM-dd",
    ];

    /// <summary>Termine werden erst mit vergebener Sterbefall-Nummer eingetragen (sonst entstehen Duplikate).</summary>
    public static string? FallSchluessel(DetailSnapshot snapshot) =>
        string.IsNullOrWhiteSpace(snapshot.SterbefallId) ? null : snapshot.SterbefallId.Trim();

    public static List<CalendarEvent> ConvertToCalendarEvents(
        DetailSnapshot snapshot,
        IReadOnlyDictionary<EventCategory, KategorieSettings>? kategorien = null)
    {
        kategorien ??= KategorieSettings.Defaults();
        var events = new List<CalendarEvent>();
        var fallId = FallSchluessel(snapshot);
        if (fallId == null) return events;

        var name = string.IsNullOrWhiteSpace(snapshot.VerstorbenerName) ? fallId : snapshot.VerstorbenerName.Trim();
        var ctx = new Kontext(events, new List<CalendarEvent>(), kategorien, snapshot, fallId, name);

        var trauerfeier = ctx.Add("trauerfeier", EventCategory.Trauerfeier, null,
            snapshot.TrauerfeierDatum, snapshot.TrauerfeierZeit, snapshot.TrauerfeierOrt);
        ctx.Add("trauerfeier2", EventCategory.Trauerfeier, "Trauerfeier 2",
            snapshot.Trauerfeier2Datum, snapshot.Trauerfeier2Zeit, snapshot.Trauerfeier2Ort);
        ctx.Add("rosenkranz", EventCategory.Rosenkranz, null,
            snapshot.RosenkranzDatum, snapshot.RosenkranzZeit, snapshot.RosenkranzOrt);
        ctx.Add("aufnahme", EventCategory.Trauergespraech, null,
            snapshot.AufnahmeDatum, snapshot.AufnahmeZeit, snapshot.AufnahmeOrt);

        var beisetzung = ctx.Add("beisetzung", EventCategory.Beisetzung, null,
            snapshot.BeisetzungsDatum, snapshot.BeisetzungsZeit, snapshot.Endziel);
        var imAnschluss = snapshot.ImAnschluss
            || (snapshot.BeisetzungsZeit?.Contains("anschluss", StringComparison.OrdinalIgnoreCase) ?? false);
        if (beisetzung is { IsAllDay: true } && trauerfeier is { IsAllDay: false } && imAnschluss
            && beisetzung.Start.Date == trauerfeier.Start.Date)
        {
            var dauer = ctx.Settings(EventCategory.Beisetzung).DauerMinuten;
            beisetzung.IsAllDay = false;
            beisetzung.Start = trauerfeier.End ?? trauerfeier.Start.AddHours(1);
            beisetzung.End = beisetzung.Start.AddMinutes(Math.Max(15, dauer));
            beisetzung.Details["imAnschluss"] = "1";
        }

        foreach (var schritt in snapshot.Schritte.OrderBy(s => s.Zeile))
        {
            var kategorie = schritt.SchrittTyp switch
            {
                "abholung" => EventCategory.Abholung,
                "kremation" => EventCategory.Kremation,
                _ => EventCategory.Ueberfuehrung,
            };
            var route = string.Join(" → ",
                new[] { schritt.VonOrt, schritt.NachOrt }.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!.Trim()));
            ctx.Add($"schritt{schritt.Zeile}", kategorie, null, schritt.TerminAm, null,
                kategorie == EventCategory.Abholung ? schritt.VonOrt : schritt.NachOrt,
                string.IsNullOrWhiteSpace(route) ? null : route,
                schritt.VonOrt, schritt.NachOrt);
        }

        foreach (var ev in ctx.Alle) ev.Description = Beschreibung(ev, ctx);
        return events;
    }

    private static readonly CultureInfo De = CultureInfo.GetCultureInfo("de-AT");

    private static string Zeitpunkt(CalendarEvent ev, bool kurz) =>
        ev.IsAllDay
            ? ev.Start.ToString(kurz ? "ddd dd.MM." : "dddd, dd.MM.yyyy", De) + (kurz ? " ganztägig" : " · ganztägig")
            : ev.Start.ToString(kurz ? "ddd dd.MM. HH:mm" : "dddd, dd.MM.yyyy · HH:mm 'Uhr'", De);

    private static string Beschreibung(CalendarEvent ev, Kontext ctx)
    {
        var s = ctx.Snapshot;
        var zeilen = new List<string>
        {
            $"Sterbefall: {ctx.FallId} | {ctx.Name}",
            Zeitpunkt(ev, false) + (ev.Details.ContainsKey("imAnschluss") ? " · im Anschluss an die Trauerfeier" : ""),
        };
        if (ev.Details.TryGetValue("route", out var route)) zeilen.Add($"Route: {route}");
        else if (!string.IsNullOrWhiteSpace(ev.Location)) zeilen.Add($"Ort: {ev.Location}");

        zeilen.Add("");
        foreach (var (label, key) in FallFelder)
            if (ev.Details.TryGetValue(key, out var wert)) zeilen.Add($"{label}: {wert}");

        if (ctx.Alle.Count > 1)
        {
            zeilen.Add("");
            zeilen.Add("Alle Termine dieses Sterbefalls:");
            foreach (var t in ctx.Alle.OrderBy(t => t.Start))
            {
                var k = ctx.Settings(t.Category);
                var wo = t.Details.TryGetValue("route", out var r) ? r : t.Location;
                var art = t.Details.TryGetValue("art", out var a) ? a : k.Name;
                zeilen.Add($"{(t == ev ? "▶" : "•")} {Zeitpunkt(t, true)} – {art}{(string.IsNullOrWhiteSpace(wo) ? "" : $": {wo}")}");
            }
        }
        zeilen.Add("");
        zeilen.Add($"Kategorie: {ctx.Settings(ev.Category).Name}");
        return string.Join("\n", zeilen).Replace("\n\n\n", "\n\n");
    }

    private static readonly (string Label, string Key)[] FallFelder =
    [
        ("Sterbedatum", "sterbedatum"),
        ("Sterbeort", "sterbeort"),
        ("Bestattungsart", "bestattungsart"),
        ("Beisetzungsort", "endziel"),
        ("Kühlraum", "kuehlraum"),
        ("Aktueller Standort", "position"),
    ];

    private static void Setze(Dictionary<string, string> d, string key, string? wert)
    {
        if (!string.IsNullOrWhiteSpace(wert)) d[key] = wert.Trim();
    }

    public static bool TryParseStart(string? datum, string? zeit, out DateTime start, out bool hatUhrzeit)
    {
        start = default;
        hatUhrzeit = false;
        if (string.IsNullOrWhiteSpace(datum)) return false;

        var s = Regex.Replace(datum.Trim(), @"\s+", " ");
        if (!DateTime.TryParseExact(s, DatumFormate, CultureInfo.InvariantCulture, DateTimeStyles.None, out start)
            && !DateTime.TryParse(s, CultureInfo.GetCultureInfo("de-AT"), DateTimeStyles.None, out start))
        {
            return false;
        }

        // Halb eingetippte Jahreszahlen ("28.05.202") nicht als Termin uebernehmen.
        if (start.Year is < 2000 or > 2100) return false;

        hatUhrzeit = start.TimeOfDay != TimeSpan.Zero;
        if (!hatUhrzeit && !string.IsNullOrWhiteSpace(zeit))
        {
            var m = Regex.Match(zeit.Trim(), @"^(\d{1,2})[:\.](\d{2})");
            if (m.Success)
            {
                var h = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
                var min = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                if (h is >= 0 and < 24 && min is >= 0 and < 60)
                {
                    start = start.Date.AddHours(h).AddMinutes(min);
                    hatUhrzeit = true;
                }
            }
        }

        return true;
    }

    private sealed record Kontext(
        List<CalendarEvent> Events,
        List<CalendarEvent> Alle,
        IReadOnlyDictionary<EventCategory, KategorieSettings> Kategorien,
        DetailSnapshot Snapshot,
        string FallId,
        string Name)
    {
        public KategorieSettings Settings(EventCategory kategorie) =>
            Kategorien.TryGetValue(kategorie, out var k) ? k : KategorieSettings.Defaults()[kategorie];

        public CalendarEvent? Add(string art, EventCategory kategorie, string? label,
            string? datum, string? zeit, string? ort, string? zusatz = null, string? von = null, string? nach = null)
        {
            if (!TryParseStart(datum, zeit, out var start, out var hatUhrzeit)) return null;

            var k = Settings(kategorie);
            // z.B. "⚰️ Beisetzung Anton Schellmann – Friedhof Ternitz" / "🚗 Überführung Anton Schellmann: A → B"
            var titel = $"{label ?? k.Name} {Name}";
            if (!string.IsNullOrWhiteSpace(k.Symbol)) titel = $"{k.Symbol.Trim()} {titel}";
            if (!string.IsNullOrWhiteSpace(zusatz)) titel += $": {zusatz}";
            else if (!string.IsNullOrWhiteSpace(ort)) titel += $" – {ort.Trim()}";

            var ev = new CalendarEvent
            {
                Id = $"{FallId}|{art}",
                SterbefallId = FallId,
                Title = titel,
                Category = kategorie,
                Location = ort?.Trim() ?? string.Empty,
                IsAllDay = !hatUhrzeit,
                Start = hatUhrzeit ? start : start.Date,
                End = hatUhrzeit ? start.AddMinutes(Math.Max(15, k.DauerMinuten)) : start.Date.AddDays(1),
            };
            var d = ev.Details;
            Setze(d, "art", label ?? k.Name);
            Setze(d, "verstorbener", Name);
            Setze(d, "ort", ort);
            Setze(d, "route", zusatz);
            Setze(d, "von", von);
            Setze(d, "nach", nach);
            Setze(d, "sterbedatum", Snapshot.Sterbedatum);
            Setze(d, "sterbeort", Snapshot.Sterbeort);
            Setze(d, "bestattungsart", Snapshot.Bestattungsart);
            Setze(d, "endziel", Snapshot.Endziel);
            Setze(d, "kuehlraum", string.Join(" / ",
                new[] { Snapshot.Kuehlraum, Snapshot.Kuehlplatz }.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!.Trim())));
            Setze(d, "position", Snapshot.AktuellePosition);
            Alle.Add(ev);
            if (k.Aktiv) Events.Add(ev);
            return ev;
        }
    }
}
