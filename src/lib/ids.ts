import { customAlphabet } from "nanoid";

const URL_SAFE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Eleven characters from 62 is ~65 bits: unguessable, and short in a link. */
export const newVideoId = customAlphabet(URL_SAFE, 11);

const general = customAlphabet(URL_SAFE, 16);

export function newId(prefix: string): string {
  return `${prefix}_${general()}`;
}

/** A random path component for stored files, so a replaced file gets a new URL. */
export const newObjectName = customAlphabet(URL_SAFE, 20);
