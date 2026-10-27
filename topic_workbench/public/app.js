import { hotlist, mockApi, exchanges } from './mock-api.js';
import { escapeHtml, icon, hotspotView, researchView, loadingView } from './views.js';
import { mountRecommendation } from './recommendation.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#research-form');
const title = $('#title');
const output = $('.output-panel');
let selectedEntry = null;
let activePlatform = '全部';
let busy = false;

function renderList() {
  if (!$('#platforms').childElementCount) {
    $('#platforms').innerHTML = ['全部', 'B站', '抖音', '微博'].map((platform) =>
      `<button type="button" data-platform="${platform}">${platform}</button>`).join('');
  }
  $('#platforms').querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.platform === activePlatform));
  });
  $('#hotlist').innerHTML = hotlist
    .filter((item) => activePlatform === '全部' || item.platform === activePlatform)
    .map((item) => hotspotView(item, selectedEntry?.id === item.id, busy)).join('');
}

function setOutputState(text, tone = 'neutral') {
  $('#output-state').textContent = text;
  $('#output-state').className = `badge ${tone}`;
}

function setStep(researching) {
  $('#input-step').classList.toggle('current', !researching);
  $('#input-step').classList.toggle('complete', researching);
  $('#research-step').classList.toggle('current', researching);
  $('#research-step').classList.remove('complete');
  const current = researching ? $('#research-step') : $('#input-step');
  const previous = researching ? $('#input-step') : $('#research-step');
  previous.removeAttribute('aria-current');
  current.setAttribute('aria-current', 'step');
}

function clearValidation() {
  title.setCustomValidity('');
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  $('#form-error').hidden = true;
}

function resetResult() {
  $('#recommendation').hidden = true;
  $('#recommendation').replaceChildren();
  $('#recommendation-step').classList.remove('current');
  $('#recommendation-step').removeAttribute('aria-current');
  $('#result').replaceChildren();
  $('#status').replaceChildren();
  $('#empty').hidden = false;
  $('#contract').textContent = '尚未提交研究请求。';
  setOutputState('等待研究');
  setStep(false);
}

function updateTitleCount() {
  $('#title-count').textContent = `${title.value.length} / 500`;
}

function chooseEntry(entry) {
  selectedEntry = entry;
  form.reset();
  clearValidation();
  title.value = entry?.title || '';
  form.elements.source_url.value = entry?.source_url || '';
  $('#entry-label').textContent = entry ? `${entry.platform} · 榜单入口` : '手动添加';
  updateTitleCount();
  resetResult();
  renderList();
  title.focus();
}

$('#platforms').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (!button) return;
  activePlatform = button.dataset.platform;
  renderList();
});
$('#hotlist').addEventListener('click', (event) => {
  const button = event.target.closest('[data-entry]');
  if (button && !busy) chooseEntry(hotlist.find((item) => item.id === button.dataset.entry));
});
$('#manual').addEventListener('click', () => { if (!busy) chooseEntry(null); });

form.addEventListener('input', () => {
  clearValidation();
  updateTitleCount();
  if (selectedEntry && title.value !== selectedEntry.title) {
    selectedEntry = null;
    $('#entry-label').textContent = '手动添加（已修改标题）';
    renderList();
  }
  // An edited request must not keep displaying a card from the previous inputs.
  resetResult();
});

function validateForm() {
  clearValidation();
  if (!title.value.trim()) title.setCustomValidity('请输入热点标题或描述');
  if (form.checkValidity()) return true;
  const invalid = form.querySelector(':invalid');
  invalid.closest('details')?.setAttribute('open', '');
  invalid.setAttribute('aria-invalid', 'true');
  $('#form-error').textContent = invalid === title
    ? '请输入热点标题或描述，再开始研究。'
    : '来源链接格式不正确，请填写完整网址，例如 https://example.com。';
  $('#form-error').hidden = false;
  invalid.focus();
  return false;
}

function readInput() {
  const values = Object.fromEntries(new FormData(form));
  return {
    entry_kind: selectedEntry ? 'hotlist' : 'manual',
    entry_id: selectedEntry?.id || null,
    platform: selectedEntry?.platform || null,
    rank: selectedEntry?.rank || null,
    collected_at: selectedEntry?.collected_at || null,
    title: values.title.trim(),
    source_url: values.source_url.trim() || null,
    location: values.location.trim() || null,
    event_time: values.event_time.trim() || null,
    focus: values.focus.trim() || null,
    manual_material: values.material_text.trim() ? {
      text: values.material_text,
      source_description: values.material_source.trim() || null,
    } : null,
  };
}

function setBusy(value, label = '模拟研究中…') {
  busy = value;
  output.setAttribute('aria-busy', String(value));
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = value; });
  $('#submit').innerHTML = value
    ? `<span class="spinner" aria-hidden="true"></span><span>${label}</span>`
    : `${icon('search')}<span>开始模拟研究</span>${icon('arrow')}`;
  renderList();
}

function updateContract() {
  $('#contract').textContent = JSON.stringify(exchanges, null, 2);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !validateForm()) return;
  const input = readInput();
  resetResult();
  setBusy(true);
  setStep(true);
  setOutputState('研究中', 'success');
  $('#empty').hidden = true;
  $('#result').innerHTML = loadingView();
  try {
    exchanges.length = 0;
    const hotspot = mockApi.createHotspot(input);
    let task = mockApi.startResearch(hotspot.id, crypto.randomUUID());
    while (task.status !== 'completed') {
      $('#status').innerHTML = `<div class="progress"><div class="progress-heading"><span class="spinner" aria-hidden="true"></span><strong>${escapeHtml(task.stage)}</strong></div><p>模拟执行中，不会调用检索或模型服务。</p></div>`;
      updateContract();
      await new Promise((resolve) => setTimeout(resolve, 450));
      task = mockApi.getTask(task.id);
    }
    $('#result').innerHTML = researchView(task.result, input);
    mountRecommendation(task.result, { setBusy, updateContract, setOutputState });
    $('#status').innerHTML = `<div class="status-success">${icon('check')}模拟研究完成 · 未自动生成选题候选</div>`;
    setOutputState('提词完成', 'success');
  } catch {
    $('#result').replaceChildren();
    $('#status').innerHTML = `<div class="error-state">${icon('info')}<div><h3>模拟研究未完成</h3><p>本次原型执行出现错误。输入已保留，你可以重新发起；未调用任何收费服务。</p><button id="retry" class="secondary" type="button">${icon('retry')}重新模拟研究</button></div></div>`;
    setOutputState('执行失败', 'error');
  } finally {
    updateContract();
    setBusy(false);
  }
});

$('#status').addEventListener('click', (event) => {
  if (event.target.closest('#retry') && !busy) form.requestSubmit();
});
output.addEventListener('click', (event) => {
  const link = event.target.closest('.source-ref');
  if (!link) return;
  const material = document.getElementById(link.hash.slice(1));
  if (material) {
    event.preventDefault();
    material.open = true;
    material.querySelector('summary').focus();
  }
});

// Native disclosure works at every size; only its initial state differs.
if (matchMedia('(max-width: 640px)').matches) $('#discovery').open = false;
renderList();
