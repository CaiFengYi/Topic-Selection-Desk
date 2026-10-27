import { mockApi } from './mock-api.js';
import { escapeHtml as esc, icon } from './views.js';
import { mountRounds } from './rounds.js';

export function mountRecommendation(research, { setBusy, updateContract, setOutputState }) {
  const root = document.querySelector('#recommendation');
  const keywords = research.keywords.map((keyword) => ({ ...keyword, correction: '', draft: '' }));
  const selected = new Set();
  let running = false;
  const snapshot = (keyword) => {
    const { draft, ...saved } = keyword;
    return structuredClone(saved);
  };

  function keywordView(keyword) {
    const manual = keyword.kind === 'manual';
    return `<div class="editable-keyword" data-keyword="${esc(keyword.id)}">
      <label class="keyword-choice"><input type="checkbox" data-select="${esc(keyword.id)}" ${selected.has(keyword.id) ? 'checked' : ''}><span>${esc(keyword.term)} <small>${manual ? '人工补词 · 未核实线索' : '材料原词'}</small></span></label>
      ${manual ? `<p class="field-description">补词说明：${esc(keyword.meaning || '未提供')} · 无材料引用</p>` : `<p class="field-description">原 AI 解释：${esc(keyword.meaning)} · <a class="source-ref" href="#source-${esc(keyword.source_id)}">${esc(keyword.source_id)}</a></p>`}
      <p class="saved-correction" ${keyword.correction ? '' : 'hidden'}>已保存修正：<span>${esc(keyword.correction)}</span></p>
      <details class="correction-editor"><summary>修正词义${icon('chevron')}</summary>
        <form data-correction="${esc(keyword.id)}"><label for="correction-${esc(keyword.id)}">你的修正解释</label><textarea id="correction-${esc(keyword.id)}" rows="2" maxlength="1000" placeholder="只修正解释，保留原词与原文；留空保存可撤销修正。">${esc(keyword.draft)}</textarea><button class="secondary" type="submit">保存词义修正</button></form>
      </details>
    </div>`;
  }

  root.innerHTML = `<div class="section-heading"><h2 id="recommendation-heading">从关键词到选题</h2><span class="badge neutral">模拟推荐</span></div>
    <p class="field-description">先确认含义，再决定创作方向。修改和补词不会触发推荐；原词与引用保留在上方研究卡。</p>
    <div id="keyword-editor">${keywords.map(keywordView).join('')}</div>
    <details class="supplement"><summary>${icon('plus')}添加人工补词${icon('chevron')}</summary>
      <form id="supplement-form"><label for="supplement-term">创作关键词</label><input id="supplement-term" maxlength="100" required placeholder="输入一个创作线索">
        <label for="supplement-meaning">补词说明 <span class="optional">可选</span></label><textarea id="supplement-meaning" rows="2" maxlength="1000" placeholder="它在这里是什么意思？"></textarea>
        <button class="secondary" type="submit">添加补词</button><p class="field-description">添加后默认不选中；人工补词不等于材料原词或已核实事实。</p></form>
    </details>
    <p id="keyword-feedback" class="edit-feedback" role="status" aria-live="polite"></p>
    <div class="recommendation-actions">
      <button id="direct-recommend" class="primary" type="button">${icon('arrow')}直接推荐</button>
      <p class="field-description">模拟 AI 从材料原词中选取角度，采用已保存修正。</p>
      <details id="manual-recommend"><summary>我来挑关键词 <span id="selection-count" class="count">已选 0 个</span>${icon('chevron')}</summary><p class="field-description">勾选上方关键词后，仅围绕本轮所选词推荐；可分别成题，无需全部组合。</p><button id="selected-recommend" class="secondary" type="button" disabled>使用本轮选词推荐</button></details>
      <label class="keyword-choice demo-option"><input id="empty-demo" type="checkbox"><span>演示零候选 <small>只控制本次模拟响应</small></span></label>
      <label for="recommendation-demo">推荐演示场景</label><select id="recommendation-demo"><option value="normal">正常推荐</option><option value="model_failure">模型失败</option><option value="budget">预算拦截</option></select>
    </div>
    <div id="recommendation-feedback" role="status" aria-live="polite"></div>
    <div id="recommendation-result"><p class="recommendation-idle">尚未推荐。研究和关键词已就绪，等待你点击。</p></div>`;
  root.hidden = false;
  const rounds = mountRounds(root.querySelector('#recommendation-result'), { regenerate: recommend, updateContract });

  const feedback = (message) => { root.querySelector('#keyword-feedback').textContent = message; };
  root.oninput = (event) => {
    const editor = event.target.closest('[data-correction]');
    if (editor) {
      keywords.find((keyword) => keyword.id === editor.dataset.correction).draft = event.target.value;
      feedback('修正尚未保存；保存后用于下一次推荐，不改写已有候选。');
    }
    event.target.setCustomValidity?.('');
  };
  root.onchange = (event) => {
    const id = event.target.dataset.select;
    if (!id) return;
    if (event.target.checked) selected.add(id); else selected.delete(id);
    mockApi.selectKeywords(research.id, [...selected]);
    updateContract();
    root.querySelector('#selection-count').textContent = `已选 ${selected.size} 个`;
    root.querySelector('#selected-recommend').disabled = !selected.size;
    feedback('本轮选词已更新，尚未触发推荐。');
  };
  root.onsubmit = (event) => {
    event.preventDefault();
    if (running) return;
    const editor = event.target.closest('[data-correction]');
    if (editor) {
      const keyword = keywords.find((item) => item.id === editor.dataset.correction);
      keyword.correction = keyword.draft.trim();
      mockApi.saveCorrection(research.id, keyword.id, keyword.correction || null);
      const saved = editor.closest('.editable-keyword').querySelector('.saved-correction');
      saved.hidden = !keyword.correction;
      saved.querySelector('span').textContent = keyword.correction;
      feedback(keyword.correction ? '词义修正已保存，将用于下一次推荐；原词、引用和原 AI 解释未改动。' : '已撤销修正，下一次推荐使用原解释。');
    } else if (event.target.id === 'supplement-form') {
      const term = root.querySelector('#supplement-term');
      if (!term.value.trim()) { term.setCustomValidity('请输入非空的创作关键词'); term.reportValidity(); return; }
      const keyword = { ...mockApi.addKeyword(research.id, { term: term.value.trim(), meaning: root.querySelector('#supplement-meaning').value.trim() }), correction: '', draft: '' };
      keywords.push(keyword);
      root.querySelector('#keyword-editor').insertAdjacentHTML('beforeend', keywordView(keyword));
      event.target.reset();
      feedback('人工补词已添加，默认未选中；勾选后才会进入人工推荐。');
      root.querySelector(`[data-select="${keyword.id}"]`).focus();
    }
    updateContract();
  };

  root.onclick = (event) => {
    const button = event.target.closest('#direct-recommend, #selected-recommend');
    if (button) recommend(button.id === 'direct-recommend' ? 'direct' : 'manual');
  };

  async function recommend(mode) {
    if (running) return;
    const chosen = keywords.filter((keyword) => mode === 'manual' ? selected.has(keyword.id) : keyword.kind !== 'manual');
    if (!chosen.length) {
      feedback('请先勾选本轮关键词，再使用人工选词方式换一批。');
      root.querySelector('#manual-recommend').open = true;
      root.querySelector('[data-select]')?.focus();
      return;
    }
    const unsaved = keywords.find((keyword) => keyword.draft.trim() !== keyword.correction);
    if (unsaved) {
      feedback('有尚未保存的词义修正。请先保存或撤销，再点击推荐。');
      const editor = root.querySelector(`[data-correction="${unsaved.id}"]`);
      editor.closest('details').open = true;
      editor.querySelector('textarea').focus();
      return;
    }
    running = true;
    setBusy(true, '模拟推荐中…');
    root.setAttribute('aria-busy', 'true');
    root.querySelectorAll('button, input, textarea, select').forEach((field) => { field.disabled = true; });
    rounds.lock(true);
    const status = root.querySelector('#recommendation-feedback');
    status.innerHTML = `<div class="progress-heading"><span class="spinner" aria-hidden="true"></span><strong>模拟推荐中…</strong></div><p class="field-description">只生成模拟选题，已有研究保留。未调用模型服务。</p>`;
    setOutputState('推荐中', 'success');
    const step = document.querySelector('#recommendation-step');
    document.querySelector('#research-step').classList.remove('current');
    document.querySelector('#research-step').classList.add('complete');
    document.querySelector('#research-step').removeAttribute('aria-current');
    step.classList.add('current');
    step.setAttribute('aria-current', 'step');
    try {
      let task = mockApi.startRecommendation(research.id, { operation_id: crypto.randomUUID(), mode, keywords: chosen.map(snapshot), demo_outcome: root.querySelector('#empty-demo').checked ? 'empty' : 'normal', demo_failure: root.querySelector('#recommendation-demo').value });
      updateContract();
      while (['queued', 'running'].includes(task.status)) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        task = mockApi.getTask(task.id);
        updateContract();
      }
      if (task.status !== 'completed') {
        status.innerHTML = `<p class="field-error" role="alert">${esc(task.error.message)} 研究、修正、历史轮次和草稿已保留。切换演示场景后，需再次明确点击推荐。</p>`;
        setOutputState(task.stage, 'error');
        return;
      }
      rounds.add(task.result);
      status.textContent = `模拟推荐完成 · ${task.result.candidates.length} 个候选 · 未执行知识核验`;
      setOutputState('推荐完成', 'success');
    } catch {
      status.innerHTML = '<p class="field-error" role="alert">模拟推荐未完成，研究、修正及已有候选已保留。请再次明确点击推荐重试。</p>';
      setOutputState('推荐失败', 'error');
    } finally {
      running = false;
      root.setAttribute('aria-busy', 'false');
      root.querySelectorAll('button, input, textarea, select').forEach((field) => { field.disabled = false; });
      root.querySelector('#selected-recommend').disabled = !selected.size;
      rounds.lock(false);
      setBusy(false);
      updateContract();
    }
  }
}
