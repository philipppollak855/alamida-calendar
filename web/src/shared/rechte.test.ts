import { describe, expect, it } from 'vitest';
import { ALLE, STANDARD_KONFIG, darfSehen, konfigPruefen, rechteFuer, verzeichnisAnwenden, verzeichnisPruefen, type Konfiguration } from './rechte';

const konfig: Konfiguration = {
  ...STANDARD_KONFIG,
  benutzer: [
    { email: 'Fahrer@Bestattung.at', gruppen: ['fahrer'] },
    { email: 'chef@bestattung.at', gruppen: [], admin: true },
  ],
  domains: [{ domain: 'buero.at', gruppen: ['buero'] }],
};

describe('rechte', () => {
  it('Fahrer sieht nur Fahrten', () => {
    const r = rechteFuer('fahrer@bestattung.at', konfig);
    expect(r.freigeschaltet).toBe(true);
    expect(darfSehen(r, 'kal', 'Abholung')).toBe(true);
    expect(darfSehen(r, 'kal', 'Beisetzung')).toBe(false);
  });

  it('Admin per Konfiguration oder ENV sieht alles', () => {
    expect(darfSehen(rechteFuer('chef@bestattung.at', konfig), 'x', 'Beisetzung')).toBe(true);
    const r = rechteFuer('boss@gmail.com', konfig, ['Boss@gmail.com']);
    expect(r.admin).toBe(true);
  });

  it('Domain-Regel und Unbekannte', () => {
    expect(darfSehen(rechteFuer('a@buero.at', konfig), 'x', 'Kremation')).toBe(true);
    const fremd = rechteFuer('fremd@gmail.com', konfig);
    expect(fremd.freigeschaltet).toBe(false);
    expect(darfSehen(fremd, 'x', 'Abholung')).toBe(false);
  });

  it('Kalender-Einschränkung', () => {
    const k: Konfiguration = { ...konfig, gruppen: [{ id: 'g', name: 'G', kategorien: ['*'], kalender: ['fahrten@x'] }], benutzer: [{ email: 'a@b.at', gruppen: ['g'] }] };
    const r = rechteFuer('a@b.at', k);
    expect(darfSehen(r, 'fahrten@x', 'Beisetzung')).toBe(true);
    expect(darfSehen(r, 'andere@x', 'Beisetzung')).toBe(false);
  });

  it('bereinigt Eingaben', () => {
    const k = konfigPruefen({ gruppen: [{ id: 'g', name: 'G', kategorien: ['*'], kalender: ['*'] }], benutzer: [{ email: ' X@Y.AT ', gruppen: ['g', 'gibtsnicht'] }, { email: 'kaputt' }], domains: [{ domain: '@firma.at', gruppen: ['g'] }] });
    expect(k.benutzer).toEqual([{ email: 'x@y.at', name: undefined, gruppen: ['g'], admin: false }]);
    expect(k.domains[0].domain).toBe('firma.at');
  });
});

describe('Hub-Verzeichnis als eine Quelle', () => {
  const lokal: Konfiguration = {
    ...STANDARD_KONFIG,
    gruppen: [
      { id: 'buero', name: 'Alt', kategorien: [ALLE], kalender: [ALLE] },
      { id: 'fahrer', name: 'Fahrer', kategorien: ['Abholung'], kalender: [ALLE] },
    ],
    benutzer: [{ email: 'alt@x.at', gruppen: ['buero'] }],
    bereitschaftGruppen: ['buero'],
  };
  const v = verzeichnisPruefen({
    gruppen: [{ id: 'buero', name: 'Büro' }, { id: 'neu', name: 'Neu' }],
    benutzer: [{ email: 'Anna@X.at', name: 'Anna', gruppen: ['neu', 'unbekannt'] }, { email: 'kein-mail' }],
    domains: [{ domain: 'firma.at', gruppen: ['buero'] }],
  })!;

  it('übernimmt Mitarbeiter, Gruppen und Domains aus dem Hub und behält die Kalender-Rechte je Gruppe', () => {
    expect(v.benutzer).toEqual([{ email: 'anna@x.at', name: 'Anna', gruppen: ['neu'], admin: false }]);
    const k = verzeichnisAnwenden(lokal, v);
    expect(k.hubVerwaltet).toBe(true);
    expect(k.gruppen).toEqual([
      { id: 'buero', name: 'Büro', kategorien: [ALLE], kalender: [ALLE] },
      { id: 'neu', name: 'Neu', kategorien: [], kalender: [] },
    ]);
    expect(k.bereitschaftGruppen).toEqual(['buero']);
    expect(rechteFuer('anna@x.at', k).freigeschaltet).toBe(true);
    expect(rechteFuer('anna@x.at', k).kategorien).toEqual([]);
    expect(rechteFuer('wer@firma.at', k).kalender).toEqual([ALLE]);
    expect(rechteFuer('alt@x.at', k).freigeschaltet).toBe(false);
  });

  it('lehnt ungültige Antworten ab', () => {
    expect(verzeichnisPruefen(null)).toBeNull();
    expect(verzeichnisPruefen({ fehler: 'nicht berechtigt' })).toBeNull();
  });
});
