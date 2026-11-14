# Wattwahl – Implementierungsplan

Nov 14, 2026 · @Eduard Vodicka

Wattwahl entsteht in 30 Schritten über sieben Phasen: 26 Umsetzungsschritte S01 bis S26 und vier Design-Schritte D1 bis D4. Rechenkern und Claude Design laufen parallel, die Oberfläche wird erst nach der Design-Freigabe gebaut. Grundlage sind die Doc und die Doc. Dieser Plan legt nur Reihenfolge, Umfang und Prüfung fest, das Wie steht in den beiden Dokumenten.

## Arbeitsweise

Jeder Schritt ist eine abgeschlossene Aufgabe für einen Agenten und endet mit einem grünen Pull Request, den der Nutzer prüft und auf den Hauptzweig merged. Ein Schritt gilt erst als fertig, wenn alle Punkte unten erfüllt sind.

**Regeln für jeden Schritt**

- Die Spezifikation ist fachlich verbindlich, die Architekturdokumentation technisch. Findet ein Agent einen Widerspruch oder eine Lücke, stoppt er und fragt nach, statt im Code zu entscheiden.
- Ein Schritt = ein Branch und ein Pull Request. Er ändert nur die Module, die der Schritt nennt. Der Agent merged nie selbst: Der Nutzer prüft jeden Pull Request und merged ihn.
- Code, Code-Kommentare, Commit-Nachrichten, README und Entwickler-Dokumentation sind auf Englisch. Fachbegriffe folgen dem Glossar (Kapitel 12 der Architektur).
- Oberflächentexte sind auf Deutsch und stehen nur in der Sprachdatei.
- Jeder Testfall, jede Qualitätsanforderung (Q1 bis Q11) und jede Formel trägt im Test ihre Kennung aus Spezifikation oder Architektur, damit die Abdeckung nachprüfbar ist.

**Definition of Done**

1. Lint (inklusive Importgrenzen), Typprüfung, alle Tests und der Build laufen lokal und im CI grün.
2. Die Validierung des Schritts ist erfüllt, die Ergebnisse stehen im Pull Request (Testnamen, Messwerte, Screenshots).
3. Kein bestehender Test wurde abgeschwächt oder entfernt, um grün zu werden.
4. Neue offene Punkte stehen im Pull Request und werden vor dem nächsten abhängigen Schritt geklärt.

## Vor dem Start

Zwei Punkte legt der Nutzer fest, bevor Schritt S01 beginnt. Beide sind später nur mit Datenverlust oder Mehraufwand änderbar.

- [ ] Name und Besitzer des öffentlichen GitHub-Repositorys. Der Name bestimmt die Pages-Adresse und damit den Origin des Browser-Speichers (Architektur 2.1 und 7.2).
- [ ] Zugang zu Claude Design für Phase 3 und eine Person, die die Mockups freigibt.

## Ablauf

Nach Phase 0 starten drei Spuren gleichzeitig: Rechenkern, Design und App-Infrastruktur. Die Oberfläche beginnt erst, wenn das Design freigegeben (G3) und der Worker angebunden ist (S14).

&#91;embedded content: Fahrplan · 3 Spuren, 7 Phasen, 4 Freigaben\]

Claude Design arbeitet in D2 und D3, also parallel zu Phase 1 und 2. So liegen freigegebene Mockups vor, bevor der erste Bildschirm gebaut wird.

## Phase 0 – Fundament

Am Ende von Phase 0 veröffentlicht die Pipeline eine leere App auf GitHub Pages, und die Schichtgrenzen werden vom Lint erzwungen.

### S01 · Projektgerüst und Schichtgrenzen

**Aufgaben**

- Projekt mit dem Stack aus Architektur 4.2 anlegen, exakt gepinnte Abhängigkeiten (2.2).
- Die acht Module aus Kapitel 5 als leere Ordner mit öffentlicher Einstiegsdatei anlegen.
- Lint- und Formatregeln einrichten: Importgrenzen nach dem Bausteindiagramm und die Verbote für den Rechenkern aus 8.4.
- README auf Englisch mit Projektname „Wattwahl“, Zweck, lokalem Start und Verweis auf Spezifikation und Architektur.

**Validierung**

- Lint, Typprüfung, ein Platzhalter-Test und der Build laufen grün.
- Test-Fixtures für die Lint-Regeln: ein Import von `src/ui` nach `src/core` (Q11) und je ein verbotener Ausdruck im Kern (`Math.pow`, `**`, `Date`, `Math.random`) lassen den Lint fehlschlagen. Ein erlaubter Import von `src/core` nach `src/domain` bleibt grün.
- Die Ordnerstruktur entspricht Tabelle 5.1.

**Voraussetzung:** Punkte aus „Vor dem Start“

### S02 · Pipeline und Veröffentlichung

**Aufgaben**

- GitHub-Actions-Workflow mit den sechs Stufen aus 7.1, Veröffentlichung nur vom Hauptzweig.
- GitHub Pages mit Quelle „GitHub Actions“, fester Basispfad nach 7.2.
- Ein erster End-to-End-Rauchtest in Chromium, Firefox und WebKit: Die App lädt unter dem Basispfad.

**Validierung**

- Ein Push auf den Hauptzweig veröffentlicht die App, die Seite ist unter der Pages-Adresse erreichbar.
- Ein absichtlich roter Test in einem Pull Request bricht die Pipeline vor der Veröffentlichung ab.
- Ein Push auf einen anderen Zweig veröffentlicht nichts.

**Voraussetzung:** S01

### Freigabe G1 · Pipeline steht

Der Nutzer öffnet die Pages-Adresse und bestätigt, dass die Adresse die endgültige ist.

## Phase 1 – Domäne

Phase 1 legt das Datenmodell fest, auf dem Rechenkern, Speicher und Oberfläche aufbauen. Danach können Phase 2 und Phase 4 parallel laufen.

### S03 · Schemas und Standardwerte

**Aufgaben**

- Alle Entitäten aus dem Abschnitt Datenmodell der Spezifikation als Speicherschema und als strenges Rechenschema abbilden (Architektur 8.1, 8.6).
- Standardwerte der Parameterliste mit Kennzeichen Platzhalter, Pflichteingabe oder fest.
- Ableitung der Angebots-ID für Kauf und Leasingstufen, Schemaversion 1.
- Geräteeinstellungen (aktives Szenario, Exportdatum, Erinnerungsintervall, Farben, Erststart) getrennt vom Szenario.

**Validierung**

- Ein tabellengetriebener Test prüft jede Zeile der Parameterliste: Wert, Einheit und Kennzeichen stimmen mit der Spezifikation überein.
- Das leere Vorlagen-Szenario besteht das Speicherschema, aber nicht das Rechenschema.
- Ein vollständiger Kandidat aus den gemeinsamen Beispieldaten der Testfälle besteht beide Schemas.
- Grenzfälle aus der Spezifikation werden abgewiesen: Min > Mittel beim Preis, mehr als vier Leasingangebote, zwei Angebote derselben Stufe, Wegsumme 0.
- Keine parallel gepflegten Typdefinitionen neben den Schemas.

**Voraussetzung:** S01

### S04 · Eingabeprüfung und Warnungen

**Aufgaben**

- Dezimalzahlen mit Komma und Punkt einlesen, ungültige Eingaben als Fehler statt als ungültige Zahl.
- Plausibilitätswarnungen aus dem Abschnitt Validierung der Spezifikation als eigene, nicht blockierende Prüfung.

**Validierung**

- Testfall 15 (Teil Einlesen): „12,5“ und „12.5“ ergeben 12,5. Negative Zahl und leeres Pflichtfeld liefern eine Meldung.
- Je ein Test für jede Warnung: Kalt- über Mild-Reichweite, Kapazität über 200 kWh, Weg über 300 km. Warnungen ändern das Schema-Ergebnis nicht.

**Voraussetzung:** S03

### S05 · Migrationsgerüst

**Aufgaben**

- Migrationskette nach Architektur 8.2 mit Version 1 als Ausgangspunkt.
- Eine Beispieldatei je Schemaversion im Repository, beginnend mit Version 1.

**Validierung**

- Jede Beispieldatei läuft durch die Kette und besteht danach das Speicherschema.
- Ein Datensatz mit höherer Version als die App wird als „nur lesbar“ erkannt und nicht verändert.
- Ein Test-Migrationsschritt v1 → v2 (nur im Test) beweist, dass die Kette mehrere Schritte nacheinander anwendet.

**Voraussetzung:** S03

## Phase 2 – Rechenkern

Am Ende von Phase 2 bestehen alle 18 Testfälle der Spezifikation gegen den Kern, und die Laufzeit am Handy ist gemessen. Die Phase braucht keine Oberfläche und läuft parallel zu Phase 3 und 4.

### S06 · Deterministische Potenzfunktion

**Aufgaben**

- Potenzfunktion für ganzzahlige und Zwölftel-Exponenten nach Architektur 8.4 und ADR-10.

**Validierung**

- Property-Test gegen `Math.pow` mit relativer Toleranz 1e-12 über den Wertebereich, den die Formeln nutzen (Restwert, Preissteigerung).
- Identische Ausgabe in zwei Aufrufen derselben Eingabe (Bitvergleich).
- Eine Mikromessung der Laufzeit steht im Pull Request, als Basis für S11.

**Voraussetzung:** S01

### S07 · Formeln Reichweite, Alterung, Eignung, Energie

**Aufgaben**

- Abschnitte 1 bis 4 der Berechnungslogik, je eine Datei nach Architektur 5.2.
- Jede Funktion schreibt einen Rechenweg-Eintrag mit Formel-ID, Eingaben und Ergebnis.

**Validierung**

- Testfälle 1, 2, 3, 4, 5 und 6 bestehen mit der Toleranz aus Architektur 8.4.
- Property-Tests: Reichweite liegt immer zwischen Kalt- und Mild-Wert; SoH fällt nie unter die Untergrenze; bei Eignung ist die Reserve größer oder gleich 0.
- Jeder Testfall prüft zusätzlich, dass der Rechenweg die erwarteten Formel-IDs enthält.

**Voraussetzung:** S03, S06

### S08 · Formeln Arbeitstage, Zusatzstrecke, Preise, Gesamtkosten

**Aufgaben**

- Abschnitte 5 bis 8 der Berechnungslogik, inklusive Leasing-Fortschreibung bei abweichender Laufzeit und geplanter Laufleistung des Verbrenners.

**Validierung**

- Testfälle 7, 8, 9 und 17 bestehen mit Toleranz.
- Die Summe der Jahresanteile ergibt die Vergleichsdauer, auch bei D, das kein Vielfaches von 12 ist (zum Beispiel 30 Monate).
- Die erwarteten Tage aller Anwesenheitszustände plus „beide frei“ ergeben je Wochentag und Monat 52/12.

**Voraussetzung:** S07

### S09 · Optimierer

**Aufgaben**

- Algorithmus aus dem Abschnitt Optimierung der Spezifikation in den Schritten aus Architektur 5.2: Schwellen-SoH, Optionsmengen, dynamische Programmierung, Garantie-Budget, Auswahl mit Gleichstandsregel.
- Streng-Modus, fester Anteil der Zusatzstrecke und abschaltbares Garantie-Budget.
- Brute-Force-Referenz nur im Testordner.

**Validierung**

- Testfälle 10, 11, 12, 13, 16 und 18 bestehen.
- Q4: Dynamische Programmierung und Brute Force liefern auf zufälligen kleinen Fällen dieselben Kosten (Anzahl der Fälle: Platzhalter 1.000, CI-Lauf unter einer Minute).
- Gleichstandsregel: ein konstruierter Fall mit zwei kostengleichen Plänen wählt den mit größerer kleinster Reserve, danach den mit kürzerer E-Auto-Strecke.
- Die Brute-Force-Referenz ist nicht im Produktions-Build enthalten.

**Voraussetzung:** S08

### S10 · Angebotsrechnung und Ergebnis

**Aufgaben**

- Öffentliche Kernfunktion nach Architektur 5.1: ein Angebot je Preisfall, inklusive Preis-Regler-Fall.
- Prüfung jedes Kandidaten gegen das Rechenschema, Status „unvollständig“ mit Feldpfaden, Status „ungeeignet“ mit Grund.
- Ergebnis mit allen Feldern aus Schritt 6 des Algorithmus und den Spalten der Ergebnistabelle.

**Validierung**

- Q6: Ein Test läuft über alle Zahlen des Ergebnisses und findet zu jeder einen Rechenweg-Eintrag mit Formel-ID.
- Ein Szenario mit einem unvollständigen und einem vollständigen Kandidaten liefert für den zweiten ein normales Ergebnis.
- Q5 vorab in Node: Dieselbe Eingabe ergibt zweimal einen identischen Ergebnis-Hash.
- Der Rechenweg jedes Preisfalls zeigt die Preiskombination aus der Spezifikation: Mittel, „E-Auto günstig“ (Benzin Maximum, Strom Minimum), „E-Auto ungünstig“ (Benzin Minimum, Strom Maximum).

**Voraussetzung:** S09

### S11 · Früher Benchmark

**Aufgaben**

- Messszenario Q1 anlegen: 10 Kandidaten mit Kauf und 4 Leasingstufen, 3 Preisfälle.
- Laufzeit des Kerns in Node und im Browser messen, im Browser zusätzlich mit CPU-Drosselung als Handy-Näherung.
- Vorschläge für die offenen Werte aus Architektur Kapitel 11: Bundle-Budget und Anzahl der Fälle in Q4.

**Validierung**

- Messwerte von drei Läufen je Umgebung stehen im Pull Request, mit Median.
- Liegt der gedrosselte Wert über 5 s oder Desktop über 2 s, stoppt der Agent und legt die Maßnahmen aus der Risikotabelle zur Entscheidung vor.

**Voraussetzung:** S10

### Freigabe G2 · Rechenkern

Der Nutzer bestätigt die Messwerte, legt die offenen Werte fest und entscheidet, ob die Ausbaustufe „nur geänderte Angebote neu rechnen“ nötig ist.

## Phase 3 – Design mit Claude Design

Claude Design entwirft die Oberfläche parallel zum Rechenkern, direkt nach Phase 0. Es liefert ein Design-System und Mockups aller fünf Bereiche. Die Agenten bauen sie in Phase 5 nach. Bis zur Freigabe G3 schreibt kein Agent Oberflächen-Code außer dem Gerüst.

### D1 · Design-Briefing

**Ausführung:** Agent

**Aufgaben**

- Briefing für Claude Design aus Spezifikation und Architektur zusammenstellen: die fünf Bereiche mit allen Feldern und Einheiten, die sechs Ergebnisansichten, die Ergebnistabelle und der Preis-Regler.
- Alle Zustände auflisten, die gestaltet werden müssen: leer, unvollständig, ungeeignet, „wird aktualisiert“, Fehler je Bereich, Speicher voll, Update-Hinweis, Installationshinweis für iOS, Export-Erinnerung, Import-Fehler, „ohne Garantie“, Annahme-Markierung.
- Rahmenbedingungen aus Spezifikation (Gestaltung, Darstellungsregeln) und Architektur 8.8: Umbruch bei 900 px, Handy 390 px, Desktop 1280 px, 44 px Bedienhöhe, Hell und Dunkel, Ampel mit Symbol, WCAG AA, deutsche Texte mit Dezimalkomma.

**Validierung**

- Eine Prüfliste ordnet jede Zeile der Tabellen „Bedienung“ und „Auswertung und Visualisierung“ der Spezifikation einem Punkt des Briefings zu, ohne Lücke.
- Der Nutzer liest das Briefing gegen und gibt es frei.

**Voraussetzung:** S01 (Briefing kann vor S03 starten, Feldnamen werden mit S03 abgeglichen)

### D2 · Design-System

**Ausführung:** Claude Design, Artefakt vom Typ Design System

**Aufgaben**

- Tokens für Farben (Hell und Dunkel), Ampelfarben, Typografie, Abstände, Radien und Bedienhöhen.
- Grundkomponenten: Zahlenfeld mit Einheit, Auswahl, Schalter, Karte, Tabelle, Navigation, Hinweis- und Fehlermeldung, Ampel-Kennzeichen.

**Validierung**

- Ein Agent prüft jede Text- und Hintergrund-Kombination der Tokens rechnerisch auf WCAG AA, in Hell und Dunkel.
- Die drei Ampelfarben sind zusätzlich an Symbol oder Zahl unterscheidbar (Spezifikation, Darstellungsregeln).

**Voraussetzung:** D1

### D3 · Mockups

**Ausführung:** Claude Design, auf Basis des Design-Systems aus D2

**Aufgaben**

- Mockups aller fünf Bereiche bei 1280 px und 390 px, mit den Zuständen aus D1.
- Handy-Formular des Kandidaten in Schritten, Desktop-Formular untereinander.
- Ergebnisansichten mit realistischen Beispielwerten aus den Testfällen der Spezifikation: Kostenbalken mit Spanne, Reserve-Heatmap, Zuordnungsraster mit drei Zuständen je Zelle, Garantie-Kachel, Rechenweg, Szenariovergleich.

**Validierung**

- Die Prüfliste aus D1 ist vollständig abgehakt, jedes Mockup ist einem Punkt zugeordnet.
- Kein Mockup zeigt ein Eingabefeld, das bei 390 px abgeschnitten ist.
- Alle Ergebnisansichten nennen Szenario, Preisfall, Vergleichsdauer und Stand der Berechnung.

**Voraussetzung:** D2

### Freigabe G3 · Design

Der Nutzer gibt Design-System und Mockups frei. Erst danach beginnt Phase 5. Spätere Design-Änderungen laufen über Claude Design und eine neue Freigabe.

### D4 · Übergabe an die Implementierung

**Ausführung:** Agent

**Aufgaben**

- Tokens in die Form überführen, die Architektur 8.8 vorgibt (Custom Properties im Theme).
- Ein Inventar anlegen: welche Komponente in welchem Mockup vorkommt und welcher Schritt in Phase 5 sie baut.
- Alle Oberflächentexte aus den Mockups als deutsche Einträge der Sprachdatei vorbereiten.

**Validierung**

- Jedes Token des Design-Systems hat genau eine Entsprechung im Theme, Hell und Dunkel.
- Jedes Mockup ist genau einem Schritt S16 bis S23 zugeordnet.

**Voraussetzung:** G3, S15

## Phase 4 – App-Infrastruktur

Phase 4 baut alles zwischen Rechenkern und Oberfläche, ohne sichtbare Bildschirme. S12, S13 und S15 laufen parallel zu Phase 2, S14 braucht den fertigen Kern.

### S12 · Speicher

**Aufgaben**

- Repository nach Architektur 8.2: zwei Stores, Laden mit Migration und Prüfung, Speichern eines Szenarios, Geräteeinstellungen.
- Schutz von Datensätzen mit höherer Schemaversion, Umgang mit `versionchange` bei mehreren Tabs, Meldung bei vollem Speicher (8.10).
- Anfrage nach dauerhaftem Speicher beim ersten Start.

**Validierung**

- Unit-Tests gegen eine IndexedDB-Testumgebung: Speichern und Laden ergibt ein gleiches Szenario.
- Ein Datensatz mit höherer Version wird geladen, aber nie überschrieben.
- Eine fehlschlagende Migration lässt den alten Datensatz unverändert (Risikotabelle Kapitel 11).
- Ein simulierter Speicher-voll-Fehler führt zu einer Meldung, der Zustand im Speicher bleibt erhalten.
- Kein anderes Modul öffnet die Datenbank (Lint-Regel oder Suche im Code).

**Voraussetzung:** S05

### S13 · Export und Import

**Aufgaben**

- Exportformat und Dateiname nach Architektur 8.3, ein oder alle Szenarien.
- Import mit Größenprüfung, Format-Kennung, Migration und Prüfung je Szenario, Modi „ersetzen“ und „hinzufügen“ in einer Transaktion.
- Geräteeinstellungen sind nicht Teil des Exports.

**Validierung**

- Testfall 14 (Unit-Teil): Export, leere Datenbank, Import ergibt die gleichen Szenarien.
- Q7 (Unit-Teil): Je ein Test für beschädigtes JSON, fremde Format-Kennung, zu große Datei, höhere Schemaversion und ein ungültiges Feld tief im Szenario. Jeder endet mit Meldung samt Schema-Pfad, kein Datensatz ist verändert.
- „Hinzufügen“ vergibt neue IDs und hängt bei doppelten Namen „(Import)“ an.

**Voraussetzung:** S12

### S14 · Worker und Anwendungszustand

**Aufgaben**

- Worker mit den Aufrufen für Rechnen und Rechenweg nach Architektur 5.1 und 8.5.
- Store mit den Slices aus 5.1, Autosave nach 300 ms Ruhe und beim Verlassen der Seite.
- Neuberechnung mit Debounce, Generation und kooperativem Abbruch, Neustart eines abgestürzten Workers.
- App-Start nach 6.2 und Import-Ablauf nach 6.3 ohne Oberfläche. IDs entstehen nur hier.

**Validierung**

- Zehn schnelle Änderungen innerhalb von 300 ms lösen genau einen Speichervorgang und genau eine Rechnung aus.
- Ein Ergebnis mit veralteter Generation wird verworfen. Eine Rechnung, die während des Laufs überholt wird, endet mit „superseded“.
- Nach einem simulierten Worker-Absturz rechnet ein neuer Worker. Das letzte Ergebnis bleibt sichtbar und ist als veraltet markiert.
- Der Rechenweg wird nur für das geöffnete Angebot berechnet und gehalten.
- Der Kern im Worker liefert denselben Ergebnis-Hash wie der direkte Aufruf aus S10.

**Voraussetzung:** S10, S12, S13

### S15 · Texte und Formatierung

**Aufgaben**

- Sprachdatei mit typisierten Schlüsseln je Bereich (Architektur 8.7).
- Formatierung von Euro, Kilometern, Verbrauch und Prozent für `de-DE`.

**Validierung**

- Ein fehlender Schlüssel lässt Typprüfung oder Build fehlschlagen (Test-Fixture).
- Format-Tests: Kosten in vollen Euro mit Tausenderpunkt, Reserve in ganzen km, Verbrauch mit einer Nachkommastelle, Dezimalkomma.
- Gerundet wird nur hier, der Kern liefert ungerundete Werte (Test mit einem Wert aus Testfall 7).

**Voraussetzung:** S01

## Phase 5 – Oberfläche

Phase 5 baut die fünf Bereiche nach den freigegebenen Mockups. S17 bis S22 hängen nur an S16 und können parallel laufen, S23 schließt die Phase ab.

**Gemeinsame Validierung für jeden Schritt S16 bis S23**

- Playwright-Screenshots des Bereichs bei 1280 px und 390 px, Hell und Dunkel. Der Agent vergleicht sie mit den Mockups aus D3 und listet jede Abweichung im Pull Request, mit Begründung oder Korrektur.
- axe-Prüfung des Bereichs ohne Verstöße (Q10), alle Bedienelemente per Tastatur erreichbar.
- Kein Oberflächentext außerhalb der Sprachdatei, alle Zahlen über die Formatierung aus S15.
- Ein Fehler in diesem Bereich lässt die anderen Bereiche bedienbar (Error Boundary).

### S16 · App-Shell, Navigation und Theme

**Aufgaben**

- Routen aus Architektur 8.8 mit Hash-Routing, Seitenleiste ab 900 px, untere Navigation darunter.
- Theme aus D4 mit Hell und Dunkel, Laufzeit-Überschreibung der Ampelfarben aus den Geräteeinstellungen.
- Szenario-Auswahl und Kopfzeile mit Szenario, Preisfall, Vergleichsdauer und Stand der Berechnung.

**Validierung**

- E2E: Jede Route ist per Deep-Link erreichbar, auch nach Neuladen, die Zurück-Taste funktioniert.
- E2E: Bei 899 px untere Navigation, bei 900 px Seitenleiste.
- Eine geänderte Ampelfarbe wirkt ohne Neuladen.

**Voraussetzung:** G3, D4, S14

### S17 · Fahrprofil und Parameter

**Aufgaben**

- Formulare für Bestandsfahrzeug, Arbeitsstätten A und B und Zusatzstrecke.
- Parameterbereich mit Standardwert, Zurücksetzen je Feld, Markierung geänderter Werte und Kennzeichnung von Platzhaltern.
- Prüfung beim Verlassen eines Feldes, Warnungen aus S04.

**Validierung**

- Testfall 15 (Oberfläche): Komma und Punkt werden angenommen, negative Zahl und leeres Pflichtfeld zeigen die Meldung am Feld.
- Jeder Platzhalter der Parameterliste ist in der Oberfläche als Annahme gekennzeichnet (tabellengetriebener Komponententest).
- E2E: Eine Eingabe ist nach Neuladen noch da.
- Zahlenfelder öffnen am Handy die Zahlentastatur und zeigen die Einheit am Feldende.

**Voraussetzung:** S16

### S18 · Kandidaten

**Aufgaben**

- Kandidatenliste als Karten mit Grund für „unvollständig“ oder „ungeeignet“.
- Kandidatenformular mit den Gruppen aus der Spezifikation, am Handy in Schritten, am Desktop untereinander.
- Leere Vorlage, Duplizieren, Löschen, Leasingangebote mit höchstens einem je Stufe.

**Validierung**

- E2E: Zwei Kandidaten anlegen, einen duplizieren, alle drei erscheinen in der Liste und im Ergebnis.
- Ein unvollständiger Kandidat zeigt auf der Karte die fehlenden Felder, die anderen werden berechnet.
- Ein fünftes Leasingangebot und eine doppelte Stufe sind nicht anlegbar.

**Voraussetzung:** S16

### S19 · Ergebnistabelle

**Aufgaben**

- Ergebnistabelle mit den Spalten aus der Spezifikation, sortiert nach Kosten, ungeeignete Angebote am Ende, ausgegraut, mit Grund.
- Markierung „wird aktualisiert“ während der Rechnung, Wechsel des Preisfalls, Klick öffnet die Detailansicht des Angebots.

**Validierung**

- Komponententests mit festen Ergebnis-Fixtures aus dem Kern: Reihenfolge, Spalten, „ohne Garantie“, ungeeignete Zeilen mit Grund aus Testfall 11.
- E2E: Eine Eingabe in einem anderen Bereich führt zu „wird aktualisiert“ und danach zu neuen Werten.

**Voraussetzung:** S16

### S20 · Diagramme und Detailansichten

**Aufgaben**

- Kostenvergleich mit Spannenstrich und Tabelle, Reserve-Heatmap, Zuordnungsraster mit drei Zuständen je Zelle und hervorgehobenen Winterwechseln, Garantie-Kachel.
- Jedes Diagramm einzeln nachgeladen, mit Text- oder Tabellenalternative.

**Validierung**

- Komponententests mit Fixtures: Testfall 16 zeigt „E→A“ in der Zeile „nur A“, Testfall 12 „E ruht“ im Januar.
- Die Ampel jeder Heatmap-Zelle trägt Farbe und Zahl. Die Schwelle wirkt nach Änderung im Parameterbereich.
- Bundle-Analyse: Die Diagramm-Bibliothek liegt nicht im Start-Bundle.
- E2E am Handy: Die Heatmap ist horizontal scrollbar, ohne dass die Seite seitlich verrutscht.

**Voraussetzung:** S16 (inhaltlich S19)

### S21 · Rechenweg und Preis-Regler

**Aufgaben**

- Aufklappbarer Rechenweg je Angebot mit Formelverweis, nachgerechnet beim Öffnen.
- Preis-Regler für Benzin, Strom und beide Preissteigerungen mit sofortiger Neuberechnung, „Als Szenario speichern“.

**Validierung**

- Komponententest: Jede Zahl der Ergebnistabelle führt im Rechenweg zu einem Eintrag mit Formel-ID (Q6 in der Oberfläche).
- E2E: Reglerwerte ändern die Kosten, werden aber nicht gespeichert. Nach „Als Szenario speichern“ gibt es ein neues Szenario mit diesen Preisen.

**Voraussetzung:** S16 (inhaltlich S19)

### S22 · Szenarien und Daten

**Aufgaben**

- Szenarioliste mit Anlegen (leer oder Kopie), Umbenennen, Duplizieren, Löschen mit Bestätigung, eindeutigem Namen.
- Szenariovergleich für zwei oder mehr Szenarien.
- Export, Import mit Moduswahl und Fehlermeldung, Export-Erinnerung mit einstellbarem Intervall.

**Validierung**

- Testfall 14 als E2E: Export, Browser-Speicher leeren, Import, alle Szenarien unverändert.
- Q7 als E2E: Eine beschädigte Datei zeigt die Fehlerstelle, die Szenarioliste bleibt gleich.
- Die Export-Erinnerung erscheint nach Ablauf des Intervalls (mit gestellter Uhr im Test) und verschwindet nach einem Export.
- Ein doppelter Szenarioname wird abgewiesen.

**Voraussetzung:** S16

### S23 · Offline, Updates und Sicherheit

**Aufgaben**

- Precache, Manifest (Name „Wattwahl“) und Update-Hinweis nach Architektur 8.12, Speichern vor dem Neuladen (6.4).
- Installationshinweis auf iOS beim ersten Start, Hinweis bei abgelehnter Speicher-Anfrage.
- Content Security Policy als Meta-Tag nach 8.11.

**Validierung**

- E2E: Nach dem ersten Laden startet und rechnet die App ohne Netz (Q9, automatischer Teil).
- E2E mit zwei Builds: Der Update-Hinweis erscheint, nach „Aktualisieren“ läuft die neue Version und keine Eingabe fehlt.
- E2E: Die Netzwerk-Aufzeichnung zeigt nach dem Laden keine Anfrage an einen anderen Origin. Die Konsole zeigt keine CSP-Verstöße.

**Voraussetzung:** S16 bis S22

## Phase 6 – Qualität und Abnahme

Phase 6 weist alle Abnahmekriterien der Spezifikation und alle Qualitätsszenarien Q1 bis Q11 nach. Was nur am echten Gerät prüfbar ist, macht der Nutzer in S26.

### S24 · Gesamtsuite und Messungen

**Aufgaben**

- Die End-to-End-Tests aus Architektur 8.13 vervollständigen und im CI in allen drei Engines laufen lassen.
- Bundle-Budget aus G2 als Prüfung im CI.

**Validierung**

- Q1: Messszenario aus S11 in der fertigen App, Handy-Näherung mit CPU-Drosselung ≤ 5 s, Desktop ≤ 2 s.
- Q2: Ein Tastendruck im Formular während der Q1-Rechnung erscheint ohne spürbare Verzögerung (Schwelle im Test festgelegt und begründet).
- Q5: Der Ergebnis-Hash des Messszenarios ist in Chromium, Firefox und WebKit gleich.
- Q8: Mit persistentem Browser-Kontext ist der Stand nach Neuladen und Neustart des Browsers da.
- Abnahmekriterium Viewports: Alle Bereiche bei 1280 px und 390 px ohne abgeschnittene Eingabefelder.
- Eine Abdeckungstabelle im Pull Request ordnet Testfälle 1 bis 18 und Q1 bis Q11 je einem grünen Test zu, Q8 und Q9 mit Verweis auf den manuellen Teil in S26.

**Voraussetzung:** S23

### S25 · Dokumentation und Release-Kandidat

**Aufgaben**

- README und Entwickler-Dokumentation auf Englisch: Architekturüberblick mit Verweis auf arc42, Tests, Veröffentlichung, Anlegen einer neuen Schemaversion.
- Release-Kandidat auf GitHub Pages mit Versionsnummer.

**Validierung**

- Ein frischer Klon lässt sich nur mit der README bauen, testen und lokal starten.
- Der Release-Kandidat unter der Pages-Adresse entspricht dem geprüften Stand des Hauptzweigs.

**Voraussetzung:** S24

### S26 · Manuelle Abnahme

**Ausführung:** Nutzer, mit einer Checkliste, die ein Agent aus Architektur 8.13 vorbereitet

- [ ] iPhone mit Safari: App auf dem Home-Bildschirm installieren, offline starten und rechnen (Q9).
- [ ] Android-Mittelklasse-Handy mit Chrome: Installation, offline, Laufzeit des Messszenarios ≤ 5 s (Q1).
- [ ] Auf beiden Geräten: Daten nach Geräteneustart vollständig da (Q8).
- [ ] Ein Szenario mit zwei Kandidaten von der ersten Eingabe bis zum Vergleich ohne Hilfe bedienen.
- [ ] Export auf dem Handy, Import am Desktop, gleiche Ergebnisse.

**Voraussetzung:** S25

### Freigabe G4 · Abnahme

Sind alle Punkte aus S24 und S26 erfüllt, gilt die App als abgenommen. Gefundene Fehler werden als neue Schritte nach diesem Schema geplant.
