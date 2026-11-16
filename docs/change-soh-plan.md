# Änderung: Plan mit Wechselzeitpunkt bei sinkendem SoH

Nov 16, 2026 · Eduard Vodicka · Status: Entwurf, Entscheidungen 1 bis 3 getroffen (Leseart, Näherung, Schalter), Rest zur Freigabe

Auslöser ist die Eignung im Zeitverlauf (Änderung Kilometerreserve, Teil B). Sie zeigt, ab wann ein Weg kippt, rechnet aber nicht damit. Ein Weg, der erst im letzten Drittel der Vergleichsdauer kippt, wird heute für die ganze Dauer dem Verbrenner zugeteilt oder macht das Angebot ungeeignet. Der Nutzer will, dass das E-Auto den Weg fährt, solange es geeignet ist, und danach eine andere Option übernimmt. Gemeint ist eine Änderung der Kalkulation, nicht der Anzeige. Der SoH selbst geht weiterhin nur über die Eignung ein, der Verbrauch hängt nicht vom SoH ab (Spezifikation, Abschnitt 4). Ein SoH-Einfluss auf Kosten (Mehrverbrauch, Restwert, SoH-Garantie) ist nicht Teil dieser Änderung.

Dieses Dokument beschreibt die Änderung. Sie läuft als Schritte C3a und C3b in Phase 8 (nach C2b, siehe Implementierungsplan). Das Dokument selbst ändert noch nichts an Spezifikation, Architektur oder Code.

## Ergebnis in einem Satz

Ein neuer Parameter „SoH-Plan“ (Standard „fest“) schaltet auf „mit Wechsel“: Der Optimierer läuft mit der Optionsmenge am Start, danach rechnet eine Nachrechnung je Planeintrag den Wechselzeitpunkt aus und korrigiert Kosten, E-Auto-Kilometer und Kilometerstände. Mit „fest“ bleiben alle Ergebnisse unverändert.

## Warum eine Nachrechnung und kein neuer Optimierer

Der SoH in einem Jahr hängt von den E-Auto-Kilometern der Jahre davor ab. Ein exakt zeitabhängiger Plan bräuchte ein DP mit den kumulierten Kilometern als Zustand. Das ändert Knapsack, Raster, Garantie-Budget, Leasing, Cache und Rechenzeit des Preis-Reglers. Entschieden ist die Näherung: Der Optimierer bleibt, die Nachrechnung ist ein linearer Durchlauf über die Planeinträge (rund 260 Gruppen, höchstens 24 Wechselereignisse).

## Neue Regel

Sei P der Plan, den der Optimierer mit der Optionsmenge am Start wählt (wie bei `sohReference = 'start'`). Jede Option mit Bedarf an ein Paar (Weg, Monat) hat eine SoH-Schwelle `OPT.threshold`.

1. **Ereignissimulation:** Alle Einträge laufen zunächst mit ihrer Option aus P. Daraus folgt der E-Auto-Kilometerstand k(t) = Laufleistung + K · t / 12 und der SoH(t) nach F2. Das nächste Ereignis ist der Zeitpunkt, zu dem SoH(t) die höchste Schwelle der gerade gefahrenen Optionen unterschreitet. Er folgt aus der Umkehrung von F2, wie `monthsUntilSoh`. Bis dahin ist die Rate K konstant.
2. **Wechsel:** Zum Ereignis wechseln alle Einträge, deren Schwelle unterschritten ist, auf die **günstigste Option derselben Gruppe, die beim aktuellen SoH noch erlaubt ist** („Ausweichoption“). Das ist bei einem Tag mit einem Arbeitsplatz „E ruht“, bei einem Tag mit beiden Arbeitsplätzen der andere Weg, bei der Zusatzstrecke ein kleinerer E-Anteil. Danach gilt eine neue Rate K, und die Simulation setzt fort. Die Ausweichoption kann später selbst kippen und löst dann ein weiteres Ereignis aus.
3. **Keine Ausweichoption:** Gibt es in einer Gruppe zu einem Zeitpunkt innerhalb der Vergleichsdauer keine erlaubte Option mehr (an Tagen mit beiden Arbeitsplätzen kippen beide Wege), ist der Plan über die ganze Dauer nicht zulässig. Dann gilt das Angebot als ungeeignet mit dem bekannten Grund „beide Wege“, ergänzt um den Monat, in dem der letzte Weg kippt.
4. **Kosten:** Energie und Wartung jedes Eintrags werden je Phase gerechnet: Menge (Option) × Preisfaktor des Zeitfensters. Die Preisfaktoren `F7.Fb`, `F7.Fs` und `F7.Fm` gelten heute für die ganze Dauer. Neu gibt es sie für ein Zeitfenster [t₁, t₂) mit den Jahresanteilen q_y aus `F7.qy` und der Steigerung (1 + g)^(y−1). Ein Wechsel mitten im Jahr teilt den Anteil dieses Jahres genau.
5. **Kennzahlen:** K_EV ist der Durchschnitt der Rate über die Vergleichsdauer, K_ICE entsprechend. `evOdometerEnd`, `iceOdometerEnd` und `sohEnd` folgen aus der Simulation (stückweise lineare Kilometer, nicht K_EV · D / 12). Die Eignungsprüfung (`sohCheck`, Reserven, `minReserve`) steht in diesem Modus auf dem SoH am Start, weil jeder Eintrag nur gefahren wird, solange er geeignet ist.
6. **Leasing und Garantie:** Die Leasingstufe wird mit dem korrigierten K_EV neu bewertet (`leaseCost`). Das Garantie-Budget B gilt für den Optimierer weiter für die Rate vor dem ersten Wechsel (konservativ). `yearsToKmLimit` nutzt die korrigierte Rate.
7. **Nie schlechter als „fest“:** Die App rechnet beide Pläne: den Plan am Start (mit Wechsel) und den Plan, den der Modus „fest“ liefert (wechselt nie). Gewählt wird der mit den kleineren Zielkosten, bei Gleichstand (± 0,01 €) der feste. So liefert „mit Wechsel“ nie höhere Kosten als „fest“.

**Modellgrenze:** Der Plan P ist für die Optionsmenge am Start optimal, nicht für den zeitlichen Verlauf. Die Nachrechnung korrigiert seine Kosten, aber der Optimierer hätte mit Kenntnis der späteren Wechsel unter Umständen einen anderen Plan gewählt. Das steht als Hinweis in der Spezifikation und in der Oberfläche. Außerdem rechnet das Modell, wie die Eignung im Zeitverlauf, mit gleichmäßigen Kilometern über das Jahr und ohne Saison im Kilometerstand.

## Parameter

`parameters.sohPlanMode`: `'fixed' | 'switch'`, Standard `'fixed'`, in der Oberfläche bei den Parametern der Eignungsprüfung, direkt unter „SoH-Bezug der Eignungsprüfung“. Er liegt im Szenario, nicht in den App-Einstellungen. So lassen sich zwei Szenarien mit und ohne Wechsel vergleichen, und ein Export bleibt reproduzierbar.

- `fixed`: heutiges Verhalten. Der SoH-Bezug (Start oder Ende) gilt wie bisher.
- `switch`: Der SoH-Bezug wird ignoriert. Die Parameterseite deaktiviert die Auswahl und nennt den Grund („Im Modus ‚mit Wechsel‘ prüft die App die Eignung zum jeweiligen Zeitpunkt“).
- Cache und Ergebnis-Hash: Der Parameter ist Teil des Szenarios und damit des Schlüssels. Ein Umschalten rechnet neu.

## Darstellung

- Ergebnisfeld je Angebot `planSwitch`: im Modus `fixed` `null`. Im Modus `switch` eine Liste der Ereignisse mit Monat, betroffenen Einträgen (Weg, Monat, Tagestyp, Zustand), Ausweichoption und neuer Rate K, dazu die Zielkosten beider verglichenen Pläne und welcher gewählt wurde.
- Detailansicht Reichweitenreserve: Der Zeitregler zeigt im Modus `switch` zusätzlich, was der Plan zum gewählten Zeitpunkt tut (E-Auto fährt, E ruht, Weg getauscht). Die Textliste nennt je Zelle den Wechselmonat („Standort A, Januar: E-Auto bis Monat 30, danach Verbrenner“). Die Information steht auch als Text, nicht nur als Farbe.
- Angebotsvergleich: Kennzeichnung „mit Wechsel“ am Angebot, das dem Plan folgt. Die Mehr- oder Minderkosten gegenüber „fest“ stehen im Detail.
- Rechenweg: neue Formel-IDs `OPT.switchEvent` (ein Eintrag je Ereignis mit Monat, SoH, Rate vorher und nachher) und `OPT.switchCost` (Kosten je Phase und Eintrag, ohne eigene Trace-Zeilen je Eintrag, die Summe verlinkt auf `costs.*`). Die Einzelkosten je Eintrag haben wie die Reserven im Zeitverlauf keine eigenen Einträge (Q6, Ausnahme wie bei `OPT.timeline`).

## Testfälle

Die Testfälle 1 bis 22 bleiben unverändert.

| Nr | Prüfung | Eingabe | Erwartet |
| --- | --- | --- | --- |
| 23 | Wechselzeitpunkt | Export `eauto-export-2026-11-16-v2_3.json`, Corsa 2023, Strecke A im Januar, R = 10 km, fester Plan mit K = 19.055 km/Jahr (wie Testfall 21) | Die Ereignissimulation liefert den Wechsel bei 30,47 Monaten. Danach übernimmt die Ausweichoption. Die Kosten dieses Eintrags sind die Summe aus Phase 1 (E-Auto, 30,47 Monate) und Phase 2 (Ausweichoption, Rest der Dauer), nachgerechnet im Pull Request. |
| 24 | Kein Ereignis | Derselbe Export mit R = 0 | Die Schwelle 0,829 liegt unter der SoH-Untergrenze 0,85, es gibt kein Ereignis. Das Ergebnis im Modus `switch` stimmt mit dem im Modus `fixed` überein. |
| 25 | Nie schlechter | Derselbe Export mit R = 10, alle drei Kandidaten und Angebote | Die Zielkosten im Modus `switch` sind je Angebot kleiner oder gleich denen im Modus `fixed`. Mindestens ein Angebot ist günstiger. |
| 26 | Zusammenlegung der Phasen | Ein Eintrag mit Wechsel zum Zeitpunkt 0 und einer mit Wechsel zum Ende, Preissteigerungen 0 und 3 % | Wechsel zum Zeitpunkt 0 gibt die Kosten der Ausweichoption, Wechsel zum Ende die Kosten der Ausgangsoption. Mit Steigerung 0 % sind die Phasenkosten proportional zur Dauer. |

Dazu Integrationstests: Im Modus `fixed` sind alle Zahlen der Testfälle 1 bis 22 bitgleich. Fehlt eine Ausweichoption in einer Gruppe, ist das Angebot ungeeignet mit Monat im Grund. Das Ergebnis hängt nicht von der Reihenfolge der Einträge ab (Q5). Die genauen Werte der Testfälle 23 bis 25 werden in C3a nachgerechnet und in die Spezifikation übernommen. „Alle 22 Testfälle“ wird „Alle 26 Testfälle“.

## Migration v3 → v4

Die Schemaversion steigt auf 4, weil ein neuer Pflichtparameter dazukommt. Der Migrationsschritt setzt `sohPlanMode = 'fixed'` in jedem Szenario und ändert sonst nichts. Alle bestehenden Ergebnisse bleiben damit gleich. Beispieldatei `scenario.v4.json`.

Der Ergebnis-Hash (Q5) ändert sich, weil das Ergebnis das Feld `planSwitch` bekommt, auch wenn es `null` ist. Die Referenz-Hashes der Abnahmetests (S24) und das Messszenario werden einmal neu erzeugt. Im Modus `fixed` müssen die Zahlenwerte dabei bitgleich bleiben, nur der Hash ändert sich.

## Betroffene Stellen

| Dokument oder Code | Änderung |
| --- | --- |
| Spezifikation, Festlegungen und Berechnungslogik Abschnitt 2 | Satz zur Eignungsprüfung nennt den Modus „mit Wechsel“. |
| Spezifikation, Berechnungslogik Abschnitt 3, Unterabschnitt „Eignung im Zeitverlauf“ | Hinweis, dass der Verlauf im Modus „mit Wechsel“ dem Plan folgt, Modellgrenze angepasst. |
| Spezifikation, Optimierung, Algorithmus | Neuer Unterabschnitt „Plan mit Wechselzeitpunkt“ mit der Regel oben. Schritt 6 nennt `planSwitch`. |
| Spezifikation, Auswertung | Reichweitenreserve: Zeitregler zeigt Planzustand, Textliste mit Wechselmonat. Angebotsvergleich: Kennzeichnung. |
| Spezifikation, Parameterliste und Validierung | Parameter SoH-Plan (fest), Hinweis zur Wechselwirkung mit dem SoH-Bezug. |
| Spezifikation, Testfälle, Risiken und Grenzen | Testfälle 23 bis 26, „Alle 26 Testfälle“, Modellgrenzen „Plan für die Optionsmenge am Start“ und „Gleichmäßige Kilometer“. Die bisherige Zeile „Wege, die erst später kippen, werden ganz ausgeschlossen“ nennt den Modus „mit Wechsel“ als Abhilfe. |
| Architektur 1.2, 8.13, 10 (Q3) | Testfallzählung 22 wird 26. |
| Architektur 5.2, 8.4 | Neues Modul `optimizer/switchPlan.ts` (Ereignissimulation und Phasenkosten), `prices.ts` mit Preisfaktoren je Zeitfenster, Formel-IDs `OPT.switchEvent` und `OPT.switchCost`. |
| Architektur 8.2, 8.5, 8.6 | Schemaversion 4 und Migration, Ergebnisfeld `planSwitch`, Prüfung des Parameters. |
| Architektur 8.8, 8.9 | Heatmap, Zeitregler und Textliste mit Planzustand, Zugänglichkeit. |
| Architektur 9, 11, 12 | Neue ADR-19 „Wechsel als Nachrechnung statt zeitabhängigem Optimierer, schaltbar“, Risiko „Plan ist für die Optionsmenge am Start optimal“, Glossar „Wechselzeitpunkt“ und „Ausweichoption“. |
| `src/domain/schema.ts`, `defaults.ts` | Parameter `sohPlanMode`, `CURRENT_SCHEMA_VERSION = 4`. |
| `src/domain/migrations.ts`, `__fixtures__` | Migration v3 → v4, `scenario.v4.json`. |
| `src/domain/validation.ts` | Wert aus der Auswahl. Keine Plausibilitätswarnung. |
| `src/domain/result.ts` | Feld `planSwitch` (Ereignisse, Zielkosten beider Pläne, gewählter Plan), neue Formel-IDs. |
| `src/core/calc/prices.ts` | `F7.Fb`, `F7.Fs`, `F7.Fm` für ein Zeitfenster [t₁, t₂). Die Variante für die ganze Dauer bleibt und ruft dieselbe Funktion auf, damit der Modus `fixed` bitgleich bleibt. |
| `src/core/calc/soh.ts` | Wiederverwendung von `monthsUntilSoh`, Variante mit wechselnder Rate je Phase. |
| `src/core/optimizer/problem.ts`, `types.ts` | Optionen liefern ihre Jahresmengen und ihr Ereignis (Schwelle, Bedarf) für die Nachrechnung. Die Schwellen und das DP bleiben unverändert. |
| `src/core/optimizer/switchPlan.ts` (neu) | Ereignissimulation, Ausweichoption, Phasenkosten, Vergleich mit dem festen Plan. |
| `src/core/optimizer/optimize.ts`, `src/core/compute.ts` | Aufruf der Nachrechnung im Modus `switch`, korrigierte Kosten, `evKmPerYear`, Kilometerstände, `yearsToKmLimit`, `buildTimeline`, Trace-Verlinkung. |
| `src/ui/areas/ParameterPage.tsx`, `forms/fieldLabels.ts` | Auswahl SoH-Plan, `sohReference` im Modus `switch` deaktiviert mit Hinweis. |
| `src/ui/charts/ReserveHeatmap.tsx`, `ergebnis/OfferDetail.tsx` | Planzustand am Zeitregler, Wechselmonat in der Textliste. `checkedAt` folgt im Modus `switch` dem Start. |
| `src/ui/areas/ergebnis/ResultTable.tsx`, `OfferCards.tsx` | Kennzeichnung „mit Wechsel“. |
| `src/ui/forms/traceFormat.ts`, `traceView.ts`, `src/i18n/de.json` | Neue Formel-IDs, Texte, Beschriftungen, Hinweise. |
| `tests/fixtures`, `e2e`, Q1-Messung, `docs/acceptance-checklist.md` | Parameter ergänzen, neue Tests, Messszenario und Hashes neu erzeugen, Abnahmepunkt für Parameter, Zeitregler und Kennzeichnung. |

## Schritt

Die Änderung läuft wie die Garantie- und die Kilometerreserve-Änderung in zwei Schritten: C3a ändert Spezifikation, Architektur und Plan und wird vom Nutzer freigegeben, C3b setzt sie im Code um. Innerhalb von C3b empfiehlt sich die Reihenfolge: Schema und Parameter (mit Modus `fixed`, alles bitgleich), Preisfaktoren je Zeitfenster, Ereignissimulation mit Phasenkosten, Vergleich mit dem festen Plan, Oberfläche. Voraussetzung ist C2b. Der Benchmark Q1 läuft im Modus `switch` erneut. Er darf die Budgets aus Architektur 11.1 nicht überschreiten, der Preis-Regler im Modus `switch` wird eigens gemessen.

## Entscheidungen

1. Gemeint ist ein zeitabhängiger Plan: Das E-Auto fährt, solange der Weg geeignet ist, danach übernimmt eine andere Option. Ein SoH-Einfluss auf Kosten gehört nicht dazu.
2. Näherung mit Nachrechnung, kein neuer Optimierer und kein DP über Zeitstufen.
3. Die Änderung ist schaltbar (Parameter `sohPlanMode`, Standard „fest“) und liegt im Szenario.
4. Die Ausweichoption ist die günstigste Option derselben Gruppe, die beim aktuellen SoH erlaubt ist, nicht immer der Verbrenner.
5. Die Ereignisse folgen einer deterministischen Simulation mit stückweise konstanter Rate, ohne Fixpunkt-Iteration.
6. „Mit Wechsel“ rechnet beide Pläne (Start und fest) und wählt den günstigeren, damit das Ergebnis nie schlechter als „fest“ ist.
7. Fällt in einer Gruppe die letzte erlaubte Option innerhalb der Vergleichsdauer weg, ist das Angebot ungeeignet. Der Grund nennt den Monat.
8. Im Modus `switch` steht `sohCheck` auf dem SoH am Start, der SoH-Bezug wird ignoriert.
9. Das Garantie-Budget gilt für den Optimierer für die Rate vor dem ersten Wechsel (konservativ), Leasingstufen werden mit dem korrigierten K_EV bewertet.
10. Einordnung: Phase 8, Folgeversion nach C2b, ohne neues Tor.
11. Offen für C3a: Genauigkeit der Zeitpunkte (Monate als Gleitkommazahl oder ganze Monate), Behandlung der Saison im Kilometerstand, Reihenfolge bei Gleichzeitigkeit mehrerer Ereignisse.
