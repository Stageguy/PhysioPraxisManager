/**
 * Patientenkartei (W63–W68, requirements §4b): Stammdaten, Kontaktwege, Adressen, Kontaktverlauf
 * (Anrufe mit Gesprächsgrund), Akte (Behandlungsfälle, Behandlungen, Rezepte), Termine.
 *
 * Seit A32 in Teile zerlegt (./patienten/): basis (Typen, Fehler), stammdaten, verlauf, termine, rezepte,
 * rechnungsliste, akte, dubletten (W119). Diese Datei führt alles zusammen, damit Aufrufer eine Stelle haben.
 * Alles mit Gesundheitsbezug geht durch den Tresor (verschlüsselt in der Datenbank); der Spaltenname
 * ist der Kontext. Dokumentation wird nie geändert – nur ergänzt (Trigger in Migration 007).
 */
export * from './patienten/basis.ts';
export * from './patienten/stammdaten.ts';
export * from './patienten/verlauf.ts';
export * from './patienten/termine.ts';
export * from './patienten/rezepte.ts';
export * from './patienten/rechnungsliste.ts';
export * from './patienten/akte.ts';
export * from './patienten/dubletten.ts';
