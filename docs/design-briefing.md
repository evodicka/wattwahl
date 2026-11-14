# Wattwahl – Design-Briefing für Claude Design (D1)

Nov 14, 2026 · @Eduard Vodicka · Status: Entwurf zur Freigabe

Dieses Briefing ist die Eingabe für Claude Design in den Schritten D2 (Design-System) und D3 (Mockups). Es fasst Spezifikation und Architektur 8.8 zusammen und ersetzt sie nicht: Bei Abweichungen gilt die Spezifikation. Feldnamen und Einheiten sind die der Spezifikation, die technischen Schlüssel stehen in `src/domain/schema.ts`.

## 1. Produkt in drei Sätzen

Wattwahl ist eine Entscheidungshilfe für einen Haushalt mit einem Bestands-Verbrenner, der ein E-Auto dazukauft oder least. Die App zeigt, welcher Kandidat die Flotte über die Vergleichsdauer am wenigsten kostet und ob seine Reichweite auf beiden Arbeitswegen in jedem Monat reicht. Alles läuft lokal im Browser, es gibt keine Konten und keinen Server.

**Wer benutzt sie:** Eine Person, die Zahlen von der EV Database abtippt, vergleicht und danach entscheidet. Sie arbeitet mit dem Handy auf dem Sofa und am Desktop zum Vergleichen. Sie ist kein Fachmann, braucht aber Zahlen, denen sie trauen kann.

**Tonalität:** sachlich, ruhig, nachvollziehbar. Eine Rechenhilfe, kein Verkaufsportal. Keine Gewichtung, kein Punkteranking, keine Empfehlungsgrafik. Spannen statt Scheingenauigkeit.

## 2. Rahmenbedingungen

| Thema | Vorgabe | Quelle |
| --- | --- | --- |
| Breiten | Handy 390 px, Desktop 1280 px, Umbruch bei 900 px | Spezifikation „Gestaltung“, Architektur 8.8 |
| Layout Desktop (ab 900 px) | Seitenleiste links, Inhalt in zwei Spalten | Architektur 8.8 |
| Layout Handy (unter 900 px) | Eine Spalte, untere Navigationsleiste mit fünf Bereichen | Architektur 8.8 |
| Bedienhöhe | Alle Bedienelemente am Handy mindestens 44 px hoch | Spezifikation „Gestaltung“ |
| Zahlenfelder | Einheit am Feldende, passende Tastatur, Eingabe mit Komma oder Punkt | Spezifikation „Eingabe“, „Validierung“ |
| Farbschema | Hell und Dunkel nach Systemeinstellung, kein Umschalter in der App | Spezifikation „Gestaltung“ |
| Kontrast | WCAG AA für alle Text-Hintergrund-Paare, in Hell und Dunkel | Spezifikation, Barrierefreiheit |
| Ampel | Grün, Gelb, Rot, nie allein über Farbe: immer mit Symbol oder Zahl | Spezifikation „Darstellungsregeln“ |
| Ampelfarben | Vom Nutzer einstellbar, überschreiben die Tokens zur Laufzeit. Das Design muss mit beliebigen Farben lesbar bleiben (Symbol und Zahl tragen die Information). | Architektur 8.8 |
| Sprache | Deutsch, Dezimalkomma, Tausenderpunkt, Euro. Texte stehen in einer Sprachdatei, das Layout muss längere Texte verkraften. | Spezifikation „Gestaltung“ |
| Zahlenformat | Kosten in vollen Euro, Reserve in ganzen km, Verbrauch mit einer Nachkommastelle | Spezifikation „Darstellungsregeln“ |
| Diagramme | SVG, jedes Diagramm mit Tabellen- oder Textalternative | Architektur 8.9 |
| Bedienung | Per Tastatur bedienbar, sichtbarer Fokus, Beschriftungen für Screenreader | Spezifikation, nicht-funktionale Anforderungen |
| Technik | Keine externen Schriften oder Dienste zur Laufzeit. Systemschrift oder eingebundene Schrift. | Spezifikation „Technik“, Architektur 8.11 |
| Speichern | Jede Eingabe wird sofort gespeichert, es gibt keinen „Speichern“-Knopf | Spezifikation „Bedienung“ |

**Pflichtangaben auf jeder Ergebnisansicht:** Szenario, Preisfall, Vergleichsdauer und Stand der Berechnung.

## 3. Navigation und Bereiche

Fünf Bereiche, überall erreichbar, aktiver Bereich markiert.

| Nr | Bereich | Route | Inhalt |
| --- | --- | --- | --- |
| 1 | Fahrprofil | `#/fahrprofil` | Bestandsfahrzeug, Arbeitsstätte A, Arbeitsstätte B, Zusatzstrecke |
| 2 | Kandidaten | `#/kandidaten`, `#/kandidaten/:id` | Liste mit Karten, Formular je Kandidat, Leasingangebote |
| 3 | Parameter | `#/parameter` | Alle Rechenparameter mit Standardwert und Zurücksetzen je Feld, Preise und Preissteigerung |
| 4 | Ergebnis | `#/ergebnis`, `#/ergebnis/:offerId` | Ergebnistabelle, sechs Ansichten, Preis-Regler |
| 5 | Szenarien und Daten | `#/szenarien` | Szenarioliste, Szenariovergleich, Export, Import, Hinweis zum letzten Export |

Zusätzlich im Rahmen: Name des aktiven Szenarios (Wechsel in Bereich 5) und ein Statusplatz für „wird aktualisiert“, Update-Hinweis und Export-Erinnerung.

## 4. Felder je Bereich

Jedes Feld nennt seine Einheit. Pflichtfelder sind markiert. Validierung beim Verlassen des Feldes: Fehler (blockiert die Berechnung des betroffenen Kandidaten) und Warnung (blockiert nicht) sind optisch zu unterscheiden.

### 4.1 Fahrprofil

**Bestandsfahrzeug (Verbrenner)**

| Feld | Einheit | Regel |
| --- | --- | --- |
| Name | Text | Pflicht |
| Verbrauch Stadt, Land, Autobahn | l/100 km | je > 0 |
| Aktuelle Laufleistung | km | ≥ 0. Daneben anzeigen: geplante Laufleistung am Ende der Vergleichsdauer (nur Anzeige) |
| Wartung und Reifen | €/km | ≥ 0 |
| Benzinpreis Minimum, Mittel, Maximum | €/l | Min ≤ Mittel ≤ Max |
| Preissteigerung Benzin | % pro Jahr | Standard 0 |

**Arbeitsstätte A und B** (zwei gleich aufgebaute Blöcke, farblich oder durch Buchstaben unterscheidbar)

| Feld | Einheit | Regel |
| --- | --- | --- |
| Name | Text | Pflicht |
| Weg Stadt, Land, Autobahn | km, einfache Strecke | je ≥ 0, Summe > 0. Summe anzeigen, Hin- und Rückweg werden verdoppelt |
| Besuchte Wochentage | Mo bis So, Mehrfachauswahl | mindestens ein Tag |
| Freie Tage pro Jahr | Tage | 0 bis Arbeitstage |
| Kostenloses Laden vor Ort | Ja oder Nein | Schalter |

**Zusatzstrecke**

| Feld | Einheit | Regel |
| --- | --- | --- |
| Kilometer pro Monat in Stadt, Land, Autobahn | km | je ≥ 0, in jedem Monat gleich, darf 0 sein |

### 4.2 Kandidaten

**Liste:** Karten mit Name, Zustand (neu oder gebraucht), Kaufpreis, Anzahl Leasingangebote und Status (vollständig, unvollständig mit Grund, ungeeignet mit Grund). Aktionen: Neu (leere Vorlage), Duplizieren, Löschen mit Bestätigung. Unvollständige und ungeeignete Kandidaten bleiben in der Liste.

**Formular, Gruppen in dieser Reihenfolge**

| Gruppe | Felder | Einheit | Regel |
| --- | --- | --- | --- |
| Allgemein | Name, Notiz | Text | Name Pflicht |
| Allgemein | Zustand | neu oder gebraucht | Pflicht |
| Allgemein | Erstzulassung | Monat und Jahr | nur bei gebraucht |
| Allgemein | Laufleistung | km | neu: 0, gebraucht: ≥ 0 |
| Akku | Netto-Akkukapazität | kWh | > 0, Warnung über 200 |
| Akku | SoH aktuell | % | optional, nur gebraucht, 50 bis 100 |
| Reichweite | Stadt mild, Stadt kalt | km | > 0 |
| Reichweite | Autobahn mild, Autobahn kalt | km | > 0 |
| Reichweite | Kombiniert mild, Kombiniert kalt | km | > 0, Warnung wenn kalt > mild |
| Garantie | Fahrzeuggarantie: Restjahre, Restkilometer | Jahre, km | 0 = abgelaufen |
| Garantie | Akkugarantie: Restjahre, Restkilometer | Jahre, km | 0 = abgelaufen |
| Preis | Kaufpreis | € | Pflicht, > 0 |
| Preis | Wertverlust (überschreibt Standard) | % pro Jahr | optional |
| Preis | Wartung und Reifen (überschreibt Standard) | €/km | optional |
| Leasing | 0 bis 4 Leasingangebote (siehe unten) | | je Stufe höchstens eines |

Die sechs Reichweitenfelder bilden das Schema der EV Database ab: drei Straßenarten mal mild und kalt. Als Raster (3 × 2) darstellen, nicht als sechs lose Felder.

**Leasingangebot** (Karte oder Zeile je Stufe, hinzufügen und entfernen)

| Feld | Einheit | Regel |
| --- | --- | --- |
| Stufe | km pro Jahr | vorbelegt 10.000, 15.000, 20.000, 25.000, änderbar |
| Monatliche Rate | € | > 0 |
| Geplante Laufzeit | Monate | > 0 |
| Anzahlung | € | ≥ 0, einmalig |
| Mehrkilometerpreis | €/km | ≥ 0 |
| Minderkilometer-Erstattung | €/km | ≥ 0 |

**Formular am Handy in vier Schritten:** Allgemein, Akku und Reichweite, Garantie, Leasing (Preis gehört zu Allgemein oder Schritt 1). Fortschrittsanzeige, Zurück und Weiter, Sprung zu einem Fehler. **Am Desktop** stehen alle Gruppen untereinander, ein Sprungmenü zu den Gruppen ist willkommen.

### 4.3 Parameter

Alle Parameter mit Standardwert, Einheit, Hinweis. Ein geänderter Standardwert ist markiert, jedes Feld hat „Zurücksetzen“. Parameter, deren Standard ein Platzhalter ist, tragen die Markierung „Annahme“. Gruppen vorschlagen: Vergleich und Laden, Akku und Alterung, Temperatur, Fahrverhalten, Preise, Optimierung, Darstellung, Gerät.

| Parameter | Standard | Einheit | Annahme |
| --- | --- | --- | --- |
| Vergleichsdauer | 48 | Monate (höchstens 1.200) | |
| Untere, obere Ladegrenze | 10, 80 | % | |
| Sicherheitspuffer | 10 | % | ja |
| SoH-Untergrenze | 85 | % | |
| Kilometer bis zur SoH-Untergrenze | 200.000 | km | ja |
| SoH-Bezug der Eignungsprüfung | Ende der Vergleichsdauer | Auswahl: Ende oder Start | |
| Ladewirkungsgrad | 90 | % | ja |
| Bezugstemperatur kalt, mild | −10, 23 | °C | ja |
| Monatstemperaturen (zwölf Werte) | Jan 1, Feb 2, Mär 5, Apr 9, Mai 14, Jun 17, Jul 19, Aug 19, Sep 15, Okt 10, Nov 5, Dez 2 | °C | ja |
| Kältereserve ΔT | 5 | K | ja |
| Autobahn-Abschlag | 12 | % | ja |
| Ampel grün ab Reserve | 15 | % | |
| Ampelfarben Grün, Gelb, Rot | Theme-Farben | Farbwahl, mit Zurücksetzen | |
| Wertverlust | 15 | % pro Jahr | ja |
| Wartung und Reifen E-Auto, Verbrenner | Pflichteingabe | €/km | |
| Benzinpreis Minimum, Mittel, Maximum | Pflichteingabe | €/l | |
| Heimstrompreis Minimum, Mittel, Maximum | Pflichteingabe | €/kWh | |
| Preissteigerung Benzin, Strom | 0 | % pro Jahr | |
| Arbeitswochen pro Jahr | 52 | Wochen | |
| Freie Tage je Arbeitsstätte | 30 | Tage pro Jahr | ja |
| Zuordnung der Zusatzstrecke | frei optimiert | Auswahl, Alternative: fester E-Auto-Anteil in % | |
| Anteilsschritt Zusatzstrecke | 10 | % | |
| Streng-Modus | aus | Schalter | |
| Garantie-Budget als Ziel | an | Schalter | |
| Kilometerraster der Optimierung | 250 | km pro Jahr | |
| Export-Erinnerung | 14 | Tage (Geräteeinstellung, nicht im Export) | |

Pflichteingaben ohne Standardwert brauchen einen eigenen leeren Zustand mit Hinweis, dass ohne sie nicht gerechnet wird.

### 4.4 Ergebnis

Siehe Abschnitt 5.

### 4.5 Szenarien und Daten

| Element | Inhalt |
| --- | --- |
| Szenarioliste | Name, aktives Szenario markiert, Aktionen: Anlegen (leer oder als Kopie), Umbenennen, Duplizieren, Löschen mit Bestätigung, Auswahl für den Vergleich |
| Szenariovergleich | Gesamtkosten je Kandidat in zwei oder mehr gewählten Szenarien, Balken nebeneinander |
| Export | Alle Szenarien oder eines, Datei mit Schemaversion und Datum im Namen |
| Import | Datei wählen, Prüfung, Wahl „ersetzen“ oder „als neue Szenarien hinzufügen“. Bei Fehlern wird die Stelle genannt, nichts wird überschrieben. |
| Hinweis zum letzten Export | Datum des letzten Exports, Export-Erinnerung nach 14 Tagen (einstellbar) |

## 5. Ergebnisansichten

Alle Ansichten zeigen Szenario, Preisfall, Vergleichsdauer und Stand der Berechnung. Ein Preisfall-Umschalter (Mittel, „E-Auto günstig“, „E-Auto ungünstig“, Regler-Szenario) gilt für den ganzen Bereich.

### 5.1 Ergebnistabelle

Eine Zeile je Angebot (Kauf oder Leasingstufe). Klick auf eine Zeile öffnet die Detailansichten (`#/ergebnis/:offerId`).

| Spalte | Inhalt |
| --- | --- |
| Kandidat | Name |
| Angebot | Kauf oder Leasing mit Stufe |
| Eignung | geeignet, ungeeignet, unvollständig, jeweils mit Symbol |
| Gesamtkosten (Mittel) mit Spanne | volle Euro, Spanne „E-Auto günstig“ bis „E-Auto ungünstig“ |
| Kleinste Reichweitenreserve | km und % mit Weg und Monat, nur über Wege, die das E-Auto fährt. Fährt es nie, steht kein Wert da. |
| E-Auto-Kilometer pro Jahr | km |
| Geplante Laufleistung des Verbrenners am Ende | km |
| Garantie-Status | Ampel mit Symbol, auch „ohne Garantie“ |

Sortierung aufsteigend nach Kosten. **Ungeeignete Angebote stehen am Ende, ausgegraut, mit Grund** (Weg, Monat, fehlende Reserve in km). Unvollständige Angebote nennen die fehlenden Felder. Am Handy: Tabelle als Kartenliste oder horizontal scrollbar, die Kostenzahl bleibt immer sichtbar.

### 5.2 Die sechs Ansichten

| Ansicht | Inhalt | Darstellung |
| --- | --- | --- |
| Kostenvergleich | Gesamtkosten der Flotte über die Vergleichsdauer, aufgeteilt in Anschaffung oder Leasing, Strom, Benzin, Wartung und Reifen | Gestapelte Balken je Angebot, aufsteigend sortiert. Ein Strich zeigt die Spanne von „E-Auto günstig“ bis „E-Auto ungünstig“. Daneben dieselben Werte als Tabelle. |
| Reichweitenreserve | Reserve in km und % je Weg (A, B) und Monat, SoH am Ende der Vergleichsdauer | Heatmap 2 × 12 mit Ampelfarbe, Symbol und Zahl in der Zelle, ein Kandidat per Auswahl. Am Handy horizontal scrollbar. |
| Zuordnungsplan | Welches Auto fährt je Wochentag, Monat und Anwesenheitszustand zu welcher Arbeitsstätte | Raster Wochentag × Monat, je Zelle drei Zeilen (beide besetzt, nur A, nur B) mit „E→A“, „E→B“ oder „E ruht“. Winterwechsel hervorgehoben. |
| Garantie | Jahresbudget in km, geplante E-Auto-Kilometer, Jahre bis zur Kilometergrenze gegenüber der Restgarantie | Kachel mit Ampel und „Mehrkosten durch Garantie-Budget“ |
| Rechenweg | Zwischenwerte je Angebot: Reichweiten je Monat, Verbrauch in kWh/100 km, Energie pro Tag, Jahresmengen, Preisfaktoren | Aufklappbar, jede Zahl mit Formelverweis |
| Szenariovergleich | Gesamtkosten je Kandidat in zwei oder mehr Szenarien | Nebeneinanderliegende Balken je Kandidat |

Der Szenariovergleich liegt inhaltlich in Bereich 5 und kann im Ergebnis-Bereich verlinkt sein. Das Mockup entscheidet, wo er wohnt.

### 5.3 Preis-Regler

- Vier Regler: Benzinpreis, Heimstrompreis, Preissteigerung Benzin, Preissteigerung Strom.
- Die Berechnung läuft bei jeder Änderung sofort neu, der alte Stand bleibt als „wird aktualisiert“ markiert sichtbar.
- „Als Szenario speichern“ legt die geänderten Preise als neues Szenario ab.
- Der Zustand „Regler verändert, nicht gespeichert“ muss erkennbar sein, mit „Zurücksetzen“.

## 6. Zustände, die gestaltet werden müssen

| Nr | Zustand | Wo | Anmerkung |
| --- | --- | --- | --- |
| Z01 | Leer | Kandidatenliste, Ergebnis, Szenarioliste | Erste Schritte nennen, nicht nur „Keine Daten“ |
| Z02 | Unvollständig | Kandidatenkarte, Ergebniszeile | Nennt die fehlenden Felder, blockiert nur diesen Kandidaten |
| Z03 | Ungeeignet | Kandidatenkarte, Ergebniszeile, Detail | Grund: Weg, Monat, fehlende Reserve in km. Drei Arten: beide besetzt, Streng-Modus, Kopplung mit dem SoH |
| Z04 | „Wird aktualisiert“ | Ergebnis und Preis-Regler | Letztes Ergebnis bleibt sichtbar, Markierung statt Sperre |
| Z05 | Fehler je Bereich | Alle fünf Bereiche | Ein Fehler in einer Ansicht lässt die anderen bedienbar, mit „Erneut versuchen“ |
| Z06 | Feldfehler und Feldwarnung | Alle Formulare | Fehler blockiert, Warnung blockiert nicht, beide mit Text und Symbol |
| Z07 | Speicher voll | Rahmen | Hinweis mit Weg zum Export |
| Z08 | Update-Hinweis | Rahmen | „Neue Version verfügbar“ mit Aktualisieren |
| Z09 | Installationshinweis für iOS | Erster Start | Erklärt Home-Bildschirm und warum (Safari löscht nach etwa sieben Tagen ohne Nutzung) |
| Z10 | Export-Erinnerung | Rahmen, Szenarien | Nach 14 Tagen ohne Export, schließbar |
| Z11 | Import-Fehler | Szenarien und Daten | Nennt die betroffene Stelle, bestätigt, dass nichts überschrieben wurde |
| Z12 | Import-Auswahl | Szenarien und Daten | „ersetzen“ oder „als neue Szenarien hinzufügen“, Ersetzen mit Warnung |
| Z13 | „Ohne Garantie“ | Garantie-Kachel, Ergebnistabelle | Kein Budget, kein Fehler |
| Z14 | Annahme-Markierung | Parameter, Rechenweg | Standardwert ist ein Platzhalter und muss geprüft werden |
| Z15 | Geänderter Standardwert | Parameter | Markierung plus „Zurücksetzen“ |
| Z16 | Pflichteingabe fehlt | Parameter, Fahrprofil | Preise und Wartungskosten haben keinen Standardwert |
| Z17 | Garantie-Budget überschritten | Garantie-Kachel, Warnung | Warnung mit Jahren bis zur Kilometergrenze, Angebot bleibt im Vergleich |
| Z18 | Erster Start | Rahmen | Leeres Szenario, Hinweis auf Beispielwerte und Annahmen |
| Z19 | Löschen bestätigen | Kandidat, Szenario, Leasingangebot | Bestätigungsdialog |
| Z20 | Gebraucht-Zweig | Kandidatenformular | Zusatzfelder Erstzulassung und SoH erscheinen nur bei „gebraucht“ |

## 7. Beispielwerte für die Mockups

Die Mockups zeigen realistische Zahlen, keine Platzhalter wie „123“. Preise in den Beispielen sind frei gewählt, keine Marktdaten.

- **Kandidat A:** 60 kWh netto, neu, Kaufpreis 40.000 €. Reichweite mild: Stadt 420, Autobahn 300, kombiniert 360 km. Kalt: Stadt 300, Autobahn 220, kombiniert 260 km. Garantie Fahrzeug 3 Jahre / 100.000 km, Akku 8 Jahre / 160.000 km (Budget 20.000 km pro Jahr).
- **Kandidat B:** gebraucht, 80.000 km, SoH 92 %, Fahrzeuggarantie 0 Jahre / 0 km, Akku 3 Jahre / 60.000 km. Für „ohne Garantie“ zusätzlich ein Fall mit beiden Garantien abgelaufen.
- **Weg A:** 10 km Stadt, 15 km Land, 35 km Autobahn (60 km einfach). Wochentage Mo bis Fr, 30 freie Tage. **Weg B:** Di und Do, 10 freie Tage.
- **Verbrenner:** 8,0 / 6,0 / 7,0 l/100 km, Benzin 1,90 €/l, Laufleistung 120.000 km, 8.000 km pro Jahr, geplant am Ende 152.000 km. Strom 0,30 €/kWh.
- **Eignung Januar (Testfall 1):** Reserve 31,1 km (25,9 %), Ampel grün. Mit Laden vor Ort (Testfall 2): 91,1 km (151,9 %).
- **Leasing (Testfall 8):** Rate 399 €, Anzahlung 2.000 €, 36 Monate, Stufe 15.000 km, 18.000 km E-Auto, Mehrkilometer 0,08 €/km, zusammen 17.084 €.
- **Kosten pro Tag (Testfall 4 und 5):** E-Auto 10,00 € ohne und 5,00 € mit Laden vor Ort, Verbrenner 15,77 €.
- **Plan (Testfall 16):** Montag beide besetzt „E→B“, nur A besetzt „E→A“. Winterwechsel: Januar „E ruht“ (Testfall 12).
- **Ungeeignet (Testfall 11):** Montag, Januar, beide Reserven negativ.
- **Garantie (Testfall 10):** Budget 20.000 km pro Jahr, Kostenoptimum bei 24.000 km, Mehrkosten sichtbar.
- Mindestens drei Angebote in der Ergebnistabelle: eines geeignet, eines ungeeignet, eines unvollständig.

## 8. Lieferumfang

**D2 – Design-System (Artefakt vom Typ Design System)**

- Tokens: Farben in Hell und Dunkel, Ampelfarben, Typografie, Abstände, Radien, Bedienhöhen. Jedes Token mit Namen als Custom Property, die in `src/ui/theme.css` übernommen werden können.
- Grundkomponenten: Zahlenfeld mit Einheit, Auswahl, Schalter, Karte, Tabelle, Navigation (Seitenleiste und untere Leiste), Hinweis- und Fehlermeldung, Ampel-Kennzeichen.
- Jede Text-Hintergrund-Kombination der Tokens muss WCAG AA erreichen. Die Ampel ist zusätzlich ohne Farbe unterscheidbar.

**D3 – Mockups (Design-Artefakt auf Basis von D2)**

- Alle fünf Bereiche bei 1280 px und bei 390 px, mit den Zuständen aus Abschnitt 6.
- Handy-Formular des Kandidaten in vier Schritten, Desktop-Formular untereinander.
- Die sechs Ergebnisansichten, die Ergebnistabelle und der Preis-Regler mit den Beispielwerten aus Abschnitt 7.
- Kein Eingabefeld ist bei 390 px abgeschnitten.
- Jede Ergebnisansicht nennt Szenario, Preisfall, Vergleichsdauer und Stand der Berechnung.
- Jedes Mockup trägt die Kennung des Prüflistenpunkts (Spalte „Mockup“ unten).

## 9. Prüfliste: Spezifikation gegen Briefing

Jede Zeile der Tabellen „Bedienung“ und „Auswertung und Visualisierung“ sowie die Aufzählungen darunter verweisen auf einen Abschnitt dieses Briefings. Die Spalte „Mockup“ füllt D3.

| Nr | Zeile der Spezifikation | Briefing | Mockup |
| --- | --- | --- | --- |
| P01 | Bedienung: Fahrprofil | 4.1 | |
| P02 | Bedienung: Kandidaten | 4.2 | |
| P03 | Bedienung: Parameter | 4.3 | |
| P04 | Bedienung: Ergebnis | 5.1 bis 5.3 | |
| P05 | Bedienung: Szenarien und Daten | 4.5 | |
| P06 | Auswertung: Kostenvergleich | 5.2 | |
| P07 | Auswertung: Reichweitenreserve | 5.2 | |
| P08 | Auswertung: Zuordnungsplan | 5.2 | |
| P09 | Auswertung: Garantie | 5.2, Z13, Z17 | |
| P10 | Auswertung: Rechenweg | 5.2, Z14 | |
| P11 | Auswertung: Szenariovergleich | 5.2, 4.5 | |
| P12 | Ergebnistabelle (Spalten, Sortierung, ausgegraut, Klick) | 5.1, Z02, Z03 | |
| P13 | Preis-Simulation (Regler, sofortige Neuberechnung, als Szenario speichern) | 5.3, Z04 | |
| P14 | Darstellungsregeln: Farben und Ampelschwellen einstellbar, Ampel nie nur Farbe | 2, 4.3 | |
| P15 | Darstellungsregeln: Zahlenformate | 2 | |
| P16 | Darstellungsregeln: Szenario, Preisfall, Dauer, Stand | 2, 5 | |
| P17 | Eingabe: Gruppen nach EV Database, Einheit je Feld | 4.2 | |
| P18 | Eingabe: Vorlage, Duplizieren | 4.2 | |
| P19 | Eingabe: Handy in Schritten, Desktop untereinander | 4.2 | |
| P20 | Eingabe: ungeeignete und unvollständige Kandidaten bleiben mit Grund | 4.2, Z02, Z03 | |
| P21 | Eingabe: Parameter änderbar, Änderung markiert | 4.3, Z15 | |
| P22 | Szenarien: Anlegen, Umbenennen, Duplizieren, Löschen mit Bestätigung | 4.5, Z19 | |
| P23 | Szenarien: Vergleich von zwei oder mehr Szenarien | 4.5, 5.2 | |
| P24 | Gestaltung: Umbruch 900 px, Seitenleiste, untere Navigation | 2, 3 | |
| P25 | Gestaltung: 44 px, Einheit am Feldende | 2 | |
| P26 | Gestaltung: Hell und Dunkel, WCAG AA | 2, 8 | |
| P27 | Gestaltung: Deutsch, Dezimalkomma, Sprachdatei | 2 | |
| P28 | Datenübertragung: Export, Import, Auswahl, Fehlermeldung, Erinnerung | 4.5, Z10 bis Z12 | |
| P29 | Plattformgrenzen: Installationshinweis iOS, Speicher voll | Z07, Z09 | |
| P30 | Offline und Updates: Update-Hinweis | Z08 | |
| P31 | Transparenz der Annahmen | 4.3, Z14 | |
| P32 | Robustheit: Fehler je Bereich, Feldvalidierung | Z05, Z06 | |

## 10. Offene Punkte

- Der Nutzer liest das Briefing gegen und gibt es frei (Validierung D1).
- Die Feldnamen sind mit `src/domain/schema.ts` abgeglichen: Jedes Feld aus Abschnitt 4 hat dort einen Schlüssel, das Schema führt keine zusätzlichen Eingabefelder. Spätere Abweichungen gehen zurück an die Spezifikation, nicht ins Design.
- Ob der Szenariovergleich im Ergebnis-Bereich wohnt oder nur unter „Szenarien und Daten“, entscheidet das Mockup (P11).
- Die Gruppierung der Parameter in Abschnitt 4.3 ist ein Vorschlag, die Spezifikation legt sie nicht fest.
