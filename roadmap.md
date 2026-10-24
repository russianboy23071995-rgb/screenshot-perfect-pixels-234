# Roadmap

## Automatischer Belegeingang — abgeschlossen
- [x] Migration: documents um sha256, source, source_ref, sender, subject, received_at, review_status, review_note erweitert
- [x] Endpunkt /api/public/beleg-eingang (POST, x-ingest-key, Dublettenprüfung, Ablage im Belege-Speicher)
- [x] Seite Prüfliste mit Vorschau und Aktionen (übernehmen / Dublette / ablehnen)
- [x] Navigations-Zähler für offene Prüfungen
- [x] Secrets INGEST_API_KEY und OWNER_USER_ID vom Nutzer gespeichert
- [x] Ende-zu-Ende getestet (falscher Schlüssel → 401, Upload → angelegt, Wiederholung → dublette), Testdaten entfernt
