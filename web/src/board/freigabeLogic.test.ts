import { describe, it, expect } from 'vitest';
import { freigabePersonCssClass, istFreigabeWirksam } from './freigabeLogic';

const heute = new Date(2026, 4, 27); // 27.05.2026

describe('freigabeLogic', () => {
  it('ohne Freigabe → nicht wirksam / rot', () => {
    expect(istFreigabeWirksam(false, undefined, heute)).toBe(false);
    expect(freigabePersonCssClass(false, undefined, heute)).toBe('is-nicht-frei');
  });

  it('Freigabe heute → wirksam / grün', () => {
    expect(istFreigabeWirksam(true, '27.05.2026', heute)).toBe(true);
    expect(freigabePersonCssClass(true, '27.05.2026', heute)).toBe('is-frei-erfasst');
  });

  it('Freigabe in Zukunft → nicht wirksam / rot', () => {
    expect(istFreigabeWirksam(true, '28.05.2026', heute)).toBe(false);
    expect(freigabePersonCssClass(true, '28.05.2026', heute)).toBe('is-nicht-frei');
  });

  it('Freigabe in Vergangenheit → wirksam / grün', () => {
    expect(istFreigabeWirksam(true, '26.05.2026', heute)).toBe(true);
    expect(freigabePersonCssClass(true, '26.05.2026', heute)).toBe('is-frei-erfasst');
  });
});
