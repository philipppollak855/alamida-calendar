using System.Diagnostics;
using Alamida.Calendar.Core.GoogleCalendar;
using Alamida.Calendar.Core.Models;
using Alamida.Calendar.Profiles;
using Alamida.Calendar.Watcher;

namespace Alamida.Calendar.Agent;

public sealed class CalendarTrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _tray;
    private readonly GoogleCalendarService _calendarService;
    private readonly AlamidaMaskWatcher _watcher;
    private readonly FieldMappingProfile _profile;
    private readonly Core.Models.AgentConfig _config;
    private readonly ToolStripMenuItem _statusZeile;
    private readonly Dictionary<string, string> _eventToGoogleIdMap = new();
    private bool _isRunning = true;

    public CalendarTrayApplicationContext(Core.Models.AgentConfig config, FieldMappingProfile profile)
    {
        _config = config;
        _profile = profile;
        
        // Initialize Google Calendar Service
        var credentialsPath = Environment.ExpandEnvironmentVariables(config.ServiceAccountPath);
        _calendarService = new GoogleCalendarService(credentialsPath, config.CalendarId ?? "primary");
        
        // Initialize Watcher
        _watcher = new AlamidaMaskWatcher(profile);
        
        _statusZeile = new ToolStripMenuItem("Status: startet…") { Enabled = false };

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Alamida Kalender",
        };
        _tray.ContextMenuStrip = BuildMenu();
        _tray.DoubleClick += (_, _) => ZeigeStatusDialog();

        StartWatching();
        AktualisiereTrayText();
        
        ShowBalloon("Alamida Kalender gestartet", ToolTipIcon.Info);
    }

    private void StartWatching()
    {
        _ = Task.Run(async () =>
        {
            while (_isRunning)
            {
                try
                {
                    var snapshot = _watcher.TryCaptureSnapshot();
                    if (snapshot != null)
                    {
                        await SyncSnapshotAsync(snapshot);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error in watcher: {ex.Message}");
                }
                
                await Task.Delay(_config.PollIntervalMs);
            }
        });
    }

    private async Task SyncSnapshotAsync(DetailSnapshot snapshot)
    {
        try
        {
            var events = CalendarEventConverter.ConvertToCalendarEvents(snapshot);
            
            foreach (var calendarEvent in events)
            {
                if (_eventToGoogleIdMap.TryGetValue(calendarEvent.Id, out var existingGoogleId))
                {
                    await _calendarService.UpdateEventAsync(existingGoogleId, calendarEvent);
                }
                else
                {
                    var googleId = await _calendarService.CreateEventAsync(calendarEvent);
                    _eventToGoogleIdMap[calendarEvent.Id] = googleId;
                }
            }
            
            UpdateStatusLine($"Status: {DateTime.Now:HH:mm:ss} - Sync ok");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error syncing to Google Calendar: {ex.Message}");
            UpdateStatusLine($"Status: Fehler - {ex.Message}");
        }
    }

    private void UpdateStatusLine(string text)
    {
        _statusZeile.Text = text;
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusZeile);
        menu.Items.Add(new ToolStripMenuItem("Status anzeigen…", null, (_, _) => ZeigeStatusDialog()));
        menu.Items.Add(new ToolStripMenuItem("Jetzt synchronisieren", null, (_, _) => _ = SyncJetztAsync()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Google Kalender öffnen", null, (_, _) =>
            OeffneUrl("https://calendar.google.com")));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Inspector (UI-Dump)", null, (_, _) => RunInspector()));
        menu.Items.Add(new ToolStripMenuItem("Konfiguration öffnen", null, (_, _) =>
        {
            var dir = Path.GetDirectoryName(_config.FieldMappingPath)
                ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AlamidaCalendar");
            Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo("explorer.exe", dir) { UseShellExecute = true });
        }));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Beenden", null, (_, _) => ExitThread()));
        menu.Opening += (_, _) => AktualisiereMenueEintraege();
        return menu;
    }

    private void AktualisiereMenueEintraege()
    {
        // Menu updates if needed
    }

    private void AktualisiereTrayText()
    {
        _tray.Text = $"Alamida Kalender - {_eventToGoogleIdMap.Count} Termine synchronisiert";
    }

    private void ZeigeStatusDialog()
    {
        var msg = $"Alamida Kalender Agent\n\n" +
                  $"Synchronisierte Termine: {_eventToGoogleIdMap.Count}\n" +
                  $"Workspace ID: {_config.WorkstationId}\n" +
                  $"Poll-Intervall: {_config.PollIntervalMs}ms\n" +
                  $"Calendar ID: {_config.CalendarId}";
        
        MessageBox.Show(msg, "Status", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private async Task SyncJetztAsync()
    {
        ShowBalloon("Synchronisiere jetzt...", ToolTipIcon.Info);
        var snapshot = _watcher.TryCaptureSnapshot();
        if (snapshot != null)
        {
            await SyncSnapshotAsync(snapshot);
            ShowBalloon("Synchronisation abgeschlossen", ToolTipIcon.Info);
        }
        else
        {
            ShowBalloon("Keine Daten gefunden", ToolTipIcon.Warning);
        }
    }

    private void RunInspector()
    {
        ShowBalloon("Inspector wird gestartet...", ToolTipIcon.Info);
        _ = Task.Run(() =>
        {
            var snapshot = _watcher.TryCaptureSnapshot(out var debugLog);
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaCalendar",
                "inspector-dump.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
            File.WriteAllText(logPath, debugLog ?? "Keine Daten");
            
            Process.Start(new ProcessStartInfo("notepad.exe", logPath) { UseShellExecute = true });
        });
    }

    private void OeffneUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Fehler beim Öffnen: {ex.Message}", "Fehler", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ShowBalloon(string text, ToolTipIcon icon)
    {
        _tray.ShowBalloonTip(3000, "Alamida Kalender", text, icon);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _isRunning = false;
            _tray.Visible = false;
            _tray.Dispose();
        }
        base.Dispose(disposing);
    }
}
