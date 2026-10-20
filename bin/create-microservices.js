#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';

const SERVICE_TYPES = new Set(['backend', 'frontend', 'worker', 'mcp']);
const DEFAULT_SERVICES = [
  { name: 'api', type: 'backend' },
  { name: 'web', type: 'frontend' },
];

function usage() {
  console.log(`Create a TDK microservice project\n\nUsage:\n  npm init @tdk-landscape/microservices [directory] [options]\n\nOptions:\n  --service <name[:type]>  Add a service (repeatable; types: ${[...SERVICE_TYPES].join(', ')})\n  --stack <name>           TDK stack name (default: main)\n  --yes                    Use api:backend and web:frontend when no services are specified\n  -h, --help               Show this help\n\nExample:\n  npm init @tdk-landscape/microservices storefront -- --service catalog:backend --service web:frontend`);
}

function parseArgs(args) {
  const options = { services: [], yes: false, stack: 'main', directory: undefined };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') return { ...options, help: true };
    if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--stack') options.stack = args[++i];
    else if (arg.startsWith('--stack=')) options.stack = arg.slice('--stack='.length);
    else if (arg === '--service') options.services.push(args[++i]);
    else if (arg.startsWith('--service=')) options.services.push(arg.slice('--service='.length));
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!options.directory) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
    if ((arg === '--stack' || arg === '--service') && !args[i]) {
      throw new Error(`${arg} requires a value.`);
    }
  }
  return options;
}

function validateSlug(value, label) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value ?? '')) {
    throw new Error(`${label} must use lowercase letters, numbers, and single hyphens (for example, orders-api).`);
  }
  return value;
}

function parseService(value) {
  const [name, type = 'backend', ...extra] = String(value).split(':');
  if (extra.length) throw new Error(`Invalid service '${value}'. Use name or name:type.`);
  validateSlug(name, 'Service name');
  if (!SERVICE_TYPES.has(type)) {
    throw new Error(`Unknown service type '${type}'. Choose ${[...SERVICE_TYPES].join(', ')}.`);
  }
  return { name, type };
}

async function ask(question, fallback, validate = () => true) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await rl.question(`${question}${fallback ? ` (${fallback})` : ''}: `)).trim() || fallback;
      const error = validate(answer);
      if (error === true) return answer;
      console.log(error);
    }
  } finally {
    rl.close();
  }
}

async function chooseServices(options) {
  if (options.services.length) return options.services.map(parseService);
  if (options.yes) return DEFAULT_SERVICES;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Specify at least one --service name[:type], or use --yes for the default API and web services.');
  }

  const countText = await ask('How many services?', '2', (value) => {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 && count <= 20 || 'Enter a number from 1 to 20.';
  });
  const services = [];
  for (let i = 0; i < Number(countText); i += 1) {
    const name = await ask(`Service ${i + 1} name`, i === 0 ? 'api' : `service-${i + 1}`, (value) => {
      try { validateSlug(value, 'Service name'); return true; } catch (error) { return error.message; }
    });
    const type = await ask(`Type for ${name} (${[...SERVICE_TYPES].join('/')})`, 'backend', (value) =>
      SERVICE_TYPES.has(value) || `Choose one of: ${[...SERVICE_TYPES].join(', ')}.`,
    );
    services.push({ name, type });
  }
  return services;
}

function ensureTarget(directory) {
  const target = resolve(directory);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error('The target directory cannot be a symbolic link.');
    if (!lstatSync(target).isDirectory()) throw new Error('The target path exists and is not a directory.');
    if (readdirSync(target).length) throw new Error(`The target directory is not empty: ${target}`);
  }
  mkdirSync(target, { recursive: true });
  return target;
}

function runTdk(args, cwd) {
  const require = createRequire(import.meta.url);
  const tdkBin = require.resolve('@tdk-landscape/tdk-cli-core/cli/bin/tdk.js');
  const result = spawnSync(process.execPath, [tdkBin, ...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function alignProjectName(target) {
  const configPath = resolve(target, '.tdk', 'project.json');
  const project = JSON.parse(readFileSync(configPath, 'utf8'));
  const projectName = basename(target).replaceAll('-', '_');
  if (project.project?.name !== projectName) {
    project.project.name = projectName;
    writeFileSync(configPath, `${JSON.stringify(project, null, 2)}\n`);
    runTdk(['project', '--yes'], target);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.stack) throw new Error('--stack requires a value.');
  validateSlug(options.stack, 'Stack name');

  let directory = options.directory;
  if (!directory && !options.yes && stdin.isTTY) {
    directory = await ask('Project directory', 'my-microservices');
  }
  directory ??= 'my-microservices';
  const services = await chooseServices(options);
  const names = new Set();
  for (const service of services) {
    if (names.has(service.name)) throw new Error(`Duplicate service name: ${service.name}`);
    names.add(service.name);
  }

  const target = ensureTarget(directory);
  console.log(`\nCreating TDK project in ${target}`);
  runTdk(['project', '--yes'], target);
  alignProjectName(target);
  for (const service of services) {
    console.log(`\nScaffolding ${service.type}: ${service.name}`);
    runTdk(['resource', service.name, '--type', service.type, '--stack', options.stack, '--yes'], target);
  }

  console.log(`\nProject created. Next:\n  cd ${isAbsolute(directory) ? target : directory}\n  tdk up ${options.stack}`);
}

main().catch((error) => {
  console.error(`\ncreate-microservices: ${error.message}`);
  process.exitCode = 1;
});
