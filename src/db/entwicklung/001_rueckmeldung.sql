-- Entwicklungs-Datenbank (W72): Rückmeldungen der Prototyp-Nutzerin – getrennt von der Praxis-Datenbank,
-- damit Screenshots und Texte nie neben Patientendaten liegen und die Datenbank später einfach wegfallen kann.

CREATE TYPE rueckmeldung_art AS ENUM ('hinweis', 'fehler');
CREATE TYPE rueckmeldung_status AS ENUM ('offen', 'erledigt');

CREATE TABLE rueckmeldung (
  id            bigserial PRIMARY KEY,
  art           rueckmeldung_art NOT NULL,
  status        rueckmeldung_status NOT NULL DEFAULT 'offen',
  -- Seite (Pfad), Element (data-hilfe-Schlüssel) und Titel der Erklärung, bei der das Symbol gedrückt wurde
  seite         text NOT NULL,
  element       text,
  element_titel text,
  -- Richtext als bereinigtes HTML (nur b, i, u, p, br, ul, ol, li)
  text_html     text NOT NULL,
  -- Screenshot des Elements bzw. seines Kastens (JPEG), leer wenn der Browser keinen liefern konnte
  bild          bytea,
  bild_typ      text,
  -- Woher: Fassung, Umgebung, Browser, Fenstergröße
  fassung       text,
  umgebung      text,
  browser       text,
  fenster       text,
  von           text NOT NULL,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  erledigt_am   timestamptz,
  erledigt_von  text,
  antwort       text
);
CREATE INDEX rueckmeldung_status ON rueckmeldung (status, erstellt_am DESC);
