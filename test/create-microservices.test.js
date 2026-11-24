import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const cli = join(repoRoot, 'bin', 'create-microservices.js');
const temporaryDirectories = [];

function createTempDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'create-microservices-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runCli(args, env = process.env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

after(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('creates the default API and web services through the Flisk CLI', () => {
  const parent = createTempDirectory();
  const target = join(parent, 'default-stack');
  const result = runCli([target, '--yes']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Project created\./);

  const project = readJson(join(target, '.flisk', 'project.json'));
  assert.equal(project.project.name, 'default_stack');

  for (const [name, type] of [['api', 'backend'], ['web', 'frontend']]) {
    const serviceDirectory = join(target, 'services', 'main', name);
    const service = readJson(join(serviceDirectory, 'service.json'));
    assert.equal(service.name, name);
    assert.equal(service.type, type);
    assert.equal(service.stack, 'main');
    assert.ok(existsSync(join(serviceDirectory, 'Dockerfile')));
  }

  assert.match(readFileSync(join(target, '.flisk', '.flisk-out', 'Tiltfile'), 'utf8'), /load\(/);
});

const relativeOverrides = [['script', './node_modules/@flisk-sh/flisk/cli/bin/flisk.js']];
if (process.platform !== 'win32') relativeOverrides.push(['executable', './node_modules/.bin/flisk']);

for (const [kind, path] of relativeOverrides) {
  test(`resolves a relative Flisk CLI ${kind} override from the caller directory`, () => {
    const target = join(createTempDirectory(), 'relative-override');
    const result = runCli([target, '--service', 'api:backend'], { ...process.env, FLISK_CLI_PATH: path });

    assert.equal(result.status, 0, `${path}: ${result.stderr || result.stdout}`);
    const service = readJson(join(target, 'services', 'main', 'api', 'service.json'));
    assert.equal(service.name, 'api');
  });
}

test('passes custom stack and all supported service types to the Flisk CLI', () => {
  const parent = createTempDirectory();
  const target = join(parent, 'commerce');
  const result = runCli([
    target,
    '--stack', 'commerce',
    '--service', 'catalog:backend',
    '--service', 'storefront:frontend',
    '--service', 'emails:worker',
    '--service', 'assistant-tools:mcp',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  for (const [name, type] of [
    ['catalog', 'backend'],
    ['storefront', 'frontend'],
    ['emails', 'worker'],
    ['assistant-tools', 'mcp'],
  ]) {
    const serviceDirectory = join(target, 'services', 'commerce', name);
    const service = readJson(join(serviceDirectory, 'service.json'));
    assert.equal(service.name, name);
    assert.equal(service.type, type);
    assert.equal(service.stack, 'commerce');
    assert.ok(readFileSync(join(serviceDirectory, 'Dockerfile'), 'utf8').length > 0);
  }
});

test('refuses to scaffold into a non-empty directory without changing its files', () => {
  const parent = createTempDirectory();
  const target = join(parent, 'existing');
  const sentinel = join(target, 'keep.txt');
  mkdirSync(target);
  writeFileSync(sentinel, 'preserve this file\n');

  const result = runCli([target, '--yes']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /target directory is not empty/i);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve this file\n');
});

test('prints a runnable cd command for a target path with spaces and an apostrophe', {
  skip: process.platform === 'win32',
}, () => {
  const target = join(createTempDirectory(), "merchant's workspace", 'shop');
  const result = runCli([target, '--service', 'api:backend']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const lines = result.stdout.split('\n');
  const nextSteps = lines.indexOf('Project created. Next:');
  assert.notEqual(nextSteps, -1, result.stdout);
  const cd = lines[nextSteps + 1];
  assert.match(cd, /^  cd /);
  const next = spawnSync('/bin/sh', ['-c', `${cd} && pwd`], { encoding: 'utf8' });
  assert.equal(next.status, 0, next.stderr);
  assert.equal(next.stdout.trim(), target);
});
