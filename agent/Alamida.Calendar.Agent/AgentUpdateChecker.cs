using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using Alamida.Calendar.Core.Models;

namespace Alamida.Calendar.Agent;

/// <summary>
/// Auto-Update: Standard per GitHub-Release-ZIP (ohne Git), optional Git für Entwickler.
/// </summary>
public sealed class AgentUpdateChecker
{
    private static readonly HttpClient Http = new()
    {
        DefaultRequestHeaders =
        {
            { "User-Agent", "AlamidaCalendar-Agent" },
            { "Accept", "application/vnd.github+json" },
        },
    };

    private readonly AutoUpdateConfig _config;
    private readonly string _installDir;

    public AgentUpdateChecker(AutoUpdateConfig config, string baseDirectory)
    {
        _config = config;
        _installDir = baseDirectory;
    }

    public string? LocalVersion { get; private set; }

    public string? RemoteVersion { get; private set; }

    public string? ResolvedRepoRoot { get; private set; }

    public bool TryApplyUpdateIfAvailable(out string? message)
    {
        message = null;
        if (!_config.Enabled || !_config.CheckOnStartup)
            return false;

        if (IsGitMode())
            return TryApplyGitUpdate(out message);

        return TryApplySourceUpdate(out message);
    }

    /// <summary>Prüft im laufenden Betrieb (ohne CheckOnStartup) und startet ggf. das Update.</summary>
    public bool TryApplyUpdateNow(out string? message)
    {
        message = null;
        if (!_config.Enabled || IsGitMode()) return false;
        return TryApplySourceUpdate(out message);
    }

    // ---- Quellcode-Update: neuester Agent-Stand von GitHub wird mit install.ps1 -Silent gebaut ----

    private const string SourceCommitFile = "source-commit.txt";
    private static readonly string[] AgentPfade = ["agent", "docs/field-mapping-9.2.1.json", "scripts/install.ps1"];
    private static readonly string WorkDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AlamidaCalendar");

    private bool TryApplySourceUpdate(out string? message)
    {
        message = null;
        try
        {
            if (!IsSourceUpdateAvailable(out var remoteDatum)) return false;
            var marker = Path.Combine(WorkDir, "update-versuch.txt");
            var versuch = $"{remoteDatum:O}";
            if (File.Exists(marker))
            {
                var alt = File.ReadAllText(marker).Trim();
                if (alt == versuch && DateTime.Now - File.GetLastWriteTime(marker) < TimeSpan.FromHours(12)) return false;
            }
            Directory.CreateDirectory(WorkDir);
            File.WriteAllText(marker, versuch);

            var script = Path.Combine(WorkDir, "update-install.ps1");
            var url = $"https://raw.githubusercontent.com/{_config.GitHubOwner}/{_config.GitHubRepo}/{_config.Branch}/scripts/install.ps1";
            var text = Http.GetStringAsync(url).GetAwaiter().GetResult();
            File.WriteAllText(script, text, new System.Text.UTF8Encoding(true));
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{script}\" -Silent",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = WorkDir,
            });
            message = $"Agent-Update wird installiert ({LocalVersion} → {RemoteVersion}). Der Agent startet danach automatisch neu.";
            return true;
        }
        catch (Exception ex)
        {
            message = $"Auto-Update übersprungen: {ex.Message}";
            return false;
        }
    }

    private bool IsSourceUpdateAvailable(out DateTimeOffset remoteDatum)
    {
        remoteDatum = DateTimeOffset.MinValue;
        var lokal = ReadSourceCommit();
        LocalVersion = lokal?.Sha is { Length: > 7 } s ? s[..7] : ReadLocalVersion();
        string? remoteSha = null;
        foreach (var pfad in AgentPfade)
        {
            var url = $"https://api.github.com/repos/{_config.GitHubOwner}/{_config.GitHubRepo}/commits?sha={Uri.EscapeDataString(_config.Branch)}&path={Uri.EscapeDataString(pfad)}&per_page=1";
            using var res = Http.GetAsync(url).GetAwaiter().GetResult();
            if (!res.IsSuccessStatusCode) return false;
            using var doc = JsonDocument.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0) continue;
            var c = doc.RootElement[0];
            var datum = c.GetProperty("commit").GetProperty("committer").GetProperty("date").GetDateTimeOffset();
            if (datum > remoteDatum)
            {
                remoteDatum = datum;
                remoteSha = c.GetProperty("sha").GetString();
            }
        }
        if (remoteSha == null) return false;
        RemoteVersion = remoteSha[..Math.Min(7, remoteSha.Length)];
        // Ohne source-commit.txt (alte Installation) ist jeder GitHub-Stand neuer.
        return lokal == null || remoteDatum > lokal.Value.Datum;
    }

    private (string Sha, DateTimeOffset Datum)? ReadSourceCommit()
    {
        try
        {
            var pfad = Path.Combine(_installDir, SourceCommitFile);
            if (!File.Exists(pfad)) return null;
            var zeilen = File.ReadAllLines(pfad);
            if (zeilen.Length < 2 || !DateTimeOffset.TryParse(zeilen[1].Trim(), System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AssumeUniversal, out var d)) return null;
            return (zeilen[0].Trim(), d);
        }
        catch
        {
            return null;
        }
    }

    public string? InstallierterStand()
    {
        var s = ReadSourceCommit();
        return s == null ? null : $"{s.Value.Sha[..Math.Min(7, s.Value.Sha.Length)]} vom {s.Value.Datum.ToLocalTime():dd.MM.yyyy HH:mm}";
    }

    public bool IsUpdateAvailable()
    {
        if (IsGitMode())
            return IsGitUpdateAvailable();

        return IsReleaseUpdateAvailable();
    }

    public bool StartUpdateScript(bool apply)
    {
        if (IsGitMode())
            return StartGitUpdateScript(apply);

        return StartReleaseUpdateScript(apply);
    }

    public string? ResolveRepoRoot()
    {
        if (!string.IsNullOrWhiteSpace(_config.RepoRoot))
        {
            var configured = Path.GetFullPath(_config.RepoRoot);
            return Directory.Exists(Path.Combine(configured, ".git")) ? configured : null;
        }

        var dir = _installDir;
        for (var i = 0; i < 10; i++)
        {
            if (Directory.Exists(Path.Combine(dir, ".git")))
                return dir;
            var parent = Directory.GetParent(dir);
            if (parent == null)
                break;
            dir = parent.FullName;
        }

        return null;
    }

    private bool IsGitMode() =>
        string.Equals(_config.Mode, "git", StringComparison.OrdinalIgnoreCase);

    private bool TryApplyReleaseUpdate(out string? message)
    {
        message = null;
        try
        {
            if (!IsReleaseUpdateAvailable())
                return false;

            if (!StartReleaseUpdateScript(apply: true))
            {
                message = "Update-Skript konnte nicht gestartet werden.";
                return false;
            }

            message = $"Update wird installiert ({LocalVersion} → {RemoteVersion})…";
            return true;
        }
        catch (Exception ex)
        {
            message = $"Auto-Update übersprungen: {ex.Message}";
            return false;
        }
    }

    private bool IsReleaseUpdateAvailable()
    {
        LocalVersion = ReadLocalVersion();
        RemoteVersion = FetchLatestReleaseVersion();
        if (string.IsNullOrEmpty(RemoteVersion))
            return false;

        return IsRemoteNewer(RemoteVersion, LocalVersion);
    }

    private bool StartReleaseUpdateScript(bool apply)
    {
        var scriptInInstall = Path.Combine(_installDir, "apply-agent-release.ps1");
        var scriptInRepo = FindRepoScript("apply-agent-release.ps1");
        var script = File.Exists(scriptInInstall) ? scriptInInstall : scriptInRepo;
        if (script == null)
            return false;

        var args =
            $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" " +
            $"-InstallDir \"{_installDir}\" " +
            $"-GitHubOwner \"{_config.GitHubOwner}\" " +
            $"-GitHubRepo \"{_config.GitHubRepo}\" " +
            $"-AssetFileName \"{_config.AssetFileName}\"";
        if (apply)
            args += " -Apply";

        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = args,
            UseShellExecute = true,
            WorkingDirectory = _installDir,
        });
        return true;
    }

    private string? FetchLatestReleaseVersion()
    {
        var url =
            $"https://api.github.com/repos/{_config.GitHubOwner}/{_config.GitHubRepo}/releases/latest";
        using var response = Http.GetAsync(url).GetAwaiter().GetResult();
        if (!response.IsSuccessStatusCode)
            return null;

        using var doc = JsonDocument.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
        if (!doc.RootElement.TryGetProperty("tag_name", out var tag))
            return null;

        return ParseReleaseTag(tag.GetString());
    }

    private static string? ParseReleaseTag(string? tagName)
    {
        if (string.IsNullOrWhiteSpace(tagName))
            return null;
        if (tagName.StartsWith("agent-v", StringComparison.OrdinalIgnoreCase))
            return tagName["agent-v".Length..];
        if (tagName.StartsWith('v') && tagName.Length > 1)
            return tagName[1..];
        return tagName;
    }

    private string ReadLocalVersion()
    {
        var versionFile = Path.Combine(_installDir, "version.txt");
        if (File.Exists(versionFile))
        {
            var fromFile = File.ReadAllText(versionFile).Trim();
            if (!string.IsNullOrEmpty(fromFile))
                return fromFile;
        }

        var informational = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            var plus = informational.IndexOf('+');
            return plus >= 0 ? informational[..plus] : informational;
        }

        return Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
    }

    private static bool IsRemoteNewer(string remote, string local)
    {
        var r = ParseVersionParts(remote);
        var l = ParseVersionParts(local);
        if (r.Length == 0 || l.Length == 0)
            return !string.Equals(remote, local, StringComparison.OrdinalIgnoreCase);

        var len = Math.Max(r.Length, l.Length);
        for (var i = 0; i < len; i++)
        {
            var ri = i < r.Length ? r[i] : 0;
            var li = i < l.Length ? l[i] : 0;
            if (ri != li)
                return ri > li;
        }

        return false;
    }

    private static int[] ParseVersionParts(string version)
    {
        if (string.IsNullOrWhiteSpace(version))
            return [];

        var s = version.Trim();
        if (s.StartsWith("agent-v", StringComparison.OrdinalIgnoreCase))
            s = s["agent-v".Length..];
        if (s.StartsWith('v') && s.Length > 1)
            s = s[1..];

        var head = s.Split('+', '-')[0];
        var parts = new List<int>();
        foreach (var segment in head.Split('.'))
        {
            if (string.IsNullOrWhiteSpace(segment))
                continue;
            if (!int.TryParse(segment, out var n))
                return [];
            parts.Add(n);
        }

        return parts.ToArray();
    }

    private bool TryApplyGitUpdate(out string? message)
    {
        message = null;
        ResolvedRepoRoot = ResolveRepoRoot();
        if (ResolvedRepoRoot == null)
            return false;

        if (!IsGitAvailable())
        {
            message = "Git nicht gefunden — Auto-Update übersprungen.";
            return false;
        }

        try
        {
            RunGit(ResolvedRepoRoot, "fetch", "origin", _config.Branch, "--quiet");
            LocalVersion = RunGit(ResolvedRepoRoot, "rev-parse", "HEAD");
            RemoteVersion = RunGit(ResolvedRepoRoot, "rev-parse", $"origin/{_config.Branch}");

            if (LocalVersion == RemoteVersion)
                return false;

            if (!StartGitUpdateScript(apply: true))
            {
                message = "Update-Skript konnte nicht gestartet werden.";
                return false;
            }

            message = $"Update wird installiert ({ShortHash(LocalVersion)} → {ShortHash(RemoteVersion)})…";
            return true;
        }
        catch (Exception ex)
        {
            message = $"Auto-Update übersprungen: {ex.Message}";
            return false;
        }
    }

    private bool IsGitUpdateAvailable()
    {
        ResolvedRepoRoot = ResolveRepoRoot();
        if (ResolvedRepoRoot == null || !IsGitAvailable())
            return false;

        try
        {
            RunGit(ResolvedRepoRoot, "fetch", "origin", _config.Branch, "--quiet");
            LocalVersion = RunGit(ResolvedRepoRoot, "rev-parse", "HEAD");
            RemoteVersion = RunGit(ResolvedRepoRoot, "rev-parse", $"origin/{_config.Branch}");
            return LocalVersion != RemoteVersion;
        }
        catch
        {
            return false;
        }
    }

    private bool StartGitUpdateScript(bool apply)
    {
        var repo = ResolveRepoRoot() ?? ResolvedRepoRoot;
        var script = repo == null ? null : Path.Combine(repo, "scripts", "update-agent.ps1");
        if (script == null || !File.Exists(script))
            return false;

        var args =
            $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -RepoRoot \"{repo}\" -Branch \"{_config.Branch}\"";
        if (apply)
            args += " -Apply";

        Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = args,
            UseShellExecute = true,
            WorkingDirectory = repo,
        });
        return true;
    }

    private string? FindRepoScript(string fileName)
    {
        var dir = _installDir;
        for (var i = 0; i < 10; i++)
        {
            var candidate = Path.Combine(dir, "scripts", fileName);
            if (File.Exists(candidate))
                return candidate;
            var parent = Directory.GetParent(dir);
            if (parent == null)
                break;
            dir = parent.FullName;
        }

        return null;
    }

    private static bool IsGitAvailable()
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = "git",
                Arguments = "--version",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true,
            });
            p?.WaitForExit(5000);
            return p is { ExitCode: 0 };
        }
        catch
        {
            return false;
        }
    }

    private static string RunGit(string repoRoot, params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "git",
            WorkingDirectory = repoRoot,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var a in args)
            psi.ArgumentList.Add(a);

        using var p = Process.Start(psi) ?? throw new InvalidOperationException("git konnte nicht gestartet werden.");
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        p.WaitForExit(120_000);
        if (p.ExitCode != 0)
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr) ? stdout : stderr.Trim());
        return stdout.Trim();
    }

    private static string ShortHash(string? hash) =>
        string.IsNullOrEmpty(hash) ? "?" : hash.Length <= 7 ? hash : hash[..7];
}
