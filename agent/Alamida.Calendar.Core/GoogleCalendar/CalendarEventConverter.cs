using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Core.GoogleCalendar;

public static class CalendarEventConverter
{
    public static List<CalendarEvent> ConvertToCalendarEvents(DetailSnapshot snapshot)
    {
        var events = new List<CalendarEvent>();
        var baseId = snapshot.SterbefallId ?? snapshot.VerstorbenerName ?? Guid.NewGuid().ToString();

        // Beisetzung / Begräbnis
        if (!string.IsNullOrEmpty(snapshot.BeisetzungsDatum))
        {
            if (DateTime.TryParse(snapshot.BeisetzungsDatum, out var beisetzungDatum))
            {
                var beisetzungStart = beisetzungDatum;
                if (!string.IsNullOrEmpty(snapshot.BeisetzungsZeit) && 
                    TimeSpan.TryParse(snapshot.BeisetzungsZeit, out var beisetzungZeit))
                {
                    beisetzungStart = beisetzungDatum.Date + beisetzungZeit;
                }

                events.Add(new CalendarEvent
                {
                    Id = $"{baseId}-beisetzung",
                    Title = $"Beisetzung: {snapshot.VerstorbenerName}",
                    Start = beisetzungStart,
                    End = beisetzungStart.AddHours(1),
                    Location = snapshot.Endziel ?? string.Empty,
                    Category = EventCategory.Begraebnis,
                    Standort = snapshot.Endziel ?? string.Empty,
                    Description = $"Begräbnis von {snapshot.VerstorbenerName}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Trauerfeier
        if (!string.IsNullOrEmpty(snapshot.TrauerfeierDatum))
        {
            if (DateTime.TryParse(snapshot.TrauerfeierDatum, out var trauerDatum))
            {
                var trauerStart = trauerDatum;
                if (!string.IsNullOrEmpty(snapshot.TrauerfeierZeit) && 
                    TimeSpan.TryParse(snapshot.TrauerfeierZeit, out var trauerZeit))
                {
                    trauerStart = trauerDatum.Date + trauerZeit;
                }

                events.Add(new CalendarEvent
                {
                    Id = $"{baseId}-trauerfeier",
                    Title = $"Trauerfeier: {snapshot.VerstorbenerName}",
                    Start = trauerStart,
                    End = trauerStart.AddHours(1),
                    Location = snapshot.TrauerfeierOrt ?? string.Empty,
                    Category = EventCategory.Begraebnis,
                    Standort = snapshot.TrauerfeierOrt ?? string.Empty,
                    Description = $"Trauerfeier für {snapshot.VerstorbenerName}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Trauerfeier 2
        if (!string.IsNullOrEmpty(snapshot.Trauerfeier2Datum))
        {
            if (DateTime.TryParse(snapshot.Trauerfeier2Datum, out var trauer2Datum))
            {
                var trauer2Start = trauer2Datum;
                if (!string.IsNullOrEmpty(snapshot.Trauerfeier2Zeit) && 
                    TimeSpan.TryParse(snapshot.Trauerfeier2Zeit, out var trauer2Zeit))
                {
                    trauer2Start = trauer2Datum.Date + trauer2Zeit;
                }

                events.Add(new CalendarEvent
                {
                    Id = $"{baseId}-trauerfeier2",
                    Title = $"Trauerfeier 2: {snapshot.VerstorbenerName}",
                    Start = trauer2Start,
                    End = trauer2Start.AddHours(1),
                    Location = snapshot.Trauerfeier2Ort ?? string.Empty,
                    Category = EventCategory.Begraebnis,
                    Standort = snapshot.Trauerfeier2Ort ?? string.Empty,
                    Description = $"Zweite Trauerfeier für {snapshot.VerstorbenerName}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Rosenkranz
        if (!string.IsNullOrEmpty(snapshot.RosenkranzDatum))
        {
            if (DateTime.TryParse(snapshot.RosenkranzDatum, out var rosenkranzDatum))
            {
                var rosenkranzStart = rosenkranzDatum;
                if (!string.IsNullOrEmpty(snapshot.RosenkranzZeit) && 
                    TimeSpan.TryParse(snapshot.RosenkranzZeit, out var rosenkranzZeit))
                {
                    rosenkranzStart = rosenkranzDatum.Date + rosenkranzZeit;
                }

                events.Add(new CalendarEvent
                {
                    Id = $"{baseId}-rosenkranz",
                    Title = $"Rosenkranz: {snapshot.VerstorbenerName}",
                    Start = rosenkranzStart,
                    End = rosenkranzStart.AddHours(1),
                    Location = snapshot.RosenkranzOrt ?? string.Empty,
                    Category = EventCategory.Begraebnis,
                    Standort = snapshot.RosenkranzOrt ?? string.Empty,
                    Description = $"Rosenkranz für {snapshot.VerstorbenerName}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Aufnahme / Trauergespräch
        if (!string.IsNullOrEmpty(snapshot.AufnahmeDatum))
        {
            if (DateTime.TryParse(snapshot.AufnahmeDatum, out var aufnahmeDatum))
            {
                var aufnahmeStart = aufnahmeDatum;
                if (!string.IsNullOrEmpty(snapshot.AufnahmeZeit) && 
                    TimeSpan.TryParse(snapshot.AufnahmeZeit, out var aufnahmeZeit))
                {
                    aufnahmeStart = aufnahmeDatum.Date + aufnahmeZeit;
                }

                events.Add(new CalendarEvent
                {
                    Id = $"{baseId}-aufnahme",
                    Title = $"Aufnahme: {snapshot.VerstorbenerName}",
                    Start = aufnahmeStart,
                    End = aufnahmeStart.AddHours(1),
                    Location = snapshot.AufnahmeOrt ?? string.Empty,
                    Category = EventCategory.Aufnahme,
                    Standort = snapshot.AufnahmeOrt ?? string.Empty,
                    Description = $"Trauergespräch / Aufnahme für {snapshot.VerstorbenerName}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Überführungen (als Termine)
        if (snapshot.Schritte != null)
        {
            foreach (var schritt in snapshot.Schritte)
            {
                if (!string.IsNullOrEmpty(schritt.TerminAm) && 
                    DateTime.TryParse(schritt.TerminAm, out var terminDatum))
                {
                    events.Add(new CalendarEvent
                    {
                        Id = $"{baseId}-ueberfuehrung-{schritt.Zeile}",
                        Title = $"Überführung: {snapshot.VerstorbenerName}",
                        Start = terminDatum,
                        End = terminDatum.AddHours(2),
                        Location = $"{schritt.VonOrt} → {schritt.NachOrt}",
                        Category = EventCategory.Begraebnis,
                        Standort = schritt.NachOrt ?? string.Empty,
                        Description = $"Überführung von {schritt.VonOrt} nach {schritt.NachOrt}",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }
        }

        return events;
    }
}
