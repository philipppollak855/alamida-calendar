import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icon.svg'));

await sharp(svg).resize(192, 192).png().toFile(join(root, 'public/pwa-192x192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(root, 'public/pwa-512x512.png'));
await sharp(svg).resize(180, 180).png().toFile(join(root, 'public/apple-touch-icon.png'));

console.log('PWA icons generated.');
