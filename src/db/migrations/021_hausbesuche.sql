-- Hausbesuche (W113): Adresstyp je Adresse, Behandlungsort je Termin, Fahrtzeit vor und nach dem Hausbesuch.
-- Die Fahrtzeit steckt nicht in Beginn/Ende des Termins, sondern daneben – belegte Zeiten und Kalender rechnen sie dazu.
ALTER TABLE patient_adresse ADD COLUMN typ text NOT NULL DEFAULT 'rechnung' CHECK (typ IN ('rechnung', 'hausbesuch', 'betreuer'));

ALTER TABLE termin ADD COLUMN behandlungsort text NOT NULL DEFAULT 'praxis' CHECK (behandlungsort IN ('praxis', 'hausbesuch'));
ALTER TABLE termin ADD COLUMN adresse_id bigint REFERENCES patient_adresse ON DELETE SET NULL;
ALTER TABLE termin ADD COLUMN fahrt_vor_min integer NOT NULL DEFAULT 0 CHECK (fahrt_vor_min >= 0 AND fahrt_vor_min <= 240);
ALTER TABLE termin ADD COLUMN fahrt_nach_min integer NOT NULL DEFAULT 0 CHECK (fahrt_nach_min >= 0 AND fahrt_nach_min <= 240);
-- von Hand eingetragene Fahrtzeiten rechnet der Dienst nicht neu
ALTER TABLE termin ADD COLUMN fahrt_manuell boolean NOT NULL DEFAULT false;
CREATE INDEX termin_hausbesuch_adresse ON termin (adresse_id) WHERE adresse_id IS NOT NULL;

-- Fahrtzeiten ohne fremden Dienst (Datenschutz): Standard von der Praxis zu einem unbekannten Ort, innerorts zwischen
-- zwei Hausbesuchen im selben Ort, und je Ort oder PLZ eine Zeile „Ort = Minuten“
INSERT INTO praxis_einstellung (schluessel, wert) VALUES ('fahrtzeit_standard_min', '30'), ('fahrtzeit_innerorts_min', '10'), ('fahrtzeit_orte', 'Bad Wörishofen = 10')
  ON CONFLICT (schluessel) DO NOTHING;
