/** Telefonnummer nach E.164 für tel:/wa.me-Links und WhatsApp („0151 123 45 67“ → „+491511234567“); Deutschland ist Standard */
export function telefonNormieren(wert: string): string {
  let z = wert.replace(/[^\d+]/g, '');
  if (z.startsWith('00')) z = `+${z.slice(2)}`;
  else if (z.startsWith('0')) z = `+49${z.slice(1)}`;
  else if (!z.startsWith('+')) z = `+49${z}`;
  return z;
}
