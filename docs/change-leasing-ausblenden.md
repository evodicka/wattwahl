# Änderung: Leasingangebote ausblenden

Nov 17, 2026 · Eduard Vodicka · Status: Entscheidungen getroffen, als Phase 9 nach C3b geplant, C4a in Spezifikation, Architektur und Plan umgesetzt, C4b im Code umgesetzt

Auslöser ist die Übersichtlichkeit der Ergebnisansicht. Mit mehreren Kandidaten und je bis zu vier Leasingstufen stehen in der Ergebnistabelle schnell mehr Leasing- als Kaufangebote. Der Nutzer will die Leasingangebote mit einem Schalter auf der Ergebnisseite ausblenden. Ausgeblendete Angebote braucht die App nicht zu rechnen.

Dieses Dokument beschreibt die Änderung. Sie läuft als Schritte C4a und C4b in Phase 9 (nach C3b, siehe Implementierungsplan). Das Dokument selbst ändert nichts an Code.

## Ergebnis in einem Satz

Ein neues Feld des Szenarios „Leasingangebote berücksichtigen“ (Standard „ja“) lässt sich im Kopf der Ergebnisseite umschalten. Bei „nein“ rechnet die App je Kandidat nur das Kaufangebot, und alle Ergebnisansichten, der Kandidatenstatus und der Szenariovergleich zeigen keine Leasingangebote. Bei „ja“ bleiben alle Ergebnisse unverändert.

## Regel

Die Angebote eines Kandidaten in einem Szenario sind:

- bei `includeLeaseOffers = true` das Kaufangebot und je Leasingstufe ein Angebot (wie bisher),
- bei `includeLeaseOffers = false` nur das Kaufangebot.

Die Leasingstufen bleiben beim Kandidaten gespeichert, erfasst und exportiert. Das Ausblenden löscht nichts. Es ändert auch keine Rechenformel: Ein Angebot, das gerechnet wird, hat dasselbe Ergebnis wie ohne die Änderung (Kauf und Leasing teilen den Optimierer je Kandidat, ein fehlendes Leasingangebot ändert das Ergebnis des Kaufs nicht).

**Unvollständige Leasingstufe:** Heute macht ein unvollständiges Leasingangebot alle Angebote des Kandidaten unvollständig (Architektur 8.5). Bei ausgeblendetem Leasing zählt es nicht, denn es wird nicht geprüft. Der Kandidat kann dann trotz einer Lücke in einer Leasingstufe gerechnet werden. Die Karte zeigt den Hinweis „Leasing ausgeblendet“ (siehe Darstellung).

## Wo die Einstellung liegt

`scenario.includeLeaseOffers: boolean`, ein Feld des Szenarios neben `parameters`, nicht in `parameters`. Begründung: Die Parameterliste der Spezifikation (`PARAMETER_DEFAULTS` in `defaults.ts`) enthält Rechenparameter und wird Zeile für Zeile geprüft, jede Zeile hat ein Feld auf der Parameterseite. Das neue Feld wählt aus, welche Angebote es gibt, und gehört nicht zu den Rechenparametern. Der Wert gehört zum Szenario: Er wird gespeichert, exportiert und beim Duplizieren und bei „Als Szenario speichern“ übernommen. So lassen sich zwei Szenarien mit und ohne Leasing vergleichen, und ein Export bleibt reproduzierbar.

Hinweis: Auch `sohPlanMode` gilt je Szenario (er liegt in `scenario.parameters`), nicht für alle. Er ist nur bei den Parametern der Eignungsprüfung zu finden. Er bleibt, wo er ist.

## Darstellung

- **Ergebniskopf:** Ein Schalter „Leasing anzeigen“ neben der Auswahl des Preisfalls. Er ändert das Szenario (Autosave, Neuberechnung wie bei jeder Eingabe).
- **Sichtbarkeit:** Der Schalter steht nur im Vergleich, nicht in der Detailansicht eines Angebots (Ausblenden würde das offene Angebot wegnehmen). Er erscheint, wenn mindestens ein Kandidat eine Leasingstufe hat oder wenn Leasing gerade ausgeblendet ist. So kommt man auch zurück, wenn die letzten Stufen gelöscht wurden.
- **Hinweis:** Bei ausgeblendetem Leasing steht unter der Tabelle (Karten auf dem Handy) „N Leasingangebote ausgeblendet“. N zählt die Leasingstufen aller Kandidaten.
- **Sofort statt nach der Rechnung:** Die Ansichten filtern selbst nach dem Feld. Beim Umschalten verschwinden Leasingzeilen sofort, auch wenn das letzte Ergebnis noch alte Leasingergebnisse enthält.
- **Detailroute:** `#/ergebnis/<offerId>` eines ausgeblendeten Leasingangebots hat keine Zeile und leitet auf `#/ergebnis` um (bestehende Regel für unbekannte Angebote).
- **Kandidatenseite:** Der Status eines Kandidaten beurteilt nur die sichtbaren Angebote. Ist das Kaufangebot ungeeignet und nur Leasing geeignet, zeigt die Karte bei ausgeblendetem Leasing „ungeeignet“. Damit das nicht überrascht, trägt die Zahl der Leasingangebote in der Zusammenfassung der Liste den Hinweis „ausgeblendet“.
- **Szenariovergleich:** Jedes Szenario gilt mit seinem eigenen Schalter. Die Zuordnung der Angebote erfolgt wie bisher über Kandidatenname und Angebotsart. Leasingzeilen erscheinen dann nur für ein Szenario, das Leasing zeigt, so wie ein Angebot, das es nur in einem Szenario gibt.

## Testfälle

Die Testfälle 1 bis 26 bleiben unverändert (Standard „ja“).

| Nr | Prüfung | Eingabe | Erwartet |
| --- | --- | --- | --- |
| 27 | Leasing ausgeblendet | Export `eauto-export-2026-11-16-v2_3.json`, `includeLeaseOffers = false` | Der Rechenkern liefert für jeden Kandidaten nur das Kaufangebot, es gibt keinen Schlüssel mit `:lease:`. Das Ergebnis jedes Kaufangebots ist in allen Zahlen gleich dem mit `includeLeaseOffers = true`. Die Ergebnistabelle hat nur Kaufzeilen, der Hinweis nennt die Anzahl der Leasingstufen. |

Dazu Integrationstests: Die Migration v4 → v5 setzt `includeLeaseOffers = true` und lässt alle Ergebnisse und den Hash (Q5) gleich. Die Detailroute eines ausgeblendeten Angebots leitet um. „Alle 26 Testfälle“ wird „Alle 27 Testfälle“.

## Migration v4 → v5

Die Schemaversion steigt auf 5, weil ein neues Pflichtfeld dazukommt. Der Migrationsschritt setzt `includeLeaseOffers = true` in jedem Szenario und ändert sonst nichts. Alle bestehenden Ergebnisse und der Ergebnis-Hash bleiben gleich. Beispieldatei `scenario.v5.json`. Ein Import älterer Dateien läuft über dieselbe Kette.

## Betroffene Stellen

| Dokument oder Code | Änderung |
| --- | --- |
| Spezifikation, Datenmodell „Szenario“ | Neues Feld „Leasingangebote berücksichtigen“ (Ja oder Nein, Standard Ja). |
| Spezifikation, Auswertung: „Ergebnistabelle“, „Szenariovergleich“ | Schalter und Hinweis, Szenariovergleich mit eigenem Schalter je Szenario. |
| Spezifikation, Oberfläche: Kandidaten | Hinweis „ausgeblendet“ an der Zahl der Leasingangebote, Status nur über sichtbare Angebote. |
| Spezifikation, Testfälle, Risiken und Grenzen | Testfall 27, „Alle 27 Testfälle“, Entscheidungszeile „Leasingangebote ausblenden“. |
| Architektur 1.2, 8.13, 9 (ADR-15) | Testfallzählung 26 wird 27. |
| Architektur 8.1, 8.2 | Feld im Szenario, Schemaversion 5 und Migration v4 → v5. |
| Architektur 8.5 | Der Worker rechnet nur die Angebote, die das Szenario zeigt. |
| Architektur 8.8 | Schalter im Ergebniskopf, Hinweis, Umleitung der Detailroute. |
| Architektur 9 | Neue ADR-20 „Leasing ausblenden als Feld des Szenarios, Filter an einer Stelle“. |
| `src/domain/schema.ts`, `defaults.ts` | Feld `includeLeaseOffers`, `CURRENT_SCHEMA_VERSION = 5`. |
| `src/domain/migrations.ts`, `__fixtures__` | Migration v4 → v5, `scenario.v5.json`. |
| `src/domain/offerId.ts` | `listScenarioOffers(scenario, candidate)`: ein Filter für alle Aufzählungen. |
| `src/worker/endpoint.ts` | `compute` und `compare` rechnen nur die Angebote aus `listScenarioOffers`. |
| `src/core/compute.ts` | Prüfung der Vollständigkeit: ein unvollständiges Leasingangebot blockiert den Kandidaten nur, wenn Leasing berücksichtigt wird. |
| `src/ui/forms/resultRows.ts`, `candidateStatus.ts`, `comparisonView.ts` | Aufzählung über `listScenarioOffers`. |
| `src/ui/areas/ErgebnisPage.tsx` | Schalter im Kopf des Vergleichs (nicht in der Detailansicht), Hinweis „N Leasingangebote ausgeblendet“. |
| `src/ui/areas/kandidaten/CandidateList.tsx`, `src/i18n/de.json` | Hinweis „ausgeblendet“ an der Zahl der Leasingangebote in der Zusammenfassung der Liste, neue Texte. |
| `docs/implementation_plan.md` | Phase 9 mit C4a und C4b, Schrittzahl, Fahrplan-Diagramm. |
| `tests/fixtures`, `e2e`, `docs/acceptance-checklist.md` | Feld ergänzen, neue Tests, Abnahmepunkt für den Schalter. |

## Schritt

Die Änderung läuft wie die früheren in zwei Schritten: C4a ändert Spezifikation, Architektur und Plan, C4b setzt sie im Code um. **Abweichend von C1 bis C3** liegen beide Schritte auf demselben Branch, und die Freigabe von C4a erfolgt mündlich im Chat, nicht durch ein Zusammenführen. Voraussetzung ist C3b. Die Änderung berührt weder Optimierer noch Preisfaktoren. Der Benchmark Q1 braucht keine neue Messung, weil er mit Leasing rechnet (Standard „ja“).

## Entscheidungen

1. Ausgeblendete Angebote werden nicht gerechnet. Das spart Rechenzeit und macht den Schalter zu einer Eigenschaft der Eingabe, nicht der Ansicht.
2. Der Schalter gilt für alle Leasingangebote eines Szenarios, nicht je Stufe.
3. Die Einstellung gehört zum Szenario (Feld `includeLeaseOffers`), der Schalter liegt auf der Ergebnisseite.
4. Der Filter steht an einer Stelle (`listScenarioOffers`), damit Worker und Ansichten dieselben Angebote kennen.
5. Im Szenariovergleich gilt der Schalter jedes Szenarios für sich.
