-- Rechnungseingang (Prompt 3 + 4): eingegangene Mail-Anhänge, Protokoll, Stand der Abholung.
-- Ohne tenant_id: eine Praxis (requirements N13).

CREATE TYPE inbound_status AS ENUM (
  'eingegangen', 'klassifiziert', 'wartet_freigabe', 'freigegeben', 'an_lexware', 'abgelehnt', 'fehler'
);

-- rechnung: Lieferantenrechnung · unklar: Lilli schaut es an · keine_rechnung: bleibt liegen
-- patient: Mail mit Patientenbezug – wird nicht verarbeitet, nur in Outlook markiert
CREATE TYPE inbound_klasse AS ENUM ('rechnung', 'unklar', 'keine_rechnung', 'patient');

CREATE TABLE inbound_document (
  id                  bigserial PRIMARY KEY,
  graph_message_id    text NOT NULL,
  internet_message_id text,
  attachment_id       text NOT NULL,
  received_at         timestamptz NOT NULL,
  sender_domain       text NOT NULL,
  -- Betreff nur als Hash: er kann Patientennamen enthalten
  subject_hash        text NOT NULL,
  -- Dateiname nur bei Lieferantenrechnungen; bei allem anderen kann er einen Namen verraten
  attachment_name     text,
  sha256              text NOT NULL,
  size                integer NOT NULL,
  klasse              inbound_klasse NOT NULL,
  lieferant           text,
  onedrive_item_id    text,
  onedrive_path       text,
  status              inbound_status NOT NULL DEFAULT 'eingegangen',
  lexware_file_id     text,
  lexware_voucher_id  text,
  reviewed_by         text,
  reviewed_at         timestamptz,
  error_code          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (graph_message_id, attachment_id)
);

-- Dieselbe Rechnung kommt nur einmal in die Ablage, egal in wie vielen Mails sie steckt
CREATE UNIQUE INDEX inbound_document_rechnung_sha256 ON inbound_document (sha256) WHERE klasse = 'rechnung';
CREATE INDEX inbound_document_status ON inbound_document (status);

-- Protokoll: nur anhängen, nie ändern oder löschen
CREATE TABLE audit_event (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,
  action      text NOT NULL,
  object_type text,
  object_id   text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION audit_event_unveraenderlich() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event ist unveränderlich';
END
$$;

CREATE TRIGGER audit_event_nur_anhaengen
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_unveraenderlich();

-- Stand von Abholungen, z. B. der Delta-Link je Mail-Ordner
CREATE TABLE sync_state (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
