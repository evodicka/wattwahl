# Änderung: Garantie ab Erstzulassung

Nov 14, 2026 · @Eduard Vodicka · Status: Entscheidungen getroffen, als Phase 3b in den Plan aufgenommen

Auslöser ist der Design-Review der Mockups (D3): Der Nutzer trägt die normale Garantie des Herstellers ein (Dauer in Jahren, Kilometer), die App rechnet die Restgarantie bei Gebrauchten selbst aus. Heute verlangen Spezifikation und Schema die Restgarantie als Eingabe. Dieses Dokument beschreibt die Änderung. Sie läuft als Schritt C1 in Phase 3b (vor Phase 4, siehe Implementierungsplan). Das Dokument selbst ändert noch nichts an Spezifikation, Architektur oder Code.

## Ergebnis in einem Satz

Der Rechenkern bleibt bei Restjahren und Restkilometern als Eingabe des Garantie-Budgets. Neu ist eine Ableitung davor: Aus Garantiedauer, Garantie-Kilometern, Erstzulassung, Laufleistung und einem Stichtag entsteht die Restgarantie. Bei Neuwagen ist die Restgarantie gleich der normalen Garantie.

## Neue Regel

Für Fahrzeug- und Akkugarantie getrennt:

- Alter in Monaten: a = (Jahr und Monat des Stichtags) − (Jahr und Monat der Erstzulassung), mindestens 0.
- Restjahre = max(0, Garantiedauer − a / 12). Keine Rundung, Monate zählen genau.
- Restkilometer = max(0, Garantie-Kilometer − Laufleistung).
- Neu: Restjahre = Garantiedauer, Restkilometer = Garantie-Kilometer.
- Abgelaufen heißt wie bisher: Restjahre = 0 oder Restkilometer = 0. Dann zählt die Garantie nicht ins Budget, sind beide abgelaufen, zeigt die App „ohne Garantie“.

**Stichtag:** Der Kern nutzt weder Uhrzeit noch Zufall (Q2). Der Stichtag ist deshalb ein Eingabewert des Szenarios (Monat und Jahr), kein Blick auf die Uhr. Entschieden: neuer Parameter „Stichtag der Garantieberechnung“, beim Anlegen eines Szenarios mit dem aktuellen Monat vorbelegt, in den Parametern änderbar, als Annahme gekennzeichnet. Ohne Stichtag-Parameter würde dasselbe Szenario in einem Monat ein anderes Ergebnis liefern.

**Gebrauchte ohne Erstzulassung:** Entschieden: Die Erstzulassung wird Pflichtfeld bei „gebraucht“. Fehlt sie, ist der Kandidat unvollständig mit Feldpfad `candidates[i].firstRegistration`.

## Betroffene Stellen

| Dokument oder Code | Änderung |
| --- | --- |
| Spezifikation, Datenmodell E-Auto-Kandidat | Zeilen Fahrzeuggarantie und Akkugarantie: Garantiedauer in Jahren, Garantie-Kilometer. Erstzulassung Pflicht bei gebraucht. |
| Spezifikation, Berechnungslogik | Neuer Abschnitt „Restgarantie“ mit der Regel oben. |
| Spezifikation, Garantie-Budget | „auf Basis der Restgarantie“ verweist auf den neuen Abschnitt. |
| Spezifikation, Parameterliste | Neuer Parameter Stichtag der Garantieberechnung (Annahme). |
| Spezifikation, Testfälle | Testfall 18 neu formuliert, neuer Testfall 19 (siehe unten). Testfall 10 bleibt, weil er mit Restwerten rechnet, die hier aus Neuwagen-Eingaben entstehen. |
| Architektur 5.2, 8.1, 8.2, 8.6, 11, Glossar | Kern-Eingabe `RemainingWarranty`, Schemaversion 2 samt Migration, Pflichtfeld Erstzulassung, Glossar „Restgarantie“. |
| `src/domain/schema.ts`, `defaults.ts`, `result.ts` | Felder behalten die Namen `vehicleWarranty` und `batteryWarranty`, ihre Bedeutung wechselt von Rest zu Normalwerten. Neuer Parameter, `OfferResult.warranty` nennt zusätzlich die berechneten Restwerte. |
| `src/domain/migrations.ts` | Migration v1 → v2: Bei Gebrauchten werden Rest- zu Normalwerten (Dauer = Rest + Alter, Kilometer = Rest + Laufleistung), der Stichtag ist der Monat der Migration, übergeben als Argument. Ohne Erstzulassung bleiben die Werte unverändert und der Kandidat wird unvollständig gemeldet. |
| `src/core/optimizer/warranty.ts` | Neue Funktion `remainingWarranty`, davor `warrantyBudget`. Trace-Formel `OPT.remainingWarranty`. |
| `src/core/compute.ts` | Ableitung vor dem Budget, neue Trace-Verlinkung (Q6). |
| Mockups D3, M5 | Bereits angepasst. Die Garantie-Kachel (D6, M9) kann „Restgarantie 3 Jahre, 60.000 km (berechnet)“ zeigen. |

## Schritt

Der Schritt heißt C1, steht im Implementierungsplan in Phase 3b zwischen Phase 3 und Phase 4 und enthält Aufgaben und Validierung. Er gilt auch für Leasingangebote: Die Ableitung der Restgarantie läuft für jedes Angebot, bei Leasing nutzt die Anzeige „Jahre bis zur Kilometergrenze“ die Restgarantie, das Budget bleibt dort nicht aktiv.

## Entscheidungen

1. Stichtag als Parameter der Garantieberechnung.
2. Erstzulassung ist Pflicht bei „gebraucht“.
3. Die Ableitung gilt auch für Leasingangebote.
