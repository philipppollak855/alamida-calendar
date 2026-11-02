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
    private readonly SemaphoreSlim _syncLock = new(1, 1);
    private readonly string _statePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AlamidaCalendar", "sync-state.json");
    private readonly SyncState _state;
    private SynchronizationContext? _ui;
    private string? _kandidatHash;
    private DateTime _pauseBis = DateTime.MinValue;
    private bool _isRunning = true;

    public CalendarTrayApplicationContext(Core.Models.AgentConfig config, FieldMappingProfile profile)
    {
        _config = config;
        _profile = profile;
        
        // Initialize Google Calendar Service
        var credentialsPath = Environment.ExpandEnvironmentVariables(config.ServiceAccountPath);
        _calendarService = new GoogleCalendarService(credentialsPath);
        _state = SyncState.Load(_statePath);
        
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
        _ui = SynchronizationContext.Current;
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

    private async Task SyncSnapshotAsync(DetailSnapshot snapshot, bool sofort = false)
    {
        var fallId = CalendarEventConverter.FallSchluessel(snapshot);
        if (fallId == null) return;

        var termine = CalendarEventConverter.ConvertToCalendarEvents(snapshot, _config.Kategorien)
            .Select(e => (Event: e, CalendarId: _config.CalendarIdFuer(e.Category), ColorId: _config.KategorieFuer(e.Category).ColorId))
            .ToList();
        var hash = BerechneHash(termine);

        if (!sofort)
        {
            // Erst uebertragen, wenn die Maske zweimal hintereinander gleich gelesen wurde (Eingabe abgeschlossen).
            if (hash != _kandidatHash) { _kandidatHash = hash; return; }
            if (DateTime.Now < _pauseBis) return;
        }

        await _syncLock.WaitAsync();
        try
        {
            _state.Faelle.TryGetValue(fallId, out var alt);
            if (!sofort && alt?.Hash == hash) return;

            var aktuellerKalender = _config.CalendarId;
            try
            {
                foreach (var (ev, calendarId, colorId) in termine)
                {
                    aktuellerKalender = calendarId;
                    if (alt != null && alt.Termine.TryGetValue(ev.Id, out var alterKalender) && alterKalender != calendarId)
                        await _calendarService.DeleteAsync(alterKalender, ev.Id);
                    await _calendarService.UpsertAsync(calendarId, ev, colorId);
                }

                if (alt != null)
                {
                    var neu = termine.Select(t => t.Event.Id).ToHashSet();
                    foreach (var (schluessel, alterKalender) in alt.Termine.Where(t => !neu.Contains(t.Key)))
                    {
                        aktuellerKalender = alterKalender;
                        await _calendarService.DeleteAsync(alterKalender, schluessel);
                    }
                }
            }
            catch (Exception ex)
            {
                _pauseBis = DateTime.Now.AddMinutes(1);
                var meldung = _calendarService.BeschreibeFehler(ex, aktuellerKalender);
                Console.WriteLine($"Fehler beim Synchronisieren: {meldung}");
                UpdateStatusLine($"Status: Fehler - {meldung}");
                return;
            }

            _state.Faelle[fallId] = new SyncState.FallEintrag
            {
                Hash = hash,
                Termine = termine.ToDictionary(t => t.Event.Id, t => t.CalendarId),
                Aktualisiert = DateTime.Now,
            };
            try { _state.Save(_statePath); }
            catch (Exception ex) { Console.WriteLine($"Sync-Status nicht gespeichert: {ex.Message}"); }

            _pauseBis = DateTime.MinValue;
            UpdateStatusLine($"Status: {DateTime.Now:HH:mm:ss} - {fallId}: {termine.Count} Termine synchronisiert");
        }
        finally
        {
            _syncLock.Release();
        }
    }

    private static string BerechneHash(IEnumerable<(CalendarEvent Event, string CalendarId, string ColorId)> termine) =>
        string.Join("\n", termine.Select(t =>
            $"{t.Event.Id}|{t.CalendarId}|{t.ColorId}|{t.Event.Title}|{t.Event.Start:O}|{t.Event.End:O}|{t.Event.IsAllDay}|{t.Event.Location}|{t.Event.Description}"));

    private void UpdateStatusLine(string text)
    {
        void Apply()
        {
            _statusZeile.Text = text.Length > 200 ? text[..200] + "..." : text;
            AktualisiereTrayText();
        }
        if (_ui != null) _ui.Post(_ => Apply(), null);
        else Apply();
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
        var text = $"Alamida Kalender - {_state.AnzahlTermine} Termine synchronisiert";
        _tray.Text = text.Length > 63 ? text[..63] : text;
    }

    private void ZeigeStatusDialog()
    {
        var msg = $"Alamida Kalender Agent\n\n" +
                  $"Synchronisierte Termine: {_state.AnzahlTermine}\n" +
                  $"Workspace ID: {_config.WorkstationId}\n" +
                  $"Poll-Intervall: {_config.PollIntervalMs}ms\n" +
                  $"Standard-Kalender: {_config.CalendarId}\n" +
                  string.Join("\n", _config.Kategorien
                      .Where(k => k.Value.Aktiv && !string.IsNullOrWhiteSpace(k.Value.CalendarId))
                      .Select(k => $"{k.Value.Name}: {k.Value.CalendarId}")) +
                  $"\n\nStatus: {_statusZeile.Text}";
        
        MessageBox.Show(msg, "Status", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private async Task SyncJetztAsync()
    {
        ShowBalloon("Synchronisiere jetzt...", ToolTipIcon.Info);
        var snapshot = _watcher.TryCaptureSnapshot();
        if (snapshot != null)
        {
            await SyncSnapshotAsync(snapshot, sofort: true);
            ShowBalloon(_statusZeile.Text, ToolTipIcon.Info);
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
