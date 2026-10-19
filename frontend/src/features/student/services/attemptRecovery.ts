import type { StudentAttempt } from './studentService';

export interface DraftAnswer {
  key: string;
  owner: string;
  attemptId: number;
  questionId: number;
  answerId: number;
  revision: string;
  synced: boolean;
}
export interface DraftStore {
  list(owner: string, attemptId: number): Promise<DraftAnswer[]>;
  put(answer: DraftAnswer): Promise<void>;
  acknowledge(answer: DraftAnswer): Promise<void>;
  clear(owner: string, attemptId: number): Promise<void>;
}

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Trình duyệt không hỗ trợ lưu bài ngoại tuyến.')); return; }
    let settled = false;
    const request = indexedDB.open('examflow-attempt-drafts', 1);
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Không mở được bộ nhớ lưu bài trên trình duyệt.')); } };
    const timer = setTimeout(fail, 4000);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('answers', { keyPath: 'key' });
      store.createIndex('scope', ['owner', 'attemptId']);
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('answers', mode, mode==='readwrite'?{durability:'strict'}:undefined);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || new Error('Chưa lưu được bài trên trình duyệt.'));
    tx.onerror = () => { /* onabort reports the failed transaction */ };
    try { work(tx.objectStore('answers'), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export const indexedDraftStore: DraftStore = {
  list: (owner, attemptId) => transaction<DraftAnswer[]>('readonly', (store, done) => {
    const request = store.index('scope').getAll(IDBKeyRange.only([owner, attemptId]));
    request.onsuccess = () => done(request.result);
  }),
  put: answer => transaction<void>('readwrite', store => { store.put(answer); }),
  acknowledge: answer => transaction<void>('readwrite', store => {
    const request = store.get(answer.key);
    request.onsuccess = () => {
      const current = request.result as DraftAnswer | undefined;
      // An old HTTP response must never mark a newer choice as synchronized.
      if (current?.revision === answer.revision) store.put({ ...current, synced: true });
    };
  }),
  clear: (owner, attemptId) => transaction<void>('readwrite', store => {
    const request = store.index('scope').getAllKeys(IDBKeyRange.only([owner, attemptId]));
    request.onsuccess = () => { for (const key of request.result) store.delete(key); };
  }),
};

export interface RecoveryState {
  pending: number[];
  localSaving: boolean;
  storageError: boolean;
  syncing: boolean;
  syncError: boolean;
}
type RecoveryOptions = {
  owner: string;
  attempt: StudentAttempt;
  deadline: number;
  store?: DraftStore;
  clock?: () => number;
  online?: () => boolean;
  send: (questionId: number, answerId: number) => Promise<unknown>;
  onChange: (state: RecoveryState) => void;
};

/** Durable write first, serialized network saves second; the server remains the authority on time and ownership. */
export class AttemptRecovery {
  private options: RecoveryOptions;
  private store: DraftStore;
  private pending = new Map<number, DraftAnswer>();
  private unpersisted = new Map<number, string>();
  private writes: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | undefined;
  private stopped = false;
  private paused = false;
  private storageError = false;
  private syncError = false;
  private localSaving = 0;
  readonly attemptId: number;
  readonly owner: string;

  constructor(options: RecoveryOptions) {
    this.options = options;
    this.owner = options.owner;
    this.attemptId = options.attempt.attemptId;
    this.store = options.store || indexedDraftStore;
  }
  private clock() { return this.options.clock?.() ?? Date.now(); }
  private online() { return this.options.online?.() ?? (typeof navigator === 'undefined' || navigator.onLine !== false); }
  private emit() {
    if (!this.stopped) this.options.onChange({ pending: [...this.pending.keys()], localSaving: this.localSaving > 0,
      storageError: this.storageError || this.unpersisted.size > 0, syncing: !!this.flushing, syncError: this.syncError });
  }
  private valid(questionId: number, answerId: number) {
    return this.options.attempt.questions.some(q => q.questionId === questionId && q.options.some(a => a.id === answerId));
  }
  async restore(): Promise<{ selected: Record<number, number>; restored: number }> {
    const selected = Object.fromEntries(this.options.attempt.questions.filter(q => q.selectedAnswerId != null).map(q => [q.questionId, q.selectedAnswerId!])) as Record<number, number>;
    try {
      const entries = await this.store.list(this.owner, this.attemptId);
      if (this.stopped) return { selected, restored: 0 };
      for (const entry of entries) {
        if (entry.owner !== this.owner || entry.attemptId !== this.attemptId || !this.valid(entry.questionId, entry.answerId) || entry.synced || typeof entry.revision !== 'string') continue;
        this.pending.set(entry.questionId, entry);
        selected[entry.questionId] = entry.answerId;
      }
    } catch { this.storageError = true; }
    this.emit();
    return { selected, restored: this.pending.size };
  }
  choose(questionId: number, answerId: number): boolean {
    if (this.stopped || this.paused || this.clock() >= this.options.deadline || !this.valid(questionId, answerId)) return false;
    const answer: DraftAnswer = { key: JSON.stringify([this.owner, this.attemptId, questionId]), owner: this.owner, attemptId: this.attemptId,
      questionId, answerId, revision: crypto.randomUUID(), synced: false };
    this.pending.set(questionId, answer);
    this.unpersisted.set(questionId, answer.revision);
    this.localSaving++;
    this.writes = this.writes.then(async () => {
      try {
        await this.store.put(answer);
        if (this.unpersisted.get(questionId) === answer.revision) this.unpersisted.delete(questionId);
      } catch { this.storageError = true; }
      finally { this.localSaving--; this.emit(); }
    });
    this.emit();
    void this.flush();
    return true;
  }
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.stopped || this.paused || !this.online() || this.clock() >= this.options.deadline || !this.pending.size) { this.emit(); return Promise.resolve(); }
    this.syncError = false;
    this.flushing = this.drain().finally(() => { this.flushing = undefined; this.emit(); });
    this.emit();
    return this.flushing;
  }
  private async drain() {
    while (!this.stopped && !this.paused && this.online() && this.clock() < this.options.deadline && this.pending.size) {
      await this.waitForWrites();
      if (this.stopped || this.paused || !this.online() || this.clock() >= this.options.deadline) break;
      const answer = this.pending.values().next().value!;
      try { await this.options.send(answer.questionId, answer.answerId); }
      catch { this.syncError = true; this.emit(); break; }
      try { await this.store.acknowledge(answer); }
      catch { this.storageError = true; }
      if (this.pending.get(answer.questionId)?.revision === answer.revision) this.pending.delete(answer.questionId);
      this.emit();
    }
  }
  private async waitForWrites() {
    let batch: Promise<void>;
    do { batch=this.writes; await batch; } while(batch!==this.writes);
  }
  async prepareSubmit() {
    this.paused = true;
    await this.waitForWrites();
    await this.flushing;
  }
  resume() { this.paused = false; this.emit(); }
  async complete() {
    this.stop();
    await this.writes;
    await this.store.clear(this.owner, this.attemptId);
  }
  stop() { this.stopped = true; }
}
