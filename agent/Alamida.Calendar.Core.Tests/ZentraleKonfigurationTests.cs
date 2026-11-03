using Alamida.Calendar.Core.Models;
using Xunit;

namespace Alamida.Calendar.Core.Tests;

public class ZentraleKonfigurationTests
{
    private const string Json = """
        {
          "standardKalender": null,
          "ersatzKalender": "firma@group.calendar.google.com",
          "kategorien": {
            "Vorsorge": { "calendarId": "vorsorge@group.calendar.google.com", "dauerMinuten": 45, "aktiv": null },
            "Kremation": { "calendarId": null, "dauerMinuten": null, "aktiv": false },
            "Beisetzung": { "calendarId": "", "dauerMinuten": 5, "aktiv": true },
            "Unbekannt": { "dauerMinuten": 30 }
          }
        }
        """;

    [Fact]
    public void Ueberlagert_Kalender_Dauer_und_Aktiv()
    {
        var lokal = KategorieSettings.Defaults();
        lokal[EventCategory.Kremation].DauerMinuten = 90;
        var cfg = new AgentConfig { CalendarId = "primary" };

        ZentraleKonfiguration.Anwenden(Json, cfg, lokal, "primary");

        Assert.Equal("firma@group.calendar.google.com", cfg.CalendarId);
        Assert.Equal("vorsorge@group.calendar.google.com", cfg.CalendarIdFuer(EventCategory.Vorsorge));
        Assert.Equal(45, cfg.KategorieFuer(EventCategory.Vorsorge).DauerMinuten);
        Assert.True(cfg.KategorieFuer(EventCategory.Vorsorge).Aktiv);
        Assert.False(cfg.KategorieFuer(EventCategory.Kremation).Aktiv);
        Assert.Equal(90, cfg.KategorieFuer(EventCategory.Kremation).DauerMinuten);
        Assert.Equal(60, cfg.KategorieFuer(EventCategory.Beisetzung).DauerMinuten);
        Assert.Equal("firma@group.calendar.google.com", cfg.CalendarIdFuer(EventCategory.Beisetzung));
        Assert.Equal(60, lokal[EventCategory.Vorsorge].DauerMinuten);
    }

    [Fact]
    public void Lokaler_Kalender_bleibt_ohne_zentrale_Vorgabe()
    {
        var cfg = new AgentConfig();
        ZentraleKonfiguration.Anwenden(Json, cfg, KategorieSettings.Defaults(), "eigener@group.calendar.google.com");
        Assert.Equal("eigener@group.calendar.google.com", cfg.CalendarId);

        ZentraleKonfiguration.Anwenden("""{"standardKalender":"zentral@x"}""", cfg, KategorieSettings.Defaults(), "eigener@group.calendar.google.com");
        Assert.Equal("zentral@x", cfg.CalendarId);
    }
}
