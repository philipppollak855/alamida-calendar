using System.Runtime.InteropServices;
using Alamida.Calendar.Agent;
using Alamida.Calendar.Core.Json;
using Alamida.Calendar.Profiles;
using Alamida.Calendar.Watcher;

namespace Alamida.Calendar.Agent;

internal static class Program
{
    private const int AttachParentProcess = -1;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);

    [STAThread]
    private static void Main(string[] args)
    {
        var isCli = args.Contains("--inspect") || args.Contains("--once") || args.Contains("--seed")
            || args.Contains("--sync");
        if (isCli)
        {
            // Ausgabe in die aufrufende CMD (dotnet run), nicht in ein separates Fenster
            if (!AttachConsole(AttachParentProcess))
                AllocConsole();
            Console.OutputEncoding = System.Text.Encoding.UTF8;
        }
        else
        {
            ApplicationConfiguration.Initialize();
            Application.ThreadException += (_, e) => LogTrayCrash(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
                LogTrayCrash(e.ExceptionObject as Exception ?? new Exception(e.ExceptionObject?.ToString()));
        }

        var config = ConfigLoader.Load();
        LogAgentStartup($"Start, Mapping={config.FieldMappingPath}");

        if (!File.Exists(config.FieldMappingPath))
        {
            LogAgentStartup($"FEHLER: Mapping fehlt: {config.FieldMappingPath}");
            MessageBox.Show(
                $"Field-Mapping nicht gefunden:\n{config.FieldMappingPath}\n\nBitte docs/field-mapping-9.2.1.json kopieren.",
                "Alamida Kalender",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        FieldMappingProfile profile;
        try
        {
            profile = FieldMappingProfile.Load(config.FieldMappingPath);
            if (!profile.Vorsorge.Aktiv)
            {
                // Ältere Mapping-Kopie in %AppData% ohne Vorsorge-Abschnitt: mitgelieferte Datei nutzen.
                var mitgeliefert = Path.Combine(AppContext.BaseDirectory, "field-mapping-9.2.1.json");
                try { if (File.Exists(mitgeliefert)) profile.Vorsorge = FieldMappingProfile.Load(mitgeliefert).Vorsorge; }
                catch (Exception ex) { LogAgentStartup($"Vorsorge-Mapping nicht geladen: {ex.Message}"); }
            }
        }
        catch (Exception ex)
        {
            LogTrayCrash(ex);
            MessageBox.Show(
                $"Field-Mapping ungueltig:\n{config.FieldMappingPath}\n\n{ex.Message}",
                "Alamida Kalender",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        if (args.Contains("--inspect"))
        {
            string dump;
            try
            {
                dump = UiInspector.DumpAllWindows(profile.WindowTitlePatterns);
            }
            catch (Exception ex)
            {
                dump = $"FEHLER beim UI-Scan: {ex.Message}\n{ex.StackTrace}";
            }
            var outCandidates = new[]
            {
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs", "inspector-dump.txt")),
                Path.Combine(Path.GetDirectoryName(config.FieldMappingPath)!, "inspector-dump.txt"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AlamidaCalendar", "inspector-dump.txt"),
            };
            var outPath = outCandidates.FirstOrDefault(p => Directory.Exists(Path.GetDirectoryName(p))) ?? outCandidates[^1];
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            var utf8NoBom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            File.WriteAllText(outPath, dump, utf8NoBom);

            var summary = $"""
                === Alamida UI Inspector ===
                Gespeichert: {outPath}
                Zeilen: {dump.Split('\n').Length}
                {(dump.Contains("WINDOW: Alamida") ? "Alamida-Fenster gefunden." : "WARNUNG: Alamida-Fenster nicht im Dump!")}
                Oeffnen Sie die Datei inspector-dump.txt im Editor.
                """;

            Console.WriteLine(summary);
            var utf8Bom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            var resultPath = Path.Combine(Path.GetDirectoryName(outPath)!, "inspect-last-run.txt");
            File.WriteAllText(resultPath, summary + "\n" + DateTime.Now, utf8Bom);

            return;
        }

        if (args.Contains("--once"))
        {
            var watcher = new AlamidaMaskWatcher(profile);
            var snap = watcher.TryCaptureSnapshot(out var fieldDebug);
            var utf8NoBom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            string body;
            if (snap == null)
            {
                body = """
                    Kein Snapshot.
                    - Alamida-Fenster offen? (Titel enthält "Alamida")
                    - Sterbefall-Detail, Tab "Termine" aktiv?
                    """;
            }
            else
            {
                body = System.Text.Json.JsonSerializer.Serialize(snap, MonitoringJson.Options);
                if (!snap.HasMinimumData && !string.IsNullOrWhiteSpace(fieldDebug))
                    body += "\n\n--- Rohfelder ---\n" + fieldDebug;
            }

            var docsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs"));
            if (!Directory.Exists(docsDir))
                docsDir = Path.GetDirectoryName(config.FieldMappingPath)!;

            var summary = $"""
                === Alamida Snapshot (--once) ===
                Mapping: {config.FieldMappingPath}
                {(snap == null ? "Status: FEHLER – kein Fenster" : "Status: OK")}
                {body}
                """;

            Console.WriteLine(summary);
            Console.Out.Flush();

            var utf8Bom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            var resultPath = Path.Combine(docsDir, "once-last-run.txt");
            Directory.CreateDirectory(docsDir);
            File.WriteAllText(resultPath, summary + "\n" + DateTime.Now, utf8Bom);
            Console.WriteLine($"Gespeichert: {resultPath}");
            Console.Out.Flush();
            return;
        }

        if (args.Contains("--sync") || args.Contains("--seed"))
        {
            Console.WriteLine("--sync und --seed sind für Google Calendar nicht erforderlich.");
            Console.WriteLine("Der Agent synchronisiert automatisch mit Google Calendar während des Betriebs.");
            return;
        }

        if (TryRunStartupAutoUpdate(config, out var updateMsg))
        {
            LogAgentStartup($"Beende fuer Auto-Update: {updateMsg}");
            MessageBox.Show(
                updateMsg ?? "Ein Agent-Update wird installiert. Der Agent startet danach neu.",
                "Alamida Kalender",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (!File.Exists(config.ServiceAccountPath))
        {
            LogAgentStartup($"FEHLER: Service-Account fehlt: {config.ServiceAccountPath}");
            MessageBox.Show(
                $"Google Service-Account-Datei nicht gefunden:\n{config.ServiceAccountPath}\n\n" +
                "Bitte INSTALLIEREN.bat erneut starten und die JSON-Datei auswaehlen.",
                "Alamida Kalender",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        try
        {
            LogAgentStartup("Tray starten");
            Application.Run(new CalendarTrayApplicationContext(config, profile));
        }
        catch (Exception ex)
        {
            LogTrayCrash(ex);
            MessageBox.Show(
                $"Der Agent konnte nicht starten:\n{ex.Message}\n\nDetails: %AppData%\\AlamidaCalendar\\agent-crash.log",
                "Alamida Kalender",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static void LogTrayCrash(Exception? ex)
    {
        if (ex == null) return;
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaCalendar");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "agent-crash.log"),
                $"[{DateTime.Now:O}] {ex}\n\n");
        }
        catch { /* ignore */ }
    }

    private static bool TryRunStartupAutoUpdate(Core.Models.AgentConfig config, out string? message)
    {
        var checker = new AgentUpdateChecker(config.AutoUpdate, AppContext.BaseDirectory);
        return checker.TryApplyUpdateIfAvailable(out message);
    }

    private static void LogAgentStartup(string line)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaCalendar");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "agent-startup.log"),
                $"[{DateTime.Now:O}] {line}\n");
        }
        catch { /* ignore */ }
    }
}
