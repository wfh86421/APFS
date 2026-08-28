import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanPorts } from '@shieldscan/port-scanner';

test('掃描本機未開放端口（127.0.0.1:65530）應為 closed', async () => {
  const results = await scanPorts('127.0.0.1', [65530], { timeoutMs: 500 });
  assert.equal(results.length, 1);
  const first = results[0];
  assert.ok(first);
  assert.equal(first.open, false);
});

test('多端口掃描結果依 port 排序', async () => {
  const results = await scanPorts('127.0.0.1', [3389, 22, 65530], { timeoutMs: 400 });
  assert.deepEqual(
    results.map((r) => r.port),
    [22, 3389, 65530],
  );
});
