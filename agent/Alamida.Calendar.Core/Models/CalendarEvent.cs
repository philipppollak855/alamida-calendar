namespace Alamida.Calendar.Core.Models;

public class CalendarEvent
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateTime Start { get; set; }
    public DateTime? End { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public EventCategory Category { get; set; }
    public string Standort { get; set; } = string.Empty;
    public string GoogleCalendarEventId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsAllDay { get; set; }
}

public enum EventCategory
{
    Begraebnis,
    Aufnahme,
    Vorsorge,
    Bereitschaft,
    Abwesenheit,
    Sonstiges
}
