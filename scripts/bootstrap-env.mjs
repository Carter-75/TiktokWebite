#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const templatePath = path.join(root, '.env.template');
const envPath = path.join(root, '.env.local');

const ensureEnvFile = () => {
  if (fs.existsSync(envPath)) return false;
  if (!fs.existsSync(templatePath)) {
    throw new Error('Missing .env.template; cannot scaffold .env.local.');
  }
  fs.copyFileSync(templatePath, envPath);
  console.log('🆕 Created .env.local from .env.template');
  return true;
};

const parseEnv = (text) => {
  const lines = text.split(/\r?\n/);
  const map = new Map();
  lines.forEach((line, index) => {
    if (!line || line.trim().startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    map.set(key, { value, index });
  });
  return { lines, map };
};

const needsSecret = (value, minLength) => {
  if (!value) return true;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('<') && normalized.endsWith('>')) return true;
  if (normalized.includes('changeme') || normalized.startsWith('your-')) return true;
  return value.length < minLength;
};

const updateEnv = (key, minLength, byteLength, state, messages) => {
  const entry = state.map.get(key);
  const currentValue = entry?.value ?? '';
  if (!needsSecret(currentValue, minLength)) {
    messages.push(`✓ ${key} already set (length ${currentValue.length})`);
    return;
  }
  const generated = crypto.randomBytes(byteLength).toString('hex');
  if (entry) {
    state.lines[entry.index] = `${key}=${generated}`;
  } else {
    state.lines.push(`${key}=${generated}`);
  }
  messages.push(`🔐 Generated ${key}: ${generated}`);
};

try {
  ensureEnvFile();
  const raw = fs.readFileSync(envPath, 'utf8');
  const state = parseEnv(raw);
  const messages = [];
  updateEnv('SESSION_SECRET', 48, 32, state, messages);
  updateEnv('METRICS_READ_KEY', 32, 24, state, messages);
  const updated = state.lines.join('\n');
  fs.writeFileSync(envPath, `${updated.trim()}\n`);
  console.log('✅ Secrets synchronized in .env.local');
  messages.forEach((msg) => console.log(msg));
  console.log('\nCopy any newly generated secrets into your hosting provider (e.g., Vercel → Environment Variables).');
} catch (error) {
  console.error('❌ Failed to bootstrap secrets:', error.message);
  process.exitCode = 1;
}
