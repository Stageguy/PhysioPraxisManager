-- Rechnungsentwürfe (W78–W81): Preisliste je Patient, automatische Entwürfe aus Rezept und Serie,
-- Textbausteine, Praxis-Einstellungen (Kleinunternehmerregelung), Statuskonzept mit Lexware-Abgleich.

-- Jeder Patient hat eine Preisliste; beim Anlegen die aktive (W78). Rechnungsversand nach Wunsch des Patienten.
ALTER TABLE patient
  ADD COLUMN preisliste_id   bigint REFERENCES preisliste,
  ADD COLUMN rechnungsversand text NOT NULL DEFAULT 'email' CHECK (rechnungsversand IN ('email', 'post', 'beides'));

-- Einstellungen der Praxis als Schlüssel/Wert – gepflegt auf der Konfigurationsseite
CREATE TABLE praxis_einstellung (
  schluessel    text PRIMARY KEY,
  wert          text NOT NULL,
  geaendert_am  timestamptz NOT NULL DEFAULT now(),
  geaendert_von text
);
-- Kleinunternehmerregelung § 19 UStG gilt derzeit (Christian, 25.10.2026): keine USt auf Wellness
INSERT INTO praxis_einstellung (schluessel, wert) VALUES ('kleinunternehmer', 'ja'), ('ust_satz_wellness', '19');

-- Textbausteine (W80): Kennung Buchstabe + Nummer („R1“), Kurzname für die Kachel, Text für die Rechnung.
-- `wirkung`: steuerfrei_heilbehandlung = Hinweis § 4 Nr. 14 UStG; kleinunternehmer = § 19 UStG, keine USt rechnen
-- `automatisch`: bei welchen Rechnungen der Baustein von selbst dabei ist
CREATE TABLE textbaustein (
  id            bigserial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  bereich       text NOT NULL DEFAULT 'rechnung' CHECK (bereich IN ('rechnung')),
  kurzname      text NOT NULL,
  text          text NOT NULL,
  wirkung       text NOT NULL DEFAULT 'keine' CHECK (wirkung IN ('keine', 'steuerfrei_heilbehandlung', 'kleinunternehmer')),
  automatisch   text NOT NULL DEFAULT 'nie' CHECK (automatisch IN ('nie', 'heilbehandlung', 'wellness', 'alle')),
  aktiv         boolean NOT NULL DEFAULT true,
  reihenfolge   integer NOT NULL DEFAULT 0,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  geaendert_am  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO textbaustein (code, kurzname, text, wirkung, automatisch, reihenfolge) VALUES
  ('R1', 'Steuerfrei – Heilbehandlung',
   'Die aufgeführten Leistungen sind Heilbehandlungen im Bereich der Humanmedizin und nach § 4 Nr. 14 Buchst. a UStG von der Umsatzsteuer befreit. Der Rechnungsbetrag enthält keine Umsatzsteuer.',
   'steuerfrei_heilbehandlung', 'heilbehandlung', 10),
  ('R2', 'Kleinunternehmer § 19 UStG',
   'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).',
   'kleinunternehmer', 'wellness', 20),
  ('R3', 'Dank',
   'Vielen Dank für Ihr Vertrauen. Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das unten genannte Konto.',
   'keine', 'nie', 30);

-- Textbausteine an einer Rechnung – als Kopie, damit spätere Änderungen am Baustein alte Rechnungen nicht verändern
CREATE TABLE rechnung_textbaustein (
  id              bigserial PRIMARY KEY,
  rechnung_id     bigint NOT NULL REFERENCES rechnung ON DELETE CASCADE,
  textbaustein_id bigint REFERENCES textbaustein ON DELETE SET NULL,
  code            text,
  kurzname        text NOT NULL,
  text            text NOT NULL,
  wirkung         text NOT NULL DEFAULT 'keine',
  reihenfolge     integer NOT NULL DEFAULT 0
);
CREATE INDEX rechnung_textbaustein_rechnung ON rechnung_textbaustein (rechnung_id, reihenfolge);

-- Statuskonzept (W81): entwurf → fertig (wartet auf Lexware) → in_lexware (Nummer + PDF da) → gesendet → bezahlt · storniert
ALTER TYPE rechnung_status ADD VALUE IF NOT EXISTS 'in_lexware';

ALTER TABLE rechnung
  ADD COLUMN netto              numeric(10, 2),
  ADD COLUMN ust                numeric(10, 2),
  ADD COLUMN ust_satz           numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN kleinunternehmer   boolean NOT NULL DEFAULT false,
  ADD COLUMN versand_art        text CHECK (versand_art IN ('email', 'post', 'beides')),
  ADD COLUMN versendet_am       date,
  -- Lexware: was dort steht, zuletzt geprüft wann; Abweichungen (storniert, geändert) als Text für die Kachel
  ADD COLUMN lexware_status     text,
  ADD COLUMN lexware_betrag     numeric(10, 2),
  ADD COLUMN lexware_geprueft_am timestamptz,
  ADD COLUMN lexware_abweichung text,
  ADD COLUMN lexware_pdf        bytea,
  ADD COLUMN lexware_pdf_am     timestamptz,
  ADD COLUMN notiz              text;

ALTER TABLE rechnung_position
  ADD COLUMN verordnung_id          bigint REFERENCES verordnung,
  ADD COLUMN termin_id              bigint REFERENCES termin,
  ADD COLUMN preisliste_position_id bigint REFERENCES preisliste_position,
  ADD COLUMN wellness_leistung_id   bigint REFERENCES wellness_leistung;
CREATE INDEX rechnung_position_verordnung ON rechnung_position (verordnung_id) WHERE verordnung_id IS NOT NULL;
