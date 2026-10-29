/** Aktionen: Mail-Entwurf im Postfach, WhatsApp senden oder vermerken (W90, W91) – nichts geht automatisch raus (Leitplanke 3) */
import { mailEntwurf, whatsappSenden, whatsappVermerken } from '../nachrichten.ts';
import { KarteiFehler } from '../patienten.ts';
import type { Aktionen } from './kontext.ts';

export const NACHRICHTEN: Aktionen = {
  async mail_entwurf({ db, t, q, id, g, f, wer, nach, seite }) {
    const e = await mailEntwurf(db, t, q.graph, id, {
      vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined, rechnungId: g('rechnung_id') || undefined, freitext: g('freitext'),
      anhangRechnungen: f.getAll('anhang_rechnung'), anhangDokumente: f.getAll('anhang_dokument'),
    }, wer);
    return nach(`${seite}#verlauf`, `Entwurf liegt im Postfach – in Outlook unter „Entwürfe“ prüfen und senden.${e.anhaenge ? ` ${e.anhaenge} Anhang dabei.` : ''}${e.hinweise.length ? ` ${e.hinweise.join(' ')}` : ''}`);
  },
  async whatsapp_senden({ db, t, q, id, g, wer, nach, seite }) {
    if (!q.whatsapp) throw new KarteiFehler('WhatsApp-Versand ist nicht eingerichtet – der WhatsApp-Knopf öffnet die Nachricht auf dem Handy');
    await whatsappSenden(db, t, q.whatsapp, id, { vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined, rechnungId: g('rechnung_id') || undefined, freitext: g('freitext') }, wer);
    return nach(`${seite}#verlauf`, 'WhatsApp-Nachricht gesendet und im Verlauf vermerkt.');
  },
  async whatsapp_vermerken({ db, t, id, g, wer, nach, seite }) {
    await whatsappVermerken(db, t, id, { vorlage: g('vorlage') ?? '', terminId: g('termin_id') || undefined }, wer);
    return nach(`${seite}#verlauf`, 'WhatsApp vermerkt.');
  },
};
