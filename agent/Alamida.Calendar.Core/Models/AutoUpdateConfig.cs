namespace Alamida.Calendar.Core.Models;

public sealed class AutoUpdateConfig
{
    public bool Enabled { get; set; } = true;

    public bool CheckOnStartup { get; set; } = true;

    /// <summary>release = GitHub-ZIP (Standard für Arbeitsplätze), git = Entwickler-Repo.</summary>
    public string Mode { get; set; } = "release";

    public string GitHubOwner { get; set; } = "philipppollak855";

    public string GitHubRepo { get; set; } = "Alamida-Monitoring";

    public string AssetFileName { get; set; } = "AlamidaMonitoringAgent-win-x64.zip";

    /// <summary>Nur Mode=git: leer = .git automatisch suchen.</summary>
    public string RepoRoot { get; set; } = "";

    public string Branch { get; set; } = "main";
}
