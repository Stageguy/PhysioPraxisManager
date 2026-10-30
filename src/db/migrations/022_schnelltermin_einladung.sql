-- Schnelltermin für einen bekannten Patienten (W117b): jeder Link in der Vorlage trägt eine zufällige
-- Einladungskennung statt Name und Mail im Klartext. Der Buchungsdienst belegt damit Name, Telefon und
-- Mail vor; kommt die Buchung zurück, ist sie über die Kennung dem Patienten sicher zugeordnet – auch
-- wenn er auf der Seite anders schreibt (kein neuer Patient, keine Dublette).
CREATE TABLE schnelltermin_einladung (
  kennung       text PRIMARY KEY,
  patient_id    bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  dauer_min     integer NOT NULL,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  erstellt_von  text NOT NULL,
  gueltig_bis   timestamptz NOT NULL
);
CREATE INDEX schnelltermin_einladung_patient ON schnelltermin_einladung (patient_id);
