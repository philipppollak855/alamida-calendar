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
    private string? _offeneLoeschungen;
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
        if (!sofort && DateTime.Now < _pauseBis) return;

        var termine = CalendarEventConverter.ConvertToCalendarEvents(snapshot, _config.Kategorien)
            .Select(e => new GeplanterTermin(e, _config.CalendarIdFuer(e.Category), _config.KategorieFuer(e.Category).ColorId))
            .ToList();

        await _syncLock.WaitAsync();
        try
        {
            _state.Faelle.TryGetValue(fallId, out var alt);
            var alteTermine = alt?.Termine ?? new Dictionary<string, SyncState.TerminEintrag>();

            var geaendert = termine
                .Where(t => sofort
                    || !alteTermine.TryGetValue(t.Event.Id, out var a)
                    || a.CalendarId != t.CalendarId
                    || a.Hash != t.Hash)
                .ToList();

            var neueIds = termine.Select(t => t.Event.Id).ToHashSet();
            var entfernt = alteTermine.Where(a => !neueIds.Contains(a.Key)).ToList();

            // Loeschen erst, wenn der Termin bei zwei Abfragen hintereinander fehlt (kein Loeschen bei kurzem Lesefehler).
            var loeschSchluessel = fallId + "|" + string.Join(",", entfernt.Select(e => e.Key).OrderBy(k => k));
            var loeschenBestaetigt = sofort || entfernt.Count == 0 || _offeneLoeschungen == loeschSchluessel;
            _offeneLoeschungen = entfernt.Count == 0 ? null : loeschSchluessel;
            if (!loeschenBestaetigt) entfernt.Clear();

            if (geaendert.Count == 0 && entfernt.Count == 0) return;

            var aktuellerKalender = _config.CalendarId;
            try
            {
                var aufgaben = geaendert.Select(async t =>
                {
                    aktuellerKalender = t.CalendarId;
                    var vorhanden = alteTermine.TryGetValue(t.Event.Id, out var a);
                    if (vorhanden && a!.CalendarId != t.CalendarId)
                    {
                        await _calendarService.DeleteAsync(a.CalendarId, t.Event.Id);
                        vorhanden = false;
                    }
                    await _calendarService.UpsertAsync(t.CalendarId, t.Event, t.ColorId, vorhanden);
                }).Concat(entfernt.Select(async e =>
                {
                    aktuellerKalender = e.Value.CalendarId;
                    await _calendarService.DeleteAsync(e.Value.CalendarId, e.Key);
                }));
                await Task.WhenAll(aufgaben);
            }
            catch (Exception ex)
            {
                _pauseBis = DateTime.Now.AddSeconds(15);
                var meldung = _calendarService.BeschreibeFehler(ex, aktuellerKalender);
                Console.WriteLine($"Fehler beim Synchronisieren: {meldung}");
                UpdateStatusLine($"Status: Fehler - {meldung}");
                return;
            }

            var eintrag = new SyncState.FallEintrag { Aktualisiert = DateTime.Now };
            foreach (var t in termine)
                eintrag.Termine[t.Event.Id] = new SyncState.TerminEintrag { CalendarId = t.CalendarId, Hash = t.Hash };
            foreach (var a in alteTermine.Where(a => !neueIds.Contains(a.Key) && !entfernt.Any(e => e.Key == a.Key)))
                eintrag.Termine[a.Key] = a.Value;
            _state.Faelle[fallId] = eintrag;
            try { _state.Save(_statePath); }
            catch (Exception ex) { Console.WriteLine($"Sync-Status nicht gespeichert: {ex.Message}"); }

            _pauseBis = DateTime.MinValue;
            UpdateStatusLine($"Status: {DateTime.Now:HH:mm:ss} - {fallId}: {geaendert.Count} aktualisiert, {entfernt.Count} geloescht");
        }
        finally
        {
            _syncLock.Release();
        }
    }

    private sealed record GeplanterTermin(CalendarEvent Event, string CalendarId, string ColorId)
    {
        public string Hash { get; } =
            $"{ColorId}|{Event.Title}|{Event.Start:O}|{Event.End:O}|{Event.IsAllDay}|{Event.Location}|{Event.Description}";
    }

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
                  $"Poll-Intervall: {_config.PollIntervalMs}ms, letzte Erfassung: {_watcher.LetzteErfassungMs}ms\n" +
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
            ShowBalloon(_statusZeile.Text ?? "", ToolTipIcon.Info);
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
