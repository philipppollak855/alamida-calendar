# Agent installieren (Wizard, ohne Git)

## Schnellstart (empfohlen)

**Wichtig:** `AlamidaMonitoring-Installer.zip` enthält **keine** fertige `.exe` zum direkten Starten — nur den Wizard. Die EXE liegt nach der Installation unter **`C:\AlamidaMonitoring\`**.

1. **`serviceAccount.json`** aus Firebase Console exportieren (siehe `FIREBASE-SETUP.txt`).
2. **`AlamidaMonitoring-Installer.zip`** vom [Release](https://github.com/philipppollak855/Alamida-Monitoring/releases/latest) entpacken.
3. **`serviceAccount.json`** in denselben Ordner wie `START-HIER.bat` legen.
4. **`START-HIER.bat`** (oder `install-wizard.bat`) starten — Agent-ZIP liegt im Paket bereits bei.
5. Im Wizard **„ZIP auf diesem PC“** wählen (`AlamidaMonitoringAgent-win-x64.zip`).

Der Wizard:

- entpackt das ZIP am richtigen Ort,
- richtet Firebase/AppData ein (wenn `firebase login` vorhanden),
- trägt den **Agent im Windows-Autostart** ein,
- legt auf dem **Desktop** die Verknüpfung **„Alamida Wandmonitor“** an.

## Wandmonitor-Verknüpfung

Öffnet bei jedem Start:

1. Prüfung auf neues **Agent-Release** (GitHub) → bei Bedarf Update + Neustart
2. Start des Agents (falls nicht läuft)
3. Wandmonitor im Edge-App-Fenster: https://alamida---monitoring.web.app/wall

## Einmal pro PC: Firebase

Falls der Wizard kein OAuth findet, nach `%AppData%\AlamidaMonitoring\` legen:

- `firebase-oauth.json` (via `firebase login` auf diesem PC), oder
- `serviceAccount.json`

`WorkstationId` in `appsettings.json` **leer lassen** → PC-Name wird verwendet.

## Manuell (ohne Wizard)

```powershell
# ZIP nach C:\AlamidaMonitoring entpacken, dann:
powershell -ExecutionPolicy Bypass -File setup-agent-install.ps1 -InstallDir "C:\AlamidaMonitoring"
```

## Updates

- Automatisch beim **Agent-Start** und bei **Öffnen der Wandmonitor-Verknüpfung**
- Tray: **Update prüfen…**

## Entwickler

Im Git-Repo: `AutoUpdate.Mode = "git"` in `appsettings.json`.
