// Copies the single-threaded "lite" Stockfish WASM build into public/engine so
// Vite serves it as a static asset (it must be loaded as a Web Worker).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');
if (!existsSync(src)) {
  console.warn('[copy-engine] stockfish package not installed yet, skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log('[copy-engine] Stockfish copied to public/engine');
