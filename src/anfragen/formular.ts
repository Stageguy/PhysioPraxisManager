/**
 * Terminanfragen von der Website (W92). Empfohlener Weg: das Kontaktformular der Website schickt eine
 * Mail mit festen Feldern an das Praxispostfach; die Praxis-Assistenz liest sie aus dem Ordner
 * „Terminanfragen“ und legt eine Anfrage an (Prompt 6). Kein öffentlicher Endpunkt, keine neue
 * Angriffsfläche – das Formular der Website bleibt beim Website-Anbieter.
 *
 * Hier der reine Leser: Zeilen „Feld: Wert“ aus dem Mailtext. Feldnamen tolerant (Name/Vorname/Nachname,
 * Telefon/Handy/Mobil, E-Mail/Mail, Wunschtermin/Zeitraum/Termin, Anliegen/Nachricht/Behandlung).
 */
export interface Terminanfrage {
  name: string;
  telefon: string | null;
  email: string | null;
  wunsch: string | null;
  anliegen: string | null;
  /** Wahl aus dem Dropdown „Terminart“ (W94), z. B. „P4 – Krankengymnastik (KG)“ */
  terminart: string | null;
  quelle: 'website';
}

const FELDER: Record<keyof Omit<Terminanfrage, 'quelle'>, RegExp> = {
  name: /^(?:name|vor- und nachname)\s*:\s*(.+)$/i,
  telefon: /^(?:telefon|telefonnummer|handy|mobil|rückrufnummer)\s*:\s*(.+)$/i,
  email: /^(?:e-?mail|mailadresse|e-mail-adresse)\s*:\s*(.+)$/i,
  wunsch: /^(?:wunschtermin|wunschzeit|zeitraum|termin|wann)\s*:\s*(.+)$/i,
  anliegen: /^(?:anliegen|nachricht|behandlung|betreff|grund|bemerkung)\s*:\s*(.+)$/i,
  terminart: /^(?:terminart|art des termins|leistungswunsch)\s*:\s*(.+)$/i,
};

/** Formular-Mail → Anfrage; undefined, wenn weder Name noch ein Kontaktweg zu finden ist */
export function anfrageAusFormularMail(text: string): Terminanfrage | undefined {
  const werte: Partial<Record<keyof typeof FELDER, string>> = {};
  let vorname = '';
  let nachname = '';
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.replace(/^[\s>*-]+/, '').trim();
    if (!zeile) continue;
    const vn = /^vorname\s*:\s*(.+)$/i.exec(zeile);
    const nn = /^(?:nachname|familienname)\s*:\s*(.+)$/i.exec(zeile);
    if (vn) { vorname = vn[1]!.trim(); continue; }
    if (nn) { nachname = nn[1]!.trim(); continue; }
    for (const [feld, muster] of Object.entries(FELDER) as [keyof typeof FELDER, RegExp][]) {
      const m = muster.exec(zeile);
      if (m && !werte[feld]) { werte[feld] = m[1]!.trim(); break; }
    }
  }
  const name = werte.name ?? `${vorname} ${nachname}`.trim();
  const email = werte.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(werte.email) ? werte.email.toLowerCase() : null;
  const telefon = werte.telefon && werte.telefon.replace(/\D/g, '').length >= 5 ? werte.telefon : null;
  if (!name && !email && !telefon) return undefined;
  return { name, telefon, email, wunsch: werte.wunsch ?? null, anliegen: werte.anliegen ?? null, terminart: werte.terminart ?? null, quelle: 'website' };
}
