/**
 * Eine Mail aus praxis@lilli-nebel.de senden. Ohne `ausfuehren` wird nur gezeigt, was gesendet
 * würde. Die Signatur hängt Exchange per Transportregel an (praxis-website/source/exchange).
 */
import type { GraphClient } from '../graph.ts';

export interface NeueMail {
  an: string[];
  cc?: string[];
  betreff: string;
  text: string;
}

const ADRESSE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function pruefeMail(mail: NeueMail): void {
  if (!mail.an.length) throw new Error('Kein Empfänger angegeben');
  for (const a of [...mail.an, ...(mail.cc ?? [])]) {
    if (!ADRESSE.test(a)) throw new Error(`„${a}“ ist keine gültige Mailadresse`);
  }
  if (!mail.betreff.trim()) throw new Error('Betreff fehlt');
  if (!mail.text.trim()) throw new Error('Text fehlt');
}

/** Körper für POST /me/sendMail */
export function sendMailKoerper(mail: NeueMail) {
  const empfaenger = (liste: string[] = []) => liste.map((address) => ({ emailAddress: { address } }));
  return {
    message: {
      subject: mail.betreff,
      body: { contentType: 'Text', content: mail.text },
      toRecipients: empfaenger(mail.an),
      ccRecipients: empfaenger(mail.cc),
    },
    saveToSentItems: true,
  };
}

export async function mailSenden(
  graph: Pick<GraphClient, 'postOhneAntwort'>,
  mail: NeueMail,
  optionen: { ausfuehren: boolean },
): Promise<{ gesendet: boolean }> {
  pruefeMail(mail);
  if (!optionen.ausfuehren) return { gesendet: false };
  // POST wird bei Netzwerkfehlern nicht wiederholt (graph.ts) – sonst ginge die Mail womöglich doppelt
  await graph.postOhneAntwort('/me/sendMail', sendMailKoerper(mail));
  return { gesendet: true };
}
