-- Preislisten (W97): mehrere können aktiv sein (Haken), genau eine ist der Standard. Patienten ohne
-- eigene Preisliste (preisliste_id NULL) bekommen den Standard – auch, wenn sich der Standard später
-- ändert. Vorhandene Rechnungen bleiben unverändert: sie tragen ihre Preisliste und jede Position
-- ihren Preis zum Zeitpunkt der Erstellung (Einzelpreis, Betrag) – Preislisten sind nach Freigabe
-- unveränderlich, eine Änderung ist immer eine neue Liste.
DROP INDEX IF EXISTS preisliste_eine_aktiv;
ALTER TABLE preisliste ADD COLUMN standard boolean NOT NULL DEFAULT false;
ALTER TABLE preisliste ADD CONSTRAINT preisliste_standard_ist_aktiv CHECK (NOT standard OR aktiv);
-- Genau eine Standard-Preisliste
CREATE UNIQUE INDEX preisliste_ein_standard ON preisliste ((true)) WHERE standard;
-- Die bisher einzige aktive Liste ist der Standard
UPDATE preisliste SET standard = true WHERE aktiv;
-- Nachfolger beim Archivieren: dorthin wurden die Patienten umgestellt
ALTER TABLE preisliste ADD COLUMN nachfolger_id bigint REFERENCES preisliste;
