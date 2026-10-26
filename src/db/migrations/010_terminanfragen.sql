-- Terminanfragen (A15, Prompt 6, W4, W92): aus Mail (frei oder Website-Formular), WhatsApp, Telefon
-- oder von Hand. Der Text der Anfrage kann Gesundheitsangaben enthalten – er liegt verschlüsselt
-- (Tresor, Kontext terminanfrage.text); Name, Adresse und Telefon im Klartext wie beim Patienten (E24).

CREATE TYPE anfrage_status AS ENUM ('neu', 'vorgeschlagen', 'bestaetigt', 'abgesagt', 'erledigt', 'verworfen');
CREATE TYPE anfrage_quelle AS ENUM ('mail', 'website', 'whatsapp', 'telefon', 'hand');
CREATE TYPE anfrage_anliegen AS ENUM ('termin', 'verschieben', 'absagen', 'unklar');

CREATE TABLE terminanfrage (
  id                bigserial PRIMARY KEY,
  status            anfrage_status NOT NULL DEFAULT 'neu',
  quelle            anfrage_quelle NOT NULL,
  anliegen          anfrage_anliegen NOT NULL DEFAULT 'unklar',
  eingegangen_am    timestamptz NOT NULL DEFAULT now(),
  -- Mail: unveränderliche Kennung (Dublettenschutz) und Unterhaltung (Antwort als Reply im selben Faden)
  graph_message_id  text UNIQUE,
  conversation_id   text,
  absender_adresse  text,
  absender_name     text,
  absender_telefon  text,
  betreff           text,
  -- Wortlaut der Anfrage (Mailtext bzw. Formularfelder) – verschlüsselt
  text              bytea,
  patient_id        bigint REFERENCES patient,
  -- Erkannte Zeitwünsche: Wochentage (1–7), Tageszeiten, Daten, Uhrzeiten – keine Gesundheitsdaten
  erkannt           jsonb NOT NULL DEFAULT '{}',
  -- Vorgeschlagene Zeiten: [{"beginn","ende","exchange_event_id"}] – reserviert im Praxiskalender, Betreff nur „Reserviert – Anfrage #id“
  vorschlaege       jsonb NOT NULL DEFAULT '[]',
  dauer_min         integer,
  leistung_nummer   text,
  -- Link zum Antwort-Entwurf in Outlook Web (nie gesendet vom System, Leitplanke 3)
  antwort_weblink   text,
  termin_id         bigint REFERENCES termin,
  erledigt_am       timestamptz,
  erledigt_von      text,
  -- Notiz von Lilli – verschlüsselt
  notiz             bytea,
  erstellt_von      text NOT NULL,
  geaendert_am      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX terminanfrage_offen ON terminanfrage (status, eingegangen_am DESC);
CREATE INDEX terminanfrage_patient ON terminanfrage (patient_id);

-- Regeln für Terminvorschläge (Konfigurationsseite): Öffnungszeiten je Wochentag, Dauer, Puffer, Mailordner
INSERT INTO praxis_einstellung (schluessel, wert) VALUES
  ('oeffnungszeiten', 'Mo 08:00-18:00; Di 08:00-18:00; Mi 08:00-18:00; Do 08:00-18:00; Fr 08:00-14:00'),
  ('termin_dauer_min', '30'),
  ('termin_puffer_min', '0'),
  ('anfragen_mailordner', 'Posteingang/Terminanfragen')
ON CONFLICT (schluessel) DO NOTHING;
