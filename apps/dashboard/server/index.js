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
    const payload = {
      generated_at: new Date().toISOString(),
      summary,
      agents,
      events,
      repos,
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
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
