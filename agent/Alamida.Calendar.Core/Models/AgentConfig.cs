namespace Alamida.Calendar.Core.Models;

public sealed class AgentConfig
{
    public string CalendarId { get; set; } = "primary";
    public string ServiceAccountPath { get; set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaCalendar", "service-account.json");
    public string WorkstationId { get; set; } = Environment.MachineName;
    public int PollIntervalMs { get; set; } = 1500;
    public string FieldMappingPath { get; set; } = "";
    public AutoUpdateConfig AutoUpdate { get; set; } = new();
}
