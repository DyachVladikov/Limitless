#!/usr/bin/env node
import { randomBytes, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

async function readPassword() {
  if (process.stdin.isTTY) {
    // readline keeps normal terminal editing, while its output (including typed
    // characters) is discarded. Prompts are written separately to stderr.
    const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = createInterface({ input: process.stdin, output: silent, terminal: true });
    const controller = new AbortController();
    input.on('SIGINT', () => controller.abort());
    try {
      process.stderr.write('Owner password (hidden, at least 12 characters): ');
      const password = await input.question('', { signal: controller.signal });
      process.stderr.write('\nConfirm password (hidden): ');
      const confirmation = await input.question('', { signal: controller.signal });
      process.stderr.write('\n');
      if (password !== confirmation) throw new Error('Passwords did not match.');
      return password;
    } finally {
      input.close();
      silent.end();
    }
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.byteLength;
    if (bytes > 1026) throw new Error('Password must be at most 1024 bytes.');
    chunks.push(chunk);
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  return raw.replace(/\r?\n$/, '');
}

try {
  if (process.argv.length !== 2) throw new Error('Pass no arguments. Enter the password at the hidden prompt or provide it through stdin.');
  const password = await readPassword();
  if ([...password].length < 12 || Buffer.byteLength(password, 'utf8') > 1024 || /[\r\n\0]/.test(password)) {
    throw new Error('Password must be one line, at least 12 characters, and at most 1024 bytes.');
  }
  const salt = randomBytes(32);
  const key = await new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
  });
  process.stdout.write(`scrypt:32768:8:1:${salt.toString('hex')}:${key.toString('hex')}\n`);
} catch (error) {
  // No input value, crypto exception, stack, or process argument is printed.
  const safeMessages = [
    'Passwords did not match.',
    'Password must be at most 1024 bytes.',
    'Password must be one line, at least 12 characters, and at most 1024 bytes.',
    'Pass no arguments. Enter the password at the hidden prompt or provide it through stdin.',
  ];
  process.stderr.write(`${safeMessages.includes(error?.message) ? error.message : 'Could not generate a password hash.'}\n`);
  process.exitCode = 1;
}
