/** Stable JSON encoding for fixture/evidence hashing; not a cryptographic signature format. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  function encode(item: unknown, depth: number): string {
    if (depth > 64) throw new TypeError('JSON nesting exceeds 64');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object') throw new TypeError('Only finite JSON data can be encoded');
    if (active.has(item)) throw new TypeError('Cyclic JSON data');
    const prototype = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError('Only plain JSON objects and arrays are supported');
    if (Object.getOwnPropertySymbols(item).length) throw new TypeError('Symbols are not JSON data');
    active.add(item);
    let result: string;
    if (Array.isArray(item)) {
      if (Object.getOwnPropertyNames(item).length !== item.length + 1) throw new TypeError('Extended arrays are not JSON data');
      const values: string[] = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Sparse arrays/accessors are not JSON data');
        values.push(encode(descriptor.value, depth + 1));
      }
      result = '[' + values.join(',') + ']';
    } else {
      const values: string[] = [];
      for (const key of Object.getOwnPropertyNames(item).sort()) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError('Unsafe JSON property');
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!descriptor.enumerable || !('value' in descriptor)) throw new TypeError('Accessors/non-enumerable properties are not JSON data');
        values.push(JSON.stringify(key) + ':' + encode(descriptor.value, depth + 1));
      }
      result = '{' + values.join(',') + '}';
    }
    active.delete(item);
    return result;
  }
  return encode(value, 0);
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export function digestJson(value: unknown): Promise<string> { return sha256(new TextEncoder().encode(canonicalJson(value))); }
