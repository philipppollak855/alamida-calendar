# Discovery-Checkliste — Alamida 9.2.1

## Vorbereitung

1. Alamida starten: `C:\Alamida\Alamida 9.2.1.fmp12`
2. **Neuer Sterbefall**-Maske und Sterbefall-Detail oeffnen
3. Tab **Termine** (Ueberfuehrungen) und Tab **Verstorbener** (Sterbeort) jeweils mit Inspector erfassen; auf „Neuer Sterbefall“ `inspect.bat` → `AutomationId` in `neuerSterbefall.fields` eintragen

## Zu dokumentieren

| Feld | Alamida | Mapping-Key |
|------|---------|-------------|
| Sterbefall-ID | Header `260087 \| Name` | `sterbefallHeader` |
| **Abholort / Sterbeort (Monitoring)** | Tab **Termine**, Zeile 1 („von“ der Abholung) | `ueberfuehrungText` + `abholungAm` |
| ~~Angabe zum Sterbeort~~ | Tab Verstorbener (`sterbeort` in Mapping) | **wird nicht gelesen** (Detail-Überführung) |
| Ueberfuehrung 1-6 | Tab Termine, Text + Datum | `ueberfuehrungText` … `abholung6Am` |

## Inspector

```cmd
c:\Users\offic\Alamida-Monitoring\scripts\inspect.bat
```

1. Zuerst Tab **Verstorbener** aktiv, Inspector laufen lassen
2. Dann Tab **Termine**, Inspector erneut
3. In `docs/inspector-dump.txt` nach `Sterbeort`, `Todesort`, `Verstorben` suchen
4. Gefundene `AutomationId` in `docs/field-mapping-9.2.1.json` unter `sterbeort` eintragen

## History (Disposition / Wall)

- **Beisetzung mit Uhrzeit**: sichtbar bis Beisetzungszeit **+ 2 Stunden**
- **Nur Beisetzungsdatum** (ohne Uhrzeit): sichtbar bis **Tagesende** (23:59)
- **„Im Anschluss“**: sichtbar bis **Trauerfeier-Uhrzeit + 2 Stunden** (Felder `trauerfeierdatum`, `trauerfeierzeit`, `imAnschluss`)
- **Alle anderen Fälle bleiben sichtbar** — Wechsel in Alamida deaktiviert frühere Fälle nicht mehr (`aktivInAlamida` bleibt true)

## Bestattungsart / Endziel

| Art | Endziel in Monitoring |
|-----|------------------------|
| Erdbestattung | `Termin_Bestattung_Ort` + Zusatz → z. B. „Friedhof Ternitz“ |
| Trauerfeier / Verabschiedung | `Termin_Gottesdienst_Ort` + Zusatz → z. B. „Kirche St.Valentin“ |
| Rosenkranz | `Termin_Rosenkranz_Ort` + Zusatz |
| Urne / Feuerbestattung | Krematorium (z. B. Innermanzing, Feba) |

Felder: `bestattungsart`, `beisetzungsort`/`beisetzungsortZusatz`, `trauerfeierort`/`trauerfeierortZusatz`, `rosenkranzort`/`rosenkranzortZusatz`, `krematoriumOrt` — bei abweichenden AutomationIds Inspector-Dump prüfen.

## Erkennung & Kühlraum (Disposition)

In der Web-App unter **Disposition → „Erkennung & Kühlraum“** (Firestore `settings/disposition`):

- **Ort prüfen**: Testfeld mit Beispiel-Orten, zeigt Treffer vor dem Speichern
- Keywords **Kremation**, **Krankenhaus** (Präfixe + Keywords), Duplikate werden entfernt
- Kurze Keywords (2–3 Zeichen) mit **Wortgrenzen**, längere mit Enthält-Match
- **Eigene Kühlräume**: Bezeichnung, Plätze (1–99), Keywords; Alamida-Name wird als Keyword übernommen
- Validierung + Hinweise vor dem Speichern; Agent lädt bei `settingsVersion`-Änderung neu (Cache ~30 s)

Alamida-Feld `kuehlplatz` / `Kuehlraum_Nr` weiter per Inspector in `field-mapping-9.2.1.json` mappen.

## Positionslogik (Agent)

- Position **0** = Abholort (nur „von“ Zeile 1 / Tab Termine), **nicht** Feld „Angabe zum Sterbeort“
- Zeilen **1..6** = Überführungsorte (Tab Termine); Typ: **Abholung** (Zeile 1), **Überführung**, **Kremation** (aus von/nach)
- **Abholort** = „von“ der Abholungszeile; Firestore-Feld `sterbeort` = gleicher Wert (Kompatibilität)
- **Kremation-Keywords** (in `OrtSchluesselwoerter.cs`): Feba, Innermanzing, Krematorium, Kremation, Einäscherung, …
- **Krankenhaus** (Abholort): Präfix `UK`, `KH`, `KH-`, `KH.` sowie Krankenhaus, Spital, Klinik
- **Aktuelle Position** = Ziel der letzten Zeile mit Datum ≤ heute, sonst Sterbeort
- **Geplant** = erste Zeile mit Datum > heute
- **Dauer-Sync (Watcher)**: bei offener Detailmaske alle ~1,5 s Firestore-Touch (`lastSeenAt`, `aktivInAlamida`); bei Datenänderung voller Sync
- **Fallwechsel**: neuer Header in der Modalansicht → sofort Sync, vorheriger Fall `aktivInAlamida: false`
- **Neuer Sterbefall**: eigene Maske (`neuerSterbefall` in `field-mapping-9.2.1.json`) — Inspector auf dieser Maske ausführen und Feld-IDs verfeinern
- **Kein Voll-Duplikat**: gleicher `contentHash` → nur Heartbeat, keine redundanten Felder

## Test

```cmd
scripts\once.bat
scripts\sync-now.bat
```

Web: https://alamida---monitoring.web.app
