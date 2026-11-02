using System.Text.Json;
using Alamida.Calendar.Core.Models;
using Microsoft.Extensions.Configuration;

namespace Alamida.Calendar.Agent;

public static class ConfigLoader
{
    public static AgentConfig Load()
    {
        var basePath = AppContext.BaseDirectory;
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        
        var config = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile(Path.Combine(appData, "AlamidaCalendar", "appsettings.json"), optional: true)
            .AddEnvironmentVariables(prefix: "ALAMIDA_")
            .Build();

        var candidates = new[]
        {
            Path.Combine(appData, "AlamidaCalendar", "field-mapping.json"),
            Path.Combine(appData, "AlamidaCalendar", "field-mapping-9.2.1.json"),
            Path.Combine(basePath, "field-mapping.json"),
            Path.Combine(basePath, "field-mapping-9.2.1.json"),
            Path.GetFullPath(Path.Combine(basePath, "..", "..", "..", "..", "..", "docs", "field-mapping-9.2.1.json")),
            Path.GetFullPath(Path.Combine(basePath, "..", "..", "..", "..", "docs", "field-mapping-9.2.1.json")),
        };
        var defaultMapping = candidates.FirstOrDefault(File.Exists)
            ?? candidates[0];

        var serviceAccountPath = config["ServiceAccountPath"];
        if (!string.IsNullOrWhiteSpace(serviceAccountPath))
        {
            serviceAccountPath = serviceAccountPath
                .Replace("%AppData%", appData, StringComparison.OrdinalIgnoreCase)
                .Replace("%APPDATA%", appData, StringComparison.OrdinalIgnoreCase);
        }
        
        if (string.IsNullOrWhiteSpace(serviceAccountPath) || !File.Exists(serviceAccountPath))
        {
            var saCandidates = new[]
            {
                Path.Combine(appData, "AlamidaCalendar", "service-account.json"),
                Path.Combine(basePath, "service-account.json"),
            };
            serviceAccountPath = saCandidates.FirstOrDefault(File.Exists) ?? saCandidates[0];
        }

        var autoUpdate = new AutoUpdateConfig();
        var autoSection = config.GetSection("AutoUpdate");
        if (autoSection.Exists())
        {
            if (bool.TryParse(autoSection["Enabled"], out var enabled))
                autoUpdate.Enabled = enabled;
            if (bool.TryParse(autoSection["CheckOnStartup"], out var onStart))
                autoUpdate.CheckOnStartup = onStart;
            if (!string.IsNullOrWhiteSpace(autoSection["RepoRoot"]))
                autoUpdate.RepoRoot = autoSection["RepoRoot"]!;
            if (!string.IsNullOrWhiteSpace(autoSection["Branch"]))
                autoUpdate.Branch = autoSection["Branch"]!;
            if (!string.IsNullOrWhiteSpace(autoSection["Mode"]))
                autoUpdate.Mode = autoSection["Mode"]!;
            if (!string.IsNullOrWhiteSpace(autoSection["GitHubOwner"]))
                autoUpdate.GitHubOwner = autoSection["GitHubOwner"]!;
            if (!string.IsNullOrWhiteSpace(autoSection["GitHubRepo"]))
                autoUpdate.GitHubRepo = autoSection["GitHubRepo"]!;
            if (!string.IsNullOrWhiteSpace(autoSection["AssetFileName"]))
                autoUpdate.AssetFileName = autoSection["AssetFileName"]!;
        }

        return new AgentConfig
        {
            CalendarId = config["CalendarId"] ?? "primary",
            ServiceAccountPath = serviceAccountPath,
            WorkstationId = string.IsNullOrWhiteSpace(config["WorkstationId"])
                ? Environment.MachineName
                : config["WorkstationId"]!,
            PollIntervalMs = int.TryParse(config["PollIntervalMs"], out var ms) ? ms : 2000,
            FieldMappingPath = string.IsNullOrWhiteSpace(config["FieldMappingPath"])
                ? defaultMapping
                : ExpandPath(config["FieldMappingPath"]!, appData),
            AutoUpdate = autoUpdate,
        };
    }

    private static string ExpandPath(string path, string appData)
    {
        return path
            .Replace("%AppData%", appData, StringComparison.OrdinalIgnoreCase)
            .Replace("%APPDATA%", appData, StringComparison.OrdinalIgnoreCase);
    }

    public static void SaveSampleConfig(string path)
    {
        var sample = new AgentConfig();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(sample, new JsonSerializerOptions { WriteIndented = true }));
    }
}
