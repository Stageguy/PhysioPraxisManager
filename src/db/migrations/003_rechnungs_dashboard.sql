-- Rechnungs-Dashboard (Prompt 15): Absender für die Kacheln, Link in OneDrive, Freigabe-Felder,
-- „privat“ mit Rückweg (vorheriger Stand und Ordner).

ALTER TYPE inbound_status ADD VALUE IF NOT EXISTS 'privat';

ALTER TABLE inbound_document
  ADD COLUMN absender_name     text,
  ADD COLUMN absender_adresse  text,
  ADD COLUMN onedrive_web_url  text,
  ADD COLUMN zurueckgestellt_am timestamptz,
  ADD COLUMN ablehnungsgrund   text,
  ADD COLUMN status_vor_privat inbound_status,
  ADD COLUMN ordner_vor_privat text;
