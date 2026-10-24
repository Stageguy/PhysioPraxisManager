-- Patientenkartei (W63–W68, requirements §4b): Stammdaten als Hybrid mit den Exchange-Kontakten,
-- Behandlungsdokumentation nach § 630f BGB, Verordnungen, Erklärungen, Dokumente, Kontaktverlauf,
-- Termine und Ausgangsrechnungen (vorbereitet für Prompt 11/14).
--
-- Grundsätze:
-- * Identität und Kontaktwege (Name, Geburtsdatum, Adresse, Telefon, Mail) liegen im Klartext –
--   sie werden gesucht, sortiert und mit Exchange/Lexware abgeglichen (E24).
-- * Alles mit Gesundheitsbezug (Anlass, Diagnose, Befund, Behandlung, Notizen, Dokumente) ist
--   `bytea` und wird von der App verschlüsselt (src/tresor.ts). Die Datenbank sieht nie Klartext.
-- * Dokumentation ist unveränderlich (§ 630f Abs. 1 S. 2–3): Inhalte werden nicht geändert oder
--   gelöscht, sondern durch eine neue Fassung ersetzt (`vorgaenger_id`, `ersetzt_am`).
-- * Aufbewahrung zehn Jahre nach Abschluss (§ 630f Abs. 3) – Löschen gibt es nur als geplante
--   Funktion mit Frist, nie als DELETE von Hand.

-- ── Kontakte, Ärzte, Stammdaten ───────────────────────────────────────────────

CREATE TABLE arzt (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  praxis        text,
  fachrichtung  text,
  -- Lebenslange Arztnummer, sofern bekannt (steht auf Verordnungen)
  lanr          text,
  strasse       text,
  plz           text,
  ort           text,
  telefon       text,
  fax           text,
  email         text,
  notiz         text,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE patient_status AS ENUM ('aktiv', 'inaktiv', 'archiviert');
CREATE TYPE abrechnungsmodus AS ENUM ('pro_termin', 'pro_serie', 'monatlich');

-- Patientennummer: fortlaufend, nie wiederverwendet; lässt sich beim Import aus Lexware übernehmen
CREATE SEQUENCE patientennummer_seq START 1001;

CREATE TABLE patient (
  id                        bigserial PRIMARY KEY,
  patientennummer           text NOT NULL UNIQUE DEFAULT 'P-' || nextval('patientennummer_seq'),
  status                    patient_status NOT NULL DEFAULT 'aktiv',
  anrede                    text,
  titel                     text,
  vorname                   text NOT NULL,
  nachname                  text NOT NULL,
  geburtsname               text,
  geburtsdatum              date,
  -- Gendern/Ansprache nur auf Wunsch: z. B. „Pronomen sie/ihr“, „bitte neutral anreden“ (W65)
  ansprache_hinweis         bytea,
  -- Besonderheiten für die Kachel: Hörgerät, Begleitperson, Treppe … (W65) – verschlüsselt
  besonderheiten            bytea,
  sprache                   text,
  kommunikationshilfe       text,
  -- Beruf und Alltagsbelastung sind fachlich relevant (§ 630f) – verschlüsselt
  beruf_belastung           bytea,
  hausarzt_id               bigint REFERENCES arzt,
  abrechnungsmodus          abrechnungsmodus NOT NULL DEFAULT 'pro_serie',
  -- NULL = Praxis-Standard (E10)
  zwischenrechnung_quartale integer,
  -- Hybrid: Spiegel des Kontakts im Postfach (Ordner „Patienten“ bzw. „Patienten-Test“)
  exchange_kontakt_id       text UNIQUE,
  exchange_abgleich_am      timestamptz,
  exchange_abgleich_hash    text,
  lexware_kontakt_id        text,
  lexware_kundennummer      text,
  patient_seit              date NOT NULL DEFAULT CURRENT_DATE,
  notiz                     bytea,
  erstellt_am               timestamptz NOT NULL DEFAULT now(),
  erstellt_von              text,
  geaendert_am              timestamptz NOT NULL DEFAULT now(),
  archiviert_am             timestamptz
);
CREATE INDEX patient_name ON patient (lower(nachname), lower(vorname));
CREATE INDEX patient_geburtsdatum ON patient (geburtsdatum);

CREATE TYPE kontaktart AS ENUM ('mobil', 'telefon', 'whatsapp', 'email', 'sonstige');

-- Kontaktwege (FHIR Patient.telecom): die Kachel zeigt den primären Anruf-Kontakt, WhatsApp und Mail (W64)
CREATE TABLE patient_kontakt (
  id            bigserial PRIMARY KEY,
  patient_id    bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  art           kontaktart NOT NULL,
  wert          text NOT NULL,
  -- Telefon/WhatsApp in E.164 („+4915112345678“) für tel:/wa.me-Links; Mail klein geschrieben
  normiert      text NOT NULL,
  bezeichnung   text,
  primaer       boolean NOT NULL DEFAULT false,
  reihenfolge   integer NOT NULL DEFAULT 0,
  notiz         text,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_kontakt_patient ON patient_kontakt (patient_id, art);
-- Wiedererkennung über Mail oder Nummer (Poststelle, Prompt 11)
CREATE INDEX patient_kontakt_normiert ON patient_kontakt (normiert);
-- Je Patient und Kontaktart höchstens ein primärer Eintrag
CREATE UNIQUE INDEX patient_kontakt_ein_primaer ON patient_kontakt (patient_id, art) WHERE primaer;

-- Mehrere Adressen je Patient als Kacheln; genau eine ist die Rechnungsadresse (W66)
CREATE TABLE patient_adresse (
  id               bigserial PRIMARY KEY,
  patient_id       bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  bezeichnung      text,
  zusatz           text,
  strasse          text,
  hausnummer       text,
  plz              text,
  ort              text,
  land             text NOT NULL DEFAULT 'DE',
  rechnungsadresse boolean NOT NULL DEFAULT false,
  reihenfolge      integer NOT NULL DEFAULT 0,
  notiz            text,
  erstellt_am      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_adresse_patient ON patient_adresse (patient_id);
CREATE UNIQUE INDEX patient_adresse_eine_rechnungsadresse ON patient_adresse (patient_id) WHERE rechnungsadresse;

-- Vertragspartner, Rechnungsempfänger, Vertretung, Notfallkontakt – getrennt von der behandelten Person
CREATE TYPE bezugsperson_rolle AS ENUM ('vertragspartner', 'rechnungsempfaenger', 'vertretung', 'notfallkontakt', 'sonstige');

CREATE TABLE patient_bezugsperson (
  id                 bigserial PRIMARY KEY,
  patient_id         bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  rolle              bezugsperson_rolle NOT NULL,
  name               text NOT NULL,
  beziehung          text,
  -- Bei Vertretung: Sorgerecht, Vorsorgevollmacht, gerichtliche Betreuung … („Angehöriger“ reicht nicht)
  berechtigungsgrund text,
  telefon            text,
  email              text,
  strasse            text,
  plz                text,
  ort                text,
  land               text NOT NULL DEFAULT 'DE',
  gueltig_bis        date,
  notiz              text,
  erstellt_am        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_bezugsperson_patient ON patient_bezugsperson (patient_id, rolle);
-- Höchstens ein Rechnungsempfänger und ein Vertragspartner je Patient
CREATE UNIQUE INDEX patient_bezugsperson_eindeutig ON patient_bezugsperson (patient_id, rolle)
  WHERE rolle IN ('vertragspartner', 'rechnungsempfaenger');

-- Versicherung nur bei Bedarf (Erstattungsservice, Beihilfe-Höchstbeträge in der Preisliste)
CREATE TYPE versicherung_art AS ENUM ('pkv', 'beihilfe', 'gkv', 'sonstige');

CREATE TABLE patient_versicherung (
  id                  bigserial PRIMARY KEY,
  patient_id          bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  art                 versicherung_art NOT NULL,
  versicherer         text,
  versicherungsnummer text,
  tarif               text,
  -- Erstattungs- bzw. Beihilfesatz in Prozent, Selbstbehalt im Jahr
  erstattungssatz     numeric(5, 2),
  selbstbehalt        numeric(10, 2),
  gueltig_von         date,
  gueltig_bis         date,
  notiz               text,
  erstellt_am         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_versicherung_patient ON patient_versicherung (patient_id);

-- ── Behandlungsfall und Dokumentation (§ 630f BGB) ────────────────────────────

-- Woraus die Behandlung folgt – getrennt von „wer zahlt“
CREATE TYPE behandlungsgrundlage AS ENUM ('verordnung', 'direktzugang', 'praevention');
CREATE TYPE steuerklasse AS ENUM ('heilbehandlung_steuerfrei', 'wellness_19');
-- Patientenweg (Prompt 12), Reihenfolge fest
CREATE TYPE fall_phase AS ENUM ('anfrage', 'aufnahme', 'anamnese', 'befund_start', 'behandlung', 'abschluss', 'rechnung', 'nachsorge', 'archiviert');

CREATE TABLE behandlungsfall (
  id                 bigserial PRIMARY KEY,
  patient_id         bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  -- Laufende Nummer je Patient: „Fall 3“
  nummer             integer NOT NULL,
  grundlage          behandlungsgrundlage NOT NULL,
  steuerklasse       steuerklasse NOT NULL DEFAULT 'heilbehandlung_steuerfrei',
  phase              fall_phase NOT NULL DEFAULT 'anfrage',
  vorheriger_fall_id bigint REFERENCES behandlungsfall,
  -- Kurzbezeichnung für Listen, ohne Diagnose: „Schulter rechts“, „Rücken“ – verschlüsselt
  bezeichnung        bytea,
  anlass             bytea,
  -- Ärztliche Diagnose (mitgeteilt) und eigener physiotherapeutischer Befund getrennt
  diagnose_arzt      bytea,
  icd_codes          bytea,
  therapieziele      bytea,
  behandlungsplan    bytea,
  abschlussbefund    bytea,
  begonnen_am        date,
  abgeschlossen_am   date,
  -- Nach Abschluss + Nachsorgefrist → archiviert; Aufbewahrung bis
  aufbewahren_bis    date,
  erstellt_am        timestamptz NOT NULL DEFAULT now(),
  erstellt_von       text,
  geaendert_am       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, nummer),
  CHECK (grundlage <> 'praevention' OR steuerklasse = 'wellness_19')
);
CREATE INDEX behandlungsfall_nach_phase ON behandlungsfall (phase);

CREATE TABLE behandlungsfall_phase (
  id       bigserial PRIMARY KEY,
  fall_id  bigint NOT NULL REFERENCES behandlungsfall ON DELETE CASCADE,
  von      fall_phase,
  nach     fall_phase NOT NULL,
  am       timestamptz NOT NULL DEFAULT now(),
  wer      text NOT NULL,
  -- „automatisch: erste Behandlung erledigt“ oder Lillis Grund beim Verschieben
  grund    text
);
CREATE INDEX behandlungsfall_phase_fall ON behandlungsfall_phase (fall_id, am);

CREATE TYPE anamnese_art AS ENUM ('online', 'tablet', 'gespraech', 'uebernommen');

-- Anamnese: jede Änderung ist eine neue Fassung; die alte bleibt lesbar
CREATE TABLE anamnese (
  id                        bigserial PRIMARY KEY,
  fall_id                   bigint NOT NULL REFERENCES behandlungsfall ON DELETE CASCADE,
  erhoben_am                date NOT NULL,
  art                       anamnese_art NOT NULL,
  beschwerden               bytea,
  vorgeschichte             bytea,
  medikamente               bytea,
  allergien                 bytea,
  kontraindikationen_risiken bytea,
  sonstiges                 bytea,
  erstellt_von              text NOT NULL,
  erstellt_am               timestamptz NOT NULL DEFAULT now(),
  vorgaenger_id             bigint REFERENCES anamnese,
  ersetzt_am                timestamptz
);
CREATE INDEX anamnese_fall ON anamnese (fall_id) WHERE ersetzt_am IS NULL;

CREATE TYPE befund_art AS ENUM ('eingang', 'verlauf', 'abschluss');

-- Untersuchungen und Befunde: Text plus Messwerte als verschlüsseltes JSON
-- ([{ "bereich": "Körperfunktion", "icf": "b7100", "item": "Schulter Flexion rechts", "wert": 120, "einheit": "°" }])
CREATE TABLE befund (
  id            bigserial PRIMARY KEY,
  fall_id       bigint NOT NULL REFERENCES behandlungsfall ON DELETE CASCADE,
  erhoben_am    date NOT NULL,
  art           befund_art NOT NULL,
  text          bytea,
  messwerte     bytea,
  erstellt_von  text NOT NULL,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  vorgaenger_id bigint REFERENCES befund,
  ersetzt_am    timestamptz
);
CREATE INDEX befund_fall ON befund (fall_id, erhoben_am) WHERE ersetzt_am IS NULL;

CREATE TYPE verordnung_status AS ENUM ('aktiv', 'abgeschlossen', 'abgebrochen');

-- Verordnung (Rezept, Prompt 14): Stempelkarte x von y über behandlung_leistung.verordnung_id
CREATE TABLE verordnung (
  id                bigserial PRIMARY KEY,
  patient_id        bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  fall_id           bigint REFERENCES behandlungsfall,
  arzt_id           bigint REFERENCES arzt,
  ausgestellt_am    date NOT NULL,
  -- Verordnetes Heilmittel als Text („Manuelle Therapie“) und, wenn zuordenbar, die Positionsnummer der Preisliste
  massnahme         text NOT NULL,
  leistung_nummer   text,
  anzahl_verordnet  integer NOT NULL CHECK (anzahl_verordnet > 0),
  frequenz          text,
  dauer_min         integer,
  gueltig_bis       date,
  diagnose          bytea,
  icd_codes         bytea,
  hinweise          bytea,
  status            verordnung_status NOT NULL DEFAULT 'aktiv',
  abbruch_grund     text,
  abbruch_am        date,
  abgeschlossen_am  date,
  dokument_id       bigint,
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  erstellt_von      text,
  CHECK (status <> 'abgebrochen' OR abbruch_grund IS NOT NULL)
);
CREATE INDEX verordnung_patient ON verordnung (patient_id, status);

CREATE TYPE termin_art AS ENUM ('erstgespraech', 'behandlung', 'sonstige');
CREATE TYPE termin_status AS ENUM ('vorgeschlagen', 'bestaetigt', 'erledigt', 'verschoben', 'abgesagt_patient', 'abgesagt_praxis', 'nicht_erschienen');

-- Termine: Quelle der Wahrheit hier, Spiegel im Exchange-Kalender (Titel nur Initialen + Nummer)
CREATE TABLE termin (
  id                 bigserial PRIMARY KEY,
  patient_id         bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  fall_id            bigint REFERENCES behandlungsfall,
  -- NULL = Individualtermin ohne Rezept (W64: „Rezept oder Individual“)
  verordnung_id      bigint REFERENCES verordnung,
  art                termin_art NOT NULL DEFAULT 'behandlung',
  beginn             timestamptz NOT NULL,
  ende               timestamptz NOT NULL,
  leistung_nummer    text,
  status             termin_status NOT NULL DEFAULT 'bestaetigt',
  exchange_event_id  text,
  kalender           text,
  -- Bei Verschiebung: der Ersatztermin
  verschoben_auf_id  bigint REFERENCES termin,
  notiz              bytea,
  erstellt_am        timestamptz NOT NULL DEFAULT now(),
  erstellt_von       text,
  geaendert_am       timestamptz NOT NULL DEFAULT now(),
  CHECK (ende > beginn)
);
CREATE INDEX termin_patient ON termin (patient_id, beginn);
CREATE INDEX termin_beginn ON termin (beginn) WHERE status IN ('vorgeschlagen', 'bestaetigt');

CREATE TYPE behandlung_status AS ENUM ('erledigt', 'ausgefallen');

-- Behandlungssitzung: was tatsächlich gemacht wurde, Wirkung und Verlauf (§ 630f)
CREATE TABLE behandlung (
  id                      bigserial PRIMARY KEY,
  fall_id                 bigint NOT NULL REFERENCES behandlungsfall ON DELETE CASCADE,
  termin_id               bigint REFERENCES termin,
  datum                   date NOT NULL,
  beginn                  time,
  dauer_min               integer,
  behandelt_von           text NOT NULL,
  status                  behandlung_status NOT NULL DEFAULT 'erledigt',
  massnahmen              bytea,
  verlauf_wirkung         bytea,
  reaktionen              bytea,
  uebungen_empfehlungen   bytea,
  notiz                   bytea,
  erstellt_von            text NOT NULL,
  erstellt_am             timestamptz NOT NULL DEFAULT now(),
  vorgaenger_id           bigint REFERENCES behandlung,
  ersetzt_am              timestamptz
);
CREATE INDEX behandlung_fall ON behandlung (fall_id, datum) WHERE ersetzt_am IS NULL;

-- Abgerechnete Leistungen je Sitzung: Preis aus der Preisliste zum Zeitpunkt der Behandlung
-- (Festhalten, nicht verweisen – die Preisliste kann später archiviert werden). Mit verordnung_id
-- ist das der „Haken“ auf der Stempelkarte (Prompt 14): je Sitzung und Rezept höchstens einer.
CREATE TABLE behandlung_leistung (
  id                     bigserial PRIMARY KEY,
  behandlung_id          bigint NOT NULL REFERENCES behandlung ON DELETE CASCADE,
  verordnung_id          bigint REFERENCES verordnung,
  preisliste_id          bigint REFERENCES preisliste,
  preisliste_position_id bigint REFERENCES preisliste_position,
  nummer                 text NOT NULL,
  bezeichnung            text NOT NULL,
  anzahl                 integer NOT NULL DEFAULT 1 CHECK (anzahl > 0),
  einzelpreis            numeric(10, 2) NOT NULL,
  steuerklasse           steuerklasse NOT NULL DEFAULT 'heilbehandlung_steuerfrei'
);
CREATE INDEX behandlung_leistung_behandlung ON behandlung_leistung (behandlung_id);
CREATE INDEX behandlung_leistung_verordnung ON behandlung_leistung (verordnung_id) WHERE verordnung_id IS NOT NULL;
CREATE UNIQUE INDEX behandlung_leistung_ein_haken ON behandlung_leistung (behandlung_id, verordnung_id) WHERE verordnung_id IS NOT NULL;

-- ── Erklärungen, Dokumente, Kontaktverlauf ────────────────────────────────────

CREATE TYPE erklaerung_art AS ENUM (
  'aufklaerung', 'behandlungseinwilligung', 'kosteninformation', 'honorarvereinbarung',
  'datenschutzinformation', 'einwilligung_email', 'einwilligung_whatsapp', 'einwilligung_erinnerung',
  'einwilligung_foto', 'einwilligung_sonstige'
);
CREATE TYPE erklaerung_form AS ENUM ('muendlich', 'schriftlich', 'textform', 'elektronisch');

-- Jede Erklärung einzeln (kein Sammel-Haken): Aufklärung, Einwilligung, Kosteninformation (§ 630c Abs. 3),
-- Datenschutzinformation (nur Aushändigung vermerken), freiwillige Einwilligungen mit Widerruf
CREATE TABLE patient_erklaerung (
  id               bigserial PRIMARY KEY,
  patient_id       bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  fall_id          bigint REFERENCES behandlungsfall,
  art              erklaerung_art NOT NULL,
  am               date NOT NULL,
  form             erklaerung_form NOT NULL,
  -- Worüber aufgeklärt, wozu eingewilligt, welche Kosten genannt – verschlüsselt
  inhalt           bytea,
  -- Fassung des verwendeten Textes, z. B. „Datenschutzinformation 2026-01“
  dokument_fassung text,
  dokument_id      bigint,
  gueltig_bis      date,
  widerrufen_am    date,
  widerruf_grund   text,
  erfasst_von      text NOT NULL,
  erstellt_am      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_erklaerung_patient ON patient_erklaerung (patient_id, art);

CREATE TYPE dokument_art AS ENUM ('verordnung', 'arztbrief', 'fremdbefund', 'erklaerung', 'kosteninformation', 'rechnung', 'foto', 'bericht', 'sonstiges');
CREATE TYPE dokument_quelle AS ENUM ('upload', 'mail', 'scan', 'system');

-- Patienten-Tresor: Dateien verschlüsselt in der Datenbank (§4a). Titel und Dateiname ebenfalls,
-- weil sie Diagnosen verraten können. Löschen gibt es nicht – nur „ungültig“ mit Grund.
CREATE TABLE dokument (
  id              bigserial PRIMARY KEY,
  patient_id      bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  fall_id         bigint REFERENCES behandlungsfall,
  art             dokument_art NOT NULL,
  titel           bytea NOT NULL,
  dateiname       bytea,
  mime            text NOT NULL,
  groesse         integer NOT NULL,
  sha256          text NOT NULL,
  inhalt          bytea NOT NULL,
  quelle          dokument_quelle NOT NULL,
  -- z. B. Graph-Message-ID der Mail, aus der die Datei stammt
  quelle_ref      text,
  dokument_datum  date,
  ungueltig_am    timestamptz,
  ungueltig_grund text,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  erstellt_von    text NOT NULL
);
CREATE INDEX dokument_patient ON dokument (patient_id, art) WHERE ungueltig_am IS NULL;
CREATE UNIQUE INDEX dokument_einmal ON dokument (patient_id, sha256) WHERE ungueltig_am IS NULL;

ALTER TABLE verordnung ADD CONSTRAINT verordnung_dokument FOREIGN KEY (dokument_id) REFERENCES dokument;
ALTER TABLE patient_erklaerung ADD CONSTRAINT patient_erklaerung_dokument FOREIGN KEY (dokument_id) REFERENCES dokument;

-- Standardbegriffe für den Kontaktverlauf (W67) – von Lilli erweiterbar
CREATE TABLE gespraechsgrund (
  code        text PRIMARY KEY,
  bezeichnung text NOT NULL,
  reihenfolge integer NOT NULL DEFAULT 0,
  aktiv       boolean NOT NULL DEFAULT true
);
INSERT INTO gespraechsgrund (code, bezeichnung, reihenfolge) VALUES
  ('terminvereinbarung',   'Terminvereinbarung',        10),
  ('terminverschiebung',   'Terminverschiebung',        20),
  ('absage_patient',       'Absage Patient',            30),
  ('absage_praxis',        'Absage Praxis',             40),
  ('erinnerung',           'Erinnerung',                50),
  ('rueckfrage_behandlung','Rückfrage zur Behandlung',  60),
  ('rueckfrage_rechnung',  'Rückfrage zur Rechnung',    70),
  ('nicht_erreicht',       'Nicht erreicht',            80),
  ('sonstiges',            'Sonstiges',                 90);

CREATE TYPE kontaktverlauf_art AS ENUM ('anruf_ausgehend', 'anruf_eingehend', 'email', 'whatsapp', 'sms', 'brief', 'persoenlich', 'notiz');

-- Kontaktverlauf: jeder Anruf aus der Kachel landet hier (W67). `offen` = Gesprächsgrund fehlt noch
CREATE TABLE patient_kontaktverlauf (
  id           bigserial PRIMARY KEY,
  patient_id   bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  fall_id      bigint REFERENCES behandlungsfall,
  kontakt_id   bigint REFERENCES patient_kontakt ON DELETE SET NULL,
  termin_id    bigint REFERENCES termin,
  art          kontaktverlauf_art NOT NULL,
  am           timestamptz NOT NULL DEFAULT now(),
  grund_code   text REFERENCES gespraechsgrund,
  notiz        bytea,
  offen        boolean NOT NULL DEFAULT false,
  -- z. B. Graph-Message-ID bei Mail
  quelle_ref   text,
  erfasst_von  text NOT NULL,
  erstellt_am  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_kontaktverlauf_patient ON patient_kontaktverlauf (patient_id, am DESC);
CREATE INDEX patient_kontaktverlauf_offen ON patient_kontaktverlauf (patient_id) WHERE offen;

-- ── Ausgangsrechnungen (vorbereitet, Prompt 11/14) ────────────────────────────

CREATE TYPE rechnung_art AS ENUM ('einzel', 'zwischenrechnung', 'abschlussrechnung', 'monat', 'ausfall');
CREATE TYPE rechnung_status AS ENUM ('entwurf', 'freigegeben', 'gesendet', 'bezahlt', 'storniert');

CREATE TABLE rechnung (
  id                 bigserial PRIMARY KEY,
  patient_id         bigint NOT NULL REFERENCES patient,
  fall_id            bigint REFERENCES behandlungsfall,
  verordnung_id      bigint REFERENCES verordnung,
  art                rechnung_art NOT NULL,
  steuerklasse       steuerklasse NOT NULL,
  -- Empfänger zum Rechnungszeitpunkt festgehalten (Name, Adresse), damit spätere Änderungen nichts verfälschen
  empfaenger         jsonb NOT NULL,
  preisliste_id      bigint REFERENCES preisliste,
  zeitraum_von       date,
  zeitraum_bis       date,
  datum              date,
  faellig_am         date,
  nummer             text UNIQUE,
  betrag             numeric(10, 2),
  status             rechnung_status NOT NULL DEFAULT 'entwurf',
  lexware_invoice_id text,
  lexware_voucher_id text,
  gesendet_am        date,
  erinnert_am        date,
  gemahnt_am         date,
  bezahlt_am         date,
  storniert_am       date,
  storno_grund       text,
  erstellt_am        timestamptz NOT NULL DEFAULT now(),
  erstellt_von       text,
  geaendert_am       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rechnung_patient ON rechnung (patient_id, status);
CREATE INDEX rechnung_offen ON rechnung (faellig_am) WHERE status IN ('gesendet', 'freigegeben');

-- Jede Leistung wird genau einmal abgerechnet (UNIQUE auf behandlung_leistung_id)
CREATE TABLE rechnung_position (
  id                     bigserial PRIMARY KEY,
  rechnung_id            bigint NOT NULL REFERENCES rechnung ON DELETE CASCADE,
  behandlung_leistung_id bigint REFERENCES behandlung_leistung,
  reihenfolge            integer NOT NULL,
  datum                  date,
  nummer                 text,
  bezeichnung            text NOT NULL,
  anzahl                 integer NOT NULL DEFAULT 1,
  einzelpreis            numeric(10, 2) NOT NULL,
  betrag                 numeric(10, 2) NOT NULL
);
CREATE INDEX rechnung_position_rechnung ON rechnung_position (rechnung_id, reihenfolge);
CREATE UNIQUE INDEX rechnung_position_leistung_einmal ON rechnung_position (behandlung_leistung_id) WHERE behandlung_leistung_id IS NOT NULL;

-- ── Unveränderlichkeit der Dokumentation (§ 630f Abs. 1 S. 2–3) ───────────────

-- Inhalte dürfen nicht geändert werden; erlaubt ist nur, eine Fassung als ersetzt zu markieren.
CREATE FUNCTION dokumentation_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  meta text[] := ARRAY['ersetzt_am'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% ist Behandlungsdokumentation und wird nicht gelöscht (§ 630f BGB)', TG_TABLE_NAME;
  END IF;
  IF (to_jsonb(OLD) - meta) <> (to_jsonb(NEW) - meta) THEN
    RAISE EXCEPTION '% wird nicht geändert – neue Fassung mit vorgaenger_id anlegen (§ 630f BGB)', TG_TABLE_NAME;
  END IF;
  -- Eine ersetzte Fassung ist endgültig – auch ihr Ersetzt-Zeitpunkt ändert sich nicht mehr
  IF OLD.ersetzt_am IS NOT NULL THEN
    RAISE EXCEPTION '% Nr. % ist bereits ersetzt', TG_TABLE_NAME, OLD.id;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER anamnese_unveraenderlich BEFORE UPDATE OR DELETE ON anamnese FOR EACH ROW EXECUTE FUNCTION dokumentation_unveraenderlich();
CREATE TRIGGER befund_unveraenderlich BEFORE UPDATE OR DELETE ON befund FOR EACH ROW EXECUTE FUNCTION dokumentation_unveraenderlich();
CREATE TRIGGER behandlung_unveraenderlich BEFORE UPDATE OR DELETE ON behandlung FOR EACH ROW EXECUTE FUNCTION dokumentation_unveraenderlich();

-- Erklärungen und Dokumente: nie löschen; Erklärungen nur widerrufen, Dokumente nur für ungültig erklären
CREATE FUNCTION nur_markieren() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  meta text[] := CASE TG_TABLE_NAME
    WHEN 'patient_erklaerung' THEN ARRAY['widerrufen_am', 'widerruf_grund', 'gueltig_bis', 'dokument_id']
    ELSE ARRAY['ungueltig_am', 'ungueltig_grund', 'fall_id']
  END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% wird nicht gelöscht – Aufbewahrung zehn Jahre (§ 630f Abs. 3 BGB)', TG_TABLE_NAME;
  END IF;
  IF (to_jsonb(OLD) - meta) <> (to_jsonb(NEW) - meta) THEN
    RAISE EXCEPTION '% wird nicht geändert – nur widerrufen bzw. für ungültig erklären', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER patient_erklaerung_nur_markieren BEFORE UPDATE OR DELETE ON patient_erklaerung FOR EACH ROW EXECUTE FUNCTION nur_markieren();
CREATE TRIGGER dokument_nur_markieren BEFORE UPDATE OR DELETE ON dokument FOR EACH ROW EXECUTE FUNCTION nur_markieren();

-- Ein Patient mit Dokumentation wird archiviert, nicht gelöscht (ON DELETE CASCADE griffe sonst in die Akte)
CREATE FUNCTION patient_nicht_loeschen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM behandlungsfall WHERE patient_id = OLD.id)
     OR EXISTS (SELECT 1 FROM dokument WHERE patient_id = OLD.id)
     OR EXISTS (SELECT 1 FROM patient_erklaerung WHERE patient_id = OLD.id)
     OR EXISTS (SELECT 1 FROM rechnung WHERE patient_id = OLD.id) THEN
    RAISE EXCEPTION 'Patient % hat eine Akte – archivieren statt löschen (§ 630f Abs. 3 BGB)', OLD.patientennummer;
  END IF;
  RETURN OLD;
END
$$;
CREATE TRIGGER patient_nicht_loeschen BEFORE DELETE ON patient FOR EACH ROW EXECUTE FUNCTION patient_nicht_loeschen();
