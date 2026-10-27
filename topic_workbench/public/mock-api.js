// Candidate transport contract. Everything lives in memory; no fetch or paid clients.
export const hotlist = [
  { id: 'demo-b1', platform: 'B站', rank: 1, title: '空间站里的水球，为什么不会落下？', source_url: 'https://example.invalid/bilibili/demo-1', collected_at: '2026-10-27T10:00:00+08:00' },
  { id: 'demo-d1', platform: '抖音', rank: 2, title: '快充时手机发热，热量从哪里来？', source_url: 'https://example.invalid/douyin/demo-1', collected_at: '2026-10-27T10:00:00+08:00' },
  { id: 'demo-w1', platform: '微博', rank: 3, title: '降温之后，眼镜为什么会起雾？', source_url: 'https://example.invalid/weibo/demo-1', collected_at: '2026-10-27T10:00:00+08:00' },
];

const fixtures = {
  'demo-b1': { text: '模拟课堂中，演示者展示了微重力环境里的水球，观察到水球形状与表面张力有关。', terms: [['微重力', '演示材料描述的环境条件'], ['表面张力', '材料中用于讨论水球形状的概念']], background: '模拟课堂以水球为观察对象，讨论环境条件与液体形状。', gap: '未取得实际课程、实验条件或原视频，不能据此判断具体演示的结论。' },
  'demo-d1': { text: '模拟讨论提到快充、手机发热与能量转化，但没有给出充电功率、温度和测量条件。', terms: [['快充', '模拟讨论中的充电方式'], ['能量转化', '材料明确提到的知识概念']], background: '模拟讨论围绕充电时的发热现象展开，尚无可比较的实测数据。', gap: '缺少机型、环境温度及测量口径，不能判断某台手机的发热原因或安全性。' },
  'demo-w1': { text: '模拟观察记录：从冷处进入温暖房间后，眼镜表面出现水雾，讨论涉及凝结与温差。', terms: [['凝结', '材料中描述水雾形成的概念'], ['温差', '模拟观察的条件线索']], background: '模拟观察记录描述了环境切换后眼镜表面的水雾。', gap: '缺少湿度、镜片温度和具体实验条件，尚不能定量解释现象。' },
};
const tasks = new Map();
const hotspots = new Map();
const operations = new Map();
const recommendationCounts = new Map();
export const exchanges = [];
const usage = { paid_requests: 0, production_writes: 0 };

function replay(key, path, request) {
  return record('POST', path, request, { ...operations.get(key), reuse: 'operation', usage });
}

function record(method, path, request, response) {
  exchanges.push({ method, path, request: structuredClone(request), response: structuredClone(response) });
  return structuredClone(response);
}

function resultFor(hotspot, taskId) {
  const fixture = fixtures[hotspot.input.entry_id] || {
    text: '热点标题是研究线索，来源归属、事件时间和采集时间需要分别记录。',
    terms: [['研究线索', '此模板中对用户输入的定位'], ['来源归属', '此模板中对材料出处的记录要求']],
    background: '这是任意手动输入共用的交互模板，没有检索或分析该热点的真实背景。',
    gap: '尚无真实事件材料；此模板及关键词不能作为该热点的研究结论。',
  };
  const readAt = new Date().toISOString();
  const material = { id: 'S1', kind: 'mock_web', title: '模拟研究材料（虚构正文）', source_url: 'https://example.invalid/material/demo', published_at: null, read_at: readAt, status: 'body', text: fixture.text, evidence_group: 'G1' };
  const materials = [material, { ...material, id: 'S2', title: '模拟转载材料（与 S1 同一内容链）', source_url: 'https://example.invalid/material/repost', status: 'duplicate' }];
  if (hotspot.input.manual_material) {
    materials.push({ id: 'U1', kind: 'manual', title: '人工补充材料', source_description: hotspot.input.manual_material.source_description, source_url: null, published_at: null, read_at: null, submitted_at: readAt, status: 'unverified', text: hotspot.input.manual_material.text });
  }
  return { id: `research-${taskId}`, task_id: taskId, hotspot_id: hotspot.id, mock: true, status: 'completed', event: { title: hotspot.input.title, event_time: hotspot.input.event_time || null, location: hotspot.input.location || null, identity_notes: '用户输入仅作定位线索；此原型未执行事件核实。' }, background: [{ text: fixture.background, source_ids: ['S1'], status: 'attributed', speaker: '模拟材料' }], materials, keywords: fixture.terms.map(([term, meaning], index) => ({ id: `K${index + 1}`, term, meaning, quote: fixture.text, source_id: 'S1', speaker: '模拟材料', stance: 'affirmed', concepts: [], context: '仅供原型交互演示' })), evidence_groups: [{ id: 'G1', source_ids: ['S1', 'S2'], basis: '相同虚构文本，不计为两份独立佐证' }], warnings: [{ code: 'MOCK_ONLY', message: '全部网页正文与提词均为模拟；人工材料未回查。' }], gaps: [fixture.gap], recommendations: [], usage: { paid_requests: 0, production_writes: 0 } };
}

function scenarioResult(hotspot, task) {
  const result = resultFor(hotspot, task.id);
  result.acquisition = { search_links: 2, readable: 1, duplicates: 1, failed: 0, diagnosis: '两页属于同一模拟材料链，不能当作独立佐证。' };
  if (task.demo_scenario === 'clarification') {
    result.materials = structuredClone(task.materials);
    const source = result.materials.find((material) => material.id === (task.event_choice === 'E1' ? 'S1' : 'S2'));
    result.event.title = `${hotspot.input.title} · ${task.event_choice === 'E1' ? '模拟事件 A' : '模拟事件 B'}`;
    result.event.identity_notes = '用户从已取得材料中的两个虚构事件选择定位；未重新检索。';
    result.background = [{ text: source.text, source_ids: [source.id], status: 'attributed', speaker: '所选事件的模拟材料' }];
    result.keywords = [{ id: 'K1', term: '水球', meaning: '所选虚构演示中的物体', quote: source.text, source_id: source.id, speaker: '模拟材料', stance: 'affirmed', concepts: [], context: '事件选择后，仅使用对应材料提词' }];
    result.evidence_groups = result.materials.filter((material) => material.kind !== 'manual').map((material) => ({ id: material.evidence_group, source_ids: [material.id], basis: '不同模拟事件，不能合并佐证' }));
  }
  if (task.demo_scenario === 'conflict') {
    result.materials[1] = { ...result.materials[0], id: 'S2', title: '另一模拟来源', source_url: 'https://example.invalid/material/other', status: 'body', evidence_group: 'G2', text: '同一虚构演示，另一来源记录水球直径为 6 厘米；第一来源记录为 5 厘米。测量条件未知。' };
    result.materials[0].text += ' 此来源记录水球直径为 5 厘米。';
    result.background.push({ text: '同一虚构演示的尺寸说法不同：S1 为 5 厘米，S2 为 6 厘米，未裁定哪一方正确。', source_ids: ['S1', 'S2'], status: 'disputed', speaker: '两个模拟来源' });
    result.evidence_groups = [{ id: 'G1', source_ids: ['S1'], basis: '模拟来源一，独立性未核实' }, { id: 'G2', source_ids: ['S2'], basis: '模拟来源二，独立性未核实' }];
    result.acquisition = { search_links: 2, readable: 2, duplicates: 0, failed: 0, diagnosis: null };
    result.warnings.push({ code: 'SOURCE_CONFLICT', message: '同事件来源分歧：保留双方说法及出处，继续提词，不要求反复确认。' });
  }
  if (task.demo_scenario === 'sparse' || task.demo_scenario === 'unreadable') {
    result.acquisition = { search_links: 5, readable: 1, duplicates: 1, failed: 3, diagnosis: '模拟读取失败；不能由正文数量判断话题热度。' };
    result.materials.push({ id: 'S3', kind: 'mock_web', title: '模拟读取失败记录', source_url: 'https://example.invalid/material/failed', published_at: null, read_at: null, status: 'failed', text: '', error: { code: 'READ_FAILED', message: '模拟正文不可读，未重试。' } });
    result.warnings.push({ code: 'SPARSE_MATERIALS', message: '取材警告：检索返回 5 个链接，成功读取 1 份、重复 1 份、失败 3 份（仅展示代表记录）。不自动补查、重读、重试或付费诊断；不等于话题不热。已有原词仍可用于独立创作，证据充分性未通过验收。' });
  }
  if (task.demo_scenario === 'unreadable') {
    result.materials = result.materials.filter((material) => material.kind !== 'manual').map((material) => ({ ...material, status: 'failed', read_at: null, text: '', error: { code: 'READ_FAILED', message: '模拟正文不可读，未重试。' } }));
    // Preserve pasted input without inventing analysis when the web-reading fixture fails.
    if (hotspot.input.manual_material) result.materials.push({ id: 'U1', kind: 'manual', title: '人工补充材料（保留，尚未分析）', source_description: hotspot.input.manual_material.source_description, text: hotspot.input.manual_material.text, status: 'unverified', read_at: null, published_at: null });
    result.status = 'no_usable_text';
    result.background = [];
    result.keywords = [];
    result.evidence_groups = [];
    result.acquisition = { search_links: 5, readable: 0, duplicates: 0, failed: 5, diagnosis: '模拟网页均不可读；人工补充如有则保留但未分析。' };
    result.warnings = [result.warnings[0], { code: 'NO_USABLE_TEXT', message: '读取失败：5 个检索链接、0 份可读网页正文，未执行模型提词或推荐。已有失败记录和人工输入保留，不自动补查或重试。' }];
    result.gaps = ['没有可用网页正文，未生成背景、关键词或选题。可修改输入或人工材料后，由你明确发起新的研究；不会自动调用服务。'];
  }
  return result;
}

export const mockApi = {
  createHotspot(input) {
    const hotspot = { id: `hotspot-${crypto.randomUUID()}`, mock: true, input: structuredClone(input) };
    hotspots.set(hotspot.id, hotspot);
    return record('POST', '/api/hotspots', input, hotspot);
  },
  startResearch(hotspotId, operationId, demoScenario = 'normal') {
    const key = `${hotspotId}:${operationId}`;
    const request = { operation_id: operationId, demo_scenario: demoScenario };
    if (operations.has(key)) return replay(key, `/api/hotspots/${hotspotId}/research`, request);
    const task = { id: `task-${crypto.randomUUID()}`, hotspot_id: hotspotId, operation_id: operationId, demo_scenario: demoScenario, mock: true, status: 'queued', stage: '等待模拟研究', result: null, error: null, reuse: 'none', usage };
    tasks.set(task.id, { task, started: performance.now() });
    operations.set(key, task);
    return record('POST', `/api/hotspots/${hotspotId}/research`, request, task);
  },
  getTask(id) {
    const { task, started } = tasks.get(id);
    if (['completed', 'needs_clarification', 'failed', 'blocked'].includes(task.status)) return record('GET', `/api/tasks/${id}`, null, task);
    const elapsed = performance.now() - started;
    task.status = elapsed < 1800 ? 'running' : 'completed';
    task.stage = elapsed < 700 ? '整理模拟材料' : elapsed < 1800 ? '提取模拟关键词' : '提词完成，等待下一步';
    if (task.kind === 'recommendation') task.stage = task.status === 'completed' ? '模拟推荐完成' : '整理模拟选题';
    const scenario = task.kind === 'recommendation' ? task.snapshot.demo_failure : task.demo_scenario;
    if (scenario === 'budget' || (scenario === 'model_failure' && task.status === 'completed')) {
      task.status = scenario === 'budget' ? 'blocked' : 'failed';
      task.stage = scenario === 'budget' ? '预算拦截' : '模型失败';
      task.error = { code: scenario === 'budget' ? 'BUDGET_BLOCKED' : 'MODEL_FAILED', message: scenario === 'budget' ? '模拟预算不足，收费操作未启动。保留已有数据；不会重置账本、自动扩容或自动重试。' : '模拟模型失败，保留输入及已有材料，不自动重试。' };
      if (task.kind !== 'recommendation' && scenario !== 'budget') task.materials = resultFor(hotspots.get(task.hotspot_id), task.id).materials;
    } else if (task.status === 'completed' && task.demo_scenario === 'clarification' && !task.event_choice) {
      task.status = 'needs_clarification';
      task.stage = '事件待澄清，暂停提词';
      task.materials = resultFor(hotspots.get(task.hotspot_id), task.id).materials;
      task.materials[1] = { ...task.materials[1], status: 'body', evidence_group: 'G2', title: '另一日期的模拟事件材料', text: '另一日期的虚构水球展示，不能与第一事件合并。' };
      task.event_candidates = [{ id: 'E1', label: '模拟事件 A · 课堂水球演示', source_ids: ['S1'] }, { id: 'E2', label: '模拟事件 B · 另一日期的水球展示', source_ids: ['S2'] }];
    } else if (task.status === 'completed' && !task.result) task.result = task.kind === 'recommendation'
      ? recommendationFor(task) : scenarioResult(hotspots.get(task.hotspot_id), task);
    return record('GET', `/api/tasks/${id}`, null, task);
  },
  clarifyTask(id, eventId) {
    const entry = tasks.get(id);
    const task = entry.task;
    if (task.status === 'needs_clarification' && task.event_candidates.some((event) => event.id === eventId)) {
      task.event_choice = eventId;
      task.status = 'queued';
      task.stage = '复用已有材料，等待模拟提词';
      entry.started = performance.now();
    }
    return record('PATCH', `/api/tasks/${id}/event`, { event_id: eventId }, task);
  },
  saveCorrection(researchId, keywordId, correction) {
    return record('PATCH', `/api/research/${researchId}/keywords/${keywordId}`, { correction }, { keyword_id: keywordId, correction, mock: true });
  },
  addKeyword(researchId, input) {
    return record('POST', `/api/research/${researchId}/keywords`, input, { id: `M-${crypto.randomUUID()}`, ...input, kind: 'manual', mock: true });
  },
  selectKeywords(researchId, keywordIds) {
    return record('PUT', `/api/research/${researchId}/selection`, { keyword_ids: keywordIds }, { keyword_ids: keywordIds, mock: true });
  },
  saveDraft(roundId, draftId, changes) {
    return record('PATCH', `/api/rounds/${roundId}/drafts/${draftId}`, changes, { round_id: roundId, draft_id: draftId, ...changes, mock: true });
  },
  startRecommendation(researchId, input) {
    const key = `recommendation:${researchId}:${input.operation_id}`;
    if (operations.has(key)) return replay(key, `/api/research/${researchId}/recommendations`, input);
    const roundNumber = (recommendationCounts.get(researchId) || 0) + 1;
    recommendationCounts.set(researchId, roundNumber);
    const task = { id: `task-${crypto.randomUUID()}`, kind: 'recommendation', research_id: researchId, round_number: roundNumber, operation_id: input.operation_id, mock: true, status: 'queued', stage: '等待模拟推荐', snapshot: structuredClone(input), result: null, error: null, reuse: 'none', usage };
    tasks.set(task.id, { task, started: performance.now() });
    operations.set(key, task);
    return record('POST', `/api/research/${researchId}/recommendations`, input, task);
  },
};

// Each fixture is an independent question, never a forced combination of all terms.
const angles = {
  '微重力': ['空间站里的水球，为什么不会落下？', '微重力环境中，自由落体如何改变水的运动？', '用轨道运动示意图区分失重体验与没有引力。'],
  '表面张力': ['水球为什么偏爱圆形？', '表面张力怎样影响小水滴的形状？', '比较小水滴与大水滴的轮廓，标注观察条件。'],
  '快充': ['快充怎样让电池更快充电？', '充电功率与充电速度有什么关系？', '画出功率随时间变化的示意曲线，标注非实测。'],
  '能量转化': ['充电时，能量都去了哪里？', '输入的电能如何分配到储能和发热？', '用能量流向图表达储能与损耗。'],
  '凝结': ['眼镜上的水雾从哪里来？', '水蒸气在什么条件下凝结？', '对比冷镜片与室温镜片，记录温度和湿度。'],
  '温差': ['同一间屋子，为什么冷镜片更容易起雾？', '镜片温度与露点有什么关系？', '用温度刻度图说明镜片温度和露点的相对位置。'],
};

function recommendationFor(task) {
  const snapshot = structuredClone(task.snapshot);
  const candidates = snapshot.demo_outcome === 'empty' ? [] : snapshot.keywords.slice(0, 3).map((keyword, index) => {
    const [title, question, visual] = angles[keyword.term] || [`如何研究「${keyword.term}」？`, `「${keyword.term}」可以转化成什么可独立验证的问题？`, '用问题、条件、观察三栏画出验证路径；这是通用交互模板。'];
    return { id: `${task.id}-draft-${index + 1}`, title: task.round_number % 2 === 0 ? question : title, opening: task.round_number % 2 === 0 ? `换个提问方式，从观察条件开始：${question}` : `从「${keyword.term}」出发，先提出一个独立的知识问题：${question}`, knowledge_question: question, used_keyword_ids: [keyword.id], association_reason: `沿用本轮解释「${keyword.correction || keyword.meaning || '用户提供的创作线索'}」作为创作线索；${keyword.correction ? '词义已修正，原示例角度需据此复核。' : '与该词分别成题。'}不据此判断具体事件。`, visual_direction: visual, verification_points: ['核验知识问题的概念、适用条件与演示安全性。', '核验标题、开场及本轮解释是否相符；模拟示例不代表已完成内容推理。'] };
  });
  return { id: `round-${task.id}`, task_id: task.id, research_id: task.research_id, mock: true, mode: snapshot.mode, keyword_snapshot: snapshot.keywords, candidates, empty_reason: candidates.length ? null : '本次选择了零候选演示：模拟材料不足以支撑独立的知识问题，保留研究与选词，不为凑数生成选题。可补充或调整关键词后明确点击推荐。', usage: { paid_requests: 0, production_writes: 0 } };
}
