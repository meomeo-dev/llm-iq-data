/**
 * 数据仓契约的纯手写结构验证器（零依赖）。
 * 精确对应 schemas/ 中的 JSON Schema 规范。
 */

/**
 * 校验是否为合法 ISO 8601 日期时间字符串
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidIsoDateTime(value) {
  if (typeof value !== 'string') return false;
  const isoPattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  return isoPattern.test(value) && !isNaN(Date.parse(value));
}

/**
 * 校验对象是否含有未在允许列表中的额外字段
 * @param {Record<string, unknown>} obj
 * @param {string[]} allowedKeys
 * @returns {string[]} 未知键名列表
 */
export function getUnexpectedKeys(obj, allowedKeys) {
  const allowedSet = new Set(allowedKeys);
  return Object.keys(obj).filter((key) => !allowedSet.has(key));
}

/**
 * 校验 TokenUsage 对象结构
 * @param {unknown} usage
 * @param {string} prefix
 * @returns {string[]} 错误列表
 */
function validateUsage(usage, prefix) {
  const errors = [];
  if (usage === null) return errors;
  if (typeof usage !== 'object' || Array.isArray(usage)) {
    return [`${prefix}: usage 必须为 object 或 null`];
  }

  const allowedUsageKeys = [
    'tokens',
    'reasoningTokens',
    'serviceTier',
    'reportedCostUsd',
  ];
  const unexpected = getUnexpectedKeys(usage, allowedUsageKeys);
  if (unexpected.length > 0) {
    errors.push(`${prefix}.usage 含有不允许的多余字段: ${unexpected.join(', ')}`);
  }

  if (!usage.tokens || typeof usage.tokens !== 'object' || Array.isArray(usage.tokens)) {
    errors.push(`${prefix}.usage.tokens 必须为 object`);
    return errors;
  }

  const allowedTokens = [
    'input',
    'cache_read',
    'cache_write',
    'cache_write_5m',
    'cache_write_1h',
    'output',
  ];
  const unTokens = getUnexpectedKeys(usage.tokens, allowedTokens);
  if (unTokens.length > 0) {
    errors.push(`${prefix}.usage.tokens 含有多余字段: ${unTokens.join(', ')}`);
  }
  for (const f of allowedTokens) {
    const val = usage.tokens[f];
    if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
      errors.push(`${prefix}.usage.tokens.${f} 必须为非负整数`);
    }
  }

  if (usage.reasoningTokens !== undefined && usage.reasoningTokens !== null) {
    if (!Number.isInteger(usage.reasoningTokens) || usage.reasoningTokens < 0) {
      errors.push(`${prefix}.usage.reasoningTokens 必须为非负整数或 null`);
    }
  }
  if (usage.serviceTier !== undefined && usage.serviceTier !== null) {
    if (usage.serviceTier !== 'standard' && usage.serviceTier !== 'fast') {
      errors.push(`${prefix}.usage.serviceTier 必须为 standard、fast 或 null`);
    }
  }
  if (usage.reportedCostUsd !== undefined && usage.reportedCostUsd !== null) {
    if (typeof usage.reportedCostUsd !== 'number' || usage.reportedCostUsd < 0) {
      errors.push(`${prefix}.usage.reportedCostUsd 必须为非负数值或 null`);
    }
  }
  return errors;
}

/**
 * 校验 PublicAttempt 字段属性
 * @param {object} attempt
 * @param {string} prefix
 * @returns {string[]}
 */
function checkAttemptFields(attempt, prefix) {
  const errors = [];
  if (typeof attempt.targetId !== 'string') errors.push(`${prefix}.targetId 必须为 string`);
  if (typeof attempt.promptId !== 'string') errors.push(`${prefix}.promptId 必须为 string`);
  if (typeof attempt.cli !== 'string') errors.push(`${prefix}.cli 必须为 string`);
  if (typeof attempt.model !== 'string') errors.push(`${prefix}.model 必须为 string`);
  if (attempt.effort !== null && typeof attempt.effort !== 'string') {
    errors.push(`${prefix}.effort 必须为 string 或 null`);
  }
  if (attempt.appliedEffort !== null && typeof attempt.appliedEffort !== 'string') {
    errors.push(`${prefix}.appliedEffort 必须为 string 或 null`);
  }
  if (attempt.effortHonored !== null && typeof attempt.effortHonored !== 'boolean') {
    errors.push(`${prefix}.effortHonored 必须为 boolean 或 null`);
  }
  if (typeof attempt.label !== 'string') errors.push(`${prefix}.label 必须为 string`);
  if (!['ok', 'no-svg', 'error', 'timeout'].includes(attempt.status)) {
    errors.push(`${prefix}.status 必须为 ok|no-svg|error|timeout 之一`);
  }
  if (attempt.svgFile !== null && typeof attempt.svgFile !== 'string') {
    errors.push(`${prefix}.svgFile 必须为 string 或 null`);
  }
  if (attempt.rawFile !== null) errors.push(`${prefix}.rawFile 必须恒为 null`);
  if (!isValidIsoDateTime(attempt.startedAt)) errors.push(`${prefix}.startedAt 须为有效 ISO`);
  if (!isValidIsoDateTime(attempt.finishedAt)) errors.push(`${prefix}.finishedAt 须为有效 ISO`);
  if (!Number.isInteger(attempt.durationMs) || attempt.durationMs < 0) {
    errors.push(`${prefix}.durationMs 必须为非负整数`);
  }
  if (attempt.svgBytes !== null && (!Number.isInteger(attempt.svgBytes) || attempt.svgBytes < 0)) {
    errors.push(`${prefix}.svgBytes 必须为非负整数或 null`);
  }
  if (attempt.error !== null && typeof attempt.error !== 'string') {
    errors.push(`${prefix}.error 必须为 string 或 null`);
  }
  return errors;
}

/**
 * 校验 PublicAttempt 对象结构
 * @param {unknown} attempt
 * @param {number} index
 * @returns {string[]} 错误列表
 */
function validatePublicAttempt(attempt, index) {
  const prefix = `attempts[${index}]`;
  if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
    return [`${prefix} 必须为 object`];
  }

  const requiredFields = [
    'targetId',
    'promptId',
    'cli',
    'model',
    'effort',
    'appliedEffort',
    'effortHonored',
    'label',
    'status',
    'svgFile',
    'rawFile',
    'startedAt',
    'finishedAt',
    'durationMs',
    'svgBytes',
    'error',
    'usage',
  ];

  const errors = [];
  for (const field of requiredFields) {
    if (!(field in attempt)) errors.push(`${prefix} 缺少必需字段: ${field}`);
  }
  const unexpected = getUnexpectedKeys(attempt, [...requiredFields, 'profile']);
  if (unexpected.length > 0) {
    errors.push(`${prefix} 含有多余字段: ${unexpected.join(', ')}`);
  }
  if ('profile' in attempt && (typeof attempt.profile !== 'string' || attempt.profile.length === 0)) {
    errors.push(`${prefix}.profile 若存在必须为非空字符串`);
  }

  errors.push(...checkAttemptFields(attempt, prefix));
  errors.push(...validateUsage(attempt.usage, prefix));
  return errors;
}

/** 公开 profile 视图允许的全部字段；接口地址、查询参数与 key 状态永远不在其中 */
const PUBLIC_PROFILE_FIELDS = ['name', 'label', 'cli', 'upstreamType', 'group', 'website', 'multiplier', 'enabled'];

/**
 * 校验 profiles 数组：每项只允许八个公开字段，name 唯一
 * @param {unknown} profiles
 * @returns {string[]}
 */
function validateProfiles(profiles) {
  if (profiles === undefined) return [];
  if (!Array.isArray(profiles)) return ['profiles 若存在必须为数组'];
  const errors = [];
  const seen = new Set();
  profiles.forEach((p, idx) => {
    const prefix = `profiles[${idx}]`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errors.push(`${prefix} 必须为 object`);
      return;
    }
    for (const field of PUBLIC_PROFILE_FIELDS) {
      if (!(field in p)) errors.push(`${prefix} 缺少必需字段: ${field}`);
    }
    const unexpected = getUnexpectedKeys(p, PUBLIC_PROFILE_FIELDS);
    if (unexpected.length > 0) errors.push(`${prefix} 含有不允许的字段: ${unexpected.join(', ')}`);
    if (typeof p.name !== 'string' || p.name.length === 0) errors.push(`${prefix}.name 必须为非空字符串`);
    else if (seen.has(p.name)) errors.push(`${prefix}.name 重复: ${p.name}`);
    seen.add(p.name);
    for (const field of ['label', 'cli', 'upstreamType']) {
      if (typeof p[field] !== 'string') errors.push(`${prefix}.${field} 必须为 string`);
    }
    for (const field of ['group', 'website']) {
      if (p[field] !== null && typeof p[field] !== 'string') errors.push(`${prefix}.${field} 必须为 string 或 null`);
    }
    if (typeof p.multiplier !== 'number' || !(p.multiplier >= 0)) errors.push(`${prefix}.multiplier 必须为非负数`);
    if (typeof p.enabled !== 'boolean') errors.push(`${prefix}.enabled 必须为 boolean`);
  });
  return errors;
}

/**
 * 每个 attempt.profile 都要在顶层 profiles 里登记
 * @param {unknown[]} attempts
 * @param {unknown} profiles
 * @returns {string[]}
 */
function validateProfileReferences(attempts, profiles) {
  const names = new Set(Array.isArray(profiles) ? profiles.map((p) => p?.name) : []);
  const errors = [];
  attempts.forEach((att, idx) => {
    if (att && typeof att.profile === 'string' && !names.has(att.profile)) {
      errors.push(`attempts[${idx}].profile 未在 profiles 里登记: ${att.profile}`);
    }
  });
  return errors;
}

/**
 * 校验 prompts 数组
 * @param {unknown} prompts
 * @returns {string[]}
 */
function validatePrompts(prompts) {
  const errors = [];
  if (!Array.isArray(prompts)) return ['prompts 必须为数组'];
  prompts.forEach((p, idx) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      errors.push(`prompts[${idx}] 必须为 object`);
      return;
    }
    if (typeof p.promptId !== 'string' || p.promptId.length === 0) {
      errors.push(`prompts[${idx}].promptId 必须为非空字符串`);
    }
    if (typeof p.text !== 'string') errors.push(`prompts[${idx}].text 必须为 string`);
    if (!p.bindings || typeof p.bindings !== 'object' || Array.isArray(p.bindings)) {
      errors.push(`prompts[${idx}].bindings 必须为 key-value 映射对象`);
    } else {
      for (const [k, v] of Object.entries(p.bindings)) {
        if (typeof v !== 'string') errors.push(`prompts[${idx}].bindings[${k}] 须为 string`);
      }
    }
  });
  return errors;
}

/**
 * 校验 PublicRunRecord 顶层结构
 * @param {unknown} data
 * @returns {string[]} 错误列表
 */
export function validatePublicRun(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['PublicRunRecord 必须为 object'];
  }

  const allowedKeys = [
    '$schema',
    'publicSchemaVersion',
    'runId',
    'prompts',
    'startedAt',
    'finishedAt',
    'durationMs',
    'trigger',
    'inProgress',
    'cancelledAt',
    'budgetStop',
    'attempts',
    'redactions',
    'profiles',
  ];
  const unexpected = getUnexpectedKeys(data, allowedKeys);
  if (unexpected.length > 0) {
    errors.push(`run.json 顶层含有多余字段: ${unexpected.join(', ')}`);
  }

  if (data.publicSchemaVersion !== 1) {
    errors.push(`publicSchemaVersion 必须为 1，当前为: ${data.publicSchemaVersion}`);
  }
  if (typeof data.runId !== 'string' || !/^\d{8}T\d{6}Z$/.test(data.runId)) {
    errors.push(`runId 格式必须为紧凑 UTC (YYYYMMDDTHHmmssZ)，当前为: ${data.runId}`);
  }
  if (!isValidIsoDateTime(data.startedAt)) errors.push('startedAt 必须为有效 ISO 时间戳');
  if (!isValidIsoDateTime(data.finishedAt)) errors.push('finishedAt 必须为有效 ISO 时间戳');
  if (!Number.isInteger(data.durationMs) || data.durationMs < 0) {
    errors.push('durationMs 必须为非负整数');
  }
  if (data.trigger !== 'schedule' && data.trigger !== 'manual') {
    errors.push(`trigger 必须为 schedule 或 manual，当前为: ${data.trigger}`);
  }
  if (data.inProgress !== false) errors.push('inProgress 必须为 false');
  if (data.cancelledAt !== undefined && data.cancelledAt !== null && !isValidIsoDateTime(data.cancelledAt)) {
    errors.push('cancelledAt 若存在必须为有效 ISO 时间戳或 null');
  }

  errors.push(...validatePrompts(data.prompts));

  if (!Array.isArray(data.redactions)) {
    errors.push('redactions 必须为数组');
  } else {
    data.redactions.forEach((r, idx) => {
      if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.file !== 'string' || typeof r.reason !== 'string') {
        errors.push(`redactions[${idx}] 必须包含 string 类型的 file 与 reason 字段`);
      }
    });
  }

  errors.push(...validateProfiles(data.profiles));

  if (!Array.isArray(data.attempts)) {
    errors.push('attempts 必须为数组');
  } else {
    data.attempts.forEach((att, idx) => {
      errors.push(...validatePublicAttempt(att, idx));
    });
    errors.push(...validateProfileReferences(data.attempts, data.profiles));
  }

  return errors;
}

/**
 * 校验 DataRepoManifest 结构
 * @param {unknown} data
 * @returns {string[]} 错误列表
 */
export function validateManifest(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['manifest 必须为 object'];
  }

  const allowedKeys = [
    '$schema',
    'schemaVersion',
    'name',
    'description',
    'repository',
    'updatedAt',
    'totalRuns',
    'days',
  ];
  const unexpected = getUnexpectedKeys(data, allowedKeys);
  if (unexpected.length > 0) {
    errors.push(`manifest 含有多余字段: ${unexpected.join(', ')}`);
  }

  if (data.schemaVersion !== 1) {
    errors.push(`schemaVersion 必须为 1，当前为: ${data.schemaVersion}`);
  }
  if (typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('name 必须为非空字符串');
  }
  if (typeof data.description !== 'string') errors.push('description 必须为字符串');
  if (typeof data.repository !== 'string') errors.push('repository 必须为字符串');
  if (!isValidIsoDateTime(data.updatedAt)) errors.push('updatedAt 必须为有效 ISO 时间戳');
  if (!Number.isInteger(data.totalRuns) || data.totalRuns < 0) {
    errors.push('totalRuns 必须为非负整数');
  }
  if (!Array.isArray(data.days)) return ['days 必须为数组'];

  let prevDate = null;
  data.days.forEach((day, idx) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      errors.push(`days[${idx}] 必须为 object`);
      return;
    }
    const dayUnexpected = getUnexpectedKeys(day, ['date', 'runs', 'path']);
    if (dayUnexpected.length > 0) {
      errors.push(`days[${idx}] 含有多余字段: ${dayUnexpected.join(', ')}`);
    }
    if (typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      errors.push(`days[${idx}].date 必须为 YYYY-MM-DD 格式`);
    }
    if (!Number.isInteger(day.runs) || day.runs < 0) {
      errors.push(`days[${idx}].runs 必须为非负整数`);
    }
    const expectedPath = `runs/${day.date?.replace(/-/g, '/')}`;
    if (day.path !== expectedPath) {
      errors.push(`days[${idx}].path 必须为 ${expectedPath}，当前为: ${day.path}`);
    }
    if (prevDate && day.date >= prevDate) {
      errors.push(`days 必须按日期降序排列 (新的在前)，当前顺序异常: ${day.date} 在 ${prevDate} 之后`);
    }
    prevDate = day.date;
  });

  return errors;
}

/**
 * 校验 DayIndex 结构
 * @param {unknown} data
 * @param {string} [expectedDate] 预期对应的日期
 * @returns {string[]} 错误列表
 */
export function validateDayIndex(data, expectedDate) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['DayIndex 必须为 object'];
  }

  const allowedKeys = ['$schema', 'schemaVersion', 'date', 'runs'];
  const unexpected = getUnexpectedKeys(data, allowedKeys);
  if (unexpected.length > 0) {
    errors.push(`day-index 含有多余字段: ${unexpected.join(', ')}`);
  }

  if (data.schemaVersion !== 1) {
    errors.push(`schemaVersion 必须为 1，当前为: ${data.schemaVersion}`);
  }
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push(`date 必须为 YYYY-MM-DD 格式，当前为: ${data.date}`);
  } else if (expectedDate && data.date !== expectedDate) {
    errors.push(`date 必须与目录日期一致，预期 ${expectedDate}，实际为 ${data.date}`);
  }
  if (!Array.isArray(data.runs)) return ['runs 必须为数组'];

  let prevRunId = null;
  data.runs.forEach((r, idx) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      errors.push(`runs[${idx}] 必须为 object`);
      return;
    }
    const rFields = [
      'runId',
      'startedAt',
      'finishedAt',
      'trigger',
      'promptIds',
      'attempts',
      'ok',
      'path',
    ];
    const rUnexpected = getUnexpectedKeys(r, rFields);
    if (rUnexpected.length > 0) {
      errors.push(`runs[${idx}] 含有多余字段: ${rUnexpected.join(', ')}`);
    }
    if (typeof r.runId !== 'string' || !/^\d{8}T\d{6}Z$/.test(r.runId)) {
      errors.push(`runs[${idx}].runId 格式必须为 YYYYMMDDTHHmmssZ`);
    }
    if (!isValidIsoDateTime(r.startedAt)) errors.push(`runs[${idx}].startedAt 须为有效 ISO`);
    if (!isValidIsoDateTime(r.finishedAt)) errors.push(`runs[${idx}].finishedAt 须为有效 ISO`);
    if (r.trigger !== 'schedule' && r.trigger !== 'manual') {
      errors.push(`runs[${idx}].trigger 必须为 schedule 或 manual`);
    }
    if (!Array.isArray(r.promptIds) || !r.promptIds.every((id) => typeof id === 'string')) {
      errors.push(`runs[${idx}].promptIds 必须为字符串数组`);
    }
    if (!Number.isInteger(r.attempts) || r.attempts < 0) {
      errors.push(`runs[${idx}].attempts 必须为非负整数`);
    }
    if (!Number.isInteger(r.ok) || r.ok < 0) {
      errors.push(`runs[${idx}].ok 必须为非负整数`);
    }
    const expectedPath = `runs/${data.date?.replace(/-/g, '/')}/${r.runId}`;
    if (r.path !== expectedPath) {
      errors.push(`runs[${idx}].path 必须为 ${expectedPath}，当前为: ${r.path}`);
    }
    if (prevRunId && r.runId <= prevRunId) {
      errors.push(`runs 必须按 runId 升序排列，当前顺序异常: ${r.runId} <= ${prevRunId}`);
    }
    prevRunId = r.runId;
  });

  return errors;
}
