/**
 * 共享泄漏扫描模块。
 * 用于在文件入库或发布前检查文本中是否包含敏感凭据或本地绝对路径。
 */

// 规则名称常量
export const LEAK_RULES = {
  LOCAL_PATH: 'local-path',
  PRIVATE_KEY: 'private-key',
  SECRET_PATTERN: 'secret-pattern',
};

// 本地绝对路径特征正则
const LOCAL_PATH_REGEXES = [
  /\/Users\/[^/\r\n\t "']+\//,
  /\/home\/[^/\r\n\t "']+\//,
  /\/root\//,
  /[a-zA-Z]:[\\/]Users[\\/][^\\/\r\n\t "']+[\\/]/i,
];

// 私钥块正则
const PRIVATE_KEY_REGEX = /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/;

// 令牌正则（前缀及格式固定部分）
const SECRET_REGEXES = [
  /(?<![a-zA-Z0-9_-])gh[pousr]_[A-Za-z0-9]{36,}/,
  /(?<![a-zA-Z0-9_-])github_pat_[A-Za-z0-9_]{22,}/,
  /(?<![a-zA-Z0-9_-])AKIA[0-9A-Z]{16}/,
  /(?<![a-zA-Z0-9_-])xox[abprs]-[A-Za-z0-9-]{10,}/,
  /(?<![a-zA-Z0-9_-])AIza[0-9A-Za-z_-]{35}/,
  /(?<![a-zA-Z0-9_-])Bearer [A-Za-z0-9._~+/-]{20,}/,
  /(?<![a-zA-Z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

// sk 前缀候选正则（需进一步校验同时含大写字母与数字）
const SK_CANDIDATE_REGEX =
  /(?<![a-zA-Z0-9_-])(?:sk-|sk-ant-|sk-proj-)([A-Za-z0-9_-]{32,})/g;

/**
 * 校验是否命中 sk 形式的 secret pattern。
 * 要求后续串中必须同时包含至少一个数字和一个大写字母。
 * @param {string} content
 * @returns {boolean}
 */
function matchSkSecret(content) {
  SK_CANDIDATE_REGEX.lastIndex = 0;
  let match;
  while ((match = SK_CANDIDATE_REGEX.exec(content)) !== null) {
    const suffix = match[1];
    const hasDigit = /\d/.test(suffix);
    const hasUpper = /[A-Z]/.test(suffix);
    if (hasDigit && hasUpper) {
      return true;
    }
  }
  return false;
}

/**
 * 对给定文本执行泄漏规则扫描。
 * 命中时仅返回规则名称，绝不回显原文。
 * @param {string} content - 待扫描文本
 * @returns {string[]} 命中的规则名列表（已去重）
 */
export function scanLeaks(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return [];
  }

  const matched = new Set();

  for (const regex of LOCAL_PATH_REGEXES) {
    if (regex.test(content)) {
      matched.add(LEAK_RULES.LOCAL_PATH);
      break;
    }
  }

  if (PRIVATE_KEY_REGEX.test(content)) {
    matched.add(LEAK_RULES.PRIVATE_KEY);
  }

  if (matchSkSecret(content)) {
    matched.add(LEAK_RULES.SECRET_PATTERN);
  } else {
    for (const regex of SECRET_REGEXES) {
      if (regex.test(content)) {
        matched.add(LEAK_RULES.SECRET_PATTERN);
        break;
      }
    }
  }

  return Array.from(matched);
}
