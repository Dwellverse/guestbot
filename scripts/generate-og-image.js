import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const svgPath = join(publicDir, 'og-image.svg');
const pngPath = join(publicDir, 'og-image.png');

const svg = readFileSync(svgPath);

sharp(svg)
  .resize(1200, 630)
  .png()
  .toFile(pngPath)
  .then(() => console.log('Generated og-image.png'))
  .catch((err) => console.error('Error:', err));
