-- Regelbehandlungszeiten je Heilmittel (W110): aus der Heilmittel-Richtlinie, wie sie in der GKV-Vergütungsliste
-- je Position steht („Regelbehandlungszeit 15–25 Minuten“) – als Konfigurationsdaten, von Hand änderbar.
-- Terminvorschläge zu einem Rezept nehmen die obere Grenze als Dauer. Der Abgleich mit der Richtlinie selbst
-- wird später definiert (W110b).
CREATE TABLE regelzeit (
  nummer        text PRIMARY KEY,
  bezeichnung   text NOT NULL,
  von_min       integer,
  bis_min       integer NOT NULL CHECK (bis_min > 0),
  -- 'preisliste' = aus der GKV-Vergütungsliste übernommen, 'hand' = von Lilli gesetzt
  quelle        text NOT NULL,
  geaendert_am  timestamptz NOT NULL DEFAULT now(),
  geaendert_von text NOT NULL
);
