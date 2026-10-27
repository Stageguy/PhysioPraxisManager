import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Db } from '../src/db/index.ts';
import { beihilfeLesen, beihilfeZuordnen, gebuethAuflage, gkvLesen, gkvLinkFinden } from '../src/preise/leser.ts';
import {
  aktivSetzen, alsVorlage, anlegen, archivieren, beihilfeSetzen, freigeben, listen, loeschen, musterAbweichung, musterHakenUebernehmen, standardSetzen,
  positionDetail, positionen, PreislisteFehler, preisliste, preisRunden, speichern, wiederherstellen,
} from '../src/preise/preislisten.ts';
import { allePruefen, alsGesehen, neueQuellen } from '../src/preise/quellen.ts';
import { testDb } from './testdb.ts';

// ── Kleine, nachgebaute Ausschnitte der echten Quellen ──────────────────────
const GKV_TEXT = `Anlage 2: Vergütungsvereinbarung
Lesefassung gültig ab 01.01.2026
Seite 2 von 10
Pos.-Nr. Leistungsbeschreibung Preis
X0107 Bindegewebsmassage (BGM)
(Regelbehandlungszeit 20 bis 30 Minuten) 25,98 2,60
X0201
Manuelle Lymphdrainage MLD - 45 Minuten
(Großbehandlung)
(Regelbehandlungszeit 45 Minuten)
53,94 5,39
X0501
Allgemeine Krankengymnastik (KG) (auch auf
neurophysiologischer Grundlage): Einzelbehandlung
(Regelbehandlungszeit 15 bis 25 Minuten)
29,63 2,96
X1201 Manuelle Therapie: Einzelbehandlung
(Regelbehandlungszeit 15 bis 25 Minuten) 35,59 3,56
X9701 Übermittlungsgebühr für Mitteilung/Bericht an die
Ärztin oder den Arzt 1,40 -
X9950
Hausbesuch inklusive Wegegeld (Einsatzpauschale)
Hinweis: zum 01.01.2026 wurde die Positionsnummer
X9933 in X9950 umbenannt
22,78 2,28
B. Abrechnung der Leistungen und Laufzeit der Vereinbarung
(1) X0102 – X2001 gilt nicht als Position 12,00 1,00`;
const zeile = (nr: string, leistung: string, betrag = '') => `<tr><td>${nr}</td><td>${leistung}</td><td>${betrag}</td></tr>`;
const BH_HTML = `<table>${zeile('Nr.', 'Leistung', 'beihilfefähiger Höchstbetrag in Euro')}${zeile('&#160;', 'Bereich Krankengymnastik, Bewegungs&#252;bungen', '&#160;')}
${zeile('4', 'Krankengymnastik (KG), auch auf neurophysiologischer Grundlage, als Einzelbehandlung, Richtwert: 15 bis 25 Minuten', '29,00')}
${zeile('11', 'Manuelle Therapie, Richtwert: 15 bis 25 Minuten', '34,80')}
${zeile('19', 'Manuelle Lymphdrainage (MLD)', '&#160;')}<tr><td>b)Gro&#223;behandlung, Richtwert: 45 Minuten</td><td>52,70</td></tr>
${zeile('18', 'Massage eines oder mehrerer Körperteile', '&#160;')}<tr><td>b)Bindegewebsmassage (BGM), Richtwert: 20 bis 30 Minuten</td><td>25,40</td></tr>
${zeile('3', 'Weitere Leistung', '&#160;')}${Array.from({ length: 18 }, (_, i) => `<tr><td>${String.fromCharCode(97 + i)})Platzhalter ${i}</td><td>1,00</td></tr>`).join('')}</table>`;
const GKV_SEITE = `<a href="/media/x/20251201_Physiotherapie_Vertrag_125_Anlage_2_barrierefrei.pdf" title="Link &ouml;ffnet PDF &quot;Anlage 2: Verg&uuml;tungsvereinbarung (Lesefassung, g&uuml;ltig ab 01.01.2026)&quot;">x</a>
<a href="/media/x/aeltere_dokumente_4/alt.pdf" title="Link &ouml;ffnet PDF &quot;Anlage 2: Verg&uuml;tungsvereinbarung (Lesefassung, g&uuml;ltig ab 01.04.2025)&quot;">y</a>`;

test('GKV-Liste lesen: Nummer für Physiotherapeuten, Kürzel, Regelzeit, Preis, Zuzahlung; Teil B nicht', () => {
  const g = gkvLesen(GKV_TEXT);
  assert.equal(g.version, 'Lesefassung gültig ab 01.01.2026');
  assert.equal(g.gueltigAb, '2026-01-01');
  assert.deepEqual(g.positionen.map((p) => p.nummer), ['20107', '20201', '20501', '21201', '29701', '29950']);
  const kg = g.positionen.find((p) => p.nummer === '20501')!;
  assert.deepEqual([kg.code, kg.kuerzel, kg.regelzeit, kg.preis, kg.zuzahlung, kg.gruppe], ['X0501', 'KG', '15 bis 25 Minuten', 29.63, 2.96, 'Krankengymnastik']);
  assert.equal(g.positionen.find((p) => p.nummer === '20201')!.bezeichnung, 'Manuelle Lymphdrainage MLD - 45 Minuten (Großbehandlung)');
  assert.equal(g.positionen.find((p) => p.nummer === '29701')!.zuzahlung, undefined, 'zuzahlungsfrei');
  assert.match(g.positionen.find((p) => p.nummer === '29950')!.hinweise ?? '', /X9933 in X9950/);
});

test('Beihilfe lesen (mit Unterpunkten) und GKV-Positionen zuordnen', () => {
  const b = beihilfeLesen(BH_HTML);
  assert.ok(b.positionen.some((p) => p.nummer === '19b' && p.preis === 52.7 && /Großbehandlung/.test(p.bezeichnung)));
  const g = gkvLesen(GKV_TEXT).positionen;
  const zu = (nr: string) => beihilfeZuordnen(g.find((p) => p.nummer === nr)!, b.positionen)?.nummer;
  assert.deepEqual([zu('20501'), zu('21201'), zu('20201'), zu('20107')], ['4', '11', '19b', '18b']);
  assert.equal(zu('29701'), undefined, 'ohne passenden Eintrag keine Zuordnung');
});

test('Link auf die aktuelle Lesefassung und GebüTh-Auflage finden', () => {
  assert.equal(gkvLinkFinden(GKV_SEITE)?.url, 'https://www.gkv-spitzenverband.de/media/x/20251201_Physiotherapie_Vertrag_125_Anlage_2_barrierefrei.pdf');
  assert.equal(gebuethAuflage('<span>15. Auflage</span> 2025'), '15. Auflage');
});

// ── Mit Datenbank ───────────────────────────────────────────────────────────
let db: Db;
const holen = (aufrufe: string[] = []) => async (url: string) => {
  aufrufe.push(url);
  if (url.endsWith('.jsp')) return new Response(GKV_SEITE);
  if (url.endsWith('.pdf')) return new Response('PDF');
  if (url.includes('gesetze-im-internet')) return new Response(new TextEncoder().encode(BH_HTML));
  return new Response('<h1>GebüTh</h1> 15. Auflage');
};
// Mindestens 20 Positionen, sonst gilt die Liste als „Aufbau geändert“
const textAus = async () => GKV_TEXT.replace(/\nB\. Abrechnung[\s\S]*$/, '').concat(Array.from({ length: 20 }, (_, i) => `\nX03${String(i).padStart(2, '0')} Platzhalter ${i}\n(Regelbehandlungszeit 10 Minuten) 1,00 0,10`).join(''));

beforeEach(async () => {
  db = await testDb();
});

test('Quellen prüfen: neue Fassungen samt Original speichern, roter Punkt bis „gesehen“, keine Dublette', async () => {
  const erst = await allePruefen(db, { speichern: true, holen: holen(), textAus });
  assert.deepEqual(erst.map((e) => [e.art, e.neu, e.fehler ?? null]), [['gkv', true, null], ['beihilfe', true, null], ['gebueth', true, null]]);
  assert.equal((await neueQuellen(db)).length, 3);
  const roh = (await db.query<{ n: number }>("SELECT length(rohdaten) AS n FROM preisquelle WHERE art = 'gkv'")).rows[0]!.n;
  assert.equal(roh, 3, 'das Original-PDF ist gespeichert');
  const zweiter = await allePruefen(db, { speichern: true, holen: holen(), textAus });
  assert.ok(zweiter.every((e) => !e.neu), 'dieselbe Fassung nicht noch einmal');
  await alsGesehen(db, 'lilli');
  assert.equal((await neueQuellen(db)).length, 0);
  const fehler = await allePruefen(db, { speichern: true, holen: async () => new Response('', { status: 500 }) });
  assert.ok(fehler.every((e) => e.fehler));
});

async function grundlagen() {
  await allePruefen(db, { speichern: true, holen: holen(), textAus });
  const id = async (art: string) => (await db.query<{ id: string }>('SELECT id::text FROM preisquelle WHERE art = $1', [art])).rows[0]!.id;
  return { gkv: await id('gkv'), beihilfe: await id('beihilfe') };
}

test('Anlegen aus GKV mit Standardfaktor; Faktor und Preis bedingen sich; Beihilfe zugeordnet', async () => {
  const q = await grundlagen();
  const id = await anlegen(db, { name: 'Privat 2026', gkvQuelleId: q.gkv, beihilfeQuelleId: q.beihilfe, standardFaktor: 1.5, wer: 'lilli' });
  const kg = (await positionen(db, id)).find((p) => p.nummer === '20501')!;
  assert.deepEqual([kg.gkvPreis, kg.faktor, kg.eigenerPreis, kg.beihilfeHoechstbetrag, kg.beihilfeNummer], [29.63, 1.5, 44.45, 29, '4']);
  await speichern(db, id, { name: 'Privat 2026', standardFaktor: '1,5', zeilen: [{ nummer: '20501', uebernehmen: true, faktor: '', eigenerPreis: '39,00' }, { nummer: '29701', uebernehmen: false, faktor: '1,5', eigenerPreis: '' }] }, 'lilli');
  const nach = await positionen(db, id);
  const kg2 = nach.find((p) => p.nummer === '20501')!;
  assert.deepEqual([kg2.eigenerPreis, kg2.faktor], [39, 1.3162], 'der Preis zählt, der Faktor folgt');
  assert.equal(nach.find((p) => p.nummer === '29701')!.uebernehmen, false);
  await assert.rejects(speichern(db, id, { name: 'x', standardFaktor: '', zeilen: [{ nummer: '20501', uebernehmen: true, faktor: '', eigenerPreis: 'viel' }] }, 'lilli'), PreislisteFehler);
});

test('Lebenslauf: freigeben (dann fest), mehrere aktiv, ein Standard, archivieren mit Umstellung, wiederherstellen, löschen nur Entwurf', async () => {
  const q = await grundlagen();
  const a = await anlegen(db, { name: 'A', gkvQuelleId: q.gkv, beihilfeQuelleId: q.beihilfe, standardFaktor: 1.3, wer: 'l' });
  const b = await anlegen(db, { name: 'B', gkvQuelleId: q.gkv, standardFaktor: 1.4, wer: 'l' });
  await assert.rejects(aktivSetzen(db, a, 'l'), /freigegebene/);
  await freigeben(db, a, 'l');
  await assert.rejects(speichern(db, a, { name: 'A', standardFaktor: '', zeilen: [] }, 'l'), /freigegebene/);
  await freigeben(db, b, 'l');
  await aktivSetzen(db, a, 'l');
  await aktivSetzen(db, b, 'l');
  assert.deepEqual((await listen(db)).map((l) => [l.name, l.aktiv, l.standard]).sort(), [['A', true, false], ['B', true, false]], 'beide aktiv, noch kein Standard');
  await standardSetzen(db, b, 'l');
  await standardSetzen(db, a, 'l');
  assert.deepEqual((await listen(db)).map((l) => [l.name, l.aktiv, l.standard]).sort(), [['A', true, true], ['B', true, false]], 'genau ein Standard');
  await assert.rejects(aktivSetzen(db, a, 'l', false), /Standard-Preisliste bleibt aktiv/);
  await assert.rejects(archivieren(db, a, 'l'), /Standard/);
  // Patienten: einer auf B, einer ohne Wahl (Standard)
  const { patientAnlegen } = await import('../src/kartei/patienten.ts');
  const { neuerHauptschluessel, tresor } = await import('../src/tresor.ts');
  const t = tresor({ PRAXIS_TRESOR_SCHLUESSEL: neuerHauptschluessel() });
  const p1 = await patientAnlegen(db, t, { vorname: 'Berta', nachname: 'B', preislisteId: b }, 'l');
  const p2 = await patientAnlegen(db, t, { vorname: 'Stefan', nachname: 'Standard' }, 'l');
  assert.equal((await preisliste(db, b))!.patienten, 1);
  assert.deepEqual((await db.query<{ p: string | null }>('SELECT preisliste_id::text AS p FROM patient WHERE id = $1', [p2])).rows[0]!.p, null, 'ohne Wahl: Standard');
  const { preislisteFuer } = await import('../src/kartei/rechnungen.ts');
  assert.deepEqual([await preislisteFuer(db, p1), await preislisteFuer(db, p2)], [b, a]);
  await aktivSetzen(db, b, 'l', false);
  assert.equal(await preislisteFuer(db, p1), a, 'inaktive Liste: der Standard springt ein');
  await aktivSetzen(db, b, 'l', true);
  assert.equal((await archivieren(db, b, 'l')).umgestellt, 1, 'Archivieren stellt zugeordnete Patienten um');
  assert.deepEqual((await db.query<{ p: string | null }>('SELECT preisliste_id::text AS p FROM patient WHERE id = $1', [p1])).rows[0]!.p, null, 'ohne Nachfolger auf den Standard');
  assert.deepEqual((await listen(db, { archiv: true })).map((l) => [l.name, l.aktiv]), [['B', false]]);
  await wiederherstellen(db, b, 'l', { aktiv: true });
  assert.deepEqual([(await preisliste(db, b))!.aktiv, (await preisliste(db, b))!.standard, (await preisliste(db, a))!.standard], [true, false, true]);
  await db.query('UPDATE patient SET preisliste_id = $2 WHERE id = $1', [p1, b]);
  assert.equal((await archivieren(db, b, 'l', { nachfolgerId: a })).umgestellt, 1);
  assert.deepEqual((await db.query<{ p: string | null }>('SELECT preisliste_id::text AS p FROM patient WHERE id = $1', [p1])).rows[0]!.p, a, 'mit Nachfolger dorthin');
  assert.equal((await preisliste(db, b))!.nachfolger?.id, a);
  await wiederherstellen(db, b, 'l', { aktiv: false });
  assert.equal((await preisliste(db, b))!.aktiv, false);
  await assert.rejects(loeschen(db, a, 'l'), /nur ein Entwurf/);
  const c = await anlegen(db, { name: 'C', gkvQuelleId: q.gkv, wer: 'l' });
  await loeschen(db, c, 'l');
  assert.equal(await preisliste(db, c), undefined);
});

test('Freigabe verlangt Preise für alle übernommenen Positionen', async () => {
  const q = await grundlagen();
  const id = await anlegen(db, { name: 'Ohne Faktor', gkvQuelleId: q.gkv, wer: 'l' });
  await assert.rejects(freigeben(db, id, 'l'), /ohne eigenen Preis/);
});

test('Vorlage: Auswahl und Faktoren speichern und für eine neue Preisliste verwenden; Basis andere Preisliste', async () => {
  const q = await grundlagen();
  const a = await anlegen(db, { name: 'GebüTh-Werte', gkvQuelleId: q.gkv, wer: 'l', standardFaktor: 1.3 });
  await speichern(db, a, { name: 'GebüTh-Werte', standardFaktor: '1,3', zeilen: [
    { nummer: '20501', uebernehmen: true, faktor: '1,35', eigenerPreis: '' },
    { nummer: '29701', uebernehmen: false, faktor: '', eigenerPreis: '' },
  ] }, 'l');
  const v = await alsVorlage(db, a, 'GebüTh 15. Auflage', 'l');
  const neu = await anlegen(db, { name: 'Neu', gkvQuelleId: q.gkv, vorlageId: v, wer: 'l' });
  const p = await positionen(db, neu);
  assert.deepEqual([p.find((x) => x.nummer === '20501')!.faktor, p.find((x) => x.nummer === '20501')!.eigenerPreis], [1.35, 40]);
  assert.equal(p.find((x) => x.nummer === '29701')!.uebernehmen, false);
  assert.equal(p.find((x) => x.nummer === '21201')!.faktor, 1.3, 'ohne eigenen Faktor gilt der allgemeine der Vorlage');
  const kopie = await anlegen(db, { name: 'Kopie', basisPreislisteId: neu, wer: 'l' });
  assert.deepEqual((await positionen(db, kopie)).map((x) => x.eigenerPreis), p.map((x) => x.eigenerPreis));
  assert.equal((await preisliste(db, kopie))!.basis?.name, 'Neu');
});

test('Detail einer Position: GKV-Original, Beihilfe-Kandidaten, Zuordnung ändern', async () => {
  const q = await grundlagen();
  const id = await anlegen(db, { name: 'D', gkvQuelleId: q.gkv, beihilfeQuelleId: q.beihilfe, wer: 'l' });
  const pos = (await positionen(db, id)).find((p) => p.nummer === '20501')!;
  const d = (await positionDetail(db, id, pos.id))!;
  assert.equal(d.gkv?.daten.positionsnummer, 'X0501');
  assert.equal(d.beihilfe?.nummer, '4');
  assert.equal(d.kandidaten[0]!.nummer, '4');
  const mt = d.kandidaten.find((k) => k.nummer === '11')!;
  await beihilfeSetzen(db, id, pos.id, mt.id, 'bewusst anders', 'l');
  assert.deepEqual([(await positionDetail(db, id, pos.id))!.position.beihilfeHoechstbetrag, (await positionDetail(db, id, pos.id))!.position.notiz], [34.8, 'bewusst anders']);
});

test('Aufrunden: auf den nächsten vollen Euro, ganze Beträge bleiben; der Faktor folgt', async () => {
  assert.deepEqual([preisRunden(43.88, true), preisRunden(39.01, true), preisRunden(40, true), preisRunden(38.519, false)], [44, 40, 40, 38.52]);
  const q = await grundlagen();
  const id = await anlegen(db, { name: 'Rund', gkvQuelleId: q.gkv, standardFaktor: 1.3, aufrunden: true, wer: 'l' });
  const kg = (await positionen(db, id)).find((p) => p.nummer === '20501')!;
  assert.deepEqual([kg.eigenerPreis, kg.faktor], [39, 1.3162], '29,63 × 1,3 = 38,52 → 39,00');
  await speichern(db, id, { name: 'Rund', standardFaktor: '1,3', aufrunden: true, zeilen: [{ nummer: '20501', uebernehmen: true, faktor: '', eigenerPreis: '41,20' }] }, 'l');
  assert.equal((await positionen(db, id)).find((p) => p.nummer === '20501')!.eigenerPreis, 42);
  await speichern(db, id, { name: 'Rund', standardFaktor: '1,3', aufrunden: false, zeilen: [{ nummer: '20501', uebernehmen: true, faktor: '1,3', eigenerPreis: '' }] }, 'l');
  assert.equal((await positionen(db, id)).find((p) => p.nummer === '20501')!.eigenerPreis, 38.52);
  assert.equal((await preisliste(db, id))!.aufrunden, false);
});

test('Muster: Abweichung erkennen (ohne Fehlalarm durch Rundung), Haken übernehmen, Aufrunden im Muster', async () => {
  const q = await grundlagen();
  const a = await anlegen(db, { name: 'Basis', gkvQuelleId: q.gkv, standardFaktor: 1.3, aufrunden: true, wer: 'l' });
  await speichern(db, a, { name: 'Basis', standardFaktor: '1,3', aufrunden: true, zeilen: [{ nummer: '29701', uebernehmen: false, faktor: '', eigenerPreis: '' }] }, 'l');
  const m = await alsVorlage(db, a, 'Muster A', 'l');
  assert.equal((await preisliste(db, a))!.vorlage?.name, 'Muster A', 'die Liste folgt dem neuen Muster');
  assert.equal(await musterAbweichung(db, a), undefined, 'gleich wie das Muster');

  const b = await anlegen(db, { name: 'Aus Muster', gkvQuelleId: q.gkv, vorlageId: m, wer: 'l' });
  const lb = (await preisliste(db, b))!;
  assert.equal(lb.aufrunden, true, 'Aufrunden kommt aus dem Muster');
  assert.equal((await positionen(db, b)).find((p) => p.nummer === '29701')!.uebernehmen, false, 'Haken aus dem Muster vorbelegt');
  assert.equal(await musterAbweichung(db, b), undefined, 'frisch aus dem Muster: keine Abweichung, trotz Rundung');

  await speichern(db, b, { name: 'Aus Muster', standardFaktor: '1,3', aufrunden: true, zeilen: [
    { nummer: '20501', uebernehmen: true, faktor: '', eigenerPreis: '45' }, { nummer: '29701', uebernehmen: true, faktor: '1,3', eigenerPreis: '' },
  ] }, 'l');
  assert.equal((await musterAbweichung(db, b))?.unterschiede, 2);

  await musterHakenUebernehmen(db, b, m, 'l');
  assert.equal((await positionen(db, b)).find((p) => p.nummer === '29701')!.uebernehmen, false);
  assert.equal((await musterAbweichung(db, b))?.unterschiede, 1, 'nur noch der geänderte Preis');
});
