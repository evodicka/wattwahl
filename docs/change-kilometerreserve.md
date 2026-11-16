# Änderung: Kilometerreserve, Eignung im Zeitverlauf, E-Auto-Kilometerstand

Nov 16, 2026 · Eduard Vodicka · Status: Entscheidungen getroffen, als Folgeversion nach dem Release-Kandidaten geplant, C2a in Spezifikation, Architektur und Plan umgesetzt

Auslöser ist die Nutzung der veröffentlichten App mit dem Szenario in `docs/acceptance/eauto-export-2026-11-16-v2_3.json` (drei Kandidaten, 96 Monate). Dort fährt das E-Auto die Strecke A (Standort A) in jedem Monat, obwohl die Reserve im Januar nur 2,5 km (Corsa 2023) bzw. 9,9 km (Corsa 2024) beträgt. Der Nutzer will eine feste Mindestreserve in km, ab der das E-Auto als ungeeignet gilt. Er will außerdem sehen, ab wann eine Strecke im Lauf der Vergleichsdauer ungeeignet wird, und im Angebotsvergleich neben dem Kilometerstand des Verbrenners auch den des E-Autos.

Dieses Dokument beschreibt drei Änderungen in einem Zug. Es ändert selbst noch nichts an Spezifikation, Architektur oder Code.

## Ergebnis in einem Satz

Ein neuer Parameter „Kilometerreserve“ (Standard 0 km) verschärft die Eignungsprüfung, die Auswertung zeigt zusätzlich, wie sich die Eignung über die Vergleichsdauer entwickelt, und der Angebotsvergleich nennt den geplanten Kilometerstand des E-Autos am Ende.

## A. Kilometerreserve

**Regel:** Ein Weg w ist im Monat m geeignet, wenn seine Reserve in km mindestens die Kilometerreserve R erreicht. Die Reserve selbst bleibt wie in Abschnitt 3 der Spezifikation definiert.

$$
\text{Reserve}_{km} = d_w \left(\frac{u}{\varphi_{w,m}} - n_w\right) \ge R
\iff \left(n_w + \frac{R}{d_w}\right)\varphi_{w,m} \le u
$$

- Die Reserve in km ist die zusätzliche einfache Weglänge, die der Akku bei diesem SoH noch schaffen würde (wie heute angezeigt), nicht die Restreichweite nach der Fahrt.
- R = 0 ergibt exakt die heutige Regel. Alle bisherigen Ergebnisse und Testfälle 1 bis 19 bleiben unverändert.
- Ein Weg mit d_w = 0 braucht keine Reserve und ist immer geeignet.
- Die SoH-Schwelle für den Optimierer (`OPT.threshold`) wird zu φ₁ · (n + R / d_w) / u. Der Optimierer selbst ändert sich nicht, er liest nur die Schwellen.
- Die Ampel bleibt „rot genau dann, wenn nicht geeignet“. Ein Weg mit Reserve von 0 bis R ist damit rot, obwohl seine Reserve positiv ist. Die angezeigte Reserve ändert sich nicht, die Zelle wird als „unter der Kilometerreserve“ gekennzeichnet (Text oder Symbol, nicht nur Farbe).
- Die kleinste Reserve in der Ergebnistabelle (`minReserve`) liegt dadurch nie unter R.
- Der Sicherheitspuffer (Prozent) bleibt bestehen. Die Kilometerreserve wirkt absolut und trifft damit kurze und lange Wege gleich.

**Folge für den Plan:** Der Verbrenner übernimmt dort, wo der Weg ungeeignet ist. An Tagen mit nur einem Arbeitsplatz bleibt das E-Auto zuhause („E ruht“). An Tagen mit beiden Arbeitsplätzen muss das E-Auto einen der beiden Wege fahren (heutige Modellregel). Ist keiner der beiden Wege geeignet, wird das Angebot „ungeeignet“ mit dem bekannten Grund „beide Wege“. Eine zu große Kilometerreserve kann also Angebote komplett ausschließen.

**Parameter:** `parameters.minReserveKm`, Standard 0, Einheit km, Wert ≥ 0, in der Oberfläche bei den Parametern der Eignungsprüfung. Plausibilitätswarnung ab 100 km (Platzhalter, blockiert nicht).

**Rechenweg:** `F3.suitable` und `OPT.threshold` behalten ihre IDs. Ihre Eingaben nennen zusätzlich `minReserveKm` und `wayKm`. Die Texte zu `F3.suitable` in der Oberfläche zeigen die neue Formel.

## B. Eignung im Zeitverlauf (nur Anzeige)

Heute wird die Eignung bei dem SoH am Ende der Vergleichsdauer geprüft (Schalter auf „Start“ möglich). Der SoH sinkt nur, also gilt „geeignet“ für die ganze Dauer. Ein Weg, der erst später kippt, wird ganz ausgeschlossen. Der Plan bleibt in dieser Änderung unverändert, die Auswertung erklärt nur, wann ein Weg kippt.

**Berechnung:** Für Zeitpunkte t = 0, 12, 24, … Monate bis D (und D selbst, wenn D kein Vielfaches von 12 ist) gilt:

- Kilometerstand des E-Autos k(t) = Laufleistung des Kandidaten + K_EV · t / 12.
- SoH(t) nach `F2.soh` an dieser Stelle.
- Reserve in km und % und Ampel je Weg und Monat (24 Zellen) bei SoH(t), wie in Abschnitt 3, einschließlich Kilometerreserve.
- Je Zelle zusätzlich `suitableForMonths`: die Monate ab Beginn, in denen die Zelle geeignet bleibt. `null` heißt „bis zum Ende geeignet“, `0` heißt „weniger als ein voller Monat geeignet“ (schließt „schon am Start ungeeignet“ ein). Der Wert kommt direkt aus der SoH-Schwelle der Zelle, ohne Abtasten.

**Modellgrenze:** Der Zeitverlauf rechnet mit den E-Auto-Kilometern des gewählten Plans. Ein Weg, der im Plan dem Verbrenner zugeteilt ist, würde bei E-Betrieb mehr Kilometer und damit einen niedrigeren SoH bedeuten. Der Verlauf sagt also „bei diesem Plan“, nicht „wenn man den Weg doch mit dem E-Auto fährt“. Das steht als Hinweis in der Oberfläche.

**Darstellung** (Detailansicht Reichweitenreserve):

- Unter der Heatmap ein Zeitregler (Start bis Ende, Schritte je Jahr), per Tastatur bedienbar und beschriftet. Er steht standardmäßig auf dem Zeitpunkt, bei dem die Eignung geprüft wird (heute: Ende, bei „Start“ der Start). Die Heatmap zeigt dann die Reserven zu diesem Zeitpunkt.
- Eine Textliste der Zellen mit Zeitgrenze, etwa „Standort A, Januar: geeignet bis Monat 30“. Sie gibt dieselbe Information, die sonst nur die Farbe trägt.
- Die Ergebnistabelle ändert sich dadurch nicht.

**Rechenweg:** Der Zeitverlauf bekommt eigene Formel-IDs `OPT.timeline` (ein Eintrag je Zeitpunkt mit Monat, Kilometerstand und SoH) und `OPT.suitableUntil` (ein Eintrag je Zelle mit Schwelle und Monaten). Die Reserven je Zeitpunkt werden ohne eigene Trace-Einträge berechnet und mit dem Eintrag des Zeitpunkts verlinkt (Q6), wie es `sohThreshold` heute bei den Teilformeln macht.

**Umfang:** Pro Angebot höchstens D/12 + 2 Zeitpunkte mit je 24 Zellen. Bei der Obergrenze von 1.200 Monaten sind das gut 100 Zeitpunkte. Es gibt keine neue Optimierung, der Q1-Wert ändert sich praktisch nicht.

## C. E-Auto-Kilometerstand am Ende

Der Angebotsvergleich zeigt heute nur „Verbrenner am Ende“ (`iceOdometerEnd`, `F8.iceOdometer`). Neu kommt „E-Auto am Ende“ dazu.

- Wert: Laufleistung des Kandidaten + K_EV · D / 12. Das ist derselbe Wert wie `F2.kEnd`, der schon für den SoH berechnet wird, unabhängig davon, ob die Eignung am Start oder am Ende geprüft wird.
- Neues Ergebnisfeld `evOdometerEnd`, verlinkt mit dem Eintrag `F2.kEnd` (Q6). Es braucht keine neue Formel.
- Wie beim Verbrenner nur zur Anzeige, er geht in keine Kosten ein.
- Anzeige in Ergebnistabelle (Spalte neben „Verbrenner am Ende“) und auf den Angebotskarten (mobil). Ungeeignete Angebote zeigen keinen Wert.

## Testfälle

Die Testfälle 1 bis 19 bleiben unverändert.

| Nr | Prüfung | Eingabe | Erwartet |
| --- | --- | --- | --- |
| 20 | Kilometerreserve | Testfall 1 (Reserve 31,1 km, n = 2) und Testfall 2 (Reserve 91,1 km, n = 1), jeweils mit R = 30 bzw. 90, dann R = 32 bzw. 92. Dritter Fall: Weg mit 0 km und R = 50 | R unter der Reserve: geeignet. R darüber: nicht geeignet, Ampel rot, angezeigte Reserve bleibt 31,1 km bzw. 91,1 km. Weg mit 0 km: geeignet. R = 0 gibt die Werte aus Testfall 1 und 2. |
| 21 | Eignung im Zeitverlauf | Export `eauto-export-2026-11-16-v2_3.json`, Kandidat Corsa 2023 (SoH 95 % bei 19.000 km), Strecke A im Januar, K_EV = 19.055 km/Jahr. Erst R = 0, dann R = 10 km | R = 0: SoH-Schwelle 0,829 liegt unter der SoH-Untergrenze von 0,85, `suitableForMonths = null`. R = 10: Schwelle 0,914, die Zelle kippt nach 30,47 Monaten, also `suitableForMonths = 30`. Der Zeitpunkt „Ende“ stimmt mit `sohCheck` und den heutigen `reserves` überein. |
| 22 | E-Auto-Kilometerstand | Derselbe Export, Kauf, K_EV = 19.055 km/Jahr, D = 96 | MG4 (neu): 152.442 km. Corsa 2023: 19.000 + 152.442 = 171.442 km. Verbrenner zum Vergleich: 120.000 + 23.430 = 143.430 km. |

Die Rechnung im Testfall 21 mit R = 10 setzt einen festen Plan voraus. Beim Optimierer mit R = 10 ändert sich K_EV. Dafür gibt es einen zusätzlichen Integrationstest: Mit R = 10 sinken die E-Auto-Kilometer des Corsa 2023 gegenüber R = 0, und die Strecke A wird in den Wintermonaten dem Verbrenner zugeteilt. Die genauen Werte werden im Schritt aus dem Rechenkern übernommen. „Alle 19 Testfälle“ wird „Alle 22 Testfälle“.

## Migration v2 → v3

Die Schemaversion steigt auf 3, weil ein neuer Pflichtparameter dazukommt. Der Migrationsschritt setzt `minReserveKm = 0` in jedem Szenario und ändert sonst nichts. Alle bestehenden Ergebnisse bleiben damit gleich. Ergebnisse sind nicht Teil der Exportdatei, die Felder `evOdometerEnd` und der Zeitverlauf werden beim Rechnen neu erzeugt. Beispieldatei `scenario.v3.json`.

Der Ergebnis-Hash (Q5) ändert sich, weil das Ergebnis neue Felder bekommt. Die Referenz-Hashes der Abnahmetests (S24) müssen einmal neu erzeugt werden, ebenso das Messszenario.

## Betroffene Stellen

| Dokument oder Code | Änderung |
| --- | --- |
| Spezifikation, Berechnungslogik Abschnitt 3 | Bedingung „geeignet“ mit Kilometerreserve, Satz zur Ampel, neuer Unterabschnitt „Eignung im Zeitverlauf“. |
| Spezifikation, Optimierung | Schwelle `OPT.threshold` mit Kilometerreserve, Hinweis auf „beide Wege“. |
| Spezifikation, Auswertung | Reichweitenreserve: Zeitregler und Zeitgrenzen. Ergebnistabelle: Spalte „E-Auto am Ende“. |
| Spezifikation, Parameterliste und Validierung | Kilometerreserve (0 km), Plausibilitätswarnung. |
| Spezifikation, Testfälle, Risiken und Grenzen | Testfälle 20 bis 22, „Alle 22 Testfälle“, Modellgrenze „Zeitverlauf bei geplanten Kilometern“. |
| Architektur 1.2, 8.13, 10 (Q3) | Testfallzählung 19 wird 22. |
| Architektur 5.2, 8.4 | `suitability.ts`, `soh.ts` (Zeit bis zur Schwelle), Formel-IDs `OPT.timeline` und `OPT.suitableUntil`. |
| Architektur 8.2, 8.5, 8.6 | Schemaversion 3 und Migration, neue Ergebnisfelder, Prüfung des Parameters. |
| Architektur 8.8, 8.9 | Heatmap mit Zeitregler und Textliste, Zugänglichkeit. |
| Architektur 9, 11, 12 | ADR „Zeitverlauf nur als Anzeige, Plan unverändert“, Risiko „Wege, die erst später kippen, werden ganz ausgeschlossen“, Glossar „Kilometerreserve“. |
| `src/domain/schema.ts`, `defaults.ts` | Parameter `minReserveKm`, `CURRENT_SCHEMA_VERSION = 3`. |
| `src/domain/migrations.ts`, `__fixtures__` | Migration v2 → v3, `scenario.v3.json`. |
| `src/domain/validation.ts` | Wert ≥ 0, Plausibilitätswarnung. |
| `src/domain/result.ts` | Felder `evOdometerEnd` und Zeitverlauf (Zeitpunkte, Reserven, `suitableForMonths`). |
| `src/core/calc/suitability.ts` | `isSuitable`, `checkWay` und `sohThreshold` mit Kilometerreserve und Weglänge, Trace-Eingaben. |
| `src/core/calc/soh.ts` | Funktion für die Monate bis zu einem SoH. |
| `src/core/optimizer/problem.ts`, `optimize.ts` | Schwellen mit Kilometerreserve, `explain` und `worstPair` vergleichen mit R statt mit 0. |
| `src/core/compute.ts` | Zeitverlauf, `evOdometerEnd`, Trace-Verlinkung. |
| `src/ui/areas/ParameterPage.tsx`, `forms/fieldLabels.ts` | Eingabefeld Kilometerreserve. |
| `src/ui/areas/ergebnis/ResultTable.tsx`, `OfferCards.tsx`, `parts.tsx` | Spalte und Zeile „E-Auto am Ende“. |
| `src/ui/areas/ergebnis/OfferDetail.tsx` | Zeitregler, Zeitgrenzen, Kennzeichnung „unter der Kilometerreserve“. |
| `src/ui/forms/traceFormat.ts`, `traceView.ts`, `src/i18n/de.json` | Neue Formel-IDs, Texte, Beschriftungen, Hinweise. |
| `tests/fixtures`, `e2e`, Q1-Messung, `docs/acceptance-checklist.md` | Parameter ergänzen, neue Tests, Messszenario und Hashes neu erzeugen, Abnahmepunkt für die neuen Anzeigen. |

## Schritt

Die Änderung läuft wie die Garantie-Änderung in zwei Schritten: C2a ändert Spezifikation und Architektur und wird vom Nutzer freigegeben, C2b setzt sie im Code um. Innerhalb von C2b empfiehlt sich die Reihenfolge C (Kilometerstand, klein), A (Kilometerreserve), B (Zeitverlauf), jeweils mit eigenen Tests. Die Änderung kommt als Folgeversion nach dem Release-Kandidaten (S25) und nach der manuellen Abnahme (S26). Der Release-Kandidat bleibt unverändert.

## Entscheidungen

1. Die Kilometerreserve ist die zusätzliche einfache Weglänge in km, Standard 0.
2. Der Zeitverlauf ist reine Anzeige, der Plan bleibt unverändert.
3. Ampel: Ein Weg mit Reserve zwischen 0 und R ist rot, wie jeder nicht geeignete Weg. Es gibt keine eigene gelbe Stufe, weil gelb einen Weg als nutzbar zeigen würde, den der Plan nicht fährt.
4. Plausibilitätswarnung ab 100 km Kilometerreserve (Platzhalter, blockiert nicht).
5. Zeitpunkte des Zeitverlaufs: jährlich bis D, dazu D selbst.
6. Formel-IDs im Stil der bestehenden Optimierer-IDs (`OPT.threshold`, `OPT.budget`, `OPT.target`): `OPT.timeline` und `OPT.suitableUntil`. `F3.suitable` und `OPT.threshold` behalten ihre IDs, der Kilometerstand nutzt `F2.kEnd`. Die Reserven je Zeitpunkt haben keine eigenen Einträge, damit der Rechenweg bei langer Vergleichsdauer kurz bleibt.
7. Einordnung: Folgeversion nach S25 und S26.
8. `suitableForMonths` ist eine Anzahl ganzer Monate, im Kern abgerundet (bewusste Ausnahme von „gerundet wird nur in der Anzeige“, Q5 bleibt unberührt). Testfall 21 erwartet 30.
9. Der Grund bei „ungeeignet“ nennt bei R > 0 die Kilometerreserve, die fehlende Menge ist R minus Reserve. Das gilt auch für den Grund im Streng-Modus.
10. Die Schritte C2a und C2b stehen als Phase 7 im Implementierungsplan, ohne neues Tor. Der Zeitverlauf hat in Q6 eine Ausnahme (Kilometerstand und Reserven je Zeitpunkt sind über `OPT.timeline` verlinkt).
