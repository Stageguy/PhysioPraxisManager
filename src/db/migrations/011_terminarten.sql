-- Terminarten für die Online-Terminanfrage (W94): Kacheln auf der Konfigurationsseite mit Kennung,
-- Kurzbeschreibung (im Dropdown), Langbeschreibung (unter dem Dropdown) und Dauer (für Vorschläge).
-- Nur aktive erscheinen im Dropdown. Drei Sektionen mit eigener Farbe und eigenem Symbol (W95),
-- die auch im Kalender wiederkehren.
--
-- Standardkacheln: alle inaktiv. Dauer = obere Regelbehandlungszeit der GKV-Vergütungsliste, auf
-- 15 Minuten aufgerundet (Umziehen und Dokumentation über den Puffer der Öffnungszeiten); Leistungen
-- von lilli-nebel.de ohne Angabe auf der Website – Dauer als Vorschlag, Lilli passt sie an.

CREATE TYPE terminart_sektion AS ENUM ('rezept', 'selbstzahler', 'wellness');

CREATE TABLE terminart (
  id               bigserial PRIMARY KEY,
  -- Kennung: Buchstabe der Sektion + Nummer (P = Rezept, S = Selbstzahler, W = Wellness), z. B. „P4“
  code             text NOT NULL UNIQUE,
  sektion          terminart_sektion NOT NULL,
  -- Im Dropdown der Website
  kurz             text NOT NULL,
  -- Unter dem Dropdown, sobald gewählt
  lang             text,
  dauer_min        integer NOT NULL CHECK (dauer_min > 0 AND dauer_min <= 480),
  -- GKV-Positionsnummer (Bezug zur Preisliste) und Regelbehandlungszeit aus der Vergütungsliste
  leistung_nummer  text,
  regelzeit        text,
  aktiv            boolean NOT NULL DEFAULT false,
  reihenfolge      integer NOT NULL DEFAULT 0,
  erstellt_am      timestamptz NOT NULL DEFAULT now(),
  geaendert_am     timestamptz NOT NULL DEFAULT now(),
  geaendert_von    text
);

ALTER TABLE terminanfrage ADD COLUMN terminart_id bigint REFERENCES terminart;
ALTER TABLE termin ADD COLUMN terminart_id bigint REFERENCES terminart;

INSERT INTO terminart (code, sektion, kurz, lang, dauer_min, leistung_nummer, regelzeit, reihenfolge) VALUES
-- ── Physioleistungen gemäß Katalog und Rezept ──────────────────────────────
('P1', 'rezept', 'Neupatient – Erstanamnese und Befund', 'Ihr erster Termin in der Praxis: ausführliches Gespräch, Untersuchung und Befund, danach die erste Behandlung. Bitte bringen Sie Ihr Rezept und vorhandene Arztberichte mit.', 60, NULL, NULL, 10),
('P2', 'rezept', 'Neues Rezept – erster Termin der Serie', 'Sie haben ein neues Rezept: Wir planen die Behandlungsserie und beginnen gleich. Bitte das Rezept zum Termin mitbringen.', 45, NULL, NULL, 20),
('P3', 'rezept', 'Folgerezept – die Behandlung geht weiter', 'Ihre Behandlung geht mit einem Folgerezept weiter. Bitte das neue Rezept zum nächsten Termin mitbringen.', 30, NULL, NULL, 30),
('P4', 'rezept', 'Krankengymnastik (KG)', 'Aktive Bewegungstherapie auf Rezept – Regelbehandlungszeit 15 bis 25 Minuten.', 30, '20501', '15 bis 25 Minuten', 40),
('P5', 'rezept', 'Manuelle Therapie (MT)', 'Gezielte Behandlung von Gelenken, Muskeln und Nerven auf Rezept – Regelbehandlungszeit 15 bis 25 Minuten.', 30, '21201', '15 bis 25 Minuten', 50),
('P6', 'rezept', 'Beckenbodentherapie auf Rezept (KG)', 'Beckenbodentherapie als Krankengymnastik auf Rezept – für Frauen und Männer.', 30, '20501', '15 bis 25 Minuten', 60),
('P7', 'rezept', 'Manuelle Lymphdrainage 30 Minuten (MLD-30)', 'Entstauende Lymphdrainage, Teilbehandlung – 30 Minuten.', 30, '20205', '30 Minuten', 70),
('P8', 'rezept', 'Manuelle Lymphdrainage 45 Minuten (MLD-45)', 'Entstauende Lymphdrainage, Großbehandlung – 45 Minuten.', 45, '20201', '45 Minuten', 80),
('P9', 'rezept', 'Manuelle Lymphdrainage 60 Minuten (MLD-60)', 'Entstauende Lymphdrainage, Ganzbehandlung – 60 Minuten.', 60, '20202', '60 Minuten', 90),
('P10', 'rezept', 'Klassische Massagetherapie (KMT)', 'Massage auf Rezept – Regelbehandlungszeit 15 bis 20 Minuten.', 30, '20106', '15 bis 20 Minuten', 100),
('P11', 'rezept', 'Bindegewebsmassage (BGM)', 'Reflektorische Behandlung über das Bindegewebe – Regelbehandlungszeit 20 bis 30 Minuten.', 30, '20107', '20 bis 30 Minuten', 110),
('P12', 'rezept', 'KG-ZNS für Erwachsene (Bobath, PNF)', 'Krankengymnastik bei zentralen Bewegungsstörungen ab 18 Jahren – Regelbehandlungszeit 25 bis 35 Minuten.', 45, '20710', '25 bis 35 Minuten', 120),
('P13', 'rezept', 'KG-ZNS für Kinder (Bobath)', 'Krankengymnastik bei zentralen Bewegungsstörungen bis 18 Jahre – Regelbehandlungszeit 30 bis 45 Minuten.', 45, '20708', '30 bis 45 Minuten', 130),
('P14', 'rezept', 'Gerätegestützte Krankengymnastik (KG-Gerät)', 'Training an Geräten unter Anleitung – 60 Minuten.', 60, '20507', '60 Minuten', 140),
('P15', 'rezept', 'Standardisierte Heilmittelkombination (D1)', 'Kombination mehrerer Maßnahmen der Physiotherapie in einem Termin – 60 Minuten.', 60, '22001', '60 Minuten', 150),
('P16', 'rezept', 'Hausbesuch (laut Rezept)', 'Behandlung bei Ihnen zu Hause, wenn auf dem Rezept ein Hausbesuch verordnet ist.', 60, '29950', NULL, 160),
-- ── Selbstzahler: Behandlungen nach Physioverordnung, privat bezahlt ────────
('S1', 'selbstzahler', 'Erstbefund ohne Rezept', 'Erster Termin ohne ärztliche Verordnung: Gespräch, Untersuchung, Befund und erste Behandlung. Abrechnung nach der Preisliste der Praxis.', 60, NULL, NULL, 210),
('S2', 'selbstzahler', 'Physiotherapie als Selbstzahler (KG)', 'Krankengymnastik ohne Rezept oder mit einem Rezept, das die Kasse nicht übernimmt – privat bezahlt.', 30, '20501', '15 bis 25 Minuten', 220),
('S3', 'selbstzahler', 'Manuelle Therapie als Selbstzahler', 'Manuelle Therapie und Schmerzbehandlung, privat bezahlt.', 30, '21201', '15 bis 25 Minuten', 230),
('S4', 'selbstzahler', 'Lymphdrainage als Selbstzahler', 'Manuelle Lymphdrainage, privat bezahlt – 60 Minuten.', 60, '20202', '60 Minuten', 240),
('S5', 'selbstzahler', 'Beckenbodentherapie (Tanzberger, Junginger, Physio Pelvica)', 'Ultraschallgestützte Beckenbodentherapie nach Tanzberger-Konzept, Bärbel Junginger und Physio Pelvica – für Frauen und Männer.', 60, NULL, NULL, 250),
('S6', 'selbstzahler', 'Ultraschallgestützte Beckenbodendiagnostik', 'Untersuchung des Beckenbodens mit Ultraschall – sichtbar machen, was sonst verborgen bleibt.', 45, NULL, NULL, 260),
('S7', 'selbstzahler', 'Pessaranpassung', 'Beratung und Anpassung eines Pessars – verschiedene Typen und Anwendungen.', 45, NULL, NULL, 270),
('S8', 'selbstzahler', 'Craniosacrale Therapie', 'Sanfte Behandlung über Schädel, Wirbelsäule und Becken – auch für Babys.', 60, NULL, NULL, 280),
('S9', 'selbstzahler', 'Kieferbehandlung (CMD)', 'Behandlung bei Beschwerden des Kiefergelenks und der Kaumuskulatur.', 45, NULL, NULL, 290),
('S10', 'selbstzahler', 'Faszientherapie', 'Behandlung des Bindegewebes und der Faszien.', 45, NULL, NULL, 300),
('S11', 'selbstzahler', 'Fußreflexzonentherapie nach Hanne Marquardt', 'Reflexzonenarbeit am Fuß nach der Methode Hanne Marquardt.', 45, NULL, NULL, 310),
('S12', 'selbstzahler', 'Babymassage – Anleitung für Eltern', 'Babymassage und Säuglingsmassage – ich zeige Ihnen, wie es geht.', 45, NULL, NULL, 320),
-- ── Wellness & Ayurveda (von lilli-nebel.de) ────────────────────────────────
('W1', 'wellness', 'Abhyanga – Ganzkörper-Ölmassage', 'Ayurvedische Ganzkörpermassage mit warmem Öl.', 90, NULL, NULL, 410),
('W2', 'wellness', 'Shirodhara – Stirnölguss', 'Warmes Öl fließt in gleichmäßigem Strahl über die Stirn – tiefe Entspannung.', 60, NULL, NULL, 420),
('W3', 'wellness', 'Padabhyanga – Fußmassage', 'Ayurvedische Fußmassage mit warmem Öl.', 45, NULL, NULL, 430),
('W4', 'wellness', 'Mukhabhyanga – Gesichtsmassage', 'Ayurvedische Gesichtsmassage.', 30, NULL, NULL, 440),
('W5', 'wellness', 'Pinda Sweda – Kräuterstempelmassage', 'Massage mit warmen Kräuterstempeln.', 75, NULL, NULL, 450),
('W6', 'wellness', 'Lomi Lomi Nui – hawaiianische Tempelmassage', 'Die hawaiianische Tempelmassage im Aloha-Spirit.', 90, NULL, NULL, 460),
('W7', 'wellness', 'Wellness- und Entspannungsmassage', 'Massage zum Entspannen und Auftanken.', 60, NULL, NULL, 470),
('W8', 'wellness', 'Kneipp-Anwendungen', 'Wassertreten, Knie- und Schenkelguss, Wechselbäder – in Bad Wörishofen, der Heimat Sebastian Kneipps.', 30, NULL, NULL, 480),
('W9', 'wellness', 'Yoga – Einzelstunde', 'Hatha, Vinyasa, Faszien- oder Yin Yoga als Einzelstunde – mit dem Blick der Physiotherapeutin.', 60, NULL, NULL, 490),
('W10', 'wellness', 'Schwangerschafts- und Rückbildungsyoga', 'Yoga in der Schwangerschaft und in der Rückbildung – ergänzend zur Beckenbodentherapie.', 60, NULL, NULL, 500);
