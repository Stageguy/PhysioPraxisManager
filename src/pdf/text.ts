/**
 * PDF ohne Bibliothek: Text in Helvetica (WinAnsi, damit Umlaute und € stimmen), Hochformat A4 mit
 * Zeilenumbruch, Überschriften, Seitenzahlen. Für Akte-Export (§ 630g) und ähnliche Textdokumente;
 * die Steuerliste nutzt denselben Schreiber für die Zeichen und baut ihre Spalten selbst.
 */
const CP1252: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

/** Zeichenkette für einen PDF-Textoperator: Klammern maskiert, Nicht-ASCII als Oktal in WinAnsi */
export function winAnsi(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, (c) => {
    const code = CP1252[c] ?? c.charCodeAt(0);
    return code <= 0xff ? `\\${code.toString(8).padStart(3, '0')}` : '?';
  });
}

export interface Zeile {
  text: string;
  fett?: boolean;
  /** Einzug in Punkt */
  einzug?: number;
  groesse?: number;
}

export interface Abschnitt {
  titel?: string;
  zeilen: (string | Zeile)[];
}

const BREITE = 595;
const HOEHE = 842;
const RAND = 50;

/** Grobe Breite eines Helvetica-Zeichens in Punkt je Schriftgröße (Mittelwert) */
const ZEICHEN = 0.52;

function umbrechen(text: string, groesse: number, breite: number): string[] {
  const max = Math.max(10, Math.floor(breite / (groesse * ZEICHEN)));
  const zeilen: string[] = [];
  for (const absatz of text.split('\n')) {
    let aktuell = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const kandidat = aktuell ? `${aktuell} ${wort}` : wort;
      if (kandidat.length <= max) { aktuell = kandidat; continue; }
      if (aktuell) zeilen.push(aktuell);
      aktuell = wort.length > max ? wort.slice(0, max) : wort;
    }
    zeilen.push(aktuell);
  }
  return zeilen;
}

/** Textdokument als PDF 1.4 */
export function textPdf(o: { titel: string; untertitel?: string; fuss?: string; abschnitte: Abschnitt[] }): Uint8Array {
  const seiten: string[][] = [];
  let inhalt: string[] = [];
  let y = HOEHE - RAND;
  const kopf = () => {
    inhalt.push(`BT /F1 8 Tf ${RAND} ${HOEHE - 30} Td (${winAnsi(o.titel)}) Tj ET`);
  };
  const neueSeite = () => { if (inhalt.length) seiten.push(inhalt); inhalt = []; y = HOEHE - RAND; kopf(); };
  const text = (s: string, groesse: number, fett: boolean, x: number) => {
    if (y < RAND + 20) neueSeite();
    inhalt.push(`BT /${fett ? 'F2' : 'F1'} ${groesse} Tf ${x} ${y.toFixed(1)} Td (${winAnsi(s)}) Tj ET`);
    y -= groesse * 1.4;
  };
  const absatz = (z: Zeile) => {
    const groesse = z.groesse ?? 10;
    const einzug = z.einzug ?? 0;
    for (const t of umbrechen(z.text, groesse, BREITE - 2 * RAND - einzug)) text(t, groesse, Boolean(z.fett), RAND + einzug);
  };
  neueSeite();
  text(o.titel, 16, true, RAND);
  if (o.untertitel) { absatz({ text: o.untertitel, groesse: 9 }); }
  y -= 8;
  for (const a of o.abschnitte) {
    if (a.titel) {
      if (y < RAND + 60) neueSeite();
      y -= 6;
      text(a.titel, 12.5, true, RAND);
      y -= 2;
    }
    for (const z of a.zeilen) absatz(typeof z === 'string' ? { text: z } : z);
    y -= 4;
  }
  if (inhalt.length) seiten.push(inhalt);

  const objekte: string[] = [];
  const add = (s: string) => { objekte.push(s); return objekte.length; };
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = objekte.length + seiten.length * 2 + 1;
  const seitenIds: number[] = [];
  seiten.forEach((zeilen, i) => {
    const fuss = `BT /F1 8 Tf ${RAND} 28 Td (${winAnsi(`${o.fuss ?? ''}${o.fuss ? '  ·  ' : ''}Seite ${i + 1} von ${seiten.length}`)}) Tj ET`;
    const strom = [...zeilen, fuss].join('\n');
    const c = add(`<< /Length ${Buffer.byteLength(strom, 'latin1')} >>\nstream\n${strom}\nendstream`);
    seitenIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${BREITE} ${HOEHE}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  });
  add(`<< /Type /Pages /Kids [${seitenIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${seitenIds.length} >>`);
  const katalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let ausgabe = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objekte.forEach((o2, i) => { offsets.push(Buffer.byteLength(ausgabe, 'latin1')); ausgabe += `${i + 1} 0 obj\n${o2}\nendobj\n`; });
  const xref = Buffer.byteLength(ausgabe, 'latin1');
  ausgabe += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${offsets.map((x) => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objekte.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(ausgabe, 'latin1');
}
