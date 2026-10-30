-- Rechnungs-Mail als Entwurf in Outlook (W122, E37): der PPM legt die Mail mit PDF und GiroCode als Entwurf ins
-- Praxispostfach, Lilli passt sie dort ggf. an und sendet. „Versendet“ steht an der Rechnung erst, wenn Outlook den
-- Versand bestätigt hat – der Abgleich sieht nach, ob der Entwurf gesendet wurde (Kennung bleibt dank ImmutableId
-- gleich; zur Sicherheit auch über den Faden in „Gesendete Elemente“).
ALTER TABLE rechnung ADD COLUMN versand_entwurf_id text;
ALTER TABLE rechnung ADD COLUMN versand_entwurf_link text;
ALTER TABLE rechnung ADD COLUMN versand_entwurf_am timestamptz;
ALTER TABLE rechnung ADD COLUMN versand_conversation_id text;
CREATE INDEX rechnung_versand_entwurf ON rechnung (versand_entwurf_id) WHERE versand_entwurf_id IS NOT NULL;
