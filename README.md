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
├── INSTALLIEREN.bat                    # Ein-Klick-Installation
├── DEINSTALLIEREN.bat                  # Deinstallation
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
│   ├── install.ps1                     # Ein-Klick-Installation (von INSTALLIEREN.bat aufgerufen)
│   ├── uninstall.ps1                   # Deinstallation (DEINSTALLIEREN.bat)
│   ├── build-setup-package.ps1         # Fertiges Installationspaket (ZIP) erstellen
│   ├── full-setup.ps1                  # Geführtes Google-Cloud-Setup
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

### Ein-Klick-Installation (empfohlen)

**`INSTALLIEREN.bat` doppelklicken.** Keine Administratorrechte, kein Rechtsklick, kein Entpacken nach Program Files.

Der Installer (`scripts/install.ps1`) erledigt automatisch:

1. Agent bauen (das .NET 8 SDK wird bei Bedarf einmalig nach `%LOCALAPPDATA%\AlamidaCalendar\dotnet` geladen) – im fertigen Paket entfällt dieser Schritt
2. Installation nach `%LOCALAPPDATA%\Programs\AlamidaCalendar` (laufender Agent wird vorher beendet → auch für Updates)
3. Konfiguration in `%APPDATA%\AlamidaCalendar` (bestehende Einstellungen bleiben erhalten)
4. Google Service-Account-JSON wird automatisch gefunden (neben `INSTALLIEREN.bat`, im Download-Ordner oder auf dem Desktop), sonst einmal per Dateiauswahl
5. Kalender-ID wird einmal abgefragt; die Service-Account-Adresse liegt dabei schon in der Zwischenablage zum Freigeben des Kalenders
6. Autostart, Startmenü- und Desktop-Verknüpfung, Eintrag unter „Apps & Features“
7. Agent starten

Protokoll: `%APPDATA%\AlamidaCalendar\install.log`. Deinstallation: `DEINSTALLIEREN.bat` oder „Apps & Features“.

**Ohne Repository herunterzuladen** (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/philipppollak855/alamida-calendar/master/scripts/install.ps1 | iex"
```

**Unbeaufsichtigt** (z.B. für mehrere PCs):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Silent -ServiceAccountPath C:\pfad\service-account.json -CalendarId kalender@example.com
```

### Fertiges Paket für PCs ohne .NET SDK

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-setup-package.ps1 -Version 1.0.0
```

Erzeugt `dist/AlamidaCalendar-Setup.zip` (Agent self-contained + `INSTALLIEREN.bat`). Auf dem Ziel-PC entpacken und `INSTALLIEREN.bat` doppelklicken.
Mit `-ServiceAccountPath` wird der Schlüssel mitgeliefert – das ZIP dann nur intern weitergeben, nie veröffentlichen.

### Google Cloud einrichten (einmalig)

Siehe `scripts/GOOGLE-CALENDAR-SETUP.txt`: Calendar API aktivieren, Service Account anlegen, JSON-Schlüssel herunterladen, Kalender für die Service-Account-Adresse freigeben („Änderungen an Terminen vornehmen“).
Als Kalender-ID die ID des freigegebenen Kalenders verwenden (Google Kalender → Einstellungen → „Kalender integrieren“). `primary` wäre der eigene, für niemanden sichtbare Kalender des Service Accounts.

### Web-UI starten

```powershell
cd web
npm run dev
```

Öffnen Sie http://localhost:5173 für die Kalenderansicht.

## Kategorien

Jeder Termin aus der Maske (Tab „Termine“) wird einer Kategorie zugeordnet und bekommt deren Farbe:

| Kategorie (Schlüssel) | Quelle in Alamida | Farbe (ColorId) |
|---|---|---|
| Beisetzung | Bestattung Datum/Zeit, „im Anschluss“ → nach der Trauerfeier | 8 Graphit |
| Trauerfeier | Trauerfeier 1 und 2 | 3 Weintraube |
| Rosenkranz | Rosenkranz | 1 Lavendel |
| Trauergespraech | Trauergespräch / Aufnahme | 5 Banane |
| Abholung | Überführungszeile 1 (Abholung) | 11 Tomate |
| Ueberfuehrung | weitere Überführungszeilen | 9 Heidelbeere |
| Kremation | Überführung ins Krematorium | 6 Mandarine |

Einstellungen in `%AppData%\AlamidaCalendar\appsettings.json`, Abschnitt `Kategorien`:

```json
"CalendarId": "standard-kalender@group.calendar.google.com",
"Kategorien": {
  "Ueberfuehrung": { "Name": "Überführung", "CalendarId": "fahrten@group.calendar.google.com", "ColorId": "9", "DauerMinuten": 120, "Aktiv": true }
}
```

- `CalendarId` leer = Standard-Kalender (`CalendarId` oben). So können beliebig viele Kalender genutzt werden, z. B. ein eigener Kalender für Überführungen.
- Jeder Kalender muss für die Service-Account-Adresse mit „Änderungen an Terminen vornehmen“ freigegeben sein.
- `ColorId` 1–11 (Google-Terminfarben), leer = Kalenderfarbe; `Aktiv: false` überträgt die Kategorie nicht.
- Termine ohne Uhrzeit werden ganztägig eingetragen. Jeder Termin hat eine feste ID aus Sterbefall-Nummer und Termin-Art: Änderungen in Alamida aktualisieren den Termin, gelöschte Daten entfernen ihn, es entstehen keine Duplikate. Termine werden erst eingetragen, wenn der Sterbefall eine Nummer hat.

## Web-UI starten

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

Datei: `%APPDATA%\\AlamidaCalendar\\appsettings.json` (wird vom Installer angelegt; Vorlage: `agent/Alamida.Calendar.Agent/appsettings.json`)

```json
{
  "CalendarId": "primary",
  "ServiceAccountPath": "%AppData%\\AlamidaCalendar\\service-account.json",
  "WorkstationId": "",
  "PollIntervalMs": 5000,
  "FieldMappingPath": "docs/field-mapping-9.2.1.json",
  "AutoUpdate": {
    "Enabled": true,
    "CheckOnStartup": true,
    "Mode": "release",
    "GitHubOwner": "philipppollak855",
    "GitHubRepo": "alamida-calendar",
    "AssetFileName": "AlamidaCalendarAgent-win-x64.zip",
    "RepoRoot": "",
    "Branch": "master"
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
