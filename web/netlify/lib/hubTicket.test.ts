import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { hubTicketPruefen } from './server';

const ORIGIN = 'https://bestattung-stranz-kalendar.netlify.app';
const schluessel = generateKeyPairSync('ed25519');

function ticket(inhalt: Record<string, unknown>, privat = schluessel.privateKey): string {
  const daten = Buffer.from(JSON.stringify(inhalt)).toString('base64url');
  return `${daten}.${sign(null, Buffer.from(daten), privat).toString('base64url')}`;
}

const gueltig = { iss: 'bestattung-stranz-hub', aud: ORIGIN, email: 'Anna@Bestattung-Stranz.at', name: 'Anna', exp: 2_000 };

beforeAll(() => {
  process.env.HUB_SSO_PUBLIC_KEY = schluessel.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

describe('hubTicketPruefen', () => {
  it('nimmt gültige Tickets an', () => {
    expect(hubTicketPruefen(ticket(gueltig), ORIGIN, 1_000)).toEqual({ email: 'anna@bestattung-stranz.at', name: 'Anna', bild: undefined });
  });
  it('lehnt abgelaufene, fremde und gefälschte Tickets ab', () => {
    expect(hubTicketPruefen(ticket(gueltig), ORIGIN, 3_000)).toBeNull();
    expect(hubTicketPruefen(ticket({ ...gueltig, aud: 'https://andere.app' }), ORIGIN, 1_000)).toBeNull();
    expect(hubTicketPruefen(ticket(gueltig, generateKeyPairSync('ed25519').privateKey), ORIGIN, 1_000)).toBeNull();
    const [, sig] = ticket(gueltig).split('.');
    const anders = Buffer.from(JSON.stringify({ ...gueltig, email: 'chef@x.at' })).toString('base64url');
    expect(hubTicketPruefen(`${anders}.${sig}`, ORIGIN, 1_000)).toBeNull();
    expect(hubTicketPruefen('quatsch', ORIGIN, 1_000)).toBeNull();
  });
});
