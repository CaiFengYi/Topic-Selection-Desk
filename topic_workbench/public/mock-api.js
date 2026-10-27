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
export const exchanges = [];

function record(method, path, request, response) {
  exchanges.push({ method, path, request, response: structuredClone(response) });
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

export const mockApi = {
  createHotspot(input) {
    const hotspot = { id: `hotspot-${crypto.randomUUID()}`, mock: true, input: structuredClone(input) };
    hotspots.set(hotspot.id, hotspot);
    return record('POST', '/api/hotspots', input, hotspot);
  },
  startResearch(hotspotId, operationId) {
    const key = `${hotspotId}:${operationId}`;
    if (operations.has(key)) return structuredClone(operations.get(key));
    const task = { id: `task-${crypto.randomUUID()}`, hotspot_id: hotspotId, operation_id: operationId, mock: true, status: 'queued', stage: '等待模拟研究', result: null };
    tasks.set(task.id, { task, started: performance.now() });
    operations.set(key, task);
    return record('POST', `/api/hotspots/${hotspotId}/research`, { operation_id: operationId }, task);
  },
  getTask(id) {
    const { task, started } = tasks.get(id);
    const elapsed = performance.now() - started;
    task.status = elapsed < 1800 ? 'running' : 'completed';
    task.stage = elapsed < 700 ? '整理模拟材料' : elapsed < 1800 ? '提取模拟关键词' : '提词完成，等待下一步';
    if (task.status === 'completed' && !task.result) task.result = resultFor(hotspots.get(task.hotspot_id), task.id);
    return record('GET', `/api/tasks/${id}`, null, task);
  },
};
