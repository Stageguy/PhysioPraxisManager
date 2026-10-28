-- Zahlungen je Rechnung (W101a/A29): was Lexware zur Rechnung an Zahlungsposten meldet (Bankumsatz, manuell,
-- Skonto, Mahnkosten) – als Kachelzeile beim Patienten und auf der Rechnungsseite. Quelle ist Lexware; die
-- Posten werden bei jedem Abgleich für die Rechnung neu gesetzt.
CREATE TABLE rechnung_zahlung (
  id          bigserial PRIMARY KEY,
  rechnung_id bigint NOT NULL REFERENCES rechnung ON DELETE CASCADE,
  datum       date,
  betrag      numeric(10, 2) NOT NULL,
  art         text NOT NULL,
  quelle      text NOT NULL DEFAULT 'lexware' CHECK (quelle IN ('lexware', 'ppm')),
  erstellt_am timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rechnung_zahlung_rechnung ON rechnung_zahlung (rechnung_id);
