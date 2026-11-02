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
        var ctx = new Kontext(events, kategorien, snapshot, fallId, name);

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
            beisetzung.Description += "\nIm Anschluss an die Trauerfeier";
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
                string.IsNullOrWhiteSpace(route) ? null : route);
        }

        return events;
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
        IReadOnlyDictionary<EventCategory, KategorieSettings> Kategorien,
        DetailSnapshot Snapshot,
        string FallId,
        string Name)
    {
        public KategorieSettings Settings(EventCategory kategorie) =>
            Kategorien.TryGetValue(kategorie, out var k) ? k : KategorieSettings.Defaults()[kategorie];

        public CalendarEvent? Add(string art, EventCategory kategorie, string? label,
            string? datum, string? zeit, string? ort, string? zusatz = null)
        {
            if (!TryParseStart(datum, zeit, out var start, out var hatUhrzeit)) return null;

            var k = Settings(kategorie);
            // z.B. "⚰️ Beisetzung Anton Schellmann – Friedhof Ternitz" / "🚗 Überführung Anton Schellmann: A → B"
            var titel = $"{label ?? k.Name} {Name}";
            if (!string.IsNullOrWhiteSpace(k.Symbol)) titel = $"{k.Symbol.Trim()} {titel}";
            if (!string.IsNullOrWhiteSpace(zusatz)) titel += $": {zusatz}";
            else if (!string.IsNullOrWhiteSpace(ort)) titel += $" – {ort.Trim()}";

            var beschreibung = new List<string> { $"Sterbefall: {FallId} | {Name}" };
            if (!string.IsNullOrWhiteSpace(zusatz)) beschreibung.Add($"Route: {zusatz}");
            if (!string.IsNullOrWhiteSpace(ort)) beschreibung.Add($"Ort: {ort.Trim()}");
            if (!string.IsNullOrWhiteSpace(Snapshot.Bestattungsart)) beschreibung.Add($"Bestattungsart: {Snapshot.Bestattungsart}");
            beschreibung.Add($"Kategorie: {k.Name}");

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
                Description = string.Join("\n", beschreibung),
            };
            if (k.Aktiv) Events.Add(ev);
            return ev;
        }
    }
}
