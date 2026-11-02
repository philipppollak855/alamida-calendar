using System.Text.RegularExpressions;
using Alamida.Calendar.Core.GoogleCalendar;
using Alamida.Calendar.Core.Models;
using Xunit;

namespace Alamida.Calendar.Core.Tests;

public class CalendarEventConverterTests
{
    private static DetailSnapshot Fall(Func<DetailSnapshot, DetailSnapshot>? mod = null)
    {
        var s = new DetailSnapshot { SterbefallId = "260087", VerstorbenerName = "Anton Schellmann" };
        return mod?.Invoke(s) ?? s;
    }

    [Fact]
    public void OhneSterbefallNummer_KeineTermine()
    {
        var s = new DetailSnapshot { VerstorbenerName = "X", BeisetzungsDatum = "28.05.2026" };
        Assert.Empty(CalendarEventConverter.ConvertToCalendarEvents(s));
    }

    [Fact]
    public void JederTerminTypHatEigeneKategorie()
    {
        var s = Fall(f => f with
        {
            BeisetzungsDatum = "28.05.2026", BeisetzungsZeit = "14:00", Endziel = "Friedhof Ternitz",
            TrauerfeierDatum = "28.05.2026", TrauerfeierZeit = "13:00", TrauerfeierOrt = "Kirche St.Valentin",
            Trauerfeier2Datum = "29.05.2026",
            RosenkranzDatum = "27.05.2026", RosenkranzZeit = "18:30",
            AufnahmeDatum = "20.05.2026 10:00",
            Schritte =
            [
                new UeberfuehrungSchritt { Zeile = 1, SchrittTyp = "abholung", VonOrt = "UK Neunkirchen", NachOrt = "Kühlr. Grafenbach", TerminAm = "15.05.2026" },
                new UeberfuehrungSchritt { Zeile = 2, SchrittTyp = "ueberfuehrung", VonOrt = "Kühlr. Grafenbach", NachOrt = "St. Johann", TerminAm = "28.05.2026 09:00" },
                new UeberfuehrungSchritt { Zeile = 3, SchrittTyp = "kremation", VonOrt = "St. Johann", NachOrt = "Feba", TerminAm = "29.05.2026" },
            ],
        });

        var events = CalendarEventConverter.ConvertToCalendarEvents(s).ToDictionary(e => e.Id);

        Assert.Equal(EventCategory.Beisetzung, events["260087|beisetzung"].Category);
        Assert.Equal(EventCategory.Trauerfeier, events["260087|trauerfeier"].Category);
        Assert.Equal(EventCategory.Trauerfeier, events["260087|trauerfeier2"].Category);
        Assert.StartsWith("Trauerfeier 2:", events["260087|trauerfeier2"].Title);
        Assert.Equal(EventCategory.Rosenkranz, events["260087|rosenkranz"].Category);
        Assert.Equal(EventCategory.Trauergespraech, events["260087|aufnahme"].Category);
        Assert.Equal(new DateTime(2026, 5, 20, 10, 0, 0), events["260087|aufnahme"].Start);
        Assert.Equal(EventCategory.Abholung, events["260087|schritt1"].Category);
        Assert.Equal("UK Neunkirchen", events["260087|schritt1"].Location);
        Assert.Equal(EventCategory.Ueberfuehrung, events["260087|schritt2"].Category);
        Assert.Equal(new DateTime(2026, 5, 28, 11, 0, 0), events["260087|schritt2"].End);
        Assert.Equal(EventCategory.Kremation, events["260087|schritt3"].Category);
        Assert.Equal("Friedhof Ternitz", events["260087|beisetzung"].Location);
        Assert.Equal(new DateTime(2026, 5, 28, 14, 0, 0), events["260087|beisetzung"].Start);
    }

    [Fact]
    public void OhneUhrzeit_Ganztaegig()
    {
        var ev = Assert.Single(CalendarEventConverter.ConvertToCalendarEvents(Fall(f => f with { RosenkranzDatum = "27.05.2026" })));
        Assert.True(ev.IsAllDay);
        Assert.Equal(new DateTime(2026, 5, 27), ev.Start);
        Assert.Equal(new DateTime(2026, 5, 28), ev.End);
    }

    [Fact]
    public void BeisetzungImAnschluss_NachTrauerfeier()
    {
        var s = Fall(f => f with
        {
            TrauerfeierDatum = "28.05.2026", TrauerfeierZeit = "13:00",
            BeisetzungsDatum = "28.05.2026", BeisetzungsZeit = "im Anschluss",
        });
        var b = CalendarEventConverter.ConvertToCalendarEvents(s).Single(e => e.Category == EventCategory.Beisetzung);
        Assert.False(b.IsAllDay);
        Assert.Equal(new DateTime(2026, 5, 28, 14, 0, 0), b.Start);
    }

    [Fact]
    public void InaktiveKategorie_WirdNichtUebertragen()
    {
        var kat = KategorieSettings.Defaults();
        kat[EventCategory.Rosenkranz].Aktiv = false;
        var s = Fall(f => f with { RosenkranzDatum = "27.05.2026", BeisetzungsDatum = "28.05.2026" });
        var ev = Assert.Single(CalendarEventConverter.ConvertToCalendarEvents(s, kat));
        Assert.Equal(EventCategory.Beisetzung, ev.Category);
    }

    [Fact]
    public void KalenderProKategorie_MitStandardAlsFallback()
    {
        var config = new AgentConfig { CalendarId = "standard@group.calendar.google.com" };
        config.Kategorien[EventCategory.Ueberfuehrung].CalendarId = "fahrten@group.calendar.google.com";
        Assert.Equal("fahrten@group.calendar.google.com", config.CalendarIdFuer(EventCategory.Ueberfuehrung));
        Assert.Equal("standard@group.calendar.google.com", config.CalendarIdFuer(EventCategory.Beisetzung));
    }

    [Fact]
    public void GoogleEventId_StabilUndGueltig()
    {
        var id = GoogleCalendarService.GoogleEventId("260087|beisetzung");
        Assert.Equal(id, GoogleCalendarService.GoogleEventId("260087|beisetzung"));
        Assert.NotEqual(id, GoogleCalendarService.GoogleEventId("260087|trauerfeier"));
        Assert.Matches(new Regex("^[a-v0-9]{5,1024}$"), id);
    }
}
