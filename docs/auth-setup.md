# Anmeldung (Google) und Benutzer-Freischaltung

## Firebase Console (einmalig)

1. [Firebase Console](https://console.firebase.google.com/project/alamida---monitoring/authentication/providers)
2. **Authentication** → **Sign-in method** → **Google** aktivieren
3. **Authorized domains**: `alamida---monitoring.web.app` und `localhost` prüfen
4. **Firestore Rules** deployen:
   ```cmd
   cd firebase
   firebase deploy --only firestore:rules --project alamida---monitoring
   ```

## Ablauf für Benutzer

1. Web öffnen: https://alamida---monitoring.web.app
2. **Mit Google anmelden** (erste Anmeldung legt Dokument `users/{uid}` an, `activated: false`)
3. Seite **„Konto wartet auf Freischaltung“** — noch keine Sterbefall-Daten
4. Nach Freischaltung: Zugriff auf `/` und `/wall`

## Administrator: Benutzer aktivieren

1. Firebase Console → **Firestore** → Collection **`users`**
2. Dokument der Person (UID steht auf der Warte-Seite oder in Authentication → Users)
3. Feld setzen:
   - `activated` → **true** (boolean)
   - optional `activatedAt` → Timestamp (jetzt)
4. Benutzer klickt **Status prüfen** oder lädt die Seite neu

### Beispiel-Dokument `users/{uid}`

| Feld | Wert |
|------|------|
| email | user@example.com |
| displayName | Max Mustermann |
| activated | **true** |
| createdAt | (automatisch) |

## Sicherheit

- **Sterbefaelle**, **ueberfuehrungen**, **events**: nur lesbar mit `activated == true`
- Schreiben weiterhin nur über den Windows-Agent (Admin SDK / OAuth)
- Benutzer können `activated` nicht selbst auf `true` setzen (Firestore Rules)

## Web deployen

```cmd
scripts\deploy-web.ps1
```

Deployt Hosting; Rules separat mit `firebase deploy --only firestore:rules`.
