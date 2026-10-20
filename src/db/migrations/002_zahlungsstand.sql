-- Zahlungsstand (requirements N24, N26): Kopfdaten zur Zuordnung Mail ↔ Lexware-Beleg,
-- Zahlung und Archivierung. Quelle des Zahlungsstands: Lexware (ab XL-Tarif), Lilli von Hand in
-- Outlook (Übergang) oder Altbestand (bei der Übernahme bestätigt bezahlt).

ALTER TYPE inbound_status ADD VALUE IF NOT EXISTS 'zahlung_angestossen';
ALTER TYPE inbound_status ADD VALUE IF NOT EXISTS 'bezahlt';

ALTER TABLE inbound_document
  ADD COLUMN rechnungsnummer   text,
  ADD COLUMN betrag            numeric(12, 2),
  ADD COLUMN rechnungsdatum    date,
  ADD COLUMN zahlstatus_quelle text CHECK (zahlstatus_quelle IN ('lexware', 'manuell', 'altbestand')),
  ADD COLUMN bezahlt_am        date,
  ADD COLUMN archiviert_at     timestamptz;

CREATE INDEX inbound_document_rechnungsnummer ON inbound_document (rechnungsnummer) WHERE klasse = 'rechnung';
