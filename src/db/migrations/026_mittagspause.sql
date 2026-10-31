-- Mittagspause (W126): Standarddauer in der Konfiguration (mittagspause_min, Vorgabe 60); je Tag eine eigene Dauer
-- (0 = an dem Tag keine Pause). Lage und Ende richten sich nach den Terminen des Tages, die Pause ist belegt
-- (keine Buchung, kein Vorschlag), zählt aber weder als frei noch als gebucht.
CREATE TABLE mittagspause_tag (
  datum         date PRIMARY KEY,
  minuten       integer NOT NULL CHECK (minuten >= 0 AND minuten <= 240),
  geaendert_am  timestamptz NOT NULL DEFAULT now(),
  geaendert_von text NOT NULL
);
