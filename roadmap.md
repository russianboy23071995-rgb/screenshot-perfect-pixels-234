# Roadmap

## Nächtliche Export-Sicherung
- [x] Zwei rein lesende, schlüsselgeschützte Exportwege mit vollständigen Besitzerdaten und Belegdateien
- [x] 17 Regeltests, echte Besitzerdaten und Originalbeleg rein lesend geprüft; laufende Routen antworten ohne Schlüssel mit 503
- [x] EXPORT_API_KEY über sicheres Formular gespeichert; n8n-Konfiguration und Veröffentlichung bleiben Nutzeraktionen

## Automatischer Belegeingang — abgeschlossen

## Buchungsentwürfe, Protokoll, Sammel-Freigabe — abgeschlossen
- [x] Migration 0006 (Entwurfsstatus, Währung, Protokoll, Anbieterprofile, GoBD-Sperre, Storno-Funktion)
- [x] Belegeingang legt Entwürfe an / verknüpft Zahlungsbelege
- [x] Neue Prüfliste mit Bearbeitung, Ampel, Fremdwährung, Sammel-Freigabe
- [x] Storno statt Ändern, Status-Badges
- [x] Summen nur festgeschrieben; USt nach Rechnungsdatum, EÜR nach Zahldatum, § 13b gesondert
- [x] Seite Protokoll + Verlauf je Buchung
- [ ] Veröffentlichen — Nutzer klickt „Publish"

## Testmodus und Live-Start
- [x] Migration: bestehende Tests, unveränderliches Protokoll, Schutz vor Umkennzeichnung und Rückkehr
- [x] Neue Daten und Dublettenprüfung folgen Besitzermodus
- [x] Hinweis, Test-Badges, Live-Start mit bestätigter Bereinigung, Protokollfilter
- [x] Auswertungen und Arbeitslisten schließen Tests im Live-Betrieb aus
- [x] Regeln testen und angemeldete Oberfläche prüfen (keine vorhandenen Daten löschen, Live-Start nicht ausführen)
