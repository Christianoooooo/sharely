# Sicherheitsaudit sharely – Stand nach Behebung

**Stand:** 23.10.2026, `main` @ `85f355f` (Merge von PR #195), CI auf `main` grün (Unit + E2E).
**Ursprüngliches Audit:** 22.10.2026, `main` @ `d9ae6b5`.

**Methode der Nachprüfung:**
- Jeder Fix wurde einzeln gegen den Code geprüft.
- Unit-Tests (`npm test`: 50 Prüfungen, davon 30 zur Verschlüsselung) und E2E-Tests (Playwright, 21 Tests mit MongoDB in GitHub Actions) bestehen.
- Zusätzliche lokale Integrationstests:
  - Datei-Auslieferung, Verschlüsselung und Download-Limits mit echtem Express-Server, echtem ffmpeg und einem Datenbank-Ersatz im Speicher (23 Prüfungen).
  - WebSocket-Limits und Origin-Prüfung mit echter Session-Middleware.
  - Setup-Token.
  - Updater-Rechte als Nicht-root-Nutzer.
  - XSS-Nachstellung und Header-Verhalten in Chromium 1194.

**Nicht prüfbar:**
- Die Live-Instanz `sharely.christian.pizza` war aus der Audit-Umgebung nicht erreichbar. Alle Aussagen beziehen sich auf den Code in `main`, nicht auf das, was dort tatsächlich läuft.
- Die Upload-Routen und das Migrationsskript wurden nicht gegen eine echte MongoDB ausgeführt, nur über die E2E-Tests in CI (Upload ohne Verschlüsselung).

---

## Zusammenfassung

| | Anzahl |
|---|---|
| Funde im ursprünglichen Audit | 22 (2 kritisch, 4 hoch, 8 mittel, 1 DSGVO-mittel, 5 niedrig, 2 Info) |
| Vollständig behoben | 18 |
| Behoben mit verbleibendem Restrisiko | 4 (H2, H4, N1, D3) |
| Zusätzliche Funde beim Beheben | 4 (alle behoben) |
| Neu eingeführter und wieder behobener Fehler | 1 (E2E-Timeout nach Session-Rotation) |
| Betriebsvorfall durch einen Fix | 1 (502 nach Port-Bindung an Loopback, behoben über Konfiguration und Doku) |

Alle kritischen und hohen Funde sind geschlossen. Offen sind nur bewusst zurückgestellte Restrisiken (siehe „Offene Punkte“).

---

## Status je Fund

### KRITISCH

#### K1 – Stored XSS über manipulierten Content-Type — **behoben**
- **Ursprung:** `mimeType` aus dem Client wurde ungeprüft gespeichert. Ein Wert wie `image/png, text/html` umging den Active-Content-Filter, Chromium renderte HTML im App-Origin. Die CSP war über eine hochgeladene JS-Datei umgehbar.
- **Umsetzung (PR #189, `cae9424`):**
  - `src/utils/mime.js`: `normalizeMime()` reduziert jeden Wert auf genau einen `typ/subtyp`. Inline ausgeliefert wird nur noch eine Whitelist passiver Formate (`SAFE_INLINE`), alles andere als `application/octet-stream` mit `attachment` und `CSP: sandbox`.
  - Normalisierung beim Speichern (alle Upload-Wege und Import) und zusätzlich beim Ausliefern, damit auch Altbestände geschützt sind.
- **Nachweis:** Normalisierung mit Angriffswerten getestet; Integrationstest der Auslieferung.
- **Restrisiko:** keins bekannt. Langfristig wäre eine eigene Domain für Nutzerinhalte die grundsätzliche Absicherung gegen diese Fehlerklasse.

#### K2 – `deleteToken`-Leak und NoSQL-Operator-Injection — **behoben**
- **Ursprung:** `GET /api/file/:shortId` lieferte ohne Login den `deleteToken`. Über den WebSocket ließ sich `shortId` als Objekt (`{"$regex": …}`) übergeben, damit waren alle Dateien enumerierbar und löschbar.
- **Umsetzung (PR #189, `cae9424`):**
  - `deleteToken` mit `select: false`, er erscheint in keiner API- oder WebSocket-Antwort mehr. Geladen wird er nur in der Lösch-Route.
  - `file:get` und `file:delete` im WebSocket verlangen einen String.
- **Restrisiko:** Das Löschen per `GET /f/:id/delete/:token` bleibt bestehen (ShareX-Kompatibilität). Mit geheimem Token ist das unkritisch.

### HOCH

#### H1 – Share-Link-Schutz und Download-Limit umgehbar — **behoben**
- **Umsetzung:**
  - PR #189 (`cae9424`): `GET /api/share-links/:token` liefert keine `shortId` mehr.
  - PR #195 (`f31ae8a`): `maxDownloads` gilt auch für `/f/:id/raw`. Gezählt werden vollständige Abrufe (ohne `Range` oder ab Byte 0), einmal pro Besucher-Session. Eigentümer und Admins zählen nie. Die Zählung ist atomar.
- **Nachweis:** Integrationstest (Vorschau plus Download eines Besuchers ergibt einen Download, ein weiterer Besucher bekommt 410, Teil-Ranges zählen nicht).
- **Bekannte Eigenschaft:** Ein Besucher kann innerhalb seiner Session beliebig oft erneut herunterladen. Das Limit begrenzt die Zahl der Besucher, nicht der Abrufe.

#### H2 – Erratbare Datei-IDs und `file:view`-Broadcast an alle — **behoben, Restrisiko**
- **Umsetzung:**
  - PR #190 (`12dece5`): Neue IDs für Dateien, Pastes und Collections bestehen aus 96 Bit Zufall (24 Hex-Zeichen). `file:view` geht nur noch an Eigentümer und Admins.
  - PR #195 (`f31ae8a`): gemeinsames Rate-Limit für fehlgeschlagene Abrufe per ID oder Token (100 pro IP in 15 Minuten) auf `/f`, `/s`, `/api/file`, Share-Links, Collections und Pastes.
- **Restrisiko:** Bereits vergebene 8-stellige IDs (Zeitstempel plus 16 Bit) bleiben gültig, damit geteilte Links nicht brechen. Sie sind nur noch durch das Rate-Limit geschützt. Import-IDs aus XBackBone behalten ihr ursprüngliches Format.

#### H3 – Rechte nur beim Verbindungsaufbau geprüft — **behoben**
- **Umsetzung:**
  - PR #190 (`9814219`): Der WebSocket prüft Session, Aktiv-Status und Rolle bei jeder Nachricht und alle 30 Sekunden für alle Verbindungen. Dazu kommt ein Ping/Pong-Heartbeat.
  - PR #191 (`628d2cc`): Die HTTP-Seite liest Rolle, Aktiv-Status und `sessionVersion` bei jedem Request aus der Datenbank.
- **Wirkung:** Logout, Deaktivierung, Löschung, Herabstufung und Passwortwechsel wirken sofort, über HTTP und WebSocket.

#### H4 – Platte ohne Login vollschreibbar, Quota umgehbar — **behoben, Restrisiko**
- **Umsetzung (PR #190, `9814219`):**
  - Abgelehnte Requests an den ShareX-Endpunkt `/upload` löschen die bereits geschriebene Datei sofort.
  - Chunk-Upload: Offene Uploads zählen gegen die Quota. Teile über der angekündigten Größe werden abgelehnt (413). Die Endgröße muss exakt stimmen (400).
  - Der Retention-Job räumt verwaiste Chunks nach 24 Stunden ab.
- **Restrisiko:** Nutzer ohne Quota (Standard `0` = unbegrenzt) können weiterhin beliebig viel speichern. Bei offener Registrierung sollte eine Standard-Quota gesetzt werden.

### MITTEL

#### M1 – WebSocket ohne Limits — **behoben** (PR #193, `cbf3a33`)
- Höchstens 64 KiB pro Nachricht (Code 1009), 30 Nachrichten am Stück und danach 5 pro Sekunde (429), höchstens 20 Verbindungen pro IP (proxy-bewusst über `proxy-addr`).
- Passwort- und Mail-Aktionen sind auf 10 pro Nutzer in 15 Minuten begrenzt, über WebSocket und HTTP (getrennte Zähler, schlimmstenfalls 20 Versuche).
- **Nachweis:** Integrationstest (403, 429, 1009 und Limit pro IP ausgelöst).

#### M2 – Keine Origin-Prüfung beim WebSocket-Handshake — **behoben** (PR #193, `cbf3a33`)
- Der Handshake wird abgelehnt, wenn `Origin` und `Host` nicht übereinstimmen. Das setzt voraus, dass der Proxy den originalen `Host` weiterreicht. Das ist dokumentiert.

#### M3 – `Secure`-Cookie und HSTS abhängig von `NODE_ENV` — **behoben** (PR #192, `163888e`)
- `secure: 'auto'`: Das Cookie bekommt `Secure`, sobald der Request per HTTPS ankommt. HSTS wird bei HTTPS gesetzt. Plain-HTTP-Setups (lokal) funktionieren weiter.

#### M4 – Port öffentlich, Rate-Limits über `X-Forwarded-For` umgehbar — **behoben** (PR #192, `163888e`; Doku PR #194, #195)
- Der Port wird standardmäßig nur auf `127.0.0.1` veröffentlicht (`BIND_ADDRESS`). `TRUST_PROXY` ist konfigurierbar.
- **Vorfall:** Setups, deren Reverse Proxy oder Tunnel in einem eigenen Container läuft, erreichen die App nach der Loopback-Bindung nicht mehr und antworten mit 502. Lösung und Upgrade-Hinweis stehen in README und `DOCUMENTATION.md` („Cloudflare Tunnel / Proxy im Container“).
- **Betreiber-Prüfung:** Im Audit-Log müssen echte Client-IPs stehen; sonst passt `TRUST_PROXY` nicht zur Proxy-Kette.

#### M5 – Brute-Force auf Passwörter von Inhalten — **behoben** (PR #192, `163888e`)
- Höchstens 10 Fehlversuche pro IP in 15 Minuten auf die Passwort-Prüfung von Share-Links, Collections und Pastes.

#### M6 – Keine Session-Rotation und -Invalidierung — **behoben** (PR #191, `628d2cc`)
- Neue Session-ID bei Login, Registrierung und Installation (`establishSession`).
- `User.sessionVersion` macht bei Passwortwechsel und -reset alle anderen Sessions ungültig, auch offene WebSockets.
- **Folgefehler:** Ein E2E-Test teilte sich unbeabsichtigt die Admin-Session mit einem Nutzer-Login. Seit der Rotation lief die E2E-Suite auf `main` (ab PR #191) in den Timeout. Behoben in PR #195 (`8e8915b`), CI ist wieder grün.

#### M7 – Secrets in Access-Logs — **behoben** (PR #192, `163888e`)
- `api_key=`, `token=`, Delete-Tokens und Share-Tokens werden im Access-Log geschwärzt.
- **Hinweis:** Bereits geschriebene Logs enthalten sie weiterhin, bis die Rotation sie verdrängt. Betroffene API-Keys sollten bei Bedarf neu erzeugt werden.

#### M8 – Verwundbare Abhängigkeiten — **behoben** (PR #193, `e6a2237`)
- nodemailer 10.2.1, mongoose 8.24.6, express 4.22.3, express-rate-limit 8.7.1, multer 2.5.0. `npm audit --omit=dev` meldet 0 Schwachstellen. Node ≥ 20 wird vorausgesetzt.
- Major-Sprünge wurden nicht mitgenommen (mongoose 9, express 5). Für das Client-Build-Tooling (postcss u. a.) gibt es weiterhin Meldungen; die betreffen nicht die Laufzeit.

#### D2 – Kontolöschung unvollständig (DSGVO Art. 17) — **behoben** (PR #193, `cbf3a33`)
- Eine gemeinsame Funktion `deleteUserData` für alle vier Löschwege. Gelöscht werden Dateien, Thumbnails, Share-Links, Pastes, Collections und der Avatar. Gelöschte Dateien werden auch aus fremden Collections entfernt, das Audit-Log wird anonymisiert.
- **Bewusst so gelassen:** Der Audit-Eintrag der Löschung selbst bleibt als Nachweis bestehen (90 Tage).

### NIEDRIG

#### N1 – Ghostscript/ffmpeg im App-Container — **behoben, Restrisiko** (PR #195, `1789be6`)
- Beide laufen jetzt mit leerer Umgebung (nur `PATH`).
- **Restrisiko:** Sie laufen unter demselben Nutzer wie Node. Bei echter Codeausführung sind die Secrets über `/proc/1/environ` weiterhin lesbar. Vollen Schutz bringt nur ein eigener Container ohne Secrets und ohne Netzwerk.

#### N2 – Updater mit Docker-Socket — **behoben** (PR #195, `7b8aea6`)
- Das Control-Verzeichnis gehört jetzt root und hat das Sticky-Bit (`1777`). Die App kann nur `update.request` anlegen und `update.state` schreiben. Untergeschobene Symlinks werden beim Start entfernt.
- Eine feste UID wurde bewusst nicht eingeführt, weil sie die Rechte bestehender `uploads`-Volumes brechen würde.
- **Nachweis:** lokal als Nicht-root-Nutzer getestet.
- **Unverändert:** Der Updater zieht ungeprüft den konfigurierten Branch (keine Signaturprüfung). Das ist nur relevant, wenn der Updater aktiv ist.

#### N3 – Unvollständige Security-Header und CSP — **behoben** (PR #195, `f31ae8a`)
- Neu: `Referrer-Policy: same-origin`, `Permissions-Policy`, sowie `base-uri 'none'`, `form-action 'self'` und `object-src 'none'` in der CSP.
- `same-origin` statt `no-referrer`, weil Letzteres bei Formular-Posts `Origin: null` erzeugen kann und die CSRF-Prüfung diese Requests dann ablehnt (in Chromium getestet).

#### N4 – Fehlerbehandlung — **behoben** (PR #195, `f31ae8a`)
- `asyncRouter` leitet async-Fehler an den Error-Handler weiter. Bei `uncaughtException` beendet sich der Prozess, Docker startet ihn neu. Datei-Streams laufen über `pipeline()`.

#### N5 – Installations-Race — **behoben** (PR #195, `f31ae8a`)
- Die Installation verlangt ein Setup-Token (im Log oder über `INSTALL_TOKEN`). Die normale Registrierung erzeugt nie einen Admin.
- **Nachweis:** lokal getestet, E2E-Setup nutzt das Token.

### DATENSCHUTZ / INFO

#### D3 – Keine Verschlüsselung der Inhalte — **behoben (opt-in), Restrisiko** (PR #195, `f31ae8a`)
- Mit `ENCRYPTION_KEY` werden Uploads und Thumbnails mit AES-256-GCM in 64-KiB-Segmenten verschlüsselt, mit einem Schlüssel pro Datei (HKDF) und Erkennung von Manipulation. Range-Requests und ZIP funktionieren. Das Migrationsskript `npm run migrate:encrypt` verschlüsselt Bestandsdaten.
- **Restrisiko:**
  - Ohne gesetzten Schlüssel bleibt alles unverschlüsselt.
  - Nicht abgedeckt sind Pastes, Dateinamen und andere Metadaten in MongoDB sowie Avatare.
  - Während der Verarbeitung liegt eine Datei kurz im Klartext auf der Platte. Liegengebliebene Klartext-Kopien entfernt der Retention-Job nach 1 Stunde.
  - Ein Schlüsselwechsel wird nicht unterstützt, und ein verlorener Schlüssel bedeutet Datenverlust.
  - Keine Ende-zu-Ende-Verschlüsselung: Der Server sieht die Inhalte beim Upload und Ausliefern.
- **Nicht getestet:** das Migrationsskript gegen eine echte Datenbank.

#### D4 – Logs zeitlich unbegrenzt mit vollen IPs — **behoben** (PR #195, `f31ae8a`)
- Das Access-Log speichert IPs gekürzt (IPv4 auf /24, IPv6 auf /48). Das Audit-Log behält volle IPs, mit 90 Tagen TTL.
- Die Rotation der Docker-Logs bleibt größenbasiert.

---

## Zusätzlich beim Beheben gefunden

| Fund | Schwere | Status |
|---|---|---|
| Path Traversal in `/f/:id/thumb`: Express dekodiert `%2F`, damit waren `.jpg`-Dateien außerhalb des Thumbnail-Ordners lesbar | Mittel | Behoben in PR #195 (ID-Prüfung `[\w-]+`) |
| Updater: Eine kompromittierte App konnte über einen Symlink im `777`-Control-Verzeichnis root-Schreibzugriffe umlenken (mit Docker-Socket entspricht das root auf dem Host) | Hoch (nur mit aktivem Updater) | Behoben in PR #195 |
| Suffix-Ranges (`bytes=-N`) lieferten immer 416 | Bug | Behoben in PR #195 |
| E2E-Test teilte die Admin-Session mit einem Nutzer-Login, ab PR #191 Timeout der Suite | CI | Behoben in PR #195 |

---

## Offene Punkte

1. **Alte 8-stellige Datei-IDs** sind weiterhin erratbar und nur durch das Rate-Limit geschützt. Eine Neuvergabe würde bestehende Links brechen und ist eine Betreiberentscheidung.
2. **Thumbnails in eigenem Container** (Restrisiko N1). Vollständige Trennung von den Secrets der App.
3. **Prüfungen auf der eigenen Instanz nach dem Update:**
   - Audit-Log zeigt echte Client-IPs (sonst `TRUST_PROXY` anpassen).
   - WebSocket funktioniert über den Proxy (Galerie lädt, keine 403 auf `/ws`).
   - Response-Header enthalten HSTS, `Referrer-Policy` und `Set-Cookie … Secure`.
4. **Verschlüsselung aktivieren** (optional): Schlüssel erzeugen und getrennt sichern, `uploads`-Volume sichern, dann `migrate:encrypt` ausführen.
5. **Standard-Quota setzen**, falls die Registrierung offen ist (Restrisiko H4).
6. **`.env.example`:** um die neuen Variablen ergänzt (`fbb0c53`).
7. **Übersetzungen:** Der Abschnitt „Automatische Updates“ fehlt in den sieben Übersetzungen unter `docs/` (bestand schon vor dem Audit). Der neue Hinweis zu den Updater-Rechten steht nur auf Deutsch.

---

## Übersicht der Änderungen auf `main`

| PR | Commit(s) | Inhalt |
|---|---|---|
| #189 | `cae9424` | K1, K2, H1 (Share-Link-ID) |
| #190 | `12dece5`, `9814219` | H2, H3 (WebSocket), H4 |
| #191 | `628d2cc` | H3 (HTTP), M6 |
| #192 | `163888e` | M3, M4, M5, M7 |
| #193 | `e6a2237`, `cbf3a33` | M8, M1, M2, D2 |
| #194 | `bbac3e3` | Doku Cloudflare Tunnel / Proxy im Container |
| #195 | `7b8aea6`, `1789be6`, `f31ae8a`, `7ea07d5`, `0bc991e`, `1fe1802`, `8e8915b` | N2, N1, D3, N5, H1 (`/raw`), H2 (Rate-Limit), N3, N4, D4, Zusatzfunde, Doku, E2E-Fix |
