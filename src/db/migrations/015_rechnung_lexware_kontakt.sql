-- Rechnung in zwei Klicks (W100/A28): Klick 1 legt die Rechnung in Lexware an. Der Lexware-Kontakt der Rechnung ist
-- der Rechnungsempfänger – meist der Patient (patient.lexware_kontakt_id), bei einer Bezugsperson als Empfänger ein
-- eigener Kontakt. Er wird an der Rechnung festgehalten, damit der Abgleich (contactId) ihn wiederfindet.
ALTER TABLE rechnung ADD COLUMN lexware_kontakt_id text;
