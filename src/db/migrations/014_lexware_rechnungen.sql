-- Rechnungen aus Lexware in der Kartei (W103): Rechnungen, die Lexware schon kennt (vor dem PPM oder dort von Hand
-- angelegt), erscheinen beim Patienten als Kacheln mit Datei. Sie tragen quelle = 'lexware', haben keine Positionen,
-- kein Rezept und keine Preisliste – die Verknüpfung über fall_id und verordnung_id bleibt möglich (später).
ALTER TABLE rechnung ADD COLUMN quelle text NOT NULL DEFAULT 'ppm' CHECK (quelle IN ('ppm', 'lexware'));
-- Die Leistungsgruppe ist bei übernommenen Rechnungen nicht bekannt (Kleinunternehmer: alle ohne USt)
ALTER TABLE rechnung ALTER COLUMN steuerklasse DROP NOT NULL;
ALTER TABLE rechnung ADD CONSTRAINT rechnung_steuerklasse_bekannt CHECK (quelle = 'lexware' OR steuerklasse IS NOT NULL);
-- Datei aus Lexware: Name und Stand in Lexware; das PDF selbst liegt ab jetzt verschlüsselt im Tresor (Kontext rechnung.lexware_pdf)
ALTER TABLE rechnung ADD COLUMN lexware_pdf_name text;
ALTER TABLE rechnung ADD COLUMN lexware_erstellt_am timestamptz;
ALTER TABLE rechnung ADD COLUMN lexware_geaendert_am timestamptz;
CREATE INDEX rechnung_lexware_invoice ON rechnung (lexware_invoice_id) WHERE lexware_invoice_id IS NOT NULL;
