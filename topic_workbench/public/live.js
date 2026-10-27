import { escapeHtml as esc, hotspotView, noticeView } from './views.js';

const $ = (selector) => document.querySelector(selector);
document.documentElement.classList.add('live-mode');
const form = $('#research-form');
let entries = [];
let selectedEntry = null;
let savedId = null;
let platform = '全部';
let saving = false;
const formatTime = (value) => value ? `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Hong_Kong' }).format(new Date(value))} +08:00` : '未知';

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  $('#contract').textContent = JSON.stringify({ method, path, response: result }, null, 2);
  if (!response.ok) throw new Error(result.error?.message || '本地服务未完成操作');
  return result;
}

$('.mode').textContent = '本地模式 · 零模型调用';
$('.discovery-heading .badge').textContent = '本地榜单';
$('.sidebar-note p').textContent = '榜单仅供定位热点，不合并相似标题或来源说法。采集时间不是事件时间。';
$('.demo-controls').hidden = true;
$('#submit').textContent = '保存热点';
$('.form-footer p').textContent = '仅本地保存，不检索、不调用模型。研究与推荐尚未接入。';
$('.contract .field-description').innerHTML = '当前为真实本地接口记录。<a href="/?mode=demo">打开已确认的模拟原型</a>（演示结果仅在页面内存中）。';
$('#contract').textContent = '等待本地接口请求。';
$('#output-heading').textContent = '热点记录';
$('#empty h3').textContent = '保存一个值得研究的热点。';
$('#empty p').textContent = '从本地榜单选择，或手动填写任意热点；保存后可在下方记录中重新打开。';
$('.empty-note').textContent = '研究、关键词与推荐将在后续接入。';
$('footer').innerHTML = '<span>仅本机运行 · 热点保存在本地磁盘</span><span>页面查看、热点保存与榜单刷新均不调用模型</span>';
$('.discovery-content .muted').insertAdjacentHTML('afterend', '<button id="refresh-hotlist" class="secondary" type="button">刷新榜单 · 仅采集</button><p id="hotlist-status" class="field-description" role="status"></p>');
$('.list-note').innerHTML = '<div id="source-times" class="field-description"></div>';
$('.input-panel').insertAdjacentHTML('beforeend', '<section class="saved-section" aria-labelledby="saved-heading"><div class="panel-heading"><h2 id="saved-heading">已保存热点</h2><button id="reload-saved" class="text-button" type="button">重新读取</button></div><p id="saved-status" class="field-description" role="status"></p><div id="saved-hotspots"></div></section>');

function renderList() {
  $('#platforms').innerHTML = ['全部', 'B站', '抖音', '微博'].map((label) => `<button type="button" data-platform="${label}" aria-pressed="${platform === label}">${label}</button>`).join('');
  const visible = entries.filter((item) => platform === '全部' || item.platform === platform);
  $('#hotlist').innerHTML = visible.map((item) => hotspotView(item, selectedEntry?.id === item.id, saving)).join('') || '<p class="field-description">该平台暂无当前榜单，可手动添加热点。</p>';
}

async function loadList(refresh = false) {
  const button = $('#refresh-hotlist');
  button.disabled = true;
  $('#hotlist-status').textContent = refresh ? '正在采集三平台并保存，不调用模型，请稍候…' : '正在读取本地榜单…';
  try {
    const data = await api(refresh ? '/api/hotlist/refresh' : '/api/hotlist', refresh ? 'POST' : 'GET', refresh ? {} : undefined);
    entries = data.items;
    $('#hotlist-status').textContent = data.message;
    $('#source-times').innerHTML = data.platforms.map((source) => `<p><strong>${esc(source.platform)}</strong> · ${source.status === 'success' ? '已采集' : source.status === 'failed' ? '本次采集失败' : '暂无采集'}<br>采集：${esc(formatTime(source.collected_at))}<br>来源更新：${esc(formatTime(source.source_updated_at))} · ${source.source_status === 'cache' ? '聚合缓存' : source.source_status === 'success' ? '聚合返回成功' : '缓存状态未知'}</p>`).join('') + '<p>仅显示当日最近一次采集。未知来源时间不以本机采集时间代替。</p>';
    renderList();
  } catch (error) {
    $('#hotlist-status').textContent = `榜单操作失败：${error.message}。可手动添加；未自动重试。`;
  } finally {
    button.disabled = false;
  }
}

function choose(entry, record = null) {
  selectedEntry = entry;
  savedId = record?.id || null;
  form.reset();
  const input = record?.input || { title: entry?.title || '', source_url: entry?.source_url || '' };
  for (const name of ['title', 'source_url', 'location', 'event_time', 'focus']) form.elements[name].value = input[name] || '';
  form.elements.material_text.value = input.manual_material?.text || '';
  form.elements.material_source.value = input.manual_material?.source_description || '';
  $('#entry-label').textContent = entry ? `${entry.platform} · 榜单入口` : '手动添加';
  $('#title-count').textContent = `${form.elements.title.value.length} / 500`;
  $('#form-error').hidden = true;
  $('#result').replaceChildren();
  $('#empty').hidden = Boolean(record);
  $('#status').textContent = record ? '已从磁盘打开热点；未发起研究。' : '';
  $('#output-state').textContent = record ? '已保存' : '等待保存';
  if (record) showRecord(record);
  renderList();
}

function showRecord(record) {
  const input = record.input;
  $('#empty').hidden = true;
  $('#output-state').textContent = '已保存';
  $('#result').innerHTML = `<article class="research-card"><h3 class="result-title">${esc(input.title)}</h3>${noticeView('热点输入是研究线索，不代表事件事实已核实。研究、取材与推荐尚未接入。', 'neutral')}<dl class="event-meta">${[
    ['入口', input.entry_kind === 'hotlist' ? `${input.platform} · 排名 ${input.rank}` : '手动添加'],
    ['榜单采集时间', formatTime(input.collected_at)], ['来源更新时间', formatTime(input.source_updated_at)],
    ['来源链接 · 未访问', input.source_url || '未提供'], ['地点 · 人工线索', input.location || '未提供'],
    ['事件时间 · 人工线索', input.event_time || '未提供'], ['关注点', input.focus || '未提供'],
    ['保存时间', formatTime(record.updated_at)],
  ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${input.manual_material ? `<h4>人工补充材料 · 未回查</h4><p>来源说明：${esc(input.manual_material.source_description || '未提供')}</p><p>提交时间：${esc(formatTime(record.manual_material_submitted_at))}</p><p class="material-text">${esc(input.manual_material.text)}</p>` : ''}</article>`;
}

async function loadSaved() {
  try {
    const data = await api('/api/hotspots');
    $('#saved-hotspots').innerHTML = data.hotspots.map((record) => `<button class="hotspot" type="button" data-saved="${esc(record.id)}"><span><strong>${esc(record.input.title)}</strong><small>${esc(record.input.platform || '手动添加')} · ${esc(formatTime(record.updated_at))}</small><span class="hotspot-link">重新打开</span></span></button>`).join('');
    $('#saved-status').textContent = data.hotspots.length ? `${data.hotspots.length} 个热点保存在本地磁盘` : '尚无已保存热点';
  } catch (error) { $('#saved-status').textContent = `读取失败：${error.message}；未自动重试。`; }
}

$('#platforms').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (button) { platform = button.dataset.platform; renderList(); }
});
$('#hotlist').addEventListener('click', (event) => {
  const button = event.target.closest('[data-entry]');
  if (button && !saving) choose(entries.find((item) => item.id === button.dataset.entry));
});
$('#manual').addEventListener('click', () => { if (!saving) choose(null); });
$('#refresh-hotlist').addEventListener('click', () => loadList(true));
$('#reload-saved').addEventListener('click', loadSaved);
$('#saved-hotspots').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-saved]');
  if (!button || saving) return;
  try {
    const record = await api(`/api/hotspots/${button.dataset.saved}`);
    choose(record.provenance, record);
  } catch (error) { $('#saved-status').textContent = `打开失败：${error.message}`; }
});
form.addEventListener('input', () => {
  $('#form-error').hidden = true;
  $('#title-count').textContent = `${form.elements.title.value.length} / 500`;
  if (selectedEntry && form.elements.title.value !== selectedEntry.title) {
    selectedEntry = null;
    $('#entry-label').textContent = '手动添加（已修改标题）';
    renderList();
  }
  $('#result').replaceChildren();
  $('#empty').hidden = false;
  $('#output-state').textContent = '未保存修改';
  $('#status').textContent = '输入已修改，请保存。';
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  const title = form.elements.title;
  title.setCustomValidity(title.value.trim() ? '' : '请输入热点标题或描述');
  if (!form.checkValidity()) {
    const invalid = form.querySelector(':invalid');
    invalid.closest('details')?.setAttribute('open', '');
    $('#form-error').textContent = invalid === title ? '请输入热点标题或描述。' : '请检查来源链接格式。';
    $('#form-error').hidden = false;
    invalid.focus();
    title.setCustomValidity('');
    return;
  }
  const values = Object.fromEntries(new FormData(form));
  const input = { entry_kind: selectedEntry ? 'hotlist' : 'manual', entry_id: selectedEntry?.id || null };
  for (const key of ['title', 'source_url', 'location', 'event_time', 'focus']) input[key] = values[key].trim() || null;
  input.manual_material = values.material_text.trim() ? { text: values.material_text, source_description: values.material_source.trim() || null } : null;
  saving = true;
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = true; });
  $('#submit').textContent = '正在保存…';
  renderList();
  try {
    const record = await api(savedId ? `/api/hotspots/${savedId}` : '/api/hotspots', savedId ? 'PATCH' : 'POST', input);
    savedId = record.id;
    showRecord(record);
    $('#status').textContent = '热点已保存到本地磁盘，可关闭后重新打开。';
    await loadSaved();
  } catch (error) { $('#status').textContent = `保存失败：${error.message} 输入已保留，未自动重试。`; }
  finally {
    saving = false;
    form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = false; });
    $('#submit').textContent = '保存热点';
    renderList();
  }
});

if (matchMedia('(max-width: 640px)').matches) $('#discovery').open = false;
renderList();
await loadList();
await loadSaved();
