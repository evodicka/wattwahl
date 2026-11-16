# Wattwahl – Checkliste zur Abnahme am Gerät (S26)

Stand: Release-Kandidat `1.0.0-rc.1` · Freigabe G4 · Grundlage: Architektur 8.13,
Spezifikation „Abnahmekriterien“

Diese Checkliste prüft, was nur am echten Gerät prüfbar ist. Alles andere läuft
automatisch in der Pipeline (Abdeckungstabelle im Pull Request von S24).
Geräte: ein iPhone mit Safari und ein Android-Mittelklasse-Handy mit Chrome.

**Vorher am Rechner**

- [ ] Auf <https://wattwahl.evodicka.dev/> steht unten im Bereich „Szenarien und
      Daten“ `Version 1.0.0-rc.1 (Build …)`, und der Build ist der Stand von `main`.
- [ ] Die Datei `docs/acceptance/q1-messszenario.json` (10 Kandidaten, das Messszenario
      von Q1) liegt auf beiden Handys, zum Beispiel per Cloud-Ordner oder AirDrop.

## 1. iPhone mit Safari (Q9, Q8)

- [ ] Seite öffnen. Der Willkommenshinweis und der Installationshinweis für iOS
      erscheinen.
- [ ] „Teilen“ → „Zum Home-Bildschirm“, die App heißt „Wattwahl“ und hat ein Symbol.
- [ ] Die App vom Home-Bildschirm starten (nicht in Safari).
- [ ] Ein Szenario anlegen: Fahrprofil, Preise, einen Kandidaten mit einem
      Leasingangebot eintragen. Im Bereich „Ergebnis“ erscheinen Kosten.
- [ ] **Flugmodus an**, App beenden und neu starten: Die App startet, alle Eingaben
      sind da, eine Änderung (zum Beispiel der Strompreis) rechnet neu. **Q9**
- [ ] Alle Bereiche und ein Diagramm (Detailansicht eines Angebots) lassen sich
      offline öffnen.
- [ ] Flugmodus aus, **iPhone neu starten**, App öffnen: Szenario und Eingaben sind
      vollständig da. **Q8**

## 2. Android mit Chrome (Q9, Q8, Q1)

- [ ] Seite öffnen, „App installieren“ (oder „Zum Startbildschirm“). Die App heißt
      „Wattwahl“.
- [ ] Die installierte App starten, ein Szenario wie oben anlegen.
- [ ] **Flugmodus an**, App beenden und neu starten: Sie startet, rechnet neu und
      zeigt alle Eingaben. **Q9**
- [ ] **Q1 am Handy:** „Szenarien und Daten“ → „Alle vorhandenen Szenarien ersetzen“
      → die Datei `q1-messszenario.json` wählen → „Ersetzen“. Mit der Stoppuhr die
      Zeit messen, bis die Markierung „wird aktualisiert“ weg ist und im Bereich
      „Ergebnis“ „Stand …“ steht. Dreimal wiederholen (jedes Mal erneut einlesen).
      Grenze: **höchstens 5 Sekunden**. Gemessen: ___ s, ___ s, ___ s
      (zum Vergleich am Desktop in der Pipeline: unter 2 s).
- [ ] Der Ergebnis-Hash ist nicht sichtbar, dafür vergleicht man die Zahlen: Die
      Gesamtkosten des ersten Angebots stimmen mit dem Desktop überein (Zahl hier
      notieren: ________).
- [ ] **Handy neu starten**, App öffnen: Szenario und Eingaben sind da. **Q8**

## 3. Bedienung ohne Hilfe

- [ ] Eine Person, die die App nicht kennt, legt auf einem Handy ein Szenario mit
      **zwei Kandidaten** an, von der ersten Eingabe bis zum Vergleich der Kosten
      im Bereich „Ergebnis“, ohne Hilfe. Wo hat sie gestockt? ____________________

## 4. Export und Import zwischen den Geräten

- [ ] Auf dem Handy „Alle Szenarien exportieren“. Die Datei heißt
      `eauto-export-JJJJ-MM-TT-v3.json`.
- [ ] Die Datei auf den Desktop bringen und dort unter „Szenarien und Daten“
      einlesen (Modus „Hinzufügen“).
- [ ] Die Ergebnisse im Bereich „Ergebnis“ sind auf beiden Geräten gleich (Kosten
      des günstigsten Angebots, Preisfall „Mittel“): Handy ________ · Desktop ________

## 5. Kilometerreserve, Zeitverlauf und Kilometerstand (Folgeversion C2b)

Diese Punkte gelten für die Folgeversion nach dem Release-Kandidaten, auf dem
Handy mit dem Szenario aus `docs/acceptance/eauto-export-2026-11-16-v2_3.json`
(Datei einlesen, sie wird beim Einlesen auf Version 3 gebracht).

- [ ] Unter „Parameter“ gibt es das Feld **Kilometerreserve** (Standard 0 km, mit
      „Annahme“). Eine Eingabe über 100 km zeigt eine Warnung und blockiert nicht.
- [ ] Kilometerreserve auf **10 km** setzen: Für den Opel Corsa 2023 fällt „E-Auto
      pro Jahr“ gegenüber 0 km, und die Heatmap zeigt im Januar Weg A **rot** mit
      Symbol ⊘ und dem Text „unter der Kilometerreserve“, die Zahl bleibt positiv.
- [ ] Kilometerreserve auf **200 km** setzen: Die Angebote sind „ungeeignet“, der
      Grund nennt die Kilometerreserve und wie viel fehlt.
- [ ] Im Ergebnis steht neben „Verbrenner am Ende“ die Spalte **„E-Auto am Ende“**
      (Handy: eigene Zeile auf der Karte), ungeeignete Angebote zeigen keinen Wert.
      Für den MG4 (neu) etwa 152.442 km.
- [ ] In der Detailansicht unter der Heatmap steht ein **Zeitregler**. Er steht
      auf „Ende“, lässt sich mit dem Finger ziehen, und die Heatmap zeigt die
      Reserven des gewählten Zeitpunkts. Die Textliste „Zeitgrenzen der Eignung“
      nennt zum Beispiel „…, Januar: geeignet bis Monat 30“.
- [ ] Der Hinweis „Der Verlauf gilt bei diesem Plan“ ist lesbar, nichts wird
      abgeschnitten, die Seite scrollt nicht seitwärts.

## Ergebnis

| Kriterium | Gerät | Bestanden | Bemerkung |
| --- | --- | --- | --- |
| Q9 offline starten und rechnen | iPhone | ☐ | |
| Q9 offline starten und rechnen | Android | ☐ | |
| Q8 Daten nach Geräteneustart | iPhone | ☐ | |
| Q8 Daten nach Geräteneustart | Android | ☐ | |
| Q1 höchstens 5 s | Android | ☐ | |
| Zwei Kandidaten ohne Hilfe | Handy | ☐ | |
| Export und Import, gleiche Ergebnisse | Handy → Desktop | ☐ | |
| Kilometerreserve, Zeitregler, „E-Auto am Ende“ (Abschnitt 5) | Handy | ☐ | |

**Fehler:** Was nicht besteht, wird als neuer Schritt nach dem Schema des
Implementierungsplans geplant. Reicht die Zeit bei Q1 nicht, ist der erste Hebel
die gröbere DP-Zelle (Architektur 11.1, Pfad 1).

## Beim Abnahmeentscheid (G4) zu nennen

Diese Punkte sind bekannt und offen, sie ändern die Abnahme nicht, gehören aber
zur Entscheidung:

- **Firefox bricht die axe-Prüfung einzelner Seiten ab** (Architektur 11.2). Die
  Prüfung nach Q10 ist für die Diagrammseite und einige weitere Seiten in zwei
  von drei Engines nachgewiesen (Chromium, WebKit).
- **Ein zweiter offener Tab läuft nach einem Update mit altem Code weiter**
  (Architektur 11.3). Daten sind sicher, Neuladen behebt es.
- **Die Reserve im Start-Bundle ist klein:** 247,1 von 250 KB gzip (Architektur 11), seit C2b (vorher 245,3).
- **Q1 in Firefox am Desktop liegt bei 1,9 s von 2 s** (seit C2b, vorher 1,8 s).
