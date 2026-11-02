namespace Alamida.Calendar.Core.Models;

public class CalendarEvent
{
    /// <summary>Stabiler Schluessel aus Sterbefall-Nummer und Termin-Art, z.B. "260087|beisetzung".</summary>
    public string Id { get; set; } = string.Empty;
    public string SterbefallId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateTime Start { get; set; }
    public DateTime? End { get; set; }
    public bool IsAllDay { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public EventCategory Category { get; set; }
}

public enum EventCategory
{
    Beisetzung,
    Trauerfeier,
    Rosenkranz,
    Trauergespraech,
    Abholung,
    Ueberfuehrung,
    Kremation,
}
