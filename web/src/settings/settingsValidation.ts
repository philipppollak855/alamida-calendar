import type { DispositionSettings } from '../types/dispositionSettings';

export type SettingsValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateDispositionSettings(s: DispositionSettings): SettingsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (s.kremationKeywords.length === 0) {
    warnings.push('Keine Kremation-Keywords — Krematorien werden nicht erkannt.');
  }
  if (s.krankenhausPrefixe.length === 0 && s.krankenhausKeywords.length === 0) {
    warnings.push('Keine Krankenhaus-Regeln — externe KH-Erkennung eingeschränkt.');
  }
  if (s.eigeneKuehlraeume.length === 0) {
    errors.push('Mindestens ein eigener Kühlraum ist erforderlich.');
  }

  const w = s.wallTabWechselSekunden;
  if (w) {
    const tabs: [string, number][] = [
      ['Kühlraum', w.kuehlraum],
      ['Extern', w.extern],
      ['Heute', w.abholungen],
      ['Offen', w.offen],
    ];
    for (const [label, sec] of tabs) {
      if (sec < 5 || sec > 300) {
        errors.push(`Wandmonitor „${label}“: Tabwechsel 5–300 Sekunden.`);
      }
    }
  }
  const enabled = s.wallTabRotationEnabled;
  if (enabled) {
    const hasAny =
      enabled.kuehlraum ||
      enabled.extern ||
      enabled.kalender ||
      enabled.abholungen ||
      enabled.offen;
    if (!hasAny) {
      errors.push('Wandmonitor: Mindestens ein Tab muss in der Rotation aktiviert sein.');
    }
  }

  for (const kr of s.eigeneKuehlraeume) {
    if (!kr.label.trim()) errors.push('Kühlraum ohne Bezeichnung.');
    if (kr.plaetze < 1 || kr.plaetze > 99) errors.push(`„${kr.label}“: Plätze müssen 1–99 sein.`);
    if (!kr.alamidaName?.trim() && kr.matchKeywords.length === 0) {
      warnings.push(`„${kr.label}“: weder Alamida-Name noch Keywords — Erkennung unsicher.`);
    }
  }

  const allKh = [
    ...s.kremationPrefixe,
    ...s.kremationKeywords,
    ...s.krankenhausPrefixe,
    ...s.krankenhausKeywords,
    ...s.pflegeheimPrefixe,
    ...s.pflegeheimKeywords,
    ...s.bestattungPrefixe,
    ...s.bestattungKeywords,
  ];
  for (const kw of allKh) {
    if (kw.length === 1) warnings.push(`Sehr kurzes Keyword „${kw}" kann Fehl-Treffer erzeugen.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function settingsChanged(a: DispositionSettings, b: DispositionSettings): boolean {
  return JSON.stringify(normalizeForCompare(a)) !== JSON.stringify(normalizeForCompare(b));
}

function normalizeForCompare(s: DispositionSettings) {
  return {
    kremationPrefixe: [...s.kremationPrefixe].sort(),
    kremationKeywords: [...s.kremationKeywords].sort(),
    krankenhausPrefixe: [...s.krankenhausPrefixe].sort(),
    krankenhausKeywords: [...s.krankenhausKeywords].sort(),
    pflegeheimPrefixe: [...s.pflegeheimPrefixe].sort(),
    pflegeheimKeywords: [...s.pflegeheimKeywords].sort(),
    bestattungPrefixe: [...s.bestattungPrefixe].sort(),
    bestattungKeywords: [...s.bestattungKeywords].sort(),
    wallTabWechselSekunden: s.wallTabWechselSekunden,
    wallTabRotationEnabled: s.wallTabRotationEnabled,
    eigeneKuehlraeume: s.eigeneKuehlraeume.map((k) => ({
      id: k.id,
      label: k.label,
      alamidaName: k.alamidaName ?? '',
      matchKeywords: [...k.matchKeywords].sort(),
      externKeywords: [...(k.externKeywords ?? [])].sort(),
      wandTab: k.wandTab ?? 'kuehlraum',
      plaetze: k.plaetze,
    })),
  };
}
