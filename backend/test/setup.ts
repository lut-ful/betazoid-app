import { webcrypto } from 'crypto';

// Jest (Node 18) doesn't expose globalThis.crypto — polyfill it so
// @nestjs/typeorm's crypto.randomUUID() call doesn't throw.
if (typeof globalThis.crypto === 'undefined') {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: false,
    });
}
