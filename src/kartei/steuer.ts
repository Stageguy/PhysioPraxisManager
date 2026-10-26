/**
 * Steuerfreie Umsätze für das Finanzamt (W85): alle gestellten Ausgangsrechnungen ohne Umsatzsteuer –
 * Heilbehandlung (§ 4 Nr. 14 Buchst. a UStG) und Kleinunternehmer (§ 19 UStG) – mit Nummer, Positionen und
 * Beträgen. Namen wahlweise maskiert (Vorname nur erster Buchstabe), die Patientennummer bleibt als Pseudonym.
 * Export als CSV (für den Datenzugriff nach GoBD) und als PDF (für die Steuerberatung).
 */
import type { Db } from '../db/index.ts';
import { rund, tag } from '../db/werte.ts';
import { datumText, preisText } from '../format.ts';
import { winAnsi } from '../pdf/text.ts';

export type Befreiung = '§ 4 Nr. 14 UStG' | '§ 19 UStG';

export interface SteuerPosition {
  datum: string | null;
  nummer: string | null;
  bezeichnung: string;
  anzahl: number;
  einzelpreis: number;
  betrag: number;
}

export interface SteuerRechnung {
  id: string;
  nummer: string;
  datum: string | null;
  status: string;
  befreiung: Befreiung;
  patientennummer: string;
  name: string;
  betrag: number;
  bezahltAm: string | null;
  storniertAm: string | null;
  positionen: SteuerPosition[];
}

export interface SteuerListe {
  jahr: number;
  jahre: number[];
  maskiert: boolean;
  rechnungen: SteuerRechnung[];
  summen: { heilbehandlung: number; kleinunternehmer: number; storniert: number; gesamt: number };
}

/** „Karin Zwölfer“ → „K**** Zwölfer“: Vorname nur mit dem ersten Buchstaben, Nachname ausgeschrieben */
export const nameMaskieren = (vorname: string, nachname: string) => `${vorname.trim().slice(0, 1)}${'*'.repeat(Math.max(1, vorname.trim().length - 1))} ${nachname.trim()}`;


export async function steuerfreieUmsaetze(db: Db, o: { jahr: number; maskiert: boolean }): Promise<SteuerListe> {
  const jahre = (await db.query<{ j: number }>("SELECT DISTINCT extract(year FROM datum)::int AS j FROM rechnung WHERE nummer IS NOT NULL AND datum IS NOT NULL ORDER BY 1 DESC")).rows.map((r) => Number(r.j));
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT r.id::text, r.nummer, r.datum, r.status::text, r.steuerklasse::text, r.kleinunternehmer, r.betrag, r.bezahlt_am, r.storniert_am, p.patientennummer, p.vorname, p.nachname
     FROM rechnung r JOIN patient p ON p.id = r.patient_id
     WHERE r.nummer IS NOT NULL AND r.ust_satz = 0 AND extract(year FROM r.datum) = $1 ORDER BY r.datum, r.nummer`, [o.jahr],
  );
  const rechnungen: SteuerRechnung[] = [];
  for (const r of rows) {
    const positionen = (await db.query<Record<string, unknown>>('SELECT datum, nummer, bezeichnung, anzahl, einzelpreis, betrag FROM rechnung_position WHERE rechnung_id = $1 ORDER BY reihenfolge, id', [r.id])).rows
      .map((p) => ({ datum: tag(p.datum), nummer: (p.nummer as string | null) ?? null, bezeichnung: String(p.bezeichnung), anzahl: Number(p.anzahl), einzelpreis: Number(p.einzelpreis), betrag: Number(p.betrag) }));
    rechnungen.push({
      id: String(r.id), nummer: String(r.nummer), datum: tag(r.datum), status: String(r.status),
      befreiung: r.steuerklasse === 'heilbehandlung_steuerfrei' ? '§ 4 Nr. 14 UStG' : '§ 19 UStG',
      patientennummer: String(r.patientennummer), name: o.maskiert ? nameMaskieren(String(r.vorname), String(r.nachname)) : `${r.vorname} ${r.nachname}`,
      betrag: Number(r.betrag), bezahltAm: tag(r.bezahlt_am), storniertAm: tag(r.storniert_am), positionen,
    });
  }
  const summe = (f: (x: SteuerRechnung) => boolean) => rund(rechnungen.filter(f).reduce((s, x) => s + x.betrag, 0));
  return {
    jahr: o.jahr, jahre: jahre.includes(o.jahr) ? jahre : [o.jahr, ...jahre], maskiert: o.maskiert, rechnungen,
    summen: {
      heilbehandlung: summe((x) => x.befreiung === '§ 4 Nr. 14 UStG' && x.status !== 'storniert'),
      kleinunternehmer: summe((x) => x.befreiung === '§ 19 UStG' && x.status !== 'storniert'),
      storniert: summe((x) => x.status === 'storniert'),
      gesamt: summe((x) => x.status !== 'storniert'),
    },
  };
}


/** CSV mit Semikolon und UTF-8-BOM (Excel, DATEV, Prüfsoftware): eine Zeile je Position, Rechnungsdaten wiederholt */
export function steuerCsv(l: SteuerListe): string {
  const z = (s: string | number | null) => { const t = s === null ? '' : String(s); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const kopf = ['Rechnungsnummer', 'Rechnungsdatum', 'Status', 'Befreiung', 'Patientennummer', 'Name', 'Leistungsdatum', 'Leistungsnummer', 'Leistung', 'Anzahl', 'Einzelpreis', 'Positionsbetrag', 'Rechnungsbetrag', 'Bezahlt am', 'Storniert am'];
  const zeilen = [kopf.join(';')];
  for (const r of l.rechnungen) {
    const pos = r.positionen.length ? r.positionen : [{ datum: null, nummer: null, bezeichnung: '', anzahl: 0, einzelpreis: 0, betrag: 0 }];
    for (const p of pos) {
      zeilen.push([r.nummer, datumText(r.datum, ''), r.status, r.befreiung, r.patientennummer, r.name, datumText(p.datum, ''), p.nummer, p.bezeichnung, p.anzahl, preisText(p.einzelpreis), preisText(p.betrag), preisText(r.betrag), datumText(r.bezahltAm, ''), datumText(r.storniertAm, '')].map(z).join(';'));
    }
  }
  return `﻿${zeilen.join('\r\n')}\r\n`;
}

// ── PDF ohne Bibliothek (Zeichen aus pdf/text.ts), Querformat mit eigenen Spalten ──
export function steuerPdf(l: SteuerListe, o: { praxis: string; erstellt: string }): Uint8Array {
  const breite = 842; const hoehe = 595; // Querformat A4
  const seiten: string[][] = [];
  let zeilen: string[] = [];
  let y = hoehe - 50;
  const neueSeite = () => { if (zeilen.length) seiten.push(zeilen); zeilen = []; y = hoehe - 50; };
  const text = (x: number, s: string, groesse = 9, fett = false) => { zeilen.push(`BT /${fett ? 'F2' : 'F1'} ${groesse} Tf ${x} ${y.toFixed(1)} Td (${winAnsi(s)}) Tj ET`); };
  const zeile = (teile: [number, string][], groesse = 9, fett = false) => { if (y < 50) neueSeite(); for (const [x, s] of teile) text(x, s, groesse, fett); y -= groesse + 4; };
  const kopfzeile = () => {
    zeile([[40, `${o.praxis} – Steuerfreie Umsätze ${l.jahr}`]], 14, true);
    zeile([[40, `Heilbehandlung § 4 Nr. 14 UStG und Kleinunternehmer § 19 UStG · erstellt ${o.erstellt} · Namen ${l.maskiert ? 'maskiert (Patientennummer als Pseudonym)' : 'ausgeschrieben'}`]], 8);
    y -= 6;
    zeile([[40, 'Rechnung'], [110, 'Datum'], [165, 'Befreiung'], [250, 'Patient'], [420, 'Leistungsdatum / Nr. / Leistung'], [720, 'Betrag €']], 8, true);
    y -= 2;
  };
  neueSeite();
  kopfzeile();
  for (const r of l.rechnungen) {
    const status = r.status === 'storniert' ? ' (storniert)' : '';
    zeile([[40, r.nummer + status], [110, datumText(r.datum, '')], [165, r.befreiung], [250, `${r.patientennummer} · ${r.name}`], [720, preisText(r.betrag)]], 9, true);
    for (const p of r.positionen) zeile([[420, `${datumText(p.datum, '')}  ${p.nummer ?? ''}  ${p.bezeichnung.slice(0, 48)}  ${p.anzahl} × ${preisText(p.einzelpreis)}`], [720, preisText(p.betrag)]], 8);
    y -= 3;
    if (y < 50) { neueSeite(); kopfzeile(); }
  }
  y -= 6;
  zeile([[40, `Summe § 4 Nr. 14 UStG: ${preisText(l.summen.heilbehandlung)} €   Summe § 19 UStG: ${preisText(l.summen.kleinunternehmer)} €   Gesamt: ${preisText(l.summen.gesamt)} €   davon storniert (nicht gezählt): ${preisText(l.summen.storniert)} €`]], 9, true);
  if (zeilen.length) seiten.push(zeilen);

  const objekte: string[] = [];
  const add = (s: string) => { objekte.push(s); return objekte.length; };
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const seitenIds: number[] = [];
  const pagesId = objekte.length + seiten.length * 2 + 1;
  for (const inhalt of seiten) {
    const strom = inhalt.join('\n');
    const c = add(`<< /Length ${Buffer.byteLength(strom, 'latin1')} >>\nstream\n${strom}\nendstream`);
    seitenIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${breite} ${hoehe}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${seitenIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${seitenIds.length} >>`);
  const katalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let ausgabe = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objekte.forEach((o2, i) => { offsets.push(Buffer.byteLength(ausgabe, 'latin1')); ausgabe += `${i + 1} 0 obj\n${o2}\nendobj\n`; });
  const xref = Buffer.byteLength(ausgabe, 'latin1');
  ausgabe += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(ausgabe, 'latin1');
}
