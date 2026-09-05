#!/usr/bin/env node
/**
 * 將 .github/issues-sync/plan.json 同步成 GitHub Milestones / Issues。
 * 以 title 為冪等鍵：已存在就不重複建立。
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plan = JSON.parse(await readFile(join(root, '.github/issues-sync/plan.json'), 'utf8'));
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) {
  console.error('需要 GITHUB_REPOSITORY 與 GITHUB_TOKEN');
  process.exit(1);
}

const api = `https://api.github.com/repos/${repo}`;
const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'shieldscan-issue-sync',
};

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} -> ${response.status}: ${text}`);
  }
  return response.json();
}

const existingMilestones = await getJson(`${api}/milestones?state=all&per_page=100`);
const milestoneNumbers = new Map();
for (const milestone of plan.milestones) {
  let match = existingMilestones.find((item) => item.title === milestone.title);
  if (!match) {
    match = await postJson(`${api}/milestones`, {
      title: milestone.title,
      description: milestone.description,
      due_on: `${milestone.dueOn}T16:00:00Z`,
    });
    console.log(`created milestone: ${milestone.title}`);
  } else {
    console.log(`exists milestone: ${milestone.title}`);
  }
  milestoneNumbers.set(milestone.title, match.number);
}

const existingIssues = await getJson(`${api}/issues?state=all&per_page=100`);
const existingTitles = new Set(existingIssues.map((issue) => issue.title));

for (const issue of plan.issues) {
  if (existingTitles.has(issue.title)) {
    console.log(`exists issue: ${issue.title}`);
    continue;
  }
  await postJson(`${api}/issues`, {
    title: issue.title,
    body: issue.body,
    milestone: milestoneNumbers.get(issue.milestone),
  });
  console.log(`created issue: ${issue.title}`);
}

console.log('sync complete');
