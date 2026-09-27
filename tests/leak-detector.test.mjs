import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAK_RULES, scanLeaks } from '../scripts/lib/leak-detector.mjs';

test('规则 1: local-path 正例与反例', () => {
  // 正例
  const positiveCases = [
    '/Users/luojin/projects/code',
    '/home/ubuntu/repo/',
    'Log at /root/secret.conf',
    'C:\\Users\\Administrator\\Desktop',
    'c:/users/runner/work',
    'D:\\Users\\Test\\file.txt',
  ];

  for (const text of positiveCases) {
    const hits = scanLeaks(text);
    assert.ok(
      hits.includes(LEAK_RULES.LOCAL_PATH),
      `预期命中 local-path，实际未命中: ${text}`
    );
  }

  // 反例
  const negativeCases = [
    'https://example.com/Users/doc',
    'Relative path: src/Users/test.js',
    '/Users//invalid',
    '/home//invalid',
    'desk-lamp-base-gradient-highlight-01',
    'normal clean string without path',
  ];

  for (const text of negativeCases) {
    const hits = scanLeaks(text);
    assert.ok(
      !hits.includes(LEAK_RULES.LOCAL_PATH),
      `预期不命中 local-path，实际误报: ${text}`
    );
  }
});

test('规则 2: private-key 正例与反例', () => {
  // 正例
  const positiveCases = [
    '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    '-----BEGIN EC PRIVATE KEY-----',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    '-----BEGIN PRIVATE KEY-----',
  ];

  for (const text of positiveCases) {
    const hits = scanLeaks(text);
    assert.ok(
      hits.includes(LEAK_RULES.PRIVATE_KEY),
      `预期命中 private-key，实际未命中: ${text}`
    );
  }

  // 反例
  const negativeCases = [
    '-----BEGIN CERTIFICATE-----',
    '-----BEGIN PUBLIC KEY-----',
    'This is a private key description text',
    'desk-lamp-base-gradient-highlight-01',
  ];

  for (const text of negativeCases) {
    const hits = scanLeaks(text);
    assert.ok(
      !hits.includes(LEAK_RULES.PRIVATE_KEY),
      `预期不命中 private-key，实际误报: ${text}`
    );
  }
});

test('规则 3: secret-pattern 正例与反例 (含 desk-lamp-base-gradient-highlight-01)', () => {
  // 正例
  const positiveCases = [
    // sk- / sk-ant- / sk-proj-
    'sk-1234567890abcdef1234567890ABCDEF1234',
    'sk-ant-1234567890abcdef1234567890ABCDEF',
    'sk-proj-1234567890abcdef1234567890ABCDEF',
    // GitHub tokens
    'ghp_1234567890abcdef1234567890abcdef1234',
    'gho_1234567890abcdef1234567890abcdef1234',
    'ghu_1234567890abcdef1234567890abcdef1234',
    'ghs_1234567890abcdef1234567890abcdef1234',
    'ghr_1234567890abcdef1234567890abcdef1234',
    'github_pat_1234567890abcdef123456',
    // AWS
    'AKIA1234567890ABCDEF',
    // Slack
    'xoxb-1234567890',
    'xoxa-123456789012345',
    'xoxp-1234567890',
    // Google API key
    'AIza12345678901234567890123456789012345',
    // Bearer
    'Bearer 12345678901234567890',
    // JWT
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  ];

  for (const text of positiveCases) {
    const hits = scanLeaks(text);
    assert.ok(
      hits.includes(LEAK_RULES.SECRET_PATTERN),
      `预期命中 secret-pattern，实际未命中: ${text}`
    );
  }

  // 反例 (必须包含 desk-lamp-base-gradient-highlight-01)
  const negativeCases = [
    'desk-lamp-base-gradient-highlight-01',
    'mask-image-radial-gradient-linear-01',
    'sk-onlylowercaselettersandhyphenletters-without-digits-or-caps',
    'sk-123456789012345678901234567890123456', // 全数字无大写字母
    'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ', // 全大写无数字
    'sk-short',
    'prefix_ghp_1234567890abcdef1234567890abcdef1234', // 前界排除
    'token-AKIA1234567890ABCDEF', // 前界排除
    'Bearer short', // 长度不足 20
    'eyJshort.eyJshort.eyJshort', // 每段少于 10
  ];

  for (const text of negativeCases) {
    const hits = scanLeaks(text);
    assert.ok(
      !hits.includes(LEAK_RULES.SECRET_PATTERN),
      `预期不命中 secret-pattern，实际误报: ${text}`
    );
  }
});

test('复合内容泄漏检测与去重', () => {
  const content = `
    Some log file:
    User home is /Users/admin/
    Another path /home/deploy/
    Private key: -----BEGIN RSA PRIVATE KEY-----
    And token: ghp_1234567890abcdef1234567890abcdef1234
  `;
  const hits = scanLeaks(content);
  assert.equal(hits.length, 3);
  assert.ok(hits.includes(LEAK_RULES.LOCAL_PATH));
  assert.ok(hits.includes(LEAK_RULES.PRIVATE_KEY));
  assert.ok(hits.includes(LEAK_RULES.SECRET_PATTERN));
});
