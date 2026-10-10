// The protocol package is typed against the DOM. React Native provides the same runtime APIs
// with slightly narrower typings; these two declarations close the gap so the shared client
// type-checks here and in host apps.
export {};

declare global {
  interface FormData {
    /** React Native accepts a file name as the third argument, like the DOM. */
    append(key: string, value: unknown, fileName?: string): void;
  }
  interface Crypto {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  }
}
