# Alamida Kalender - Einrichtungsanleitung

## Übersicht

Dieses Projekt basiert auf Alamida-Monitoring und wurde für Google Calendar Synchronisation angepasst. Der Windows-Agent liest Termine aus Alamida (FileMaker) via UI-Automatisierung und synchronisiert sie direkt mit Google Calendar.

## Was wurde erledigt

✅ **Projektstruktur erstellt**
- Kopiert von Alamida-Monitoring
- Alle Namespaces von `Alamida.Monitoring` zu `Alamida.Calendar` geändert
- Firebase durch Google Calendar API ersetzt
- Build erfolgreich

✅ **Agent (.NET 8)**
- UI-Automatisierung (FlaUI) für Alamida übernommen
- Google Calendar Service implementiert
- CalendarEventConverter für Umwandlung von Alamida-Snapshots zu Calendar Events
- Tray-Application für Windows Tray Icon
- Konfiguration von Firebase zu Google Calendar angepasst

✅ **Kernfunktionen**
- Beisetzung / Begräbnis
- Trauerfeier (1 & 2)
- Rosenkranz
- Aufnahme / Trauergespräch
- Überführungen
- Kategorien: Begraebnis, Aufnahme, Vorsorge, Bereitschaft, Abwesenheit, Sonstiges

## Was noch zu tun ist

### 1. Google Cloud Projekt einrichten

1. Google Cloud Console öffnen: https://console.cloud.google.com
2. Neues Projekt erstellen
3. Google Calendar API aktivieren
4. Service Account erstellen:
   - IAM & Admin → Service Accounts
   - "Create Service Account"
   - Rolle: "Editor" oder "Calendar Editor"
   - Service Account Key als JSON herunterladen
5. JSON-Datei speichern: `%AppData%\AlamidaCalendar\service-account.json`
6. Kalender freigeben:
   - Google Calendar öffnen
   - Kalender-Einstellungen → Mit Personen teilen
   - Service Account E-Mail hinzufügen mit "Verwalten"-Rechten

### 2. Field-Mapping anpassen

Das bestehende Field-Mapping von Alamida-Monitoring kann verwendet werden:
- Pfad: `docs/field-mapping-9.2.1.json`
- Eventuell für Ihre spezifischen Terminmasken anpassen

### 3. Agent konfigurieren

Datei: `agent/Alamida.Calendar.Agent/appsettings.json`

```json
{
  "CalendarId": "primary",
  "ServiceAccountPath": "%AppData%\\AlamidaCalendar\\service-account.json",
  "WorkstationId": "PC-NAME",
  "PollIntervalMs": 1000,
  "FieldMappingPath": "docs/field-mapping-9.2.1.json",
  "AutoUpdate": {
    "Enabled": true,
    "CheckOnStartup": true,
    "Mode": "release",
    "GitHubOwner": "IHR_GITHUB_USER",
    "GitHubRepo": "Alamida-Kalender",
    "AssetFileName": "AlamidaCalendarAgent-win-x64.zip",
    "RepoRoot": "",
    "Branch": "main"
  }
}
```

### 4. Agent starten

```powershell
cd agent
dotnet run
```

Der Agent erscheint als Tray-Icon und überwacht Alamida auf neue Termine.

### 5. Web-UI anpassen (optional)

Die bestehende Web-UI zeigt Kühlraum-Belegung. Für einen Kalender mit Filterung:
- `web/src` anpassen
- Kalender-Komponente integrieren (z.B. FullCalendar oder react-big-calendar)
- Filter für Kategorien und Standorte hinzufügen
- Google Calendar API im Frontend für Anzeige

### 6. Installer erstellen

Das bestehende Installer-System kann angepasst werden:
- `scripts/install-wizard.ps1` anpassen
- Paketnamen ändern zu `AlamidaCalendarAgent`
- Firebase durch Google Calendar Setup ersetzen

## Architektur

```
├── agent/
│   ├── Alamida.Calendar.Agent/     # Windows Tray App
│   ├── Alamida.Calendar.Core/      # Google Calendar Service
│   ├── Alamida.Calendar.Watcher/   # UI-Automatisierung (FlaUI)
│   └── Alamida.Calendar.Profiles/  # Field-Mapping
├── web/                            # React Web-UI (PWA)
└── docs/                           # Dokumentation
```

## Nutzung

1. Agent starten (Tray-Icon erscheint)
2. Alamida öffnen und Terminmaske öffnen
3. Agent erkennt Änderungen und synchronisiert mit Google Calendar
4. Termine werden mit Kategorien und Standorten versehen
5. Google Calendar öffnen für die Ansicht

## Kategorien

- **Begraebnis**: Beisetzungen, Trauerfeiern, Rosenkränze
- **Aufnahme**: Trauergespräche, Aufnahmetermine
- **Vorsorge**: Vorsorgeverträge
- **Bereitschaft**: Bereitschaftsdienste
- **Abwesenheit**: Urlaub, Krankheit
- **Sonstiges**: Alle anderen Termine

## Troubleshooting

### Agent startet nicht
- Prüfen Sie ob die Service Account JSON-Datei existiert
- Prüfen Sie ob Google Calendar API aktiviert ist
- Prüfen Sie ob der Kalender für das Service Account freigegeben ist

### Termine werden nicht synchronisiert
- Prüfen Sie ob Alamida offen ist
- Prüfen Sie ob die richtige Maske aktiv ist
- Prüfen Sie das Tray-Icon für Fehlermeldungen
- Inspector ausführen: Rechtsklick → Inspector (UI-Dump)

### Field-Mapping Probleme
- `dotnet run --project agent/Alamida.Calendar.Agent -- --inspect`
- Dump-Datei prüfen: `%AppData%\AlamidaCalendar\inspector-dump.txt`

## Lizenz

Interne Verwendung für Bestattungsfirma
