declare type BufferEncoding = 'utf8';

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: BufferEncoding): string;
}

declare module 'node:module' {
  export function createRequire(filename: string): {
    resolve(id: string): string;
  };
}
