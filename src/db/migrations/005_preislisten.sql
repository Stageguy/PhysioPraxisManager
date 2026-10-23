-- Preislisten (W59): Grundlagen (Preisquellen) mit vollständigem Originaldokument, Vorlagen,
-- Preislisten mit Positionen. Die GebüTh ist ein gekauftes Buch – ihre Empfehlungen kommen über
-- Vorlagen; als Quelle wird nur die erschienene Auflage vermerkt.

CREATE TYPE preisquelle_art AS ENUM ('gkv', 'beihilfe', 'gebueth');

CREATE TABLE preisquelle (
  id            bigserial PRIMARY KEY,
  art           preisquelle_art NOT NULL,
  titel         text NOT NULL,
  version       text NOT NULL,
  gueltig_ab    date,
  url           text,
  abgerufen_am  timestamptz NOT NULL DEFAULT now(),
  sha256        text NOT NULL,
  -- Das Originaldokument (PDF bzw. HTML), damit jede Preisliste nachvollziehbar bleibt
  rohdaten      bytea,
  rohdaten_typ  text,
  -- NULL = noch nicht gesehen → roter Punkt am Menü „Preislisten“
  gesehen_am    timestamptz,
  gesehen_von   text,
  UNIQUE (art, sha256)
);

CREATE TABLE preisquelle_position (
  id          bigserial PRIMARY KEY,
  quelle_id   bigint NOT NULL REFERENCES preisquelle ON DELETE CASCADE,
  reihenfolge integer NOT NULL,
  -- GKV: "20501" (Physiotherapeut), Beihilfe: "4", "10a"
  nummer      text NOT NULL,
  -- GKV: "X0501" wie in der Vergütungsliste
  code        text,
  kuerzel     text,
  gruppe      text,
  bezeichnung text NOT NULL,
  regelzeit   text,
  preis       numeric(10, 2),
  zuzahlung   numeric(10, 2),
  hinweise    text,
  daten       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX preisquelle_position_quelle ON preisquelle_position (quelle_id, reihenfolge);

CREATE TABLE preisvorlage (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  standard_faktor numeric(8, 4),
  -- { "20501": { "uebernehmen": true, "faktor": 1.35 }, … }
  positionen      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notiz           text,
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  geaendert_am    timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE preisliste_status AS ENUM ('entwurf', 'freigegeben', 'archiviert');

CREATE TABLE preisliste (
  id                  bigserial PRIMARY KEY,
  name                text NOT NULL,
  gkv_quelle_id       bigint REFERENCES preisquelle,
  beihilfe_quelle_id  bigint REFERENCES preisquelle,
  basis_preisliste_id bigint REFERENCES preisliste,
  vorlage_id          bigint REFERENCES preisvorlage ON DELETE SET NULL,
  standard_faktor     numeric(8, 4),
  status              preisliste_status NOT NULL DEFAULT 'entwurf',
  aktiv               boolean NOT NULL DEFAULT false,
  erstellt_am         timestamptz NOT NULL DEFAULT now(),
  erstellt_von        text,
  freigegeben_am      timestamptz,
  freigegeben_von     text,
  archiviert_am       timestamptz,
  notiz               text,
  CHECK (NOT aktiv OR status = 'freigegeben')
);
-- Höchstens eine Preisliste ist aktiv
CREATE UNIQUE INDEX preisliste_eine_aktiv ON preisliste ((true)) WHERE aktiv;

CREATE TABLE preisliste_position (
  id                     bigserial PRIMARY KEY,
  preisliste_id          bigint NOT NULL REFERENCES preisliste ON DELETE CASCADE,
  reihenfolge            integer NOT NULL,
  nummer                 text NOT NULL,
  kuerzel                text,
  gruppe                 text,
  bezeichnung            text NOT NULL,
  regelzeit              text,
  gkv_preis              numeric(10, 2),
  quell_position_id      bigint REFERENCES preisquelle_position,
  beihilfe_position_id   bigint REFERENCES preisquelle_position,
  beihilfe_hoechstbetrag numeric(10, 2),
  uebernehmen            boolean NOT NULL DEFAULT true,
  faktor                 numeric(8, 4),
  eigener_preis          numeric(10, 2),
  notiz                  text,
  UNIQUE (preisliste_id, nummer)
);

-- Wo eine Preisliste verwendet wurde – füllen die Ausgangsrechnungen (Prompt 11/14)
CREATE TABLE preisliste_verwendung (
  id            bigserial PRIMARY KEY,
  preisliste_id bigint NOT NULL REFERENCES preisliste,
  patient_ref   text,
  rechnung_ref  text,
  verwendet_am  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX preisliste_verwendung_liste ON preisliste_verwendung (preisliste_id);
