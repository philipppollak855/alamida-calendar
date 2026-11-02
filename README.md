# Alamida Kalender

Google Calendar-basierte Terminverwaltung für Bestattungen mit automatischer Synchronisation aus Alamida (FileMaker).

## Übersicht

Alamida Kalender ist eine Abspaltung von Alamida-Monitoring, die Firebase durch Google Calendar API ersetzt. Der Windows-Agent liest Termine aus Alamida via UI-Automatisierung und synchronisiert sie direkt mit Google Calendar.

## Features

✅ **Automatische Synchronisation**: Termine aus Alamida werden automatisch in Google Calendar synchronisiert
✅ **Kategorisierung**: Begräbnis, Aufnahme, Vorsorge, Bereitschaft, Abwesenheit, Sonstiges
✅ **Standort-Filterung**: Filter nach Standorten (Friedhöfe, Kirchen, Bestattungshaus)
✅ **Web-UI**: React-basierte Kalenderansicht mit Filterung
✅ **Windows Tray-Agent**: Hintergrunddienst mit Statusanzeige
✅ **PWA**: Progressive Web App für mobile Nutzung

## Projektstruktur

```
alamida-calendar/
├── agent/                              # .NET 8 Windows Agent
│   ├── Alamida.Calendar.Agent/         # Tray-Application
│   ├── Alamida.Calendar.Core/          # Google Calendar Service
│   ├── Alamida.Calendar.Watcher/       # UI-Automatisierung (FlaUI)
│   └── Alamida.Calendar.Profiles/      # Field-Mapping
├── web/                                # React Web-UI
│   ├── src/
│   │   ├── CalendarPage.tsx            # Kalenderansicht
│   │   └── CalendarPage.css
│   └── dist/                           # Build-Output
├── scripts/                            # Installationsskripte
│   ├── full-setup.ps1                  # Vollautomatisches Setup (Google Cloud + Installer)
│   ├── build-simple-installer.ps1      # ZIP-Installer erstellen
│   ├── build-installer.ps1             # Inno Setup Installer erstellen
│   ├── build-agent-release.ps1         # Release-Build
│   ├── install-calendar-agent.ps1      # Installation
│   ├── INSTALL.bat                     # Installation (ZIP)
│   ├── UNINSTALL.bat                   # Deinstallation
│   ├── setup-complete.ps1              # Ersteinrichtung
│   └── GOOGLE-CALENDAR-SETUP.txt       # Google Cloud Setup
└── docs/
    ├── SETUP.md                        # Einrichtungsanleitung
    └── field-mapping-9.2.1.json        # UI-Feld-Mapping
```

## Schnellstart

### Vollautomatisches Setup (empfohlen - ONE CLICK)

**Ein Klick-Installation - Google Cloud Projekt wird automatisch eingerichtet:**

1. Doppelklick auf `INSTALLER-ERSTELLEN.bat` im Projektverzeichnis
2. Folgen Sie den Anweisungen im Browser:
   - Google Cloud Projekt wird automatisch erstellt
   - Calendar API wird aktiviert
   - Service Account wird erstellt mit Berechtigungen
   - Kalender wird freigegeben
   - Konfiguration wird automatisch gesetzt
3. Das Skript erstellt automatisch den Installer (ZIP-Datei)
4. Installieren:
   - `dist/installer/AlamidaCalendarAgent-Setup.zip` entpacken
   - `INSTALL.bat` als Administrator ausführen (Rechtsklick → "Als Administrator ausführen")

**Das wars! Der Agent läuft und synchronisiert automatisch mit Google Calendar.**

### Manuelles Setup (falls vollautomatisches Setup nicht funktioniert)

**Schritt 1: Installer erstellen**

```powershell
cd scripts
.\build-simple-installer.ps1
```

**Schritt 2: Google Cloud Projekt einrichten**

Siehe `scripts/GOOGLE-CALENDAR-SETUP.txt` für Details:

1. Google Cloud Console öffnen: https://console.cloud.google.com
2. Google Calendar API aktivieren
3. Service Account erstellen und JSON herunterladen
4. JSON speichern nach: `%AppData%\AlamidaCalendar\service-account.json`
5. Kalender für Service Account freigeben

**Schritt 3: Installieren**

- `dist/installer/AlamidaCalendarAgent-Setup.zip` entpacken
- `INSTALL.bat` als Administrator ausführen
3. Service Account erstellen und JSON herunterladen
4. JSON speichern nach: `%AppData%\AlamidaCalendar\service-account.json`
5. Kalender für Service Account freigeben

**Option 3: Manuelles Setup**

```powershell
# Builden
cd scripts
.\build-agent-release.ps1

# Installieren
.\install-calendar-agent.ps1
```

### 3. Agent starten

Der Agent startet automatisch nach der Installation und erscheint als Tray-Icon im Windows Tray.

### 4. Web-UI starten

```powershell
cd web
npm run dev
```

Öffnen Sie http://localhost:5173 für die Kalenderansicht.

## Kategorien

Der Agent erstellt Calendar Events für folgende Termine:

- **Begraebnis**: Beisetzungen, Trauerfeiern, Rosenkränze
- **Aufnahme**: Trauergespräche, Aufnahmetermine
- **Vorsorge**: Vorsorgeverträge
- **Bereitschaft**: Bereitschaftsdienste
- **Abwesenheit**: Urlaub, Krankheit
- **Sonstiges**: Alle anderen Termine

## Web-UI

Die Web-UI bietet:

- Monats-/Wochen-/Tagesansicht
- Filter nach Kategorien
- Filter nach Standorten
- Farbcodierte Termine pro Kategorie
- Responsive Design (Mobile-freundlich)

## Agent-Konfiguration

Datei: `agent/Alamida.Calendar.Agent/appsettings.json`

```json
{
  "CalendarId": "primary",
  "ServiceAccountPath": "%AppData%\\AlamidaCalendar\\service-account.json",
  "WorkstationId": "PC-NAME",
  "PollIntervalMs": 5000,
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

## Entwicklung

### Agent entwickeln

```powershell
cd agent
dotnet build
dotnet run
```

### Web-UI entwickeln

```powershell
cd web
npm install
npm run dev
```

### Web-UI builden

```powershell
cd web
npm run build
```

## Deployment

### Agent Release erstellen

```powershell
cd scripts
.\build-agent-release.ps1 -Version "1.0.0"
```

Erstellt `dist/agent-release/AlamidaCalendarAgent-win-x64.zip`

### Web-UI deployen

```powershell
cd web
npm run build
# dist/ Inhalt auf Webserver kopieren
```

## Troubleshooting

### Agent startet nicht
- Prüfen Sie ob `service-account.json` existiert
- Prüfen Sie ob Google Calendar API aktiviert ist
- Prüfen Sie ob der Kalender freigegeben ist

### Termine werden nicht synchronisiert
- Prüfen Sie ob Alamida offen ist
- Prüfen Sie ob die richtige Maske aktiv ist
- Rechtsklick auf Tray-Icon → Inspector (UI-Dump)

### Field-Mapping Probleme
- Führen Sie `dotnet run --project agent/Alamida.Calendar.Agent -- --inspect` aus
- Prüfen Sie `%AppData%\AlamidaCalendar\inspector-dump.txt`

## Unterschiede zu Alamida-Monitoring

| Feature | Alamida-Monitoring | Alamida-Kalender |
|---------|-------------------|-------------------|
| Backend | Firebase Firestore | Google Calendar API |
| Kalender | Custom Wall-Display | react-big-calendar |
| Fokus | Kühlraum-Belegung | Terminplanung |
| Datenquelle | Alamida (FileMaker) | Alamida (FileMaker) |
| UI-Automatisierung | FlaUI | FlaUI (übernommen) |

## Lizenz

Interne Verwendung für Bestattungsfirma

## Danksagung

Basierend auf Alamida-Monitoring mit UI-Automatisierung via FlaUI.
