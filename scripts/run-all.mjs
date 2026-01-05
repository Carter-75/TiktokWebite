#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED ?? '1';

const root = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const vercelCmd = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
const npmExecPath = process.env.npm_execpath;
const npmRunnerCommand = npmExecPath ? process.execPath : npmCmd;
const npmRunnerArgs = (args) => (npmExecPath ? [npmExecPath, ...args] : args);
const host = process.env.DEV_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.DEV_PORT ?? '3000', 10);
const protocol = process.env.DEV_PROTOCOL ?? 'http';
const baseUrl = process.env.DEV_URL ?? `${protocol}://${host}:${port}`;
const timeoutMs = Number.parseInt(process.env.DEV_PING_TIMEOUT ?? '60000', 10);
const cliArgs = process.argv.slice(2);
let npmOriginalArgs = [];
try {
  const parsed = JSON.parse(process.env.npm_config_argv ?? '{}');
  if (Array.isArray(parsed?.original)) {
    npmOriginalArgs = parsed.original;
  }
} catch {
  npmOriginalArgs = [];
}
const npmLifecycleEvent = process.env.npm_lifecycle_event;
const allowedModes = new Set(['launch', 'diagnostics', 'dev-only']);

const shouldPurgeNodeModules = process.env.RUN_ALL_PURGE_NODE_MODULES === 'true' || cliArgs.includes('--purge-modules');
const cleanTargets = ['.next', '.turbo', 'coverage', 'dist', 'test-results', 'playwright-report'];
if (shouldPurgeNodeModules) {
  cleanTargets.push('node_modules');
}

const log = (message) => {
  console.log(`[launch] ${message}`);
};

const resolveMode = () => {
  if (process.env.RUN_ALL_MODE) {
    return process.env.RUN_ALL_MODE;
  }
  if (npmLifecycleEvent === 'diagnostics') {
    return 'diagnostics';
  }
  if (npmLifecycleEvent === 'dev-only') {
    return 'dev-only';
  }
  const argPool = [...cliArgs, ...npmOriginalArgs];
  if (argPool.includes('--diagnostics')) {
    return 'diagnostics';
  }
  if (argPool.includes('--dev-only')) {
    return 'dev-only';
  }
  const explicit = cliArgs.find((arg) => arg.startsWith('--mode='));
  if (explicit) {
    return explicit.split('=')[1];
  }
  return 'launch';
};

const mode = resolveMode();
if (!allowedModes.has(mode)) {
  console.error(`Unsupported mode "${mode}". Valid modes: ${[...allowedModes].join(', ')}`);
  process.exit(1);
}

const ensureWorkspace = () => {
  if (!existsSync(path.join(root, 'package.json'))) {
    throw new Error('run-all must be executed from the project root.');
  }
};

const runCommand = (command, args, extraEnv = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
      shell: false,
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });

const runNpmSync = (args, options = {}) => spawnSync(npmRunnerCommand, npmRunnerArgs(args), options);
const runNpm = (args, extraEnv = {}) => runCommand(npmRunnerCommand, npmRunnerArgs(args), extraEnv);
const runNpx = (args, extraEnv = {}) =>
  npmExecPath
    ? runCommand(process.execPath, [npmExecPath, 'exec', ...args], extraEnv)
    : runCommand(npxCmd, args, extraEnv);

const logEnvironment = () => {
  const npmVersion = runNpmSync(['--version'], { encoding: 'utf8' }).stdout?.trim() ?? 'unknown';
  log(`Mode: ${mode}`);
  log('Workspace diagnostics');
  log(`  • Workspace: ${root}`);
  log(`  • OS: ${os.type()} ${os.release()} (${os.arch()})`);
  log(`  • CPU: ${os.cpus()[0]?.model ?? 'unknown'} × ${os.cpus().length}`);
  log(`  • Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB total`);
  log(`  • Node: ${process.version}`);
  log(`  • npm: ${npmVersion}`);
  log(`  • Purge node_modules: ${shouldPurgeNodeModules ? 'yes' : 'no (use --purge-modules to enable)'}`);
  const requiredEnv = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
    'AI_PROVIDER_URL',
    'AI_PROVIDER_KEY',
    'AI_PROVIDER_MODEL',
    'ADS_ENDPOINT',
  ];
  log('Environment status:');
  requiredEnv.forEach((key) => {
    const status = process.env[key] ? 'set' : 'missing';
    log(`    - ${key}: ${status}`);
  });
};

const step = async (label, action) => {
  log(`\n=== ${label} ===`);
  const start = Date.now();
  await action();
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  log(`${label} complete in ${duration}s`);
};

const cleanPaths = async (targets) => {
  await Promise.all(
    targets.map(async (target) => {
      const fullPath = path.join(root, target);
      if (!existsSync(fullPath)) {
        return;
      }
      await rm(fullPath, { recursive: true, force: true });
      log(`Removed ${target}`);
    })
  );
};

const hasVercelCli = () => {
  try {
    const result = spawnSync(vercelCmd, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
};

const waitForServer = async () => {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(baseUrl, { method: 'HEAD' });
      if (response.ok || response.status === 200 || response.status === 405) {
        return true;
      }
    } catch (error) {
      if (attempts % 5 === 0) {
        log(`Still waiting for dev server (${error.message})`);
      }
    }
    await delay(1000);
  }
  throw new Error(`Dev server did not respond at ${baseUrl} within ${timeoutMs / 1000}s`);
};

const openBrowser = () => {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  try {
    if (process.platform === 'darwin') {
      spawn('open', [normalized], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', normalized], { stdio: 'ignore', detached: true }).unref();
    } else {
      spawn('xdg-open', [normalized], { stdio: 'ignore', detached: true }).unref();
    }
    log(`Browser launch requested for ${normalized}`);
  } catch (error) {
    log(`Unable to launch browser automatically (${error.message}). Please open ${normalized} manually.`);
  }
};

const startDevServer = () => {
  log(`Starting dev server on ${baseUrl}`);
  const child = spawn(
    npmRunnerCommand,
    npmRunnerArgs(['run', 'dev', '--', '--hostname', host, '--port', String(port)]),
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        LOG_LEVEL: process.env.LOG_LEVEL ?? 'debug',
        NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG ?? 'verbose',
      },
    }
  );

  const shutdown = (signal) => {
    log(`Received ${signal}. Forwarding to dev server...`);
    child.kill(signal);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  child.on('exit', (code, signal) => {
    if (signal) {
      log(`Dev server exited via signal ${signal}`);
    }
    process.exit(code ?? 0);
  });

  waitForServer()
    .then(() => {
      log('Dev server responded. Launching browser...');
      openBrowser();
    })
    .catch((error) => {
      log(error.message);
    });
};

const runDiagnosticsPipeline = async () => {
  await step('Reset workspace', async () => {
    await cleanPaths(cleanTargets);
  });

  await step('Install dependencies', async () => {
    const hasLockfile = existsSync(path.join(root, 'package-lock.json'));
    const installer = hasLockfile ? 'ci' : 'install';
    await runNpm([installer]);
  });

  await step('Install Playwright browsers', async () => {
    const args = ['playwright', 'install'];
    if (process.platform === 'linux') {
      args.push('--with-deps');
    }
    await runNpx(args);
  });

  await step('Lint', async () => {
    await runNpm(['run', 'lint', '--', '--max-warnings=0']);
  });

  await step('Unit tests', async () => {
    await runNpm(['run', 'test', '--', '--reporter=verbose']);
  });

  await step('E2E tests', async () => {
    await runNpm(['run', 'test:e2e', '--', '--reporter=list']);
  });

  await step('Production build', async () => {
    await runNpm(['run', 'build']);
  });

  if (hasVercelCli()) {
    await step('Vercel build (serverless verification)', async () => {
      await runCommand(vercelCmd, ['build', '--prod']);
    });
  } else {
    log('\nVercel CLI not detected — skipping vercel build check.');
  }

  await step('Next.js diagnostics', async () => {
    await runNpx(['next', 'info'], { FORCE_COLOR: '1' });
  });
};

const ensureDevDependencies = async () => {
  if (existsSync(path.join(root, 'node_modules'))) {
    return;
  }
  log('node_modules missing — installing dependencies before starting dev server.');
  await step('Install dependencies', async () => {
    const hasLockfile = existsSync(path.join(root, 'package-lock.json'));
    const installer = hasLockfile ? 'ci' : 'install';
    await runNpm([installer]);
  });
};

const main = async () => {
  ensureWorkspace();
  logEnvironment();

  if (mode === 'launch' || mode === 'diagnostics') {
    await runDiagnosticsPipeline();
    if (mode === 'diagnostics') {
      log('\nDiagnostics completed. Dev server intentionally skipped (diagnostics mode).');
      return;
    }
  }

  if (mode === 'dev-only') {
    await ensureDevDependencies();
  }

  log('\nBooting the interactive environment...');
  startDevServer();
};

main().catch((error) => {
  console.error('\nLaunch script failed:', error.message);
  process.exitCode = 1;
});
