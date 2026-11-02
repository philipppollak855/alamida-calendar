namespace Alamida.Calendar.Core.Models;

/// <summary>Darstellung und Ziel-Kalender einer Termin-Kategorie (appsettings.json, Abschnitt "Kategorien").</summary>
public sealed class KategorieSettings
{
    public string Name { get; set; } = "";

    /// <summary>Eigener Google-Kalender fuer diese Kategorie; leer = Standard-CalendarId.</summary>
    public string CalendarId { get; set; } = "";

    /// <summary>Google-Terminfarbe 1-11; leer = Farbe des Kalenders.</summary>
    public string ColorId { get; set; } = "";

    public int DauerMinuten { get; set; } = 60;
    public bool Aktiv { get; set; } = true;

    public static Dictionary<EventCategory, KategorieSettings> Defaults() => new()
    {
        [EventCategory.Beisetzung] = new() { Name = "Beisetzung", ColorId = "8" },
        [EventCategory.Trauerfeier] = new() { Name = "Trauerfeier", ColorId = "3" },
        [EventCategory.Rosenkranz] = new() { Name = "Rosenkranz", ColorId = "1" },
        [EventCategory.Trauergespraech] = new() { Name = "Trauergespräch", ColorId = "5" },
        [EventCategory.Abholung] = new() { Name = "Abholung", ColorId = "11" },
        [EventCategory.Ueberfuehrung] = new() { Name = "Überführung", ColorId = "9", DauerMinuten = 120 },
        [EventCategory.Kremation] = new() { Name = "Kremation", ColorId = "6" },
    };
}
