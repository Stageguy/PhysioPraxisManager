/** Rechnungen eines Patienten als Kacheln (W79, W103) – Status, Zahlungen aus Lexware, PDF im Tresor */
import type { Db } from '../../db/index.ts';
import { tag, text, zahl } from '../../db/werte.ts';
import { STATUS_TEXT as RECHNUNG_STATUS_TEXT } from '../rechnungen.ts';
import type { RechnungKurz } from './basis.ts';

/** Zahlungsposten aus dem JSON der Abfrage (pg liefert Objekte, PGlite ebenfalls; Text zur Sicherheit) */
export const zahlungenAus = (v: unknown): RechnungKurz['zahlungen'] => {
  const liste = (typeof v === 'string' ? JSON.parse(v) : v) as { datum: unknown; betrag: unknown; art: unknown }[] | null;
  return (liste ?? []).map((z) => ({ datum: tag(z.datum), betrag: Number(z.betrag), art: String(z.art) }));
};

export async function rechnungen(db: Db, patientId: string): Promise<RechnungKurz[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id::text, art::text, steuerklasse::text, datum, faellig_am, nummer, betrag, status::text, gemahnt_am, versand_art, lexware_abweichung, (lexware_pdf IS NOT NULL) AS pdf,
       quelle, bezahlt_am, storniert_am, lexware_pdf_name, lexware_status, lexware_invoice_id,
       (SELECT count(*) FROM rechnung_position p WHERE p.rechnung_id = rechnung.id) AS positionen,
       (SELECT coalesce(json_agg(json_build_object('datum', z.datum, 'betrag', z.betrag, 'art', z.art) ORDER BY z.datum, z.id), '[]'::json) FROM rechnung_zahlung z WHERE z.rechnung_id = rechnung.id) AS zahlungen
     FROM rechnung WHERE patient_id = $1 ORDER BY status = 'entwurf' DESC, coalesce(datum, erstellt_am::date) DESC, id DESC LIMIT 300`, [patientId],
  );
  return rows.map((r) => {
    const [statusText, statusFarbe] = RECHNUNG_STATUS_TEXT[r.status as keyof typeof RECHNUNG_STATUS_TEXT] ?? [String(r.status), 'preset12'];
    return {
      id: String(r.id), art: String(r.art), steuerklasse: text(r.steuerklasse) ?? '', datum: tag(r.datum), faelligAm: tag(r.faellig_am), nummer: text(r.nummer), betrag: zahl(r.betrag), status: String(r.status),
      statusText, statusFarbe, gemahnt: r.gemahnt_am != null, positionen: Number(r.positionen), versandArt: text(r.versand_art), lexwareAbweichung: text(r.lexware_abweichung),
      quelle: r.quelle === 'lexware' ? 'lexware' as const : 'ppm' as const, bezahltAm: tag(r.bezahlt_am), storniertAm: tag(r.storniert_am), dateiName: text(r.lexware_pdf_name), lexwareStatus: text(r.lexware_status),
      lexwareInvoiceId: text(r.lexware_invoice_id), zahlungen: zahlungenAus(r.zahlungen), pdf: Boolean(r.pdf),
    };
  });
}
