#!/usr/bin/env node

/**
 * ShieldScan Plugin CLI（Phase 0）
 *
 * 用法：
 *   shieldscan-plugin validate <manifest.json>  驗證 PluginManifest
 *   shieldscan-plugin --version                 顯示版本
 *   shieldscan-plugin --help                    顯示說明
 *
 * 驗證失敗時以 exit code 1 結束，供 CI 使用。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePluginManifest } from '@shieldscan/core-schema';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`ShieldScan Plugin CLI v${VERSION}

用法:
  shieldscan-plugin validate <manifest.json>   驗證 PluginManifest（exit 0 = 通過）
  shieldscan-plugin --version                  顯示版本
  shieldscan-plugin --help                     顯示說明

範例:
  shieldscan-plugin validate plugins/detection/browser.canvas/manifest.json
`);
}

async function validateManifest(filePath: string): Promise<number> {
  const absolute = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch (err) {
    console.error(`[錯誤] 無法讀取檔案: ${absolute}`);
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    console.error(`[錯誤] 不是合法的 JSON: ${absolute}`);
    return 1;
  }

  const result = validatePluginManifest(manifest);
  if (!result.ok) {
    console.error(`[失敗] ${absolute}`);
    for (const error of result.errors) {
      console.error(`  - ${error.path}: ${error.message}`);
    }
    return 1;
  }

  const m = result.data;
  console.log(`[通過] ${m.id}@${m.version} (${m.type})`);
  console.log(`  platform: ${m.platforms.join(', ')}`);
  console.log(`  riskLevel: ${m.riskLevel} | defaultEnabled: ${m.defaultEnabled}`);
  console.log(`  capabilities: ${m.capabilities.length} 項`);
  console.log(`  requiredPermissions: ${m.requiredPermissions.length} 項`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, target] = argv;

  if (command === '--help' || command === '-h' || command === undefined) {
    printHelp();
    return 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return 0;
  }

  if (command === 'validate') {
    if (!target) {
      console.error('[錯誤] validate 需要指定 manifest.json 路徑');
      printHelp();
      return 1;
    }
    return validateManifest(target);
  }

  console.error(`[錯誤] 未知指令: ${command}`);
  printHelp();
  return 1;
}

process.exitCode = await main(process.argv.slice(2));
