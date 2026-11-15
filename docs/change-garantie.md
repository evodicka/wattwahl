# Änderung: Garantie ab Erstzulassung

Nov 14, 2026 · @Eduard Vodicka · Status: Entscheidungen getroffen, als Phase 3b in den Plan aufgenommen, Review eingearbeitet, C1a in Spezifikation und Architektur umgesetzt, C1b im Code umgesetzt

Auslöser ist der Design-Review der Mockups (D3): Der Nutzer trägt die normale Garantie des Herstellers ein (Dauer in Jahren, Kilometer), die App rechnet die Restgarantie bei Gebrauchten selbst aus. Heute verlangen Spezifikation und Schema die Restgarantie als Eingabe. Dieses Dokument beschreibt die Änderung. Sie läuft als Schritte C1a und C1b in Phase 3b (vor S12, siehe Implementierungsplan). Das Dokument selbst ändert noch nichts an Spezifikation, Architektur oder Code.

## Ergebnis in einem Satz

Das Garantie-Budget rechnet weiter mit Restjahren und Restkilometern. Neu ist eine Ableitung davor: Aus Garantiedauer, Garantie-Kilometern, Erstzulassung, Laufleistung und einem Stichtag entsteht die Restgarantie. Bei Neuwagen ist die Restgarantie gleich der normalen Garantie.

## Neue Regel

Für Fahrzeug- und Akkugarantie getrennt:

- Alter in Monaten: a = (Jahr und Monat des Stichtags) − (Jahr und Monat der Erstzulassung), mindestens 0.
- Restjahre = max(0, Garantiedauer − a / 12). Keine Rundung, Monate zählen genau.
- Restkilometer = max(0, Garantie-Kilometer − Laufleistung).
- Neu: Restjahre = Garantiedauer, Restkilometer = Garantie-Kilometer.
- Abgelaufen heißt wie bisher: Restjahre = 0 oder Restkilometer = 0. Dann zählt die Garantie nicht ins Budget, sind beide abgelaufen, zeigt die App „ohne Garantie“. Endet die Garantie genau im Monat des Stichtags, ist sie abgelaufen.

Die Regel steht in der Spezifikation als Unterabschnitt „Restgarantie“ im Abschnitt Optimierung → Garantie-Budget, nicht als neuer Abschnitt der Berechnungslogik. Damit bleiben die Formel-IDs F1 bis F8 und die Zuordnung von `src/core/calc` zu den Abschnitten 1 bis 8 (Architektur 5.2) unverändert. Formel-ID ist `OPT.remainingWarranty`, der Code liegt in `src/core/optimizer/warranty.ts`.

**Stichtag:** Der Kern nutzt weder Uhrzeit noch Zufall (Q5). Der Stichtag ist deshalb ein Eingabewert des Szenarios (Monat und Jahr), kein Blick auf die Uhr. Entschieden: neuer Parameter „Stichtag der Garantieberechnung“, beim Anlegen eines Szenarios mit dem aktuellen Monat vorbelegt, in den Parametern änderbar, als Annahme gekennzeichnet. Ohne Stichtag-Parameter würde dasselbe Szenario in einem Monat ein anderes Ergebnis liefern.

- Den aktuellen Monat liefert `src/state`, wie die UUIDs (Architektur 8.1). `createScenarioTemplate` erhält ihn als Argument, `src/domain` und `src/core` lesen keine Uhr.
- „Zurücksetzen“ setzt den aktuellen Monat. Als „geändert“ markiert ist der Stichtag nur, wenn der Nutzer ihn selbst gesetzt hat, nicht weil der Anlagemonat vergangen ist. Dafür merkt sich das Szenario, ob der Stichtag vom Nutzer gesetzt wurde.
- Duplizieren, Import und „Als Szenario speichern“ übernehmen den Stichtag unverändert.

**Laufleistung am Stichtag:** Die Restkilometer rechnen mit der eingetragenen Laufleistung. Liegt der Stichtag in der Zukunft (etwa beim geplanten Kauf), gilt die Laufleistung als Stand an diesem Tag. Das steht als Modellgrenze in der Spezifikation.

**Gebrauchte ohne Erstzulassung:** Entschieden: Die Erstzulassung wird Pflichtfeld bei „gebraucht“. Fehlt sie, ist der Kandidat unvollständig mit Feldpfad `candidates[i].firstRegistration`. Liegt die Erstzulassung nach dem Stichtag, gilt a = 0 und es erscheint eine Plausibilitätswarnung (blockiert nicht).

## Testfälle

Testfall 10 bleibt, weil er mit Restwerten rechnet, die hier aus Neuwagen-Eingaben entstehen. Die gemeinsamen Beispieldaten der Testfälle beschreiben einen Neuwagen.

| Nr | Prüfung | Eingabe | Erwartet |
| --- | --- | --- | --- |
| 18 | Restgarantie eines Gebrauchten | Gebraucht, Erstzulassung 03/2022, Stichtag 03/2025, Laufleistung 80.000 km. Fahrzeuggarantie 3 J / 100.000 km, Akku 6 J / 140.000 km | a = 36 Monate. Fahrzeug: 0 J / 20.000 km, abgelaufen. Akku: 3 J / 60.000 km. B = 20.000 km pro Jahr aus der Akkugarantie. |
| 19 | Abgelaufene Garantie | Gebraucht, Erstzulassung 01/2020, Stichtag 03/2025, Laufleistung 170.000 km. Fahrzeuggarantie 5 J / 200.000 km, Akku 8 J / 160.000 km. Zweiter Fall: Erstzulassung 03/2020, sonst gleich | a = 62 Monate. Fahrzeug nach Alter abgelaufen (0 J / 30.000 km), Akku nach Kilometern abgelaufen (2,83 J / 0 km). Kein Budget, Status „ohne Garantie“, kein Fehler durch Division durch 0. Zweiter Fall: a = 60, Fahrzeug endet genau am Stichtag (0 J), ebenfalls „ohne Garantie“. |

Die heutigen Tests mit der Kennung TC18 (`warranty.test.ts`, `optimize.test.ts`) prüfen das Budget mit Restwerten 0. Sie bleiben unverändert erhalten und erhalten die Kennung TC19 bzw. `OPT.budget`.

## Migration v1 → v2

Die Schemaversion steigt auf 2, weil sich die Bedeutung der Garantiefelder ändert und ein neuer Pflichtparameter dazukommt. Der Migrationsschritt bleibt eine reine Funktion. Den Monat der Migration erhält er als Argument, den `src/storage` beim Laden und beim Import übergibt. Dafür bekommen `MigrationStep`, `createMigrator`, `migrate` und `upgradeScenario` einen Kontext mit diesem Monat.

- **Jedes Szenario** erhält den Stichtag = Monat der Migration, als nicht vom Nutzer gesetzt.
- **Neuwagen:** Garantiewerte bleiben unverändert.
- **Gebrauchte mit Erstzulassung:** Dauer = Restjahre + a / 12, Kilometer = Restkilometer + Laufleistung, mit a aus Erstzulassung und Monat der Migration. Damit ergibt die Ableitung wieder die alte Restgarantie. Krumme Dauern (z. B. 6,67 Jahre) sind in Ordnung.
- **Gebrauchte ohne Erstzulassung**, mit leerer Laufleistung oder mit leeren Garantiefeldern: Die nicht umrechenbaren Werte bleiben unverändert, leere Felder bleiben leer. Der Kandidat erhält das Kennzeichen „Garantiewerte prüfen“. Die Karte zeigt den Hinweis „Garantiewerte prüfen: jetzt Normalgarantie statt Restgarantie“, bis der Nutzer die Garantie bestätigt oder ändert. Der Hinweis blockiert die Rechnung nicht, eine fehlende Erstzulassung macht den Kandidaten wie oben unvollständig.

Die Rückrechnung (r + a/12) − a/12 ergibt in Gleitkomma nicht immer bitgenau r. Der Migrationstest vergleicht die Restgarantie darum mit Toleranz (Architektur 8.4), nicht exakt.

Beispiel mit der Beispieldatei Version 1 (Gebraucht, Erstzulassung 03/2023, 80.000 km, Fahrzeug 0 J / 0 km, Akku 3 J / 60.000 km), migriert im Monat 11/2026: a = 44 Monate. Fahrzeug 3,67 J / 80.000 km, Akku 6,67 J / 140.000 km. Restgarantie danach wie vorher: Fahrzeug abgelaufen, Akku 3 J / 60.000 km.

## Betroffene Stellen

| Dokument oder Code | Änderung |
| --- | --- |
| Spezifikation, Festlegungen | Zeile „Garantie“: Budget aus der Restgarantie, die die App aus normaler Garantie, Erstzulassung, Laufleistung und Stichtag berechnet. |
| Spezifikation, Datenmodell E-Auto-Kandidat | Zeilen Fahrzeuggarantie und Akkugarantie: Garantiedauer in Jahren, Garantie-Kilometer. Zeile Erstzulassung: Pflicht bei gebraucht. |
| Spezifikation, Validierung | Plausibilitätswarnung: Erstzulassung nach dem Stichtag. |
| Spezifikation, Optimierung → Garantie-Budget | Neuer Unterabschnitt „Restgarantie“ mit der Regel oben, „auf Basis der Restgarantie“ verweist darauf. |
| Spezifikation, Auswertung | Garantie-Kachel nennt die berechnete Restgarantie. |
| Spezifikation, Parameterliste | Neuer Parameter Stichtag der Garantieberechnung, Standard aktueller Monat, Platzhalter. |
| Spezifikation, Testfälle und Abnahmekriterien | Testfall 18 neu, Testfall 19 neu (siehe oben). „Alle 18 Testfälle“ wird „Alle 19 Testfälle“. |
| Spezifikation, Risiken und Grenzen | Entscheidung vom 14.11.2026 in die Tabelle und in den Einleitungssatz. Modellgrenze „Laufleistung am Stichtag“. |
| Architektur 1.2, 8.13, 10 (Q3), ADR-15 | „18 Testfälle“ bzw. „1 bis 18“ wird 19, Q3 mit offenem Nachweis für Testfall 18 und 19. |
| Architektur 5.1, 6.2, 6.3, 8.2 | Migration mit Kontext (Monat der Migration aus `src/storage`), Schemaversion 2. |
| Architektur 5.2 | `warranty.ts`: Restgarantie und Garantie-Budget. |
| Architektur 8.1 | Erstzulassung Pflicht bei gebraucht. Den aktuellen Monat für den Stichtag liefert `src/state`, wie die UUIDs. |
| Architektur 8.4 | Formel-ID `OPT.remainingWarranty` in der Zeile Optimierer. |
| Architektur 8.5 | `OfferResult.warranty.remaining` mit Rechenweg-Verweis (Q6), neuer `incomplete`-Pfad `candidates[i].firstRegistration`. |
| Architektur 8.6 | Pflichtprüfung der Erstzulassung im Rechenschema, neue Plausibilitätswarnung. |
| Architektur 9 | Neue ADR-17: Stichtag als Parameter statt Uhr im Kern. |
| Architektur 11, Glossar | Risiko der ersten echten Migration. Glossar „Restgarantie“ (`RemainingWarranty`) und „Stichtag der Garantieberechnung“. |
| `src/domain/schema.ts` | Felder behalten die Namen `vehicleWarranty` und `batteryWarranty`, ihre Bedeutung wechselt von Rest zu Normalwerten. Neuer Parameter Stichtag samt Kennzeichen „vom Nutzer gesetzt“, Kennzeichen „Garantiewerte prüfen“ am Kandidaten, `CURRENT_SCHEMA_VERSION = 2`. `CandidateComputeSchema` verlangt die Erstzulassung bei gebraucht. |
| `src/domain/defaults.ts` | `ParameterDefault` und `UNITS` erhalten einen Wert für Monat und Jahr. `createScenarioTemplate` erhält den aktuellen Monat als Argument. |
| `src/domain/result.ts` | `OfferResult.warranty` nennt zusätzlich die berechneten Restwerte beider Garantien. |
| `src/domain/validation.ts` | Warnung „Erstzulassung nach dem Stichtag“. |
| `src/domain/migrations.ts` | Migration v1 → v2 wie oben, Kontext mit dem Monat der Migration. Beispieldatei `scenario.v2.json`. |
| `src/core/optimizer/warranty.ts` | Neue Funktion `remainingWarranty`, aufgerufen vor `warrantyBudget`. Trace-Formel `OPT.remainingWarranty`. |
| `src/core/optimizer/optimize.ts` | `warrantyBudget`, `isExpired` und `yearsToKmLimit` lesen heute `candidate.vehicleWarranty` und `candidate.batteryWarranty` direkt. Sie rechnen künftig mit den Restwerten, auch bei Leasing. |
| `src/core/compute.ts` | Ableitung vor dem Budget, Ergebnisfeld mit Restwerten, neue Trace-Verlinkung (Q6). |
| `tests/fixtures/exampleScenario.ts`, `tests/fixtures/q1Scenario.ts` | Stichtag ergänzen. Die gebrauchten Kandidaten im Messszenario erhalten Normalwerte, die zum Stichtag eine laufende Restgarantie ergeben. Danach den Benchmark erneut laufen lassen und 11.1 nachführen, falls sich Werte ändern. |
| Mockups D3, M5 | Bereits angepasst. Die Garantie-Kachel (D6, M9) kann „Restgarantie 3 Jahre, 60.000 km (berechnet)“ zeigen. Der Hinweis „Garantiewerte prüfen“ auf der Kandidatenkarte fehlt noch in den Mockups. |

## Schritt

Die Änderung läuft in Phase 3b des Implementierungsplans in zwei Schritten: C1a ändert Spezifikation und Architektur und wird vom Nutzer freigegeben, C1b setzt die Änderung im Code um. Beide Schritte enthalten Aufgaben und Validierung. Die Änderung gilt auch für Leasingangebote: Die Ableitung der Restgarantie läuft für jedes Angebot, bei Leasing nutzt die Anzeige „Jahre bis zur Kilometergrenze“ die Restgarantie, das Budget bleibt dort nicht aktiv.

## Entscheidungen

1. Stichtag als Parameter der Garantieberechnung.
2. Erstzulassung ist Pflicht bei „gebraucht“.
3. Die Ableitung gilt auch für Leasingangebote.
4. Die Restgarantie ist ein Unterabschnitt des Garantie-Budgets mit Formel-ID `OPT.remainingWarranty`, kein neuer Abschnitt der Berechnungslogik.
5. Der Stichtag wird beim Zurücksetzen auf den aktuellen Monat gesetzt und gilt nur als geändert, wenn der Nutzer ihn gesetzt hat. Kopien übernehmen ihn unverändert.
6. Nur S12 und alles danach warten auf die Änderung (C1b). S15 läuft weiter nach S01.
7. Migration: Nicht umrechenbare Garantiewerte bleiben stehen, der Kandidat erhält den Hinweis „Garantiewerte prüfen“.
8. Die Änderung ist geteilt: C1a (Spezifikation und Architektur, Freigabe durch den Nutzer), danach C1b (Code).
