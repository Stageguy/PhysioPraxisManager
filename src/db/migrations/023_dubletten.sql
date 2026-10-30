-- Dubletten (W119): ein versehentlich doppelt angelegter Patient wird mit dem richtigen zusammengeführt
-- (alles Verknüpfte wandert, die Dublette bleibt archiviert mit Verweis auf den bleibenden Patienten) oder –
-- wenn an ihm nichts hängt – gelöscht. „Keine Dublette“ merkt sich die Kartei je Paar, damit das Symbol
-- nicht wiederkommt.
ALTER TABLE patient ADD COLUMN dublette_von bigint REFERENCES patient;
CREATE INDEX patient_dublette_von ON patient (dublette_von) WHERE dublette_von IS NOT NULL;

CREATE TABLE patient_keine_dublette (
  patient_a        bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  patient_b        bigint NOT NULL REFERENCES patient ON DELETE CASCADE,
  entschieden_von  text NOT NULL,
  entschieden_am   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_a, patient_b),
  CHECK (patient_a < patient_b)
);

-- Erklärungen und Dokumente dürfen den Patienten nur beim Zusammenführen wechseln – wenn der alte Patient als
-- Dublette des neuen markiert ist. Sonst gilt weiter: nur widerrufen bzw. für ungültig erklären (Migration 007).
CREATE OR REPLACE FUNCTION nur_markieren() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  meta text[] := CASE TG_TABLE_NAME
    WHEN 'patient_erklaerung' THEN ARRAY['widerrufen_am', 'widerruf_grund', 'gueltig_bis', 'dokument_id']
    ELSE ARRAY['ungueltig_am', 'ungueltig_grund', 'fall_id']
  END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% wird nicht gelöscht – Aufbewahrung zehn Jahre (§ 630f Abs. 3 BGB)', TG_TABLE_NAME;
  END IF;
  IF NEW.patient_id <> OLD.patient_id THEN
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = OLD.patient_id AND dublette_von = NEW.patient_id) THEN
      RAISE EXCEPTION '% wechselt den Patienten nur beim Zusammenführen einer Dublette (W119)', TG_TABLE_NAME;
    END IF;
    meta := meta || ARRAY['patient_id'];
  END IF;
  IF (to_jsonb(OLD) - meta) <> (to_jsonb(NEW) - meta) THEN
    RAISE EXCEPTION '% wird nicht geändert – nur widerrufen bzw. für ungültig erklären', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END
$$;
