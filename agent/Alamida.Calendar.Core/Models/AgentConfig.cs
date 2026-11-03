namespace Alamida.Calendar.Core.Models;

public sealed class AgentConfig
{
    public string CalendarId { get; set; } = "primary";
    /// <summary>Kalender-Web-App: liefert zentrale Kategorie-Einstellungen und nimmt Statusmeldungen an; leer = aus.</summary>
    public string WebUrl { get; set; } = "https://bestattung-stranz-kalendar.netlify.app";
    public string ServiceAccountPath { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaCalendar", "service-account.json");
    public string WorkstationId { get; set; } = Environment.MachineName;
    public int PollIntervalMs { get; set; } = 1000;
    public string FieldMappingPath { get; set; } = "";
    public AutoUpdateConfig AutoUpdate { get; set; } = new();
    public Dictionary<EventCategory, KategorieSettings> Kategorien { get; set; } = KategorieSettings.Defaults();

    public KategorieSettings KategorieFuer(EventCategory kategorie) =>
        Kategorien.TryGetValue(kategorie, out var k) ? k : KategorieSettings.Defaults()[kategorie];

    public string CalendarIdFuer(EventCategory kategorie)
    {
        var eigene = KategorieFuer(kategorie).CalendarId;
        return string.IsNullOrWhiteSpace(eigene) ? CalendarId : eigene.Trim();
    }
}
