import { describe, it, expect, beforeEach } from 'vitest';
import { buildExternGruppen } from './wallExternUtils';
import type { Sterbefall } from '../types';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';

function baseFall(overrides: Partial<Sterbefall>): Sterbefall {
  return {
    id: 'doc1',
    sterbefallId: 'test1',
    verstorbenerName: 'Test',
    aktivInAlamida: true,
    ...overrides,
  };
}

describe('buildExternGruppen', () => {
  beforeEach(() => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('klassifiziert Bestattung Kunz → KR nicht als Krankenhaus', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 'b1',
        verstorbenerName: 'Michael Brauneder',
        abholort: 'Bestattung Kunz',
        abholortIstKrankenhaus: false,
        naechsterSchrittVon: 'Bestattung Kunz',
        naechsterSchrittNach: 'Kühlr. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    expect(gruppen.filter((g) => g.typ === 'krankenhaus')).toHaveLength(0);
    const bestattung = gruppen.find((g) => g.typ === 'bestattung');
    expect(bestattung?.ort).toMatch(/kunz/i);
    expect(bestattung?.faelle.some((f) => f.name.includes('Brauneder'))).toBe(true);
  });

  it('zeigt UK Wiener Neustadt → Kühl. unter Krankenhaus', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't1',
        verstorbenerName: 'Touahria',
        sterbefallId: '260100',
        abholort: 'UK - Wiener Neustadt',
        abholortIstKrankenhaus: true,
        naechsterSchrittVon: 'UK - Wiener Neustadt',
        naechsterSchrittNach: 'Kühl. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    const kh = gruppen.find((g) => g.typ === 'krankenhaus');
    expect(kh).toBeDefined();
    expect(kh!.faelle.some((f) => f.name.includes('Touahria'))).toBe(true);
    expect(kh!.ort.toLowerCase()).toContain('neustadt');
  });

  it('erkennt UK-Route auch nur mit getrenntem abholort und naechsterSchrittNach', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't2',
        verstorbenerName: 'Touahria',
        abholort: 'UK - Wiener Neustadt',
        abholortIstKrankenhaus: true,
        ausstehend: [],
        naechsterSchrittVon: 'UK - Wiener Neustadt',
        naechsterSchrittNach: 'Kühl. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    expect(gruppen.some((g) => g.typ === 'krankenhaus' && g.faelle.length > 0)).toBe(true);
  });

  it('erkennt UK→Kühl nur aus Verlauf (ohne ausstehend/naechsterSchritt)', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't3',
        verstorbenerName: 'Touahria',
        sterbefallId: '260100',
        ausstehend: [],
        abholort: '',
        naechsterSchrittVon: '',
        naechsterSchrittNach: '',
        naechsterSchrittTyp: undefined,
        verlauf: [
          {
            nummer: 1,
            typ: 'abholung',
            vonOrt: 'UK - Wiener Neustadt',
            nachOrt: 'Kühl. Grafenbach',
            ort: 'Kühl. Grafenbach',
            terminAm: '',
          },
        ],
      }),
    ]);

    const kh = gruppen.find((g) => g.typ === 'krankenhaus');
    expect(kh).toBeDefined();
    expect(kh!.faelle.some((f) => f.name.includes('Touahria'))).toBe(true);
  });

  it('zeigt Fall gleichzeitig in Krankenhaus und Kremation bei offenen Schritten', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't4',
        verstorbenerName: 'Gertraud Touahria',
        sterbefallId: '260100',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'abholung',
            vonOrt: 'UK - Wiener Neustadt',
            nachOrt: 'Kühl. Grafenbach',
            status: 'geplant',
          },
          {
            zeile: 2,
            schrittTyp: 'kremation',
            vonOrt: 'Kühl. Grafenbach',
            nachOrt: 'Innermanzing',
            status: 'geplant',
          },
        ],
      }),
    ]);

    const kh = gruppen.find((g) => g.typ === 'krankenhaus' && /neustadt/i.test(g.ort));
    const krem = gruppen.find((g) => g.typ === 'kremation');
    expect(kh?.faelle.some((f) => f.name.includes('Touahria'))).toBe(true);
    expect(krem?.faelle.some((f) => f.name.includes('Touahria'))).toBe(true);
  });

  it('listet Kühlraum mit wandTab extern auf dem Extern-Tab', () => {
    setDispositionSettings({
      ...DEFAULT_DISPOSITION_SETTINGS,
      eigeneKuehlraeume: [
        ...DEFAULT_DISPOSITION_SETTINGS.eigeneKuehlraeume,
        {
          id: 'wien',
          label: 'Kühlraum Wien',
          alamidaName: 'Kühlr. Wien',
          matchKeywords: ['wien', 'kühlr. wien'],
          externKeywords: [],
          wandTab: 'extern',
          plaetze: 4,
        },
      ],
    });

    const gruppen = buildExternGruppen([
      baseFall({
        id: 'w1',
        verstorbenerName: 'Muster Wien',
        status: 'im_kuehlraum',
        kuehlraumId: 'Kühlr. Wien',
        kuehlplatz: '2',
        aktuellePosition: 'Kühlr. Wien',
        aktuellePositionTyp: 'ueberfuehrung',
      }),
    ]);

    const kr = gruppen.find((g) => g.typ === 'kuehlraum' && g.ort === 'Kühlraum Wien');
    expect(kr?.faelle.some((f) => f.name.includes('Muster Wien'))).toBe(true);
    expect(kr?.faelle[0]?.hinweis).toContain('Platz 2');
  });
});
