-- Bestätigung der Behandlung durch den Patienten (W107a): Unterschrift am Bildschirm (PNG, verschlüsselt im
-- Tresor, Kontext behandlung_bestaetigung.bild), auf Papier, mündlich. Ein Anhang an die unveränderliche
-- Behandlung (§ 630f) mit Zeitstempel – höchstens eine Bestätigung je Behandlung.
CREATE TYPE bestaetigung_art AS ENUM ('unterschrift', 'papier', 'muendlich');
CREATE TABLE behandlung_bestaetigung (
  id            bigserial PRIMARY KEY,
  behandlung_id bigint NOT NULL REFERENCES behandlung ON DELETE CASCADE,
  art           bestaetigung_art NOT NULL,
  bild          bytea,
  bild_mime     text,
  -- wer bestätigt hat, wenn nicht der Patient selbst (Begleitung, Elternteil) – frei
  wer_name      text,
  zeitpunkt     timestamptz NOT NULL DEFAULT now(),
  erfasst_von   text NOT NULL
);
CREATE UNIQUE INDEX behandlung_bestaetigung_einmal ON behandlung_bestaetigung (behandlung_id);
