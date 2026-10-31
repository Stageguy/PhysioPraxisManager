-- Hausbesuche im Kalender des Postfachs (W130, Entscheidung E33 vom 31.10.2026): die Fahrt zum Hausbesuch und die
-- Rückfahrt zur Praxis sind eigene Ereignisse (Kategorie „Praxis-Fahrt“); hier ihre Kennungen, damit die Kartei sie
-- nachziehen und bei Absage löschen kann. Das Ereignis des Hausbesuchs selbst trägt die Adresse als Ort und die
-- Erinnerung zum Beginn der Anfahrt.
ALTER TABLE termin ADD COLUMN fahrt_vor_event_id text;
ALTER TABLE termin ADD COLUMN fahrt_nach_event_id text;
