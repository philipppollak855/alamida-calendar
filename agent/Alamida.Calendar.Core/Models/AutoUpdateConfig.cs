namespace Alamida.Calendar.Core.Models;

public sealed class AutoUpdateConfig
{
    public bool Enabled { get; set; } = true;

    public bool CheckOnStartup { get; set; } = true;

    /// <summary>source = neuesten Stand von GitHub bauen (Standard), git = Entwickler-Repo.</summary>
    public string Mode { get; set; } = "source";

    public string GitHubOwner { get; set; } = "philipppollak855";

    public string GitHubRepo { get; set; } = "alamida-calendar";

    public string AssetFileName { get; set; } = "AlamidaCalendarAgent-win-x64.zip";

    /// <summary>Nur Mode=git: leer = .git automatisch suchen.</summary>
    public string RepoRoot { get; set; } = "";

    public string Branch { get; set; } = "master";
}
