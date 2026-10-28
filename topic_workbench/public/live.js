import { escapeHtml as esc, hotspotView, noticeView, icon } from './views.js';
import { researchTasksView } from './research.js';
import { mountLiveRecommendation } from './live-recommendation.js';
import { createWorkflow } from './workflow.js';

const $ = (selector) => document.querySelector(selector);
document.documentElement.classList.add('live-mode');
const form = $('#research-form');
let entries = [];
let selectedEntry = null;
let savedId = null;
let platform = '全部';
let saving = false;
let loadVersion = 0;
let researchTasks = [];
const workflow = createWorkflow();
const formatTime = (value) => value && Number.isFinite(new Date(value).getTime()) ? `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Hong_Kong' }).format(new Date(value))} +08:00` : '未知';
const savedTime = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' });

async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  $('#contract').textContent = JSON.stringify({ method, path, response: result }, null, 2);
  if (!response.ok) throw new Error(result.error?.message || '本地服务未完成操作');
  return result;
}

$('.mode').textContent = '本地模式 · 研究与推荐';
$('.skip-link').href = '#work-title';
$('.skip-link').textContent = '跳到当前工作区';
$('.discovery-heading .badge').textContent = '本地榜单';
$('.sidebar-note p').textContent = '榜单仅供定位热点，不合并相似标题或来源说法。采集时间不是事件时间。';
$('.demo-controls').hidden = true;
$('#submit').textContent = '保存热点';
$('#submit').className = 'secondary';
$('.form-footer p').textContent = '研究消耗 API 额度；仅保存热点免费。';
$('.form-footer').insertAdjacentHTML('afterbegin', '<button id="collect" class="primary" type="submit">发起研究</button>');
$('.form-footer').insertAdjacentHTML('afterend', '<details class="budget-details"><summary id="budget-summary">正在读取费用…</summary><p id="budget-status" class="field-description" role="status"></p></details>');
$('.contract .field-description').innerHTML = '当前为真实本地接口记录。<a href="/?mode=demo">打开已确认的模拟原型</a>（演示结果仅在页面内存中）。';
$('#contract').textContent = '等待本地接口请求。';
$('.page-heading h1').textContent = '创作选题台';
$('.page-heading p').remove();
$('#empty h3').textContent = '保存一个值得研究的热点。';
$('#empty p').textContent = '从本地榜单选择，或手动填写任意热点；保存后可在下方记录中重新打开。';
$('.empty-note').textContent = '取材后自动接续研究提词，保留出处与缺口；不会自动推荐。';
$('footer').innerHTML = '<span>仅本机运行 · 数据保存在本地</span>';
$('.discovery-content .muted').insertAdjacentHTML('afterend', '<button id="refresh-hotlist" class="secondary" type="button">刷新榜单 · 仅采集</button><p id="hotlist-status" class="field-description" role="status"></p>');
$('.list-note').innerHTML = '<div id="source-times" class="field-description"></div>';
$('.input-panel').insertAdjacentHTML('beforeend', '<section class="saved-section" aria-labelledby="saved-heading"><div class="panel-heading"><h2 id="saved-heading">已保存热点</h2><button id="reload-saved" class="text-button" type="button">重新读取</button></div><p id="saved-status" class="field-description" role="status"></p><div id="saved-hotspots"></div></section>');
$('.hotlist').insertAdjacentElement('afterbegin', $('.saved-section'));
$('.hotlist').insertAdjacentHTML('afterbegin', '<details id="saved-library" open><summary>已保存热点<span id="saved-count" class="badge neutral"></span></summary></details>');
$('#saved-library').append($('.saved-section'));
$('#saved-heading').classList.add('sr-only');
$('.work-context').insertAdjacentElement('afterend', $('#status'));
$('.hotlist').append($('.budget-details'), $('.contract'));
$('.list-note').outerHTML = '<details class="source-times"><summary>榜单时间与来源</summary><div id="source-times" class="field-description"></div></details>';
$('#discovery').open = false;
if (matchMedia('(max-width: 700px)').matches) $('#saved-library').open = false;
$('.discovery-heading strong').textContent = '从榜单发现热点';
$('.discovery-content .muted').remove();
$('.sidebar-note').hidden = true;
$('.contract summary span:first-child').textContent = '开发参考';
$('.contract summary .optional').remove();
$('.hotlist').insertAdjacentHTML('afterbegin', `<div class="library-heading">${icon('search')}<h2>热点资料库</h2></div><div class="library-tabs" role="group" aria-label="热点来源"><button type="button" data-library-tab="discovery" aria-pressed="true">发现热点</button><button type="button" data-library-tab="saved-library" aria-pressed="false">已保存</button></div>`);
$('[data-library-tab="saved-library"]').append($('#saved-count'));
$('#discovery').open = true;
$('#saved-library').open = true;
$('#saved-library').hidden = true;
$('.discovery-heading').hidden = true;
$('#saved-library > summary').hidden = true;
$('#refresh-hotlist').innerHTML = icon('retry');
$('#refresh-hotlist').setAttribute('aria-label', '刷新榜单，仅采集');
$('#refresh-hotlist').title = '仅采集榜单，不调用模型';
$('.library-heading').append($('#refresh-hotlist'));
$('.hotlist').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-library-tab]');
  if (!tab) return;
  for (const id of ['discovery', 'saved-library']) $(`#${id}`).hidden = id !== tab.dataset.libraryTab;
  document.querySelectorAll('[data-library-tab]').forEach((button) => button.setAttribute('aria-pressed', String(button === tab)));
});

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
    $('#hotlist-status').textContent = data.platforms.some((source) => source.status === 'failed') || !data.items.length ? data.message : '当日榜单 · 非实时';
    $('#source-times').innerHTML = data.platforms.map((source) => `<p><strong>${esc(source.platform)}</strong> · ${source.status === 'success' ? '已采集' : source.status === 'failed' ? '本次采集失败' : '暂无采集'}<br>采集：${esc(formatTime(source.collected_at))}<br>来源更新：${esc(formatTime(source.source_updated_at))} · ${source.source_status === 'cache' ? '聚合缓存' : source.source_status === 'success' ? '聚合返回成功' : '缓存状态未知'}</p>`).join('') + '<p>仅显示当日最近一次采集。未知来源时间不以本机采集时间代替。</p>';
    renderList();
  } catch (error) {
    $('#hotlist-status').textContent = `榜单操作失败：${error.message}。可手动添加；未自动重试。`;
  } finally {
    button.disabled = false;
  }
}

function choose(entry, record = null) {
  loadVersion += 1;
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
  $('#status').textContent = record ? '已从磁盘打开热点，正在读取取材记录；查看不会追加请求。' : '';
  $('#output-state').textContent = record ? '已保存' : '等待保存';
  workflow.update({ stage: 1, available: 1, busy: false, title: input.title || '', message: record ? '正在读取已保存记录，不会追加收费请求…' : '确认标题，可按需补充线索，然后发起研究。' });
  if (record) { showRecord(record); loadMaterials(record.id); }
  document.querySelectorAll('[data-saved]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.saved === savedId)));
  renderList();
}

function showRecord(record) {
  const input = record.input;
  $('#empty').hidden = true;
  $('#output-state').textContent = '已保存';
  $('#result').innerHTML = `<details class="input-snapshot"><summary>热点输入与来源信息</summary><dl class="event-meta">${[
    ['入口', input.entry_kind === 'hotlist' ? `${input.platform} · 排名 ${input.rank}` : '手动添加'],
    ['榜单采集时间', formatTime(input.collected_at)], ['来源更新时间', formatTime(input.source_updated_at)],
    ['来源链接 · 未访问', input.source_url || '未提供'], ['地点 · 人工线索', input.location || '未提供'],
    ['事件时间 · 人工线索', input.event_time || '未提供'], ['关注点', input.focus || '未提供'],
    ['保存时间', formatTime(record.updated_at)],
  ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${input.manual_material ? `<h4>人工补充材料 · 未回查</h4><p>来源说明：${esc(input.manual_material.source_description || '未提供')}</p><p>提交时间：${esc(formatTime(record.manual_material_submitted_at))}</p><p class="material-text">${esc(input.manual_material.text)}</p>` : ''}</details>`;
}

function sourceLink(url) {
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`;
  } catch { /* Missing or invalid links remain plain text. */ }
  return esc(url || '未提供');
}

async function loadBudget() {
  try {
    const b = await api('/api/budget');
    $('.mode').textContent = `本地 · 累计 ${b.accounted_cny.toFixed(2)} / ${b.cap_cny} 元`;
    $('#budget-summary').textContent = `累计 ${b.accounted_cny.toFixed(2)} / ${b.cap_cny} 元 · 费用详情`;
    $('#budget-status').textContent = `共享累计计账（含预留）${b.accounted_cny} / 上限 ${b.cap_cny} 元，其中不确定费用预留 ${b.uncertain_cny} 元；待确认请求 ${b.pending_count} 个。应用估算，不是账户账单。失败或中断不会释放预留，也不会自动续跑。${b.pricing_overrun ? '价格异常，后续付费请求已拦截。' : ''}`;
    if (b.pending_count || b.pricing_overrun) $('.budget-details').open = true;
  } catch (error) { $('.mode').textContent = '本地 · 费用读取失败'; $('#budget-summary').textContent = '费用读取失败 · 查看说明'; $('.budget-details').open = true; $('#budget-status').textContent = `费用记录读取失败：${error.message}；不能据此认定尚有额度，未自动重试。`; }
}

function showMaterials(tasks) {
  if (tasks.length) $('#output-state').textContent = '已保存 · 取材记录';
  $('#materials-results')?.remove();
  $('#result').insertAdjacentHTML('beforeend', `<details id="materials-results" class="materials-archive"><summary>取材记录与原始正文 · ${tasks.length} 次操作</summary>${tasks.map((task) => `<article class="research-card">
    <h3>取材阶段 · ${esc(task.input_snapshot.title)}</h3>
    <p>${esc(({ completed: '取材结束', failed: '取材失败', blocked: '取材受阻', running: '尚未完成，可能仍在执行或已中断；不会自动续跑' })[task.status])} · 未完成研究提词</p>
    <p class="field-description">发起：${esc(formatTime(task.created_at))} · ${task.budget ? `本次结束时共享计账（含预留）${esc(task.budget.accounted_cny)} / 上限 ${esc(task.budget.cap_cny)} 元` : '尚无结束时费用快照'}</p>
    ${task.error ? noticeView(task.error.message, 'error') : ''}${task.warnings.map((warning) => noticeView(warning)).join('')}
    <p>可读正文 ${task.materials.filter((s) => s.status === 'body').length} · 完全重复 ${task.materials.filter((s) => s.status === 'duplicate').length} · 读取失败 ${task.materials.filter((s) => s.status === 'read_failed').length}</p>
    ${task.materials.map((source) => `<details class="material"><summary><span>${esc(source.id)} · ${esc(source.title)}<br>${esc(({ body: '已读正文 · 未核实', search_summary: '仅搜索结果 · 尚未读正文', duplicate: `完全重复 · 对应 ${source.duplicate_of}`, read_failed: '读取失败 · 未重试' })[source.status])}</span></summary><div class="material-body"><p>来源：${sourceLink(source.url)}</p><p>发布时间：${esc(formatTime(source.published_at))}<br>检索时间：${esc(formatTime(source.searched_at || source.retrieved_at))}<br>读取时间：${esc(formatTime(source.read_at))}</p>${source.error ? noticeView(source.error, 'error') : ''}<p class="material-text">${esc(source.text || '未取得正文')}</p>${source.summary ? `<p>搜索摘要（不是正文）：${esc(source.summary)}</p>` : ''}</div></details>`).join('')}
    <details class="preserved-materials"><summary>原始搜索结果 · ${task.search_results.length} 条（含未读与重复链接）</summary>${task.search_results.map((source) => `<p>${esc(source.title)}<br>${sourceLink(source.url)}<br>发布时间：${esc(formatTime(source.publishedDate))}</p>`).join('') || '<p>未取得搜索结果。</p>'}</details>
    <p class="field-description">按原始取材输入保留；未读取的来源线索和人工材料不计入已读正文。不同网站不代表独立证据链。</p>
  </article>`).join('')}</details>`);
  $('#materials-results').open = tasks.some((task) => task.status !== 'completed');
}

function activateResearch(taskId, navigate = true) {
  const task = researchTasks.find((item) => item.id === taskId);
  if (!task) return;
  document.querySelectorAll('[data-research-task]').forEach((article) => { article.hidden = article.dataset.researchTask !== taskId; });
  const root = document.querySelector(`[data-live-recommendation="${taskId}"]`);
  const hasAttempts = root?.dataset.hasAttempts === 'true';
  workflow.update({ available: hasAttempts ? 3 : 2, ...(navigate ? { stage: hasAttempts ? 3 : 2 } : {}),
    message: task.research_completed ? (hasAttempts ? '比较草稿并选用；需要调整关键词时可返回第 2 步。' : '研究已保存。确认关键词含义，再选择推荐方式。') : '研究尚未完成，请查看原因或选择具体事件；不会自动重试。' });
}

async function loadMaterials(id, restore = true) {
  const version = ++loadVersion;
  try {
    const data = await api(`/api/hotspots/${id}/materials`);
    if (savedId !== id || version !== loadVersion) return;
    showMaterials(data.tasks);
    const research = await api(`/api/hotspots/${id}/research`);
    if (savedId === id && version === loadVersion) {
      researchTasks = research.tasks;
      $('#research-results')?.remove();
      $('#materials-results').insertAdjacentHTML('beforebegin', researchTasksView(research.tasks));
      if (research.tasks.length) $('#output-state').textContent = '已保存 · 研究记录';
      for (const task of research.tasks.filter((t) => t.research_completed && t.result)) {
        if (savedId !== id || version !== loadVersion) return;
        const root = document.querySelector(`[data-live-recommendation="${task.id}"]`);
        await mountLiveRecommendation(root, task.result, { api, onStage(stage) {
          if (root.closest('[data-research-task]').hidden) return;
          root.dataset.hasAttempts = 'true';
          workflow.update({ stage, available: 3, message: '推荐只复用已有研究，不重新取材；结果仍待审核与知识核验。' });
        }, setBusy(value) {
          saving = value;
          workflow.update({ busy: value });
          $('.hotlist').inert = value;
          if (!value) loadBudget();
          document.querySelectorAll('[data-live-recommendation]').forEach((section) => { if (section !== root) section.inert = value; });
          form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = value; });
          $('#result').querySelectorAll('[data-task-event], [data-add-clue]').forEach((b) => { b.disabled = value; });
        } });
      }
      if (savedId !== id || version !== loadVersion) return;
      if (research.tasks.length) activateResearch(research.tasks[0].id, restore);
      else workflow.update({ available: data.tasks.length ? 2 : 1, stage: restore && data.tasks.length ? 2 : 1, message: data.tasks.length ? '已有取材记录，请展开查看状态；尚无研究结果。' : '热点已保存。准备好后，点击「发起研究」。' });
      $('#result').append($('#result .input-snapshot'));
      $('#status').textContent = '';
    }
  } catch (error) { if (savedId === id && version === loadVersion) $('#status').textContent = `材料读取失败：${error.message}；未自动重试。`; }
  finally { await loadBudget(); }
}

async function collectMaterials() {
  workflow.update({ stage: 2, available: 2, busy: true, message: '正在取得公开材料并研究提词，完成后等待你的推荐操作。' });
  $('.hotlist').inert = true;
  $('#result').inert = true;
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = true; });
  $('.output-panel').setAttribute('aria-busy', 'true');
  $('#status').textContent = '正在取材并研究提词；材料偏少不追加检索，事件不清时暂停选择。';
  try {
    await api(`/api/hotspots/${savedId}/research`, 'POST', { operation_id: crypto.randomUUID() });
    $('#status').textContent = '研究操作已保存，请查看结果、事件选择或失败说明；不会自动推荐。';
  } catch (error) { $('#status').textContent = `取材请求未完成：${error.message}。可重新打开查看已有材料，不自动重试。`; }
  finally {
    await loadMaterials(savedId);
    $('.output-panel').setAttribute('aria-busy', 'false');
    $('#result').inert = false;
    workflow.update({ busy: false });
    $('.hotlist').inert = false;
  }
}

async function loadSaved() {
  try {
    const data = await api('/api/hotspots');
    $('#saved-count').textContent = data.hotspots.length;
    $('#saved-hotspots').innerHTML = data.hotspots.map((record) => `<button class="hotspot" type="button" data-saved="${esc(record.id)}" aria-pressed="${record.id === savedId}"><span><strong>${esc(record.input.title)}</strong><small>${esc(record.input.platform || '手动添加')} · <time datetime="${esc(record.updated_at)}" title="${esc(formatTime(record.updated_at))}">${esc(savedTime.format(new Date(record.updated_at)))}</time></small></span></button>`).join('');
    $('#saved-status').textContent = data.hotspots.length ? '' : '尚无已保存热点';
  } catch (error) { $('#saved-status').textContent = `读取失败：${error.message}；未自动重试。`; }
}

$('#platforms').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (button) { platform = button.dataset.platform; renderList(); }
});

$('#result').addEventListener('click', async (event) => {
  const view = event.target.closest('[data-view-step]');
  if (view) { workflow.navigate(Number(view.dataset.viewStep)); return; }
  const reference = event.target.closest('a.source-ref');
  if (reference) {
    workflow.navigate(2);
    const target = document.getElementById(reference.hash.slice(1));
    for (let parent = target; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
  }
  const clue = event.target.closest('[data-add-clue]');
  if (clue && !saving) {
    workflow.navigate(1);
    form.elements.location.closest('details')?.setAttribute('open', '');
    form.elements.location.focus();
    return;
  }
  const button = event.target.closest('[data-task-event]');
  if (!button || saving) return;
  saving = true;
  workflow.update({ stage: 2, busy: true, message: '正在研究你选择的事件，复用已有材料。' });
  $('.hotlist').inert = true;
  $('#result').inert = true;
  const id = savedId;
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = true; });
  $('#result').querySelectorAll('[data-task-event], [data-add-clue]').forEach((b) => { b.disabled = true; });
  $('#status').textContent = '复用已取得材料研究所选事件，不追加取材。';
  try {
    await api(`/api/tasks/${button.dataset.taskEvent}/event`, 'PATCH', { event_id: button.dataset.eventId });
    $('#status').textContent = '所选事件研究操作已保存；不会自动推荐。';
  } catch (error) { $('#status').textContent = `事件研究未完成：${error.message}；未自动重试。`; }
  finally {
    await loadMaterials(id);
    saving = false;
    $('#result').inert = false;
    workflow.update({ busy: false });
    $('.hotlist').inert = false;
    form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = false; });
  }
});
$('#result').addEventListener('change', (event) => {
  if (event.target.matches('[data-research-history]')) activateResearch(event.target.value);
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
  loadVersion += 1;
  workflow.update({ stage: 1, available: 1, title: form.elements.title.value, message: '输入有未保存修改。确认后发起研究，或仅保存热点。' });
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
  workflow.update({ busy: true });
  $('.hotlist').inert = true;
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = true; });
  $('#submit').textContent = '正在保存…';
  renderList();
  try {
    const record = await api(savedId ? `/api/hotspots/${savedId}` : '/api/hotspots', savedId ? 'PATCH' : 'POST', input);
    savedId = record.id;
    showRecord(record);
    await loadMaterials(record.id, false);
    $('#status').textContent = '热点已保存到本地磁盘，可关闭后重新打开。';
    if (event.submitter?.id === 'collect') await collectMaterials();
    await loadSaved();
  } catch (error) { $('#status').textContent = `保存失败：${error.message} 输入已保留，未自动重试。`; }
  finally {
    saving = false;
    workflow.update({ busy: false });
    $('.hotlist').inert = false;
    form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = false; });
    $('#submit').textContent = '保存热点';
    renderList();
  }
});

renderList();
await loadList();
await loadSaved();
await loadBudget();
