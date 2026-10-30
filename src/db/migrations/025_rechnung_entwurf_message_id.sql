-- Sprung in Apple Mail (W122b): Apple Mail öffnet eine Nachricht über ihre Internet-Message-ID (message://<…>). Die ID
-- bekommt der Entwurf beim Anlegen von Exchange; sie bleibt beim Senden gleich.
ALTER TABLE rechnung ADD COLUMN versand_entwurf_message_id text;
