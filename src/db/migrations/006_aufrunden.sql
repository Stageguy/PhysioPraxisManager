-- Preislisten: eigene Preise auf volle Euro aufrunden (W60) – je Preisliste und im Muster
ALTER TABLE preisliste ADD COLUMN aufrunden boolean NOT NULL DEFAULT false;
ALTER TABLE preisvorlage ADD COLUMN aufrunden boolean NOT NULL DEFAULT false;
