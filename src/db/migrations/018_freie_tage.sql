-- Freie Tage (A26/W111): Feiertage als Daten (Bayern, importiert oder gerechnet), Brückentage nach Lillis Wahl,
-- Schließtage (Urlaub, Fortbildung, geschlossen). gesperrt = keine Terminvorschläge, nicht buchbar.
CREATE TYPE freier_tag_art AS ENUM ('feiertag', 'brueckentag', 'geschlossen', 'urlaub', 'fortbildung');
CREATE TABLE freier_tag (
  datum        date PRIMARY KEY,
  name         text NOT NULL,
  art          freier_tag_art NOT NULL,
  gesperrt     boolean NOT NULL DEFAULT true,
  -- feiertage-api.de, Rechner oder hand
  quelle       text NOT NULL,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  erstellt_von text NOT NULL
);
