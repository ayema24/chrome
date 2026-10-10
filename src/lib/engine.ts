// Thin UCI wrapper around Stockfish. The transport is pluggable so the same
// logic runs in the browser (Web Worker) and in Node (tests / scripts).

export interface EngineTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate?(): void;
}

export interface PvLine {
  multipv: number;
  depth: number;
  /** Centipawns from the side-to-move's perspective (undefined if mate). */
  cp?: number;
  /** Mate in N from side-to-move's perspective (negative = getting mated). */
  mate?: number;
  pv: string[];
}

export interface SearchResult {
  bestMove: string | null;
  lines: PvLine[];
  depth: number;
}

export interface SearchOptions {
  depth?: number;
  movetime?: number;
  nodes?: number;
  multipv?: number;
  skill?: number; // 0..20
  /** Optional UCI move list to restrict the search to. */
  searchMoves?: string[];
  onInfo?: (lines: PvLine[]) => void;
}

interface Job {
  fen: string;
  opts: SearchOptions;
  resolve: (r: SearchResult) => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
}

export class Engine {
  private transport: EngineTransport;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines = new Map<number, PvLine>();
  private maxDepth = 0;
  private skill = 20;
  private multipv = 1;
  private readyResolvers: (() => void)[] = [];

  constructor(transport: EngineTransport) {
    this.transport = transport;
    this.transport.onLine((l) => this.handleLine(l));
    this.ready = new Promise<void>((res) => {
      this.readyResolvers.push(res);
      this.transport.send('uci');
      this.transport.send('setoption name Hash value 32');
      this.transport.send('isready');
    });
  }

  private handleLine(line: string) {
    if (line === 'readyok') {
      const r = this.readyResolvers.shift();
      r?.();
      return;
    }
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      const parsed = parseInfo(line);
      if (parsed) {
        this.lines.set(parsed.multipv, parsed);
        this.maxDepth = Math.max(this.maxDepth, parsed.depth);
        if (!job.cancelled && job.opts.onInfo && parsed.multipv === this.multipvCount(job)) {
          job.opts.onInfo(this.sortedLines());
        }
      }
    } else if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      const result: SearchResult = {
        bestMove: best && best !== '(none)' ? best : null,
        lines: this.sortedLines(),
        depth: this.maxDepth,
      };
      this.current = null;
      if (job.cancelled) job.reject(new CancelledError());
      else job.resolve(result);
      this.pump();
    }
  }

  private multipvCount(job: Job) {
    return Math.max(1, job.opts.multipv ?? 1);
  }

  private sortedLines(): PvLine[] {
    return [...this.lines.values()].sort((a, b) => a.multipv - b.multipv);
  }

  private async pump() {
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    if (job.cancelled) {
      job.reject(new CancelledError());
      this.pump();
      return;
    }
    this.current = job;
    await this.ready;
    const { opts } = job;
    const skill = opts.skill ?? 20;
    if (skill !== this.skill) {
      this.transport.send(`setoption name Skill Level value ${skill}`);
      this.skill = skill;
    }
    const mpv = Math.max(1, opts.multipv ?? 1);
    if (mpv !== this.multipv) {
      this.transport.send(`setoption name MultiPV value ${mpv}`);
      this.multipv = mpv;
    }
    this.lines.clear();
    this.maxDepth = 0;
    this.transport.send(`position fen ${job.fen}`);
    let go = 'go';
    if (opts.depth) go += ` depth ${opts.depth}`;
    if (opts.movetime) go += ` movetime ${opts.movetime}`;
    if (opts.nodes) go += ` nodes ${opts.nodes}`;
    if (!opts.depth && !opts.movetime && !opts.nodes) go += ' depth 14';
    if (opts.searchMoves?.length) go += ` searchmoves ${opts.searchMoves.join(' ')}`;
    this.transport.send(go);
  }

  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject, cancelled: false });
      this.pump();
    });
  }

  /** Cancels everything queued and stops the running search. */
  stopAll() {
    for (const j of this.queue) j.cancelled = true;
    if (this.current) {
      this.current.cancelled = true;
      this.transport.send('stop');
    }
  }

  newGame() {
    this.transport.send('ucinewgame');
  }

  terminate() {
    this.stopAll();
    this.transport.terminate?.();
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export function isCancelled(e: unknown): boolean {
  return e instanceof CancelledError;
}

export function parseInfo(line: string): PvLine | null {
  const tok = line.split(' ');
  const get = (k: string) => {
    const i = tok.indexOf(k);
    return i >= 0 ? tok[i + 1] : undefined;
  };
  const depth = parseInt(get('depth') ?? '', 10);
  const pvIdx = tok.indexOf('pv');
  if (!Number.isFinite(depth) || pvIdx < 0) return null;
  const scoreIdx = tok.indexOf('score');
  if (scoreIdx < 0) return null;
  // Ignore bound-only updates.
  if (tok[scoreIdx + 3] === 'lowerbound' || tok[scoreIdx + 3] === 'upperbound') return null;
  const kind = tok[scoreIdx + 1];
  const val = parseInt(tok[scoreIdx + 2], 10);
  return {
    multipv: parseInt(get('multipv') ?? '1', 10),
    depth,
    cp: kind === 'cp' ? val : undefined,
    mate: kind === 'mate' ? val : undefined,
    pv: tok.slice(pvIdx + 1),
  };
}

// ---------------------------------------------------------------------------
// Browser singletons

let interactive: Engine | null = null;
let background: Engine | null = null;

function workerTransport(): EngineTransport {
  const url = `${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`;
  const worker = new Worker(url);
  const listeners: ((l: string) => void)[] = [];
  worker.onmessage = (e: MessageEvent) => {
    const data = typeof e.data === 'string' ? e.data : String(e.data);
    for (const line of data.split('\n')) if (line) listeners.forEach((l) => l(line));
  };
  return {
    send: (c) => worker.postMessage(c),
    onLine: (cb) => listeners.push(cb),
    terminate: () => worker.terminate(),
  };
}

/** Engine for things the user is waiting on: play, live analysis, hints. */
export function getEngine(): Engine {
  if (!interactive) interactive = new Engine(workerTransport());
  return interactive;
}

/** Separate engine instance for batch game analysis so it never blocks play. */
export function getBackgroundEngine(): Engine {
  if (!background) background = new Engine(workerTransport());
  return background;
}
