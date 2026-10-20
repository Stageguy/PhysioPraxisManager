/**
 * Zahlungsabgleich (requirements N24, N26): Wenn eine Rechnung bezahlt ist, bekommt ihre Mail die
 * Kategorie „Rechnung: bezahlt“ und wandert ins Exchange-Archiv.
 *
 * Zwei Quellen für „bezahlt“:
 * - lexware (Lösung 3, ab Tarif XL): Status am Lexware-Beleg. transferred/sepadebit → „Zahlung
 *   angestoßen“, paid → „bezahlt“ + Archiv. Zuordnung Mail ↔ Beleg über lexware_voucher_id, sonst
 *   eindeutig über die Rechnungsnummer (Belegnummer in Lexware), bei mehreren Treffern zusätzlich
 *   über den Betrag. Nie raten: nicht eindeutig → nichts tun, nur zählen.
 * - outlook (Übergang bis XL): Lilli setzt „Rechnung: bezahlt“ selbst in Outlook; das System
 *   verschiebt die Mail ins Archiv und trägt den Stand in die Datenbank ein.
 *
 * Ohne `ausfuehren`: liest nur und zählt.
 */
import { protokolliere, type Db } from '../db/index.ts';
import type { GraphClient } from '../graph.ts';
import type { Beleg, LexwareClient } from '../lexware/client.ts';
import { aufStufe, KATEGORIEN } from '../mail/kategorien.ts';
import { normiereNummer } from '../rechnungen/kopfdaten.ts';

const PREFER = { Prefer: 'IdType="ImmutableId"' };
type AbgleichGraph = Pick<GraphClient, 'get' | 'patch' | 'post' | 'paginate'>;

interface Zeile {
  id: string;
  graph_message_id: string;
  rechnungsnummer: string | null;
  betrag: string | null;
  lexware_voucher_id: string | null;
  status: string;
}

export interface AbgleichBericht {
  offen: number;
  angestossen: number;
  bezahlt: number;
  archiviert: number;
  ohneZuordnung: number;
  mehrdeutig: number;
  mailFehlt: number;
}

const neuerBericht = (): AbgleichBericht => ({
  offen: 0, angestossen: 0, bezahlt: 0, archiviert: 0, ohneZuordnung: 0, mehrdeutig: 0, mailFehlt: 0,
});

/** Mail auf eine Stufe setzen und – bei „bezahlt“ – ins Archiv. false, wenn es die Mail nicht mehr gibt */
async function mailSetzen(graph: AbgleichGraph, mailId: string, kategorie: string, archivieren: boolean): Promise<boolean> {
  let mail: { categories?: string[]; parentFolderId?: string };
  try {
    mail = await graph.get(`/me/messages/${mailId}?$select=categories,parentFolderId`, PREFER);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
  await graph.patch(`/me/messages/${mailId}`, { categories: aufStufe(mail.categories ?? [], kategorie) }, PREFER);
  if (archivieren) await graph.post(`/me/messages/${mailId}/move`, { destinationId: 'archive' }, PREFER);
  return true;
}

/** Den Beleg zu einer Zeile finden – oder begründet keinen */
export function belegZu(zeile: Zeile, nachId: Map<string, Beleg>, nachNummer: Map<string, Beleg[]>): Beleg | 'keiner' | 'mehrdeutig' {
  if (zeile.lexware_voucher_id) return nachId.get(zeile.lexware_voucher_id) ?? 'keiner';
  if (!zeile.rechnungsnummer) return 'keiner';
  const kandidaten = nachNummer.get(normiereNummer(zeile.rechnungsnummer)) ?? [];
  if (kandidaten.length === 1) return kandidaten[0]!;
  if (!kandidaten.length) return 'keiner';
  const betrag = zeile.betrag === null ? undefined : Number(zeile.betrag);
  const passend = betrag === undefined ? [] : kandidaten.filter((b) => b.totalAmount !== undefined && Math.abs(b.totalAmount - betrag) < 0.005);
  return passend.length === 1 ? passend[0]! : 'mehrdeutig';
}

const OFFEN = "klasse = 'rechnung' AND status NOT IN ('bezahlt', 'abgelehnt', 'fehler')";

/** Lösung 3: Zahlungsstand aus Lexware */
export async function abgleichLexware(
  graph: AbgleichGraph,
  db: Db,
  lex: Pick<LexwareClient, 'belege' | 'zahlung'>,
  optionen: { ausfuehren: boolean },
): Promise<AbgleichBericht> {
  const b = neuerBericht();
  const zeilen = (await db.query<Zeile>(
    `SELECT id::text, graph_message_id, rechnungsnummer, betrag::text, lexware_voucher_id, status::text
     FROM inbound_document WHERE ${OFFEN}`,
  )).rows;
  b.offen = zeilen.length;
  if (!zeilen.length) return b;

  // Alle Eingangsbelege mit Zahlungsbewegung – eine Abfrage statt einer je Rechnung (2 Anfragen/s)
  const nachId = new Map<string, Beleg>();
  const nachNummer = new Map<string, Beleg[]>();
  for await (const beleg of lex.belege({ typ: 'purchaseinvoice', status: ['paid', 'transferred', 'sepadebit'] })) {
    nachId.set(beleg.id, beleg);
    if (beleg.voucherNumber) {
      const n = normiereNummer(beleg.voucherNumber);
      nachNummer.set(n, [...(nachNummer.get(n) ?? []), beleg]);
    }
  }

  for (const z of zeilen) {
    const beleg = belegZu(z, nachId, nachNummer);
    if (beleg === 'keiner') {
      b.ohneZuordnung++;
      continue;
    }
    if (beleg === 'mehrdeutig') {
      b.mehrdeutig++;
      continue;
    }
    const bezahlt = beleg.voucherStatus === 'paid';
    if (!bezahlt && z.status === 'zahlung_angestossen') continue;
    if (bezahlt) b.bezahlt++;
    else b.angestossen++;
    if (!optionen.ausfuehren) continue;

    const paidDate = bezahlt ? (await lex.zahlung(beleg.id)).paidDate?.slice(0, 10) ?? null : null;
    const da = await mailSetzen(graph, z.graph_message_id, bezahlt ? KATEGORIEN.bezahlt.name : KATEGORIEN.angestossen.name, bezahlt);
    if (!da) b.mailFehlt++;
    else if (bezahlt) b.archiviert++;
    await db.query(
      `UPDATE inbound_document SET status = $2, lexware_voucher_id = $3, zahlstatus_quelle = 'lexware',
         bezahlt_am = $4, archiviert_at = CASE WHEN $5 THEN now() ELSE archiviert_at END, updated_at = now()
       WHERE id = $1`,
      [z.id, bezahlt ? 'bezahlt' : 'zahlung_angestossen', beleg.id, paidDate, bezahlt && da],
    );
    await protokolliere(db, {
      actor: 'system:zahlungsabgleich', action: bezahlt ? 'rechnung_bezahlt' : 'zahlung_angestossen',
      objectType: 'inbound_document', objectId: z.id,
      details: { quelle: 'lexware', beleg: beleg.id, status: beleg.voucherStatus, mail: da ? 'archiviert' : 'fehlt' },
    });
  }
  return b;
}

/** Übergang bis XL: Lilli setzt „Rechnung: bezahlt“ in Outlook, das System archiviert */
export async function abgleichOutlook(
  graph: AbgleichGraph,
  db: Db,
  optionen: { ausfuehren: boolean },
): Promise<AbgleichBericht> {
  const b = neuerBericht();
  const archiv = await graph.get<{ id: string }>('/me/mailFolders/archive?$select=id', PREFER);
  const filter = encodeURIComponent(`categories/any(c:c eq '${KATEGORIEN.bezahlt.name.replace(/'/g, "''")}')`);
  for await (const mail of graph.paginate<{ id: string; parentFolderId: string; categories: string[] }>(
    `/me/messages?$filter=${filter}&$select=id,parentFolderId,categories&$top=50`,
    PREFER,
  )) {
    if (mail.parentFolderId === archiv.id) continue;
    b.bezahlt++;
    if (!optionen.ausfuehren) continue;
    // Andere Stufen-Kategorien weg, „bezahlt“ bleibt; Lillis eigene Kategorien bleiben
    await graph.patch(`/me/messages/${mail.id}`, { categories: aufStufe(mail.categories, KATEGORIEN.bezahlt.name) }, PREFER);
    await graph.post(`/me/messages/${mail.id}/move`, { destinationId: 'archive' }, PREFER);
    b.archiviert++;
    const { rows } = await db.query<{ id: string }>(
      `UPDATE inbound_document SET status = 'bezahlt', zahlstatus_quelle = 'manuell', archiviert_at = now(), updated_at = now()
       WHERE graph_message_id = $1 AND ${OFFEN} RETURNING id::text`,
      [mail.id],
    );
    await protokolliere(db, {
      actor: 'system:zahlungsabgleich', action: 'rechnung_bezahlt', objectType: 'mail', objectId: mail.id,
      details: { quelle: 'manuell', zeilen: rows.map((r) => r.id) },
    });
  }
  return b;
}
