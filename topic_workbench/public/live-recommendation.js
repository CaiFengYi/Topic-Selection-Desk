import { escapeHtml as esc, noticeView } from './views.js';

export async function mountLiveRecommendation(root, research, { api, setBusy }) {
  const base = `/api/research/${research.id}`;
  let state = await api(`${base}/keywords`);
  let tasks = (await api(`${base}/recommendations`)).tasks;
  let busy = false;

  const candidateView = (candidate, round) => `<article class="candidate">
    <span class="badge neutral">选题草稿 · 待审核与知识核验</span>
    <h4>${esc(candidate.title)}</h4><p class="candidate-opening">${esc(candidate.opening)}</p>
    <dl><div><dt>独立知识问题</dt><dd>${esc(candidate.knowledge_question)}</dd></div>
    <div><dt>所用词与出处</dt><dd>${candidate.used_keyword_ids.map((id) => {
      const k = round.keyword_snapshot.find((keyword) => keyword.id === id);
      return `${esc(k.term)} · ${k.kind === 'manual' ? '人工补词，未核实，无材料引用' : `<a class="source-ref" href="#research-${esc(research.id)}-${esc(k.source_id)}">${esc(k.source_id)}</a>`}`;
    }).join('；')}</dd></div>
    <div><dt>关联理由</dt><dd>${esc(candidate.association_reason)}</dd></div>
    <div><dt>画面方向</dt><dd><ul>${candidate.visual_direction.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></dd></div>
    <div><dt>待查证事项</dt><dd><ul>${candidate.verification_points.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></dd></div></dl>
  </article>`;

  function renderResults() {
    const latest = tasks.at(-1);
    const result = tasks.filter((t) => t.result).at(-1)?.result;
    root.querySelector('[data-recommendation-results]').innerHTML = `
      ${latest?.error ? noticeView(latest.error.message, 'error') : ''}
      ${latest?.status === 'running' ? noticeView('推荐尚未完成，可能执行中或已中断；不会自动重试。') : ''}
      ${latest?.budget ? `<p class="field-description">本阶段共享计账 / 预留 ${esc(latest.budget.accounted_cny)} / ${esc(latest.budget.cap_cny)} 元；应用估算，不是账户账单。</p>` : ''}
      ${result ? `<h3>已保存候选 · ${result.candidates.length} / 3 题</h3>
        ${noticeView('结构与原词引用检查通过；不表示科学内容、实验数据或事件事实已核验。请检查原物件与数字辨识度、独立知识问题和待查证事项。', 'neutral')}
        <details class="round-snapshot"><summary>本次关键词与解释快照 · ${result.mode === 'direct' ? '直接推荐' : '人工推荐'}</summary>${result.keyword_snapshot.map((k) => `<p><strong>${esc(k.term)}</strong> · ${k.kind === 'manual' ? '人工补词，未核实' : '材料原词'}<br>本轮解释：${esc(k.correction || k.meaning || '未提供')}<br>原 AI 解释 / 补词说明：${esc(k.meaning || '未提供')}</p>`).join('')}</details>
        ${result.candidates.length ? result.candidates.map((c) => candidateView(c, result)).join('') : noticeView(`本轮没有合适候选：${result.empty_reason}`)}` : '<p class="recommendation-idle">尚无已完成的推荐，等待你明确点击。</p>'}`;
  }

  function render() {
    root.innerHTML = `<div class="section-heading"><h3>从关键词到选题</h3><span class="badge neutral">真实本地接口</span></div>
      <p class="field-description">修正、补词和选词仅保存到本地。原词与引文保留在研究卡；人工解释和补词不会自动成为已核实事实。</p>
      <div data-keyword-editor>${state.keywords.map((k) => `<div class="editable-keyword" data-keyword="${esc(k.id)}">
        <label class="keyword-choice"><input type="checkbox" data-select="${esc(k.id)}" ${state.keyword_ids.includes(k.id) ? 'checked' : ''}><span>${esc(k.term)} <small>${k.kind === 'manual' ? '人工补词 · 未核实线索' : '材料原词'}</small></span></label>
        <p class="field-description">${k.kind === 'manual' ? '补词说明' : '原 AI 解释'}：${esc(k.meaning || '未提供')}</p>
        ${k.correction ? `<p class="saved-correction">已保存修正：${esc(k.correction)}</p>` : ''}
        <details class="correction-editor"><summary>修正词义</summary><form data-correction="${esc(k.id)}">
          <label for="correction-${esc(research.id)}-${esc(k.id)}">你的修正解释</label><textarea id="correction-${esc(research.id)}-${esc(k.id)}" rows="2" maxlength="1000">${esc(k.correction || '')}</textarea>
          <button class="secondary" type="submit">保存词义修正</button><p class="field-description">留空保存可撤销；不会改写已有候选。</p></form></details></div>`).join('')}</div>
      <details class="supplement"><summary>添加人工补词</summary><form data-supplement>
        <label>创作关键词<input name="term" maxlength="100" required></label><label>补词说明<textarea name="meaning" rows="2" maxlength="1000"></textarea></label>
        <button class="secondary" type="submit">添加补词</button><p class="field-description">添加后默认不选中；旧补词只有勾选才进入本轮人工推荐。</p></form></details>
      <div class="recommendation-actions"><button class="primary" type="button" data-recommend="direct">直接推荐</button>
        <p class="field-description">AI 从材料原词中选择角度，采用已保存修正；调用模型额度，只推荐、不重新检索。</p>
        <details><summary>我来挑关键词 · <span data-selection-count>已选 ${state.keyword_ids.length} 个</span></summary>
          <p class="field-description">仅使用本轮勾选，可分别成题，无需强行拼接。会消耗模型额度。</p><button class="secondary" type="button" data-recommend="manual">使用本轮选词推荐</button></details></div>
      <p class="edit-feedback" data-feedback role="status" aria-live="polite"></p><div data-recommendation-results></div>`;
    renderResults();
    lock(busy);
  }

  function lock(value) {
    if (busy !== value) setBusy(value);
    busy = value;
    root.querySelectorAll('button, input, textarea').forEach((e) => { e.disabled = value; });
    root.querySelector('[data-recommend="manual"]').disabled = value || !state.keyword_ids.length;
    root.querySelector('[data-recommend="direct"]').disabled = value || !state.keywords.some((k) => k.kind === 'original');
  }
  const feedback = (message) => { root.querySelector('[data-feedback]').textContent = message; };
  async function save(action) {
    if (busy) return;
    lock(true);
    try { state = await action(); render(); feedback('已保存到本地磁盘；未调用模型。'); }
    catch (error) { feedback(`保存失败：${error.message}；输入保留，未自动重试。`); }
    finally { lock(false); }
  }
  root.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.matches('[data-correction]')) {
      save(() => api(`${base}/keywords/${form.dataset.correction}`, 'PATCH', { correction: form.querySelector('textarea').value.trim() || null }));
    } else if (form.matches('[data-supplement]')) {
      if (!form.elements.term.value.trim()) { feedback('请输入非空关键词。'); return; }
      save(() => api(`${base}/keywords`, 'POST', { term: form.elements.term.value.trim(), meaning: form.elements.meaning.value.trim() }));
    }
  });
  root.addEventListener('change', async (event) => {
    const id = event.target.dataset.select;
    if (!id || busy) return;
    const ids = new Set(state.keyword_ids);
    if (event.target.checked) ids.add(id); else ids.delete(id);
    lock(true);
    try {
      state = await api(`${base}/selection`, 'PUT', { keyword_ids: [...ids] });
      root.querySelector('[data-selection-count]').textContent = `已选 ${state.keyword_ids.length} 个`;
      feedback('本轮选词已保存；未调用模型。');
    } catch (error) { event.target.checked = state.keyword_ids.includes(id); feedback(`选词保存失败：${error.message}`); }
    finally { lock(false); }
  });
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-recommend]');
    if (!button || busy) return;
    const unsaved = [...root.querySelectorAll('[data-correction]')].some((form) => form.querySelector('textarea').value.trim() !== (state.keywords.find((k) => k.id === form.dataset.correction).correction || ''));
    const supplement = root.querySelector('[data-supplement]');
    if (unsaved || supplement.elements.term.value.trim() || supplement.elements.meaning.value.trim()) { feedback('有未保存的词义修正或补词，请先保存或清空后推荐。'); return; }
    lock(true);
    feedback('正在调用模型推荐；最多三题，也可能没有合适候选。不追加检索。');
    try {
      const task = await api(`${base}/recommendations`, 'POST', { operation_id: crypto.randomUUID(), mode: button.dataset.recommend });
      tasks.push(task);
      renderResults();
      feedback(task.status === 'completed' ? '推荐已保存，内容等待人工审核与知识核验。' : '操作已保存，请查看失败或受阻说明。');
    } catch (error) { feedback(`请求未完成：${error.message}；已有结果保留。重新打开热点可只读检查，不自动重试。`); }
    finally { lock(false); }
  });
  render();
}
