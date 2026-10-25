/** Die Praxis rechnet in deutscher Ortszeit – Graph in UTC. */
const ZONE = 'Europe/Berlin';
/** So heißt dieselbe Zone in Outlook-Terminen */
export const OUTLOOK_ZONE = 'W. Europe Standard Time';

/** Abstand der deutschen Ortszeit zu UTC in Minuten zum Zeitpunkt t (60 im Winter, 120 im Sommer) */
function versatzMinuten(t: number): number {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const alsUtc = Date.UTC(teile.year!, teile.month! - 1, teile.day!, teile.hour!, teile.minute!, teile.second!);
  return Math.round((alsUtc - t) / 60_000);
}

/** "2026-10-01" → Beginn dieses Tages in Deutschland als UTC-Zeitpunkt ("2026-09-30T22:00:00Z") */
export function berlinMitternachtUtc(datum: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!m) throw new Error(`Datum „${datum}“ ist nicht im Format JJJJ-MM-TT`);
  const naiv = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const erst = naiv - versatzMinuten(naiv) * 60_000;
  const t = naiv - versatzMinuten(erst) * 60_000;
  return new Date(t).toISOString().replace('.000Z', 'Z');
}

/**
 * Deutsche Ortszeit ("2026-10-25", "09:00") → UTC-Zeitpunkt. Richtig auch an den Tagen der Zeitumstellung,
 * an denen „Mitternacht + Minuten“ um eine Stunde danebenläge.
 */
export function berlinZeitUtc(datum: string, zeit: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  const z = /^(\d{2}):(\d{2})$/.exec(zeit);
  if (!m || !z) throw new Error(`Datum „${datum}“ oder Zeit „${zeit}“ ist nicht im Format JJJJ-MM-TT bzw. HH:MM`);
  const naiv = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(z[1]), Number(z[2]));
  const erst = naiv - versatzMinuten(naiv) * 60_000;
  const t = naiv - versatzMinuten(erst) * 60_000;
  return new Date(t).toISOString().replace('.000Z', 'Z');
}

/** Zeitpunkt (ISO, UTC) → Kalendertag in Deutschland, "2026-10-20" */
export function datumBerlin(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(iso));
}
