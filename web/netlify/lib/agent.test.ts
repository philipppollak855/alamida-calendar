import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { STANDARD_KONFIG, konfigPruefen } from '../../src/shared/rechte';
import { agentAntwort, agentStatusPruefen, agentTokenPruefen } from './agent';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { client_email: 'agent@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
function token(claims: Record<string, unknown>, key = sa.private_key) {
  const kopf = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${kopf}.${createSign('RSA-SHA256').update(kopf).sign(key).toString('base64url')}`;
}
const jetzt = 1_800_000_000_000;
const n = jetzt / 1000;

describe('Agent-Anmeldung', () => {
  it('nimmt ein gültiges Token an', () => {
    expect(agentTokenPruefen(token({ iss: sa.client_email, aud: 'alamida-agent', iat: n, exp: n + 300 }), sa, jetzt)).toBe(true);
  });
  it('lehnt falschen Aussteller, abgelaufene, zu lange und fremd signierte Tokens ab', () => {
    const fremd = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(agentTokenPruefen(token({ iss: 'x@y', aud: 'alamida-agent', iat: n, exp: n + 300 }), sa, jetzt)).toBe(false);
    expect(agentTokenPruefen(token({ iss: sa.client_email, aud: 'alamida-agent', iat: n - 400, exp: n - 1 }), sa, jetzt)).toBe(false);
    expect(agentTokenPruefen(token({ iss: sa.client_email, aud: 'alamida-agent', iat: n, exp: n + 3600 }), sa, jetzt)).toBe(false);
    expect(agentTokenPruefen(token({ iss: sa.client_email, aud: 'anders', iat: n, exp: n + 300 }), sa, jetzt)).toBe(false);
    expect(agentTokenPruefen(token({ iss: sa.client_email, aud: 'alamida-agent', iat: n, exp: n + 300 }, fremd), sa, jetzt)).toBe(false);
    expect(agentTokenPruefen('kaputt', sa, jetzt)).toBe(false);
  });
});

describe('Agent-Einstellungen', () => {
  it('bereinigt Kategorie-Vorgaben und liefert sie an den Agent', () => {
    const k = konfigPruefen({
      ...STANDARD_KONFIG,
      kalender: [{ id: 'k1@group.calendar.google.com', name: 'Bestattung' }],
      agent: {
        standardKalender: 'k1@group.calendar.google.com',
        kategorien: { Vorsorge: { kalender: 'v@group.calendar.google.com', dauer: 45, aktiv: true }, Kremation: { aktiv: false, dauer: 5 }, Unsinn: { dauer: 30 } },
      },
    });
    expect(k.agent).toEqual({
      standardKalender: 'k1@group.calendar.google.com',
      kategorien: { Vorsorge: { kalender: 'v@group.calendar.google.com', dauer: 45 }, Kremation: { aktiv: false } },
    });
    const a = agentAntwort(k);
    expect(a.ersatzKalender).toBe('k1@group.calendar.google.com');
    expect(a.kategorien.Vorsorge).toEqual({ calendarId: 'v@group.calendar.google.com', dauerMinuten: 45, aktiv: null });
    expect(a.kategorien.Kremation).toEqual({ calendarId: null, dauerMinuten: null, aktiv: false });
    expect(a.kategorien).not.toHaveProperty('Sonstiges');
  });
  it('prüft Status-Meldungen', () => {
    expect(agentStatusPruefen({ version: '1' })).toBeNull();
    expect(agentStatusPruefen({ station: ' PC1 ', termine: 3.4, zentral: true }, 5)).toMatchObject({ station: 'PC1', termine: 3, zentral: true, zeit: 5 });
  });
});
