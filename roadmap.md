# Roadmap

## Automatischer Belegeingang
- [x] Migration: documents um sha256, source, source_ref, sender, subject, received_at, review_status, review_note erweitert
- [x] Endpunkt /api/public/beleg-eingang (POST, x-ingest-key, Dublettenprüfung, Ablage im Belege-Speicher)
- [x] Seite Prüfliste mit Vorschau und Aktionen (übernehmen / Dublette / ablehnen)
- [x] Navigations-Zähler für offene Prüfungen
- [ ] Secrets INGEST_API_KEY und OWNER_USER_ID anlegen (Nutzer füllt sie selbst; „neuen Key erstellen“ = Generieren-Button im Formular)
- [ ] Build prüfen und Prüfliste im Browser verifizieren
