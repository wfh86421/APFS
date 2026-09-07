import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADMIN_PAGE_KEYS,
  ADMIN_PAGES,
  BLOCK_REGISTRY,
  defaultSettingsFor,
  listAllBlocks,
  listPageBlocks,
  validateBlockSettings,
} from '@shieldscan/core-schema';

test('M1 總量：7 頁 / 22 區塊，區塊 key 全域唯一', () => {
  assert.equal(ADMIN_PAGE_KEYS.length, 7);
  assert.equal(listAllBlocks().length, 22);

  const keys = listAllBlocks().map((b) => b.key);
  assert.equal(new Set(keys).size, keys.length, 'block key 不得重複');

  for (const b of listAllBlocks()) {
    assert.ok(b.key.startsWith(`${b.page}.`), `${b.key} 應以頁面前綴開頭`);
    assert.ok(ADMIN_PAGES[b.page], `${b.key} 的頁面 ${b.page} 存在`);
  }
});

test('每個頁面至少有 1 個區塊；排序由 defaultPosition 決定', () => {
  for (const page of ADMIN_PAGE_KEYS) {
    const defs = listPageBlocks(page);
    assert.ok(defs.length >= 1, `${page} 應有區塊`);
    const positions = defs.map((d) => d.defaultPosition);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${page} 依位置排序`);
  }
});

test('預設停用僅 1 塊（devices.table.list），其餘預設啟用', () => {
  const disabled = listAllBlocks().filter((b) => !b.defaultEnabled);
  assert.equal(disabled.length, 1);
  assert.equal(disabled[0]?.key, 'devices.table.list');
  assert.equal(BLOCK_REGISTRY['devices.table.list']?.defaultEnabled, false);
});

test('governance 頁區塊為 restricted，其餘頁為 normal', () => {
  for (const b of listPageBlocks('governance')) {
    assert.equal(b.accessLevel, 'restricted');
  }
  for (const b of listPageBlocks('workbench')) {
    // 工作台治理卡 restricted；其餘分類卡 normal
    if (b.key === 'workbench.governance') assert.equal(b.accessLevel, 'restricted');
    else assert.equal(b.accessLevel, 'normal');
  }
  for (const page of ADMIN_PAGE_KEYS.filter((p) => p !== 'governance' && p !== 'workbench')) {
    for (const b of listPageBlocks(page)) {
      assert.equal(b.accessLevel, 'normal');
    }
  }
});

test('空輸入 → 回傳全部預設值（與 defaultSettingsFor 一致）', () => {
  for (const def of listAllBlocks()) {
    const r = validateBlockSettings(def.key, {});
    assert.ok(r.ok, `${def.key} 空輸入應通過`);
    if (r.ok) {
      assert.deepEqual(r.data, defaultSettingsFor(def), `${def.key} 預設值一致`);
    }
  }
});

test('未知鍵被 strict 拒絕（安全：不允許任意設定欄位）', () => {
  for (const def of listAllBlocks()) {
    const defaults = defaultSettingsFor(def);
    const r = validateBlockSettings(def.key, { ...defaults, hackerField: 'x' });
    assert.equal(r.ok, false, `${def.key} 未知鍵應被拒`);
    if (!r.ok) {
      assert.ok(
        r.issues.some((i) => i.field === 'hackerField' || i.message.includes('hackerField')),
        'issue 應指出該未知鍵',
      );
    }
  }
});

test('型別/邊界驗證：number、text 長度、select、multiselect、color、toggle', () => {
  let r = validateBlockSettings('overview.trend.week', { days: 999 });
  assert.equal(r.ok, false);
  r = validateBlockSettings('overview.trend.week', { days: 7.5 });
  assert.equal(r.ok, false);
  r = validateBlockSettings('overview.kpi.summary', { title: 'x'.repeat(41) });
  assert.equal(r.ok, false);
  r = validateBlockSettings('overview.trend.week', { metric: '其他' });
  assert.equal(r.ok, false);
  r = validateBlockSettings('events.filter.chips', { defaultSeverity: ['high', 'urgent'] });
  assert.equal(r.ok, false);
  r = validateBlockSettings('homepage.hero', { accentColor: '#xyz' });
  assert.equal(r.ok, false);
  r = validateBlockSettings('homepage.sections', { showConsent: 'yes' });
  assert.equal(r.ok, false);
  r = validateBlockSettings('overview.recent.incidents', { limit: 20, minSeverity: 'critical' });
  assert.ok(r.ok);
});

test('未知區塊 key 被拒', () => {
  const r = validateBlockSettings('nope.block', {});
  assert.equal(r.ok, false);
  assert.equal(r.ok ? '' : r.issues[0]?.field, '$block');
});

test('部分輸入：缺欄位以預設補、給定欄位保留', () => {
  const r = validateBlockSettings('reports.table.list', { pageSize: 30 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.data.pageSize, 30);
    assert.equal(r.data.title, '報告');
    assert.deepEqual(r.data.columns, ['時間', '風險', '分數', 'IP', '來源']);
  }
});
