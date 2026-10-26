-- Buchungsseite (W96): Buchungswünsche kommen vom öffentlichen Buchungsdienst als Anfragen mit Quelle
-- „buchung“; die Kennung der Buchung verhindert Dubletten. Einstellungen für das Angebot.
ALTER TYPE anfrage_quelle ADD VALUE IF NOT EXISTS 'buchung';
ALTER TABLE terminanfrage ADD COLUMN buchung_id text UNIQUE;

INSERT INTO praxis_einstellung (schluessel, wert) VALUES
  ('buchung_vorlauf_stunden', '24'),
  ('buchung_tage', '21'),
  ('buchung_hinweis', 'Bitte wählen Sie Behandlung, Tag und Uhrzeit. Ihr Wunsch ist eine Anfrage – wir melden uns zur Bestätigung.'),
  ('buchung_letzte_nr', '0')
ON CONFLICT (schluessel) DO NOTHING;
