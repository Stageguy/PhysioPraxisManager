-- Rezepte als eigene Entität (W73): Rezeptarten, Langzeitbehandlung, Verknüpfung mit dem Vorgänger,
-- Korrektur (ersetzt eine Verordnung ohne neues Kontingent), Zweitschrift (nur Vermerk).
-- Wellness-Leistungen (W74): eigener Katalog außerhalb der GKV-Liste, von Lilli gepflegt.

CREATE TYPE verordnung_art AS ENUM ('erst', 'folge_unveraendert', 'folge_angepasst', 'wiederaufnahme', 'korrektur');
ALTER TYPE verordnung_status ADD VALUE IF NOT EXISTS 'ersetzt';

ALTER TABLE verordnung
  ADD COLUMN art             verordnung_art NOT NULL DEFAULT 'erst',
  ADD COLUMN langzeit        boolean NOT NULL DEFAULT false,
  -- Folgerezept: das vorherige Rezept; Korrektur: die berichtigte Verordnung (deren Haken zählen weiter)
  ADD COLUMN vorgaenger_id   bigint REFERENCES verordnung,
  ADD COLUMN zweitschrift_am date,
  ADD COLUMN notiz           text;
CREATE INDEX verordnung_vorgaenger ON verordnung (vorgaenger_id) WHERE vorgaenger_id IS NOT NULL;

-- Wellness-Leistungen: nicht aus der GKV-Liste, immer 19 % USt (Prompt 11)
CREATE TABLE wellness_leistung (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  bezeichnung text NOT NULL,
  dauer_min   integer,
  preis       numeric(10, 2) NOT NULL,
  aktiv       boolean NOT NULL DEFAULT true,
  reihenfolge integer NOT NULL DEFAULT 0,
  erstellt_am timestamptz NOT NULL DEFAULT now()
);

-- Behandlungsserie ohne Rezept (Direktzugang, Wellness): die gewählte Leistung am Fall festhalten
ALTER TABLE behandlungsfall ADD COLUMN wellness_leistung_id bigint REFERENCES wellness_leistung;
