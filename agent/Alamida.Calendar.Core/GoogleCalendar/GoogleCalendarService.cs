using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;
using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Core.GoogleCalendar;

public class GoogleCalendarService
{
    private readonly CalendarService _calendarService;
    private readonly string _calendarId;

    public GoogleCalendarService(string credentialsPath, string calendarId = "primary")
    {
        var credential = GoogleCredential.FromFile(credentialsPath)
            .CreateScoped(CalendarService.Scope.Calendar);

        _calendarService = new CalendarService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "Alamida Calendar"
        });

        _calendarId = calendarId;
    }

    public async Task<string> CreateEventAsync(CalendarEvent calendarEvent)
    {
        var googleEvent = new Event
        {
            Summary = calendarEvent.Title,
            Description = BuildDescription(calendarEvent),
            Location = calendarEvent.Location,
            Start = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.Start,
                TimeZone = "Europe/Berlin"
            },
            End = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.End ?? calendarEvent.Start.AddHours(1),
                TimeZone = "Europe/Berlin"
            }
        };

        var request = _calendarService.Events.Insert(googleEvent, _calendarId);
        var createdEvent = await request.ExecuteAsync();

        return createdEvent.Id;
    }

    public async Task UpdateEventAsync(string googleEventId, CalendarEvent calendarEvent)
    {
        var googleEvent = new Event
        {
            Summary = calendarEvent.Title,
            Description = BuildDescription(calendarEvent),
            Location = calendarEvent.Location,
            Start = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.Start,
                TimeZone = "Europe/Berlin"
            },
            End = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.End ?? calendarEvent.Start.AddHours(1),
                TimeZone = "Europe/Berlin"
            }
        };

        var request = _calendarService.Events.Update(googleEvent, _calendarId, googleEventId);
        await request.ExecuteAsync();
    }

    public async Task DeleteEventAsync(string googleEventId)
    {
        var request = _calendarService.Events.Delete(_calendarId, googleEventId);
        await request.ExecuteAsync();
    }

    public async Task<List<CalendarEvent>> GetEventsAsync(DateTime start, DateTime end)
    {
        var request = _calendarService.Events.List(_calendarId);
        request.TimeMinDateTimeOffset = start;
        request.TimeMaxDateTimeOffset = end;
        request.ShowDeleted = false;
        request.SingleEvents = true;
        request.OrderBy = EventsResource.ListRequest.OrderByEnum.StartTime;

        var events = await request.ExecuteAsync();
        var calendarEvents = new List<CalendarEvent>();

        foreach (var googleEvent in events.Items)
        {
            var calendarEvent = new CalendarEvent
            {
                GoogleCalendarEventId = googleEvent.Id,
                Title = googleEvent.Summary ?? string.Empty,
                Description = googleEvent.Description ?? string.Empty,
                Location = googleEvent.Location ?? string.Empty,
                Start = googleEvent.Start?.DateTimeDateTimeOffset?.DateTime ?? DateTime.MinValue,
                End = googleEvent.End?.DateTimeDateTimeOffset?.DateTime ?? DateTime.MinValue,
                IsAllDay = googleEvent.Start?.Date != null
            };

            // Parse metadata from description
            ParseDescriptionMetadata(calendarEvent);

            calendarEvents.Add(calendarEvent);
        }

        return calendarEvents;
    }

    private string BuildDescription(CalendarEvent calendarEvent)
    {
        var description = calendarEvent.Description;
        
        if (!string.IsNullOrEmpty(calendarEvent.Standort))
        {
            description += $"\nStandort: {calendarEvent.Standort}";
        }

        description += $"\nKategorie: {calendarEvent.Category}";
        description += $"\nEventId: {calendarEvent.Id}";

        return description;
    }

    private void ParseDescriptionMetadata(CalendarEvent calendarEvent)
    {
        if (string.IsNullOrEmpty(calendarEvent.Description))
            return;

        var lines = calendarEvent.Description.Split('\n');
        foreach (var line in lines)
        {
            if (line.StartsWith("Standort:"))
            {
                calendarEvent.Standort = line.Substring("Standort:".Length).Trim();
            }
            else if (line.StartsWith("Kategorie:"))
            {
                var categoryStr = line.Substring("Kategorie:".Length).Trim();
                if (Enum.TryParse<EventCategory>(categoryStr, out var category))
                {
                    calendarEvent.Category = category;
                }
            }
            else if (line.StartsWith("EventId:"))
            {
                calendarEvent.Id = line.Substring("EventId:".Length).Trim();
            }
        }
    }
}
