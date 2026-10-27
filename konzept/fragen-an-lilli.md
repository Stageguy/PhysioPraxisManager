# Fragen an Lilli

Stand: 20.10.2026 · für das nächste Gespräch mit Lilli. Antworten bitte direkt hier eintragen.
Jede Frage verweist in Klammern auf die Stelle in [requirements.md](requirements.md).

## Rechnungen und Zahlungen

**1. Sind die Mails mit Rechnungs-PDFs im Archiv schon bezahlt?**
Im Outlook-Archiv liegen seit Dezember 2025 36 Mails mit Rechnungs-PDF. Sind diese Rechnungen
alle bezahlt? Wenn ja, bis zu welchem Tag sicher? Dann legt das System sie gleich als
„Rechnung: bezahlt“ ab, und du musst sie nicht einzeln anfassen. (N26, `--bezahlt-bis`)
Gleiches gilt für Rechnungen in Unterordnern des Posteingangs (29) und im Papierkorb (9).

> Antwort:

**2. Welche Absender sind beruflich?**
Im Postfach liegen private und berufliche Rechnungen gemischt. Bitte ankreuzen, welche Absender
zur Praxis gehören. Nur deren Rechnungen legt das System ohne Rückfrage ab. (N21, A06a)

| Absender | beruflich? |
|---|---|
| Telekom | ☐ |
| Lexware (Abo-Rechnung) | ☐ |
| practomed | ☐ |
| beckenbodenfortbildung.de | ☐ |
| bueroshop24 | ☐ |
| elektro-springer.de | ☐ |
| Deutsche Post | ☐ |
| Deutsche Bahn | ☐ |
| Amazon | ☐ teils |
| IKEA | ☐ |
| H&M | ☐ |
| weitere: … | ☐ |

> Antwort:

**3. Sind die Mails von belege.lexware.de deine eigenen Rechnungen an Patienten?**
Es sind 78 Mails, darin stehen Diagnose, Krankenkasse und Rezept. Das System hält sie für
Kopien deiner eigenen Rechnungen und überspringt sie. Stimmt das? (N25)

> Antwort:

**4. Was muss auf deinen Rechnungen an Patienten stehen?**
Heute stehen Diagnose, Krankenkasse und Rezept darauf. Verlangen Privatversicherung und Beihilfe
das wirklich, oder genügen Leistung und Datum? Am besten mit der Steuerberatung klären. (E17)

> Antwort:

**5. Wann bekommst du den Lexware-Tarif XL?**
Erst damit kann das System den Zahlungsstand selbst aus Lexware lesen. Bis dahin setzt du bei
bezahlten Rechnungen die Kategorie „Rechnung: bezahlt“ in Outlook selbst. (A13, N26)

> Antwort:

**6. Zahlung: eine Kategorie oder zwei?**
Vorschlag: „Zahlung angestoßen“, sobald du in Lexware die Überweisung beauftragst, und
„bezahlt“, wenn die Bank gebucht hat. Oder genügt dir „bezahlt“? (E22)

> Antwort:

**7. Welcher Ordner ist wofür?**
In „01 Finanzen“ gibt es „01 Rechnungseingang“, im Jahresordner „Rechnungen Business“ und neu
„Eingangsrechnungen“. Vorschlag: In „Eingangsrechnungen“ legt das System ab, „Rechnungen Business“
bleibt für deine Ablage von Hand. Passt das? (E21)

> Antwort:

## Termine und Patienten

**8. Absage weniger als 24 Stunden vorher:** Was gilt dann, zum Beispiel eine Ausfallgebühr? (E7)

> Antwort:

**9. Zwischenrechnung bei langen Rezepten:** Nach wie vielen Quartalen soll standardmäßig eine
Zwischenrechnung kommen? Pro Patient lässt sich das später ändern. (E10)

> Antwort:

**10. Leistungen und Preise:** Welche Leistungen bietest du an, wie lange dauern sie, was kosten
sie, und welche sind Heilbehandlung bzw. Wellness mit 19 %? Am besten mit der Steuerberatung. (E9)

> Antwort:

**11. WhatsApp:** Sollen Terminanfragen auch über WhatsApp kommen dürfen? Dazu gibt es vorher
eine kurze Entscheidungsvorlage zum Datenschutz. (E8)

> Antwort:

## Patientenkartei

**14. Woher kommen deine heutigen Patientendaten?** Lexware-Kunden, eine Excel-Liste, Karteikarten?
Dann übernehmen wir sie einmalig – mit den vorhandenen Kundennummern. (§4b, A19c)

> Antwort:

**15. Behandelst du auch ohne ärztliche Verordnung?** Dafür braucht es die sektorale
Heilpraktikererlaubnis (Physiotherapie). Wenn ja: seit wann, welche Behörde? Ohne Erlaubnis bleibt
„ohne Rezept“ auf Prävention und Wellness beschränkt. (E26)

> Antwort:

**16. Welche Gesprächsgründe brauchst du nach einem Anruf?** Vorschlag: Terminvereinbarung,
Terminverschiebung, Absage Patient, Absage Praxis, Erinnerung, Rückfrage zur Behandlung, Rückfrage
zur Rechnung, Nicht erreicht, Sonstiges. Fehlt etwas? (W67)

> Antwort:

**17. Ab wann ist eine Rechnung „leicht verzögert“ (gelb) und ab wann „im Verzug“ (rot)?**
Vorschlag: gelb ab dem Fälligkeitstag, rot 14 Tage danach oder nach der ersten Mahnung. (E25)

> Antwort:

**18. Welche Unterlagen gibst du Patienten heute?** Datenschutzinformation, Kosteninformation,
Behandlungsvertrag, Einwilligung WhatsApp/E-Mail – bitte je ein Exemplar, damit die Fassungen in
der Akte vermerkt werden können. (§4b)

> Antwort:

**19. Rezepte fotografieren – nur über den Knopf in der Praxis-Assistenz?** Dann landet das Foto
verschlüsselt in der Akte und nicht in der Fotomediathek des iPhones (von dort ginge es in iCloud-Fotos,
ein US-Dienst). Fotografierst du heute Rezepte mit der Kamera-App? Ist iCloud-Fotos auf dem
Praxis-iPhone an? (W69)

> Antwort:

**20. Kalender und Siri:** Welcher Kalender ist auf deinem iPhone der Standardkalender (Einstellungen →
Kalender → Standardkalender)? Für Siri-Termine muss es der Exchange-Kalender von praxis@ sein, sonst sieht
die Praxis-Assistenz sie nicht und kann keine Kollision vermeiden. Passt dir ein eigener Kalender „Praxis“
für die Termine der Praxis-Assistenz (lila Kategorie), neben deinem normalen Kalender? (E27, W77)

> Antwort:

**21. Kleinunternehmerregelung:** Gilt § 19 UStG für dich noch (Vorjahresumsatz bis 25.000 €, laufend bis
100.000 €)? Sobald nicht mehr, schalten wir in der Konfiguration um – dann rechnen Wellness-Rechnungen 19 %.
Mit der Steuerberatung klären. (W80)

> Antwort:

**22. Rechnungsversand:** Welche Patienten wollen die Rechnung per Mail, welche per Post? Standard ist Mail;
in den Stammdaten einstellbar. Und: Was steht heute als Text unter deinen Rechnungen (Dank, Bankverbindung,
Zahlungsziel)? Das werden die Textbausteine R3 ff. (W80)

> Antwort:

## Zugang und Ablage

**12. Ein Konto oder zwei?** Heute arbeitest du und das System mit praxis@lilli-nebel.de. Reicht
das, oder möchtest du ein eigenes Konto? (E5)

> Antwort:

**13. Deine Ablage „Praxis Lilli Nebel“ liegt im OneDrive von Christian.** Soll sie in dein
OneDrive (praxis@) umziehen, damit sie dir gehört? (E20, N23)

> Antwort:

## Terminanfragen (26.10.2026)

**23. Öffnungszeiten, Dauer, Ordner:** Die Praxis-Assistenz schlägt Patienten drei freie Zeiten vor. Dafür
braucht sie (a) deine **Öffnungszeiten je Wochentag** (Vorgabe: Mo–Do 8–18, Fr 8–14 Uhr), (b) die
**Dauer je Behandlung** (Vorgabe 30 Min.; KG 30, MT 30, MLD 45/60, Massage 20/30?), (c) ob **Mariä
Himmelfahrt** (15.8.) bei dir frei ist (in Bad Wörishofen Feiertag), (d) einen **Puffer** zwischen Terminen.
Alles steht unter Konfiguration und lässt sich ändern. Dazu legen wir in Outlook einen Ordner
„Posteingang/Terminanfragen“ an und eine Regel: Betreff enthält „Termin“ → in diesen Ordner. Mails aus
dem Kontaktformular der Website gehören auch dorthin (Frage an den Website-Anbieter: feste Feldnamen
„Name:“, „Telefon:“, „E-Mail:“, „Wunschtermin:“, „Anliegen:“).

**24. Terminarten für die Online-Anfrage:** Unter Konfiguration → Terminarten stehen 38 Kacheln in drei
Sektionen (Rezept, Selbstzahler, Wellness), alle noch aus. Bitte (a) die Kacheln anhaken, die Patienten auf
der Website wählen sollen, (b) **Dauern** prüfen – deine Website nennt keine, die Werte sind Vorschläge
(z. B. Abhyanga 90, Shirodhara 60, Lomi Lomi 90, Beckenbodentherapie 60 Minuten), (c) die
**Langbeschreibungen** in deinen Worten ergänzen (sie stehen öffentlich unter dem Dropdown), (d) sagen, ob
die Einteilung passt: „Selbstzahler – Behandlungen nach Physioverordnung“ = privat bezahlt, mit oder ohne
Rezept. Farben: Rezept Brombeer, Selbstzahler Holzbraun, Wellness Gold – so auch im Kalender.

**25. Buchungsseite:** Patienten können Terminart, Tag und Uhrzeit selbst wählen; das kommt als Wunsch zu
dir, du bestätigst. Bitte entscheiden: (a) welche Terminarten online stehen (wenige – das Dropdown soll
übersichtlich bleiben, Vorschlag: Neupatient, KG, MT, Lymphdrainage, zwei bis drei Wellness-Angebote),
(b) **Vorlauf**: frühestens 24 Stunden im Voraus? (c) **Zeitraum**: drei Wochen im Voraus? (d) der
**Hinweistext** über dem Formular, (e) ob die Seite im Kontaktbereich von lilli-nebel.de oder auf einer
eigenen Unterseite „Termin“ stehen soll. Öffentlich wird sie erst, wenn Christian sie freigibt.


**26. Weniger, längere Termine als verordnet (W108):** Manche Patienten wollen statt 10 × 20 Minuten lieber
5 × 40 Minuten. Der PPM kann das als **Doppelbehandlung** abbilden: ein 40-Minuten-Termin verbraucht zwei
Einheiten des Rezepts, Akte und Rechnung zeigen das genau so (ein Tag, zwei Einheiten). Nicht möglich ist eine
Dokumentation mit erfundenen Terminen – das wäre eine falsche Behandlungsdokumentation. Bitte entscheiden:
(a) Willst du Doppelbehandlungen anbieten? (b) Sprichst du mit den verordnenden Ärzten ab, dass sie
„Doppelbehandlung“ oder eine 40-Minuten-Leistung gleich verordnen? (c) Sollen Patienten vorher den Hinweis
bekommen, dass ihre Versicherung Doppelbehandlungen ohne Verordnung kürzen kann (eine Erklärung in der Akte)?
