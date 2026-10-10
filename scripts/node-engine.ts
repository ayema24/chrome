// Node transport for the Stockfish engine (used by tests and offline scripts).
import { createRequire } from 'node:module';
import { Engine, type EngineTransport } from '../src/lib/engine';

const require = createRequire(import.meta.url);

export async function createNodeEngine(): Promise<Engine> {
  const init = require('stockfish');
  const sf = await init('lite-single');
  const listeners: ((l: string) => void)[] = [];
  sf.listener = (line: string) => listeners.forEach((l) => l(line));
  const transport: EngineTransport = {
    send: (c) => sf.sendCommand(c),
    onLine: (cb) => listeners.push(cb),
    terminate: () => sf.terminate?.(),
  };
  return new Engine(transport);
}
