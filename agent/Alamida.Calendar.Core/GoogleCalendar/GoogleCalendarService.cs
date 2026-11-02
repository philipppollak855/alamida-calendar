using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Google;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;
using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Core.GoogleCalendar;

public class GoogleCalendarService
{
    private const string TimeZoneId = "Europe/Vienna";
    private readonly CalendarService _calendarService;

    public string ServiceAccountEmail { get; }

    public GoogleCalendarService(string credentialsPath)
    {
        var credential = GoogleCredential.FromFile(credentialsPath)
            .CreateScoped(CalendarService.Scope.Calendar);

        _calendarService = new CalendarService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "Alamida Calendar"
        });

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(credentialsPath));
            ServiceAccountEmail = doc.RootElement.TryGetProperty("client_email", out var e) ? e.GetString() ?? "" : "";
        }
        catch (Exception)
        {
            ServiceAccountEmail = "";
        }
    }

    /// <summary>Google-Event-ID (base32hex) aus dem stabilen Termin-Schluessel.</summary>
    public static string GoogleEventId(string schluessel) =>
        "alamida" + Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(schluessel))).ToLowerInvariant();

    /// <summary>Legt den Termin an oder aktualisiert ihn (gleiche ID = gleicher Termin, keine Duplikate).</summary>
    public async Task UpsertAsync(string calendarId, CalendarEvent calendarEvent, string? colorId,
        bool vermutlichVorhanden = false, CancellationToken ct = default)
    {
        var googleEvent = ToGoogleEvent(calendarEvent, colorId);
        googleEvent.Status = "confirmed";
        if (vermutlichVorhanden)
        {
            try
            {
                await _calendarService.Events.Update(googleEvent, calendarId, googleEvent.Id).ExecuteAsync(ct);
                return;
            }
            catch (GoogleApiException ex) when (ex.HttpStatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
            {
            }
        }

        try
        {
            await _calendarService.Events.Insert(googleEvent, calendarId).ExecuteAsync(ct);
        }
        catch (GoogleApiException ex) when (ex.HttpStatusCode == HttpStatusCode.Conflict)
        {
            await _calendarService.Events.Update(googleEvent, calendarId, googleEvent.Id).ExecuteAsync(ct);
        }
    }

    public async Task DeleteAsync(string calendarId, string schluessel, CancellationToken ct = default)
    {
        try
        {
            await _calendarService.Events.Delete(calendarId, GoogleEventId(schluessel)).ExecuteAsync(ct);
        }
        catch (GoogleApiException ex) when (ex.HttpStatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
        }
    }

    public string BeschreibeFehler(Exception ex, string calendarId)
    {
        var freigabe = string.IsNullOrWhiteSpace(ServiceAccountEmail) ? "den Service Account" : ServiceAccountEmail;
        return ex switch
        {
            GoogleApiException { HttpStatusCode: HttpStatusCode.NotFound } =>
                $"Kalender nicht gefunden: {calendarId} - Kalender-ID pruefen und fuer {freigabe} freigeben",
            GoogleApiException { HttpStatusCode: HttpStatusCode.Forbidden } =>
                $"Keine Schreibrechte fuer Kalender {calendarId} - {freigabe} braucht 'Aenderungen an Terminen vornehmen'",
            _ => ex.Message,
        };
    }

    private static Event ToGoogleEvent(CalendarEvent ev, string? colorId)
    {
        var end = ev.End ?? (ev.IsAllDay ? ev.Start.Date.AddDays(1) : ev.Start.AddHours(1));
        return new Event
        {
            Id = GoogleEventId(ev.Id),
            Summary = ev.Title,
            Description = ev.Description,
            Location = string.IsNullOrWhiteSpace(ev.Location) ? null : ev.Location,
            ColorId = string.IsNullOrWhiteSpace(colorId) ? null : colorId.Trim(),
            Start = ToEventDateTime(ev.Start, ev.IsAllDay),
            End = ToEventDateTime(end, ev.IsAllDay),
            ExtendedProperties = new Event.ExtendedPropertiesData { Private__ = PrivateProperties(ev) },
        };
    }

    private static Dictionary<string, string> PrivateProperties(CalendarEvent ev)
    {
        // Google begrenzt Schluessel+Wert auf 1024 Zeichen.
        var props = ev.Details
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value.Length > 900 ? kv.Value[..900] : kv.Value);
        props["alamidaKey"] = ev.Id;
        props["sterbefallId"] = ev.SterbefallId;
        props["kategorie"] = ev.Category.ToString();
        return props;
    }

    private static EventDateTime ToEventDateTime(DateTime value, bool allDay)
    {
        if (allDay)
            return new EventDateTime { Date = value.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) };

        var offset = ViennaTimeZone().GetUtcOffset(value);
        return new EventDateTime
        {
            DateTimeDateTimeOffset = new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Unspecified), offset),
            TimeZone = TimeZoneId,
        };
    }

    private static TimeZoneInfo ViennaTimeZone()
    {
        foreach (var id in new[] { TimeZoneId, "W. Europe Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (Exception) { }
        }
        return TimeZoneInfo.Local;
    }
}
