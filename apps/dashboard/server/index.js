#!/usr/bin/env node
// DaanaRX Build Dashboard — zero-dependency Node http server.
// Aggregates per-agent JSON status files from ~/.daana-status/ and serves them
// to the static UI in apps/dashboard/public.

import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STATUS_DIR = path.join(os.homedir(), '.daana-status');
const EVENTS_LOG = path.join(STATUS_DIR, 'events.log');
const PORT = Number(process.env.DASHBOARD_PORT || 8080);

const REPOS = [
  { name: 'DaanarRX', path: '/Users/rithik/Code/DaanarRX', lane: 'frontend' },
  { name: 'DaanaRx-Backend', path: '/Users/rithik/Code/DaanaRx-Backend', lane: 'backend' },
  { name: 'daana-inventory', path: '/Users/rithik/Code/daana-inventory', lane: 'platform' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const STATUS_ALIASES = {
  started: 'in_progress',
  starting: 'in_progress',
  running: 'in_progress',
  active: 'in_progress',
  working: 'in_progress',
  complete: 'done',
  completed: 'done',
  finished: 'done',
  ready: 'pending',
  queued: 'pending',
};

function normalize(raw) {
  // accept loose schemas from agents that haven't read the protocol yet
  const id = raw.agent_id || raw.agent || raw.id || 'unknown';
  const status = STATUS_ALIASES[raw.status] || raw.status || 'pending';
  return {
    agent_id: id,
    agent_type: raw.agent_type || raw.type || 'feature',
    lane: raw.lane || 'meta',
    repo: raw.repo || null,
    branch: raw.branch || null,
    worktree: raw.worktree || null,
    status,
    current_task: raw.current_task || raw.task || '—',
    progress_pct: raw.progress_pct ?? raw.progress ?? 0,
    started_at: raw.started_at || null,
    last_update: raw.last_update || raw.ts || raw.timestamp || null,
    blockers: raw.blockers || [],
    completed_subtasks: raw.completed_subtasks || [],
    pending_subtasks: raw.pending_subtasks || [],
    pr_url: raw.pr_url || null,
    commit_count: raw.commit_count || 0,
  };
}

async function readAgentStatuses() {
  if (!existsSync(STATUS_DIR)) return [];
  const files = await fs.readdir(STATUS_DIR);
  const agents = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(STATUS_DIR, file), 'utf-8');
      agents.push(normalize(JSON.parse(raw)));
    } catch {
      // skip malformed files
    }
  }
  return agents.sort((a, b) => (a.agent_id || '').localeCompare(b.agent_id || ''));
}

async function readEvents(limit = 50) {
  if (!existsSync(EVENTS_LOG)) return [];
  const raw = await fs.readFile(EVENTS_LOG, 'utf-8');
  const lines = raw.trim().split('\n').filter(Boolean);
  const events = [];
  for (const line of lines.slice(-limit).reverse()) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return events;
}

function gitInfo(repoPath) {
  if (!existsSync(path.join(repoPath, '.git'))) return null;
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath }).toString().trim();
    const lastCommit = execSync('git log -1 --format=%s%n%h%n%ar', { cwd: repoPath }).toString().trim().split('\n');
    const dirty = execSync('git status --porcelain', { cwd: repoPath }).toString().trim().length > 0;
    const branchCount = Number(execSync('git branch | wc -l', { cwd: repoPath }).toString().trim());
    return {
      branch,
      last_commit_subject: lastCommit[0] || '',
      last_commit_sha: lastCommit[1] || '',
      last_commit_age: lastCommit[2] || '',
      dirty,
      branch_count: branchCount,
    };
  } catch {
    return null;
  }
}

function getRepoStates() {
  return REPOS.map((r) => ({ ...r, git: gitInfo(r.path), exists: existsSync(r.path) }));
}

const BASE_BRANCHES = {
  DaanarRX: 'feature/platform-integration',
  'DaanaRx-Backend': 'feature/platform-integration',
  'daana-inventory': 'main',
};

function getFeatureBranches() {
  const out = [];
  for (const r of REPOS) {
    if (!existsSync(path.join(r.path, '.git'))) continue;
    try {
      const branches = execSync('git for-each-ref --format="%(refname:short)" refs/heads/', { cwd: r.path })
        .toString()
        .trim()
        .split('\n')
        .filter((b) => b.startsWith('feature/'));
      const base = BASE_BRANCHES[r.name];
      for (const b of branches) {
        let commitCount = 0;
        let lastSubject = '';
        let lastSha = '';
        let lastAge = '';
        try {
          if (b !== base) {
            commitCount = Number(execSync(`git rev-list --count ${base}..${b}`, { cwd: r.path }).toString().trim()) || 0;
          }
          const log = execSync(`git log -1 --format=%s%n%h%n%ar ${b}`, { cwd: r.path }).toString().trim().split('\n');
          lastSubject = log[0] || '';
          lastSha = log[1] || '';
          lastAge = log[2] || '';
        } catch {
          /* ignore */
        }
        out.push({
          repo: r.name,
          lane: r.lane,
          branch: b,
          base,
          commits_ahead: commitCount,
          last_subject: lastSubject,
          last_sha: lastSha,
          last_age: lastAge,
          is_base: b === base,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => a.repo.localeCompare(b.repo) || a.branch.localeCompare(b.branch));
}

const MVP_MODULES = [
  { name: 'Home', branch: 'feature/home-search', repo: 'DaanarRX' },
  { name: 'Check In', branch: 'feature/checkin-rebuild', repo: 'DaanarRX' },
  { name: 'Check Out', branch: 'feature/fe-checkout-cart', repo: 'DaanarRX' },
  { name: 'Inventory', branch: 'feature/fe-inventory-table', repo: 'DaanarRX' },
  { name: 'Cart', branch: 'feature/fe-checkout-cart', repo: 'DaanarRX' },
  { name: 'Reports', branch: 'feature/fe-reports-dashboard', repo: 'DaanarRX' },
  { name: 'Settings', branch: 'feature/fe-settings', repo: 'DaanarRX' },
  { name: 'Account', branch: 'feature/fe-auth-polish', repo: 'DaanarRX' },
];

function getMvpModuleStatus(branches) {
  const byKey = new Map(branches.map((b) => [`${b.repo}:${b.branch}`, b]));
  return MVP_MODULES.map((m) => {
    const b = byKey.get(`${m.repo}:${m.branch}`);
    return {
      ...m,
      ready: !!b && b.commits_ahead > 0,
      commits: b?.commits_ahead || 0,
    };
  });
}

const DOCS = [
  {
    label: 'Architecture Decision Record',
    href: '/docs/architecture',
    path: '/Users/rithik/Code/daana-inventory/docs/architecture.md',
    description: 'Core platform schema, state machine, FEFO, code generator contracts',
  },
  {
    label: 'Merge Strategy',
    href: '/docs/merge-strategy',
    path: '/Users/rithik/Code/daana-inventory/docs/merge-strategy.md',
    description: 'Recommended branch merge order + conflict matrix + cross-repo contract drift',
  },
  {
    label: 'Deployment Plan',
    href: '/docs/deployment-plan',
    path: '/Users/rithik/Code/daana-inventory/docs/deployment-plan.md',
    description: 'Render workspace survey, drift report, deploy sequence, rollback matrix',
  },
  {
    label: 'Status Protocol',
    href: '/docs/status-protocol',
    path: '/Users/rithik/Code/daana-inventory/docs/status-protocol.md',
    description: 'Agent status JSON schema',
  },
];

const BLOCKERS = [
  {
    severity: 'high',
    title: 'Apply SQL migration 002',
    detail:
      'migrations/002_core_inventory_platform.sql on feature/architecture-foundation is drafted but unapplied. All 3 BE feature branches assume it.',
    action: 'Approve mcp__supabase__apply_migration on next prompt',
  },
  {
    severity: 'medium',
    title: 'inventory-core distribution for Render',
    detail:
      'Service package.json files use file:../../../daana-inventory/... — that path will not exist on Render builds.',
    action: 'Decide: publish to GitHub Packages, vendor, or git submodule. See deployment-plan.md §4.',
  },
  {
    severity: 'medium',
    title: 'autoDeploy: true on all Render services',
    detail: 'Merging into main will cascade-redeploy all 5 services simultaneously against schema that may not be live.',
    action: 'Flip autoDeploy: false in render.yaml before first merge.',
  },
  {
    severity: 'low',
    title: 'Cross-repo contract drift',
    detail:
      '/api/carts/current/items, /api/locations, /api/carts?status=pending_approval, /api/items/next-code referenced by FE but not in BE branches.',
    action: 'Add these endpoints in follow-up backend agents OR change FE callers. See merge-strategy.md.',
  },
];

function rollup(agents) {
  const counts = { total: agents.length, in_progress: 0, done: 0, blocked: 0, qa: 0, pending: 0 };
  let progressSum = 0;
  for (const a of agents) {
    counts[a.status] = (counts[a.status] || 0) + 1;
    progressSum += Number(a.progress_pct || 0);
  }
  const overall_progress = agents.length === 0 ? 0 : Math.round(progressSum / agents.length);
  return { counts, overall_progress };
}

async function handleApi(url, res) {
  if (url === '/api/status') {
    const agents = await readAgentStatuses();
    const events = await readEvents();
    const repos = getRepoStates();
    const summary = rollup(agents);
    const branches = getFeatureBranches();
    const modules = getMvpModuleStatus(branches);
    const docs = DOCS.map((d) => ({ ...d, exists: existsSync(d.path) }));
    const payload = {
      generated_at: new Date().toISOString(),
      summary,
      agents,
      events,
      repos,
      branches,
      modules,
      docs,
      blockers: BLOCKERS,
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
    return true;
  }
  if (url.startsWith('/docs/')) {
    const slug = url.slice('/docs/'.length);
    const doc = DOCS.find((d) => d.href === '/docs/' + slug);
    if (!doc) {
      res.writeHead(404);
      res.end('Not found');
      return true;
    }
    try {
      const content = await fs.readFile(doc.path, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Document not found on disk');
    }
    return true;
  }
  return false;
}

async function serveStatic(reqPath, res) {
  let file = reqPath === '/' ? '/index.html' : reqPath;
  if (file.includes('..')) {
    res.writeHead(403);
    res.end();
    return;
  }
  const full = path.join(PUBLIC_DIR, file);
  try {
    const data = await fs.readFile(full);
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(url.pathname, res);
      if (!handled) {
        res.writeHead(404);
        res.end('Not Found');
      }
      return;
    }
    await serveStatic(url.pathname, res);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Internal Error');
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log(`Status dir: ${STATUS_DIR}`);
});
