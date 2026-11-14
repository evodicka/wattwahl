# Wattwahl – Design-Inventar (D4)

Nov 14, 2026 · @Eduard Vodicka

Dieses Inventar übergibt das freigegebene Design (G3) an Phase 5. Es sagt, welches Board welcher Schritt baut, welche Komponente wo vorkommt und wo Tokens und Texte liegen. Fachlich gilt die Spezifikation, technisch die Architektur, das Design zeigt das Wie der Oberfläche.

## Quellen

| Was | Wo |
| --- | --- |
| Design-System (Tokens, Grundkomponenten, Regeln) | https://claude.ai/artifact/XcCjLPUnuS8iSXQ73k7Z5f |
| Mockups (23 Boards) | https://claude.ai/artifact/XLGoB4DrazZ4gj6HiqsBFy |
| Tokens als Export zum Stand G3 | `docs/design/tokens.json` |
| Tokens als Custom Properties | `src/ui/theme.css`, geprüft von `tests/ui/theme.test.ts` |
| Oberflächentexte | `src/i18n/de.json`, ein Namespace je Bereich plus `common` |
| Briefing mit Zuständen Z01 bis Z22 und Tablet-Stufen | `docs/design-briefing.md` |

Die Komponenten-Stylesheets der Mockups (`components/bundle.css` im Design-System, `ww-app.css` in den Mockups) sind Referenz, kein Code: Sie zeigen Maße und Zustände, die Phase 5 als React-Komponenten nachbaut. Werte kommen dort nur aus den Custom Properties von `theme.css`.

**Änderungen am Design** laufen über Claude Design und eine neue Freigabe (G3). Danach wird `docs/design/tokens.json` ersetzt und `theme.css` daraus neu erzeugt, der Test zeigt jede Abweichung.

## Board je Schritt

Jedes Board gehört genau einem Schritt. Teile eines Boards, die ein anderer Schritt baut, stehen in der letzten Spalte.

| Board | Inhalt | Schritt | Teile aus anderen Schritten |
| --- | --- | --- | --- |
| D1 Fahrprofil | Bestandsfahrzeug, Arbeitsstätten, Zusatzstrecke, 1280 px | S17 | Seitenleiste S16 |
| M1 Fahrprofil | dasselbe, 390 px | S17 | untere Navigation S16 |
| D2 Kandidaten | Kartenliste mit vier Zuständen | S18 | |
| M2 Kandidaten | dasselbe, 390 px | S18 | |
| D3 Kandidatenformular | alle Gruppen untereinander, Leasing | S18 | |
| M3 bis M6 Formular, Schritte 1 bis 4 | Allgemein und Preis, Akku und Reichweite, Garantie, Leasing | S18 | |
| D4 Parameter | alle Parameter, Annahme, Stichtag, Ampelfarben | S17 | Ampelfarben zur Laufzeit S16 |
| M7 Parameter | dasselbe, 390 px | S17 | |
| D5 Ergebnis | Ergebnistabelle, Kostenvergleich, Preis-Regler | S19 | Kostenvergleich S20, Preis-Regler S21 |
| M8 Ergebnis | Angebotskarten, Kostenbalken, Preis-Regler | S19 | Kostenbalken S20, Preis-Regler S21 |
| D6 Ergebnis, Detailansichten | Heatmap, Zuordnungsplan, Garantie, Rechenweg | S20 | Rechenweg S21, Verweis Szenariovergleich S22 |
| M9 Ergebnis, Detailansichten | dasselbe, 390 px | S20 | Rechenweg S21 |
| D7 Szenarien und Daten | Liste, Szenariovergleich, Export, Import | S22 | |
| M10 Szenarien und Daten | dasselbe, 390 px | S22 | |
| D8 Zustände | Z01 bis Z22, 1280 px | S16 | je Zustand siehe Tabelle unten |
| M11 Zustände | dasselbe, 390 px | S16 | je Zustand siehe Tabelle unten |
| T1 Fahrprofil, 820 px | Tablet hochkant | S16 | Inhalt S17 |
| T2 Ergebnis, 820 px | Tablet hochkant | S16 | Inhalt S19 bis S21 |
| T3 Fahrprofil, 1024 px | Tablet quer | S16 | Inhalt S17 |
| T4 Ergebnis, 1024 px | Tablet quer | S16 | Inhalt S19 bis S21 |

S16 besitzt die Zustandsboards, weil Rahmen, Hinweise, Dialog und Error Boundary dort entstehen, und die Tablet-Boards, weil sie die Breitenstufen festlegen. S23 hat kein eigenes Board, baut aber die Zustände Z08 und Z09 aus D8 und M11.

## Komponenten

„Basis“ heißt: im Design-System als Grundkomponente beschrieben, mit Vorschau und Regeln. „Mockup“ heißt: nur in den Mockups gezeichnet. Der erste Schritt in der Spalte „baut“ legt die Komponente unter `src/ui` an, die anderen nutzen sie.

| Komponente | Herkunft | Boards | baut | nutzt |
| --- | --- | --- | --- | --- |
| Button (primär, normal, leise, Löschen, gesperrt) | Basis | alle | S16 | S17 bis S22 |
| Zahlenfeld mit Einheit, Hinweis, Fehler, Warnung, Annahme, geändert, Zurücksetzen | Basis | D1, D3, D4, M1, M3 bis M7, T1, T3, D8, M11 | S17 | S18, S21 |
| Textfeld (Name, Notiz) | Mockup | D1, D3, M1, M3 | S17 | S18, S22 |
| Monat-und-Jahr-Feld (Erstzulassung, Stichtag) | Mockup | D4, M7, D8, M11 | S17 | S18 |
| Auswahl (Select) | Basis | D3, D4, D6, M3, M7, M9 | S17 | S18, S20 |
| Schalter (role switch) | Basis | D1, D4, M1, M7 | S17 | |
| Wochentag-Umschalter | Basis | D1, M1, T1, T3 | S17 | |
| Karte, gedämpfte Karte | Basis | alle Bereiche | S16 | S17 bis S22 |
| Tabelle mit fester erster Spalte und Scrollbox | Basis | D5, D7, T4 | S19 | S20, S22 |
| Navigation: Seitenleiste und untere Leiste | Basis | alle | S16 | |
| Kopfzeile mit Szenario und Speicherstand | Mockup | alle | S16 | |
| Statuszeile: Szenario, Preisfall, Vergleichsdauer, Stand | Mockup | D5, D6, D7, M8, M9, M10 | S16 | S19 bis S22 |
| Hinweis (Fehler, Warnung, Erfolg, Info) mit Aktionen | Basis | D2, D6, D8, M2, M5, M6, M11 | S16 | S17 bis S23 |
| Ampel-Kennzeichen mit Symbol und Zahl | Basis | D2, D5, D6, M2, M8, M9, D8, M11 | S16 | S18 bis S20 |
| Markierungen „Annahme“ und „geändert“ | Basis | D1, D4, M1, M7, D6 | S17 | S18, S21 |
| Leerer Zustand | Mockup | D8, M11 | S16 | S18, S19, S22 |
| Bestätigungsdialog | Mockup | D8, M11 | S16 | S18, S22 |
| Segment-Umschalter (Preisfall) | Mockup | D5, M8, T2, T4 | S19 | |
| Kandidatenkarte mit Status und Grund | Mockup | D2, M2, D8, M11 | S18 | |
| Reichweiten-Raster 3 × 2 (Straßenart × mild/kalt) | Mockup | D3, M4 | S18 | |
| Leasingangebot-Panel | Mockup | D3, M6 | S18 | |
| Schrittanzeige und feste Aktionsleiste (Formular am Handy) | Mockup | M3 bis M6 | S18 | |
| Restgarantie-Anzeige (berechnet) | Mockup | D6, M9, D8, M11 | S18 | S20 |
| Angebotskarte (Ergebnis am Handy) | Mockup | M8, T2 | S19 | |
| Kostenbalken mit Spannenstrich, Legende, Achse | Mockup | D5, M8, T2, T4 | S20 | |
| Reserve-Heatmap mit Tabellenalternative | Mockup | D6, M9 | S20 | |
| Zuordnungsplan mit Symbolen und Legende | Mockup | D6, M9 | S20 | |
| Kachel (Zahl groß, Beschriftung) | Mockup | D1, D6, M9 | S20 | S17 |
| Rechenweg (aufklappbar, Zeile mit Formel-ID) | Mockup | D6, M9 | S21 | |
| Preis-Regler mit Wertanzeige | Mockup | D5, M8, T2, T4 | S21 | |
| Szenariozeile mit Auswahl für den Vergleich | Mockup | D7, M10 | S22 | |
| Szenariovergleich (Balken je Szenario plus Tabelle) | Mockup | D7, M10 | S22 | |
| Datei-Auswahl für den Import, Moduswahl als Radiogruppe | Mockup | D7, M10 | S22 | |

## Zustände je Schritt

| Zustand | Board | baut |
| --- | --- | --- |
| Z01 Leer (Kandidaten, Ergebnis, Szenarien) | D8, M11 | S18, S19, S22 |
| Z02 Unvollständig, auch Erstzulassung fehlt | D2, D5, D8, M2, M8, M11 | S18, S19 |
| Z03 Ungeeignet (beide besetzt, Streng-Modus, Kopplung) | D2, D5, D8, M2, M8, M11 | S18, S19 |
| Z04 „Wird aktualisiert“, Regler verändert | D8, M11 | S19, S21 |
| Z05 Fehler je Bereich | D8, M11 | S16 |
| Z06 Feldfehler und Feldwarnung | D8, M4, M11 | S17 |
| Z07 Speicher voll | D8, M11 | S16 |
| Z08 Update-Hinweis | D8, M11 | S23 |
| Z09 Installationshinweis iOS | D8, M11 | S23 |
| Z10 Export-Erinnerung | D7, D8, M10, M11 | S22 |
| Z11 Import-Fehler, Z12 Import-Auswahl | D7, D8, M10, M11 | S22 |
| Z13 „Ohne Garantie“, Z17 Budget überschritten | D5, D6, D8, M9, M11 | S20 |
| Z14 Annahme, Z15 geändert, Z16 Pflichteingabe fehlt | D4, D8, M7, M11 | S17 |
| Z18 Erster Start | D8, M11 | S23 |
| Z19 Löschen bestätigen | D8, M11 | S18, S22 |
| Z20 Gebraucht-Zweig mit Restgarantie | D8, M11 | S18 |
| Z21 Garantiewerte prüfen | D8, M11 | S18 |
| Z22 Erstzulassung nach dem Stichtag | D8, M11 | S18 |

## Texte

Alle Texte aus den Mockups stehen in `src/i18n/de.json`. Die Namespaces folgen den Bereichen: `common` (Rahmen, Navigation, Aktionen, Ampel, Einheiten, Hinweise, Prüfmeldungen, Monate, Wochentage), `fahrprofil`, `kandidaten`, `parameter`, `ergebnis`, `szenarien`. Zahlen stehen nie im Text, sondern kommen als Platzhalter (`{{value}}`) und werden über `src/i18n/format.ts` formatiert. Beispielwerte aus den Mockups (Modell A, 27.012 €) sind keine Texte.

Phase 5 ergänzt Schlüssel, wo ein Schritt mehr Text braucht als die Mockups zeigen, und entfernt keine Schlüssel eines anderen Bereichs.
