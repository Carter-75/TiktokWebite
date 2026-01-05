#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXT_TELEMETRY_DISABLED = '1';

const root = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const vercelCmd = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';

const step = async (label, action) => {
  console.log(`\n=== ${label} ===`);
  const start = Date.now();
  await action();
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`${label} complete in ${duration}s`);
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

const cleanPaths = async (paths) => {
  await Promise.all(
    paths.map(async (target) => {
      const fullPath = path.join(root, target);
      if (!existsSync(fullPath)) return;
      await rm(fullPath, { recursive: true, force: true });
      console.log(`Removed ${target}`);
    })
  );
};

const ensureWorkspace = () => {
  if (!existsSync(path.join(root, 'package.json'))) {
    throw new Error('full-diagnostics must be run from the project root.');
  }
};

const logEnvironment = () => {
  const npmVersion = spawnSync(npmCmd, ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? 'unknown';
  console.log('Workspace:', root);
  console.log('OS:', os.type(), os.release(), os.arch());
  console.log('CPU:', os.cpus()[0]?.model ?? 'unknown', '×', os.cpus().length);
  console.log('Memory:', `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB total`);
  console.log('Node:', process.version);
  console.log('npm:', npmVersion);
  const requiredEnv = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
    'AI_PROVIDER_URL',
    'AI_PROVIDER_KEY',
    'AI_PROVIDER_MODEL',
    'ADS_ENDPOINT',
  ];
  console.log('Environment status:');
  requiredEnv.forEach((key) => {
    const status = process.env[key] ? 'set' : 'missing';
    console.log(`  • ${key}: ${status}`);
  });
};

const hasVercelCli = () => {
  try {
    const result = spawnSync(vercelCmd, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
};

const main = async () => {
  ensureWorkspace();
  console.log('Product Pulse — full diagnostics');
  logEnvironment();

  await step('Reset workspace', async () => {
    await cleanPaths(['.next', '.turbo', 'coverage', 'dist', 'test-results', 'node_modules']);
  });

  await step('Install dependencies', async () => {
    await runCommand(npmCmd, ['ci']);
  });

  await step('Install Playwright browsers', async () => {
    const playwrightArgs = ['playwright', 'install'];
    if (process.platform === 'linux') {
      playwrightArgs.push('--with-deps');
    }
    await runCommand(npxCmd, playwrightArgs);
  });

  await step('Lint', async () => {
    await runCommand(npmCmd, ['run', 'lint', '--', '--max-warnings=0']);
  });

  await step('Unit tests', async () => {
    await runCommand(npmCmd, ['run', 'test', '--', '--runInBand', '--reporter=verbose']);
  });

  await step('E2E tests', async () => {
    await runCommand(npmCmd, ['run', 'test:e2e', '--', '--reporter=list']);
  });

  await step('Production build', async () => {
    await runCommand(npmCmd, ['run', 'build']);
  });

  if (hasVercelCli()) {
    await step('Vercel build (serverless verification)', async () => {
      await runCommand(vercelCmd, ['build', '--prod']);
    });
  } else {
    console.log('\nVercel CLI not detected — skipping vercel build check.');
  }

  await step('Next.js diagnostics', async () => {
    await runCommand(npxCmd, ['next', 'info'], { FORCE_COLOR: '1' });
  });

  console.log('\nDiagnostics completed successfully. Attach this log to bug reports for full context.');
};

main().catch((error) => {
  console.error('\nDiagnostics failed:', error.message);
  process.exitCode = 1;
});
