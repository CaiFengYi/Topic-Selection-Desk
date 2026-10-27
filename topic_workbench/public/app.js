import { hotlist, mockApi, exchanges } from './mock-api.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#research-form');
let selectedEntry = null;
let activePlatform = '全部';
let busy = false;
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const time = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Hong_Kong' }).format(new Date(value)) + ' +08:00' : '未知 / 未提供';

function renderList() {
  $('#platforms').innerHTML = ['全部', 'B站', '抖音', '微博'].map((platform) => `<button type="button" aria-pressed="${activePlatform === platform}" data-platform="${platform}">${platform}</button>`).join('');
  $('#hotlist').innerHTML = hotlist.filter((item) => activePlatform === '全部' || item.platform === activePlatform).map((item) => `<button type="button" class="hotspot ${selectedEntry?.id === item.id ? 'selected' : ''}" data-entry="${item.id}" ${busy ? 'disabled' : ''} aria-pressed="${selectedEntry?.id === item.id}"><span class="rank">0${item.rank}</span><span><small>${item.platform} · 模拟排名 ${item.rank}</small><strong>${escape(item.title)}</strong><span class="hotspot-link">带入研究表单 ↗</span></span></button>`).join('');
}

$('#platforms').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (!button) return;
  activePlatform = button.dataset.platform;
  renderList();
});
$('#hotlist').addEventListener('click', (event) => {
  const button = event.target.closest('[data-entry]');
  if (!button || busy) return;
  form.reset();
  selectedEntry = hotlist.find((item) => item.id === button.dataset.entry);
  form.elements.title.value = selectedEntry.title;
  form.elements.source_url.value = selectedEntry.source_url;
  $('#entry-label').textContent = `${selectedEntry.platform} · 模拟榜单入口`;
  resetResult();
  renderList();
  $('#title').focus();
});
$('#manual').addEventListener('click', () => {
  if (busy) return;
  selectedEntry = null;
  form.reset();
  $('#entry-label').textContent = '手动添加';
  resetResult();
  renderList();
  $('#title').focus();
});
// Editing a list title creates a manual input, rather than attaching an unrelated fixture.
$('#title').addEventListener('input', () => {
  if (selectedEntry && form.elements.title.value !== selectedEntry.title) {
    selectedEntry = null;
    $('#entry-label').textContent = '手动添加（已修改标题）';
    renderList();
  }
});

function resetResult() {
  $('#result').replaceChildren();
  $('#status').replaceChildren();
  $('#empty').hidden = false;
  $('#research-step').classList.remove('current');
}

function renderResult(result, input) {
  const sources = (ids) => ids.map((id) => `<a class="source-ref" href="#source-${id}">${escape(id)}</a>`).join(' ');
  $('#result').innerHTML = `<article class="research-card"><div class="result-heading"><div><p class="eyebrow">RESEARCH CARD / 模拟研究卡</p><h2>${escape(result.event.title)}</h2></div><span class="tag">提词完成</span></div>
    <p class="notice">${escape(result.warnings[0].message)} 有出处不代表事实已核实。</p>
    <dl class="event-meta"><div><dt>事件时间 · 用户线索</dt><dd>${escape(result.event.event_time || '未知 / 未提供')}</dd></div><div><dt>榜单采集时间 · 模拟</dt><dd>${escape(input.collected_at ? time(input.collected_at) : '手动输入，无榜单采集时间')}</dd></div><div><dt>地点 · 用户线索</dt><dd>${escape(result.event.location || '未提供')}</dd></div><div><dt>关注点</dt><dd>${escape(input.focus || '未提供')}</dd></div></dl>
    <p class="muted">来源线索：${escape(input.source_url || '未提供')}（未访问）</p>
    <h3>背景与语境</h3>${result.background.map((item) => `<p>${escape(item.text)} ${sources(item.source_ids)}<small class="attribution">来源说法 · ${escape(item.speaker)} · 未核实</small></p>`).join('')}
    <h3>关键词 <span class="count">${result.keywords.length} 个原词 · 模拟提取</span></h3><div class="keywords">${result.keywords.map((keyword) => `<section class="keyword"><div><span class="keyword-id">${keyword.id}</span><h4>${escape(keyword.term)}</h4>${sources([keyword.source_id])}</div><p>${escape(keyword.meaning)}</p><blockquote>“${escape(keyword.quote)}”</blockquote><small>说话者：${escape(keyword.speaker)} · 肯定语境 · 未核实</small></section>`).join('')}</div>
    <h3>研究缺口</h3><div class="gap">${escape(result.gaps[0])}</div>
    <h3>所用材料 <span class="count">网页与人工材料分开记录</span></h3>${result.materials.map((material) => `<details class="material" id="source-${material.id}"><summary><span>${material.id} · ${escape(material.title)}</span><span class="material-state">${material.kind === 'manual' ? '人工补充 · 未回查' : material.status === 'duplicate' ? '重复内容 · 同一来源链' : '模拟已读正文'}</span></summary><div class="material-body"><p>来源：${escape(material.source_url || material.source_description || '用户未说明')}</p><p>发布时间：${time(material.published_at)}<br>读取时间：${time(material.read_at)}${material.submitted_at ? `<br>人工提交时间：${time(material.submitted_at)}` : ''}</p><p class="material-text">${escape(material.text)}</p>${material.evidence_group ? '<small>S1 与 S2 为同一虚构材料链，不能当作独立佐证。</small>' : '<small>用户提供的原始文本，未访问来源、未核实。</small>'}</div></details>`).join('')}
    <div class="stop"><span>✓</span><div><strong>研究到这里，先停一下。</strong><p>已展示模拟关键词；推荐与草稿将在后续任务提供。当前未生成任何选题候选。</p></div></div></article>`;
  document.querySelectorAll('.source-ref').forEach((link) => link.addEventListener('click', () => { $(link.getAttribute('href')).open = true; }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  const values = Object.fromEntries(new FormData(form));
  if (!values.title.trim()) { $('#title').setCustomValidity('请输入热点标题或描述'); $('#title').reportValidity(); return; }
  const input = { entry_kind: selectedEntry ? 'hotlist' : 'manual', entry_id: selectedEntry?.id || null, platform: selectedEntry?.platform || null, rank: selectedEntry?.rank || null, collected_at: selectedEntry?.collected_at || null, title: values.title.trim(), source_url: values.source_url.trim() || null, location: values.location.trim() || null, event_time: values.event_time.trim() || null, focus: values.focus.trim() || null, manual_material: values.material_text.trim() ? { text: values.material_text, source_description: values.material_source.trim() || null } : null };
  busy = true;
  resetResult();
  $('#empty').hidden = true;
  $('#research-step').classList.add('current');
  form.querySelectorAll('input, textarea, button').forEach((element) => { element.disabled = true; });
  renderList();
  $('#submit').textContent = '模拟研究中…';
  try {
    exchanges.length = 0;
    const hotspot = mockApi.createHotspot(input);
    let task = mockApi.startResearch(hotspot.id, crypto.randomUUID());
    while (task.status !== 'completed') {
      $('#status').innerHTML = `<div class="progress"><span class="spinner"></span><div><strong>${escape(task.stage)}</strong><p>模拟执行中 · 请稍候，不会调用检索或模型服务</p></div></div>`;
      $('#contract').textContent = JSON.stringify(exchanges, null, 2);
      await new Promise((resolve) => setTimeout(resolve, 450));
      task = mockApi.getTask(task.id);
    }
    $('#status').textContent = '模拟研究完成 · API 收费请求 0 · 正式数据写入 0';
    renderResult(task.result, input);
    $('#contract').textContent = JSON.stringify(exchanges, null, 2);
  } catch {
    $('#status').textContent = '原型执行失败；未调用收费服务。请重新发起模拟研究。';
  } finally {
    busy = false;
    form.querySelectorAll('input, textarea, button').forEach((element) => { element.disabled = false; });
    $('#submit').innerHTML = '再次模拟研究 <span>↗</span>';
    renderList();
  }
});
$('#title').addEventListener('input', () => $('#title').setCustomValidity(''));
renderList();
