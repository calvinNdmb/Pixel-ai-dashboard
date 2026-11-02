/**
 * File asynchrone minimaliste : sert d'entrée « streaming » au SDK Agent, ce qui
 * permet d'envoyer de nouveaux messages à une session déjà lancée.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  push(item: T): boolean {
    if (this.closed) return false;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) return Promise.resolve({ value: this.items.shift() as T, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: (): Promise<IteratorResult<T>> => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
