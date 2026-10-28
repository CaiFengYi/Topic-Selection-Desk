import { escapeHtml as esc, noticeView } from './views.js';

export async function mountLiveRecommendation(root, research, { api, setBusy, onStage }) {
  const base = `/api/research/${research.id}`;
  let state = await api(`${base}/keywords`);
  let tasks = (await api(`${base}/recommendations`)).tasks;
  let activeId = tasks.filter((t) => t.result).at(-1)?.id;
  let busy = false;
  const edits = new Map();
  const openDetails = new Map();
  function rememberDetails() {
    root.querySelectorAll('details[data-detail-key]').forEach((detail) => openDetails.set(detail.dataset.detailKey, detail.open));
  }
  function restoreDetails() {
    root.querySelectorAll('details[data-detail-key]').forEach((detail) => { detail.open = openDetails.get(detail.dataset.detailKey) || false; });
  }
  const draftKey = (round, candidate) => `${round.id}:${candidate.id}`;
  const draftValue = (candidate, round) => candidate.draft || { round_id: round.id, draft_id: candidate.id, title: candidate.title, opening: candidate.opening, status: 'pending' };

  const candidateView = (candidate, round) => {
    const draft = draftValue(candidate, round);
    const edit = edits.get(draftKey(round, candidate)) || draft;
    const fieldId = `draft-${round.id}-${round.candidates.indexOf(candidate)}`;
    return `<article class="candidate" data-candidate="${esc(candidate.id)}">
    <span class="badge ${draft.status === 'selected' ? 'success' : 'neutral'}">${{ pending: '待审核', selected: '已选用', discarded: '已放弃' }[draft.status]}</span>
    <h4>${esc(draft.title)}</h4><p class="candidate-opening">${esc(draft.opening)}</p>
    <div class="draft-actions"><button class="secondary" type="button" data-draft-status="${draft.status === 'selected' ? 'pending' : 'selected'}" data-draft-id="${esc(candidate.id)}" aria-pressed="${draft.status === 'selected'}" title="${draft.status === 'selected' ? '点击取消选用' : '选用此草稿'}">${draft.status === 'selected' ? '取消选用' : '选用此草稿'}</button><details class="draft-review" data-detail-key="review-${fieldId}"><summary>更多操作</summary>${[['discarded', '放弃此草稿'], ['pending', '恢复待审核']].map(([status, label]) => `<button class="text-button" type="button" data-draft-status="${status}" data-draft-id="${esc(candidate.id)}">${label}</button>`).join('')}</details></div>
    <details class="draft-editor" data-detail-key="editor-${fieldId}"><summary>编辑标题与开场${edits.has(draftKey(round, candidate)) ? ' · 有未保存修改' : ''}</summary><form data-draft-editor="${esc(candidate.id)}">
      <label for="${fieldId}-title">草稿标题</label><input id="${fieldId}-title" name="title" maxlength="200" required value="${esc(edit.title)}">
      <label for="${fieldId}-opening">开场</label><textarea id="${fieldId}-opening" name="opening" rows="3" maxlength="2000" required>${esc(edit.opening)}</textarea>
      <div class="draft-buttons"><button class="secondary" type="submit">保存草稿修改</button><button class="text-button" type="button" data-reset-draft="${esc(candidate.id)}">撤销未保存修改</button></div>
    </form><p class="field-description">修改后请保存；原始内容仍保留。</p><p class="field-description">原始标题：${esc(candidate.title)}<br>原始开场：${esc(candidate.opening)}</p></details>
    <details class="candidate-evidence" data-detail-key="evidence-${fieldId}"><summary>创作依据、画面与待查证事项</summary>
    <dl><div><dt>独立知识问题</dt><dd>${esc(candidate.knowledge_question)}</dd></div>
    <div><dt>所用词与出处</dt><dd>${candidate.used_keyword_ids.map((id) => {
      const k = round.keyword_snapshot.find((keyword) => keyword.id === id);
      return `${esc(k.term)} · ${k.kind === 'manual' ? '人工补词，未核实，无材料引用' : `<a class="source-ref" href="#research-${esc(research.id)}-${esc(k.source_id)}">${esc(k.source_id)}</a>`}`;
    }).join('；')}</dd></div>
    <div><dt>关联理由</dt><dd>${esc(candidate.association_reason)}</dd></div>
    <div><dt>画面方向</dt><dd><ul>${candidate.visual_direction.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></dd></div>
    <div><dt>待查证事项</dt><dd><ul>${candidate.verification_points.map((v) => `<li>${esc(v)}</li>`).join('')}</ul></dd></div></dl></details>
  </article>`;
  };

  function renderResults(remember = true) {
    if (remember) rememberDetails();
    const latest = tasks.at(-1);
    const rounds = tasks.filter((t) => t.result);
    const result = rounds.find((t) => t.id === activeId)?.result;
    const chosen = rounds.flatMap((t, i) => t.result.candidates.filter((c) => draftValue(c, t.result).status === 'selected').map((c) => ({ task: t, candidate: c, number: i + 1 })));
    root.querySelector('[data-recommendation-results]').innerHTML = `
      ${latest?.error ? noticeView(latest.error.message, 'error') : ''}
      ${tasks.some((t) => t.status === 'running') ? noticeView('推荐尚未完成，可能执行中或已中断；不会自动重试。') : ''}
      <div class="drafts-intro"><div><h3>${result ? `${result.candidates.length} 个候选草稿` : '候选草稿'}</h3><p class="field-description">可多选，选用后仍需知识核验。</p></div><button class="text-button" type="button" data-view-step="2">调整关键词</button></div>
      ${result ? `<div class="round-toolbar"><nav class="round-history" aria-label="历史推荐轮次">${rounds.map((t, i) => `<button class="secondary" type="button" data-round="${esc(t.id)}" aria-pressed="${t.id === activeId}">第 ${i + 1} 轮 · ${t.mode === 'direct' ? '直接' : '人工'} · ${t.result.candidates.length} 题</button>`).join('')}</nav>
        <div class="round-actions"><button class="secondary" type="button" data-next-batch data-recommend="${esc(result.mode)}">换一批 · 消耗额度</button></div></div>
        ${result.candidates.length ? result.candidates.map((c) => candidateView(c, result)).join('') : noticeView(`本轮没有合适候选：${result.empty_reason}`)}
        <details class="round-snapshot" data-detail-key="snapshot-${esc(result.id)}"><summary>本轮关键词快照与费用</summary>${result.keyword_snapshot.map((k) => `<p><strong>${esc(k.term)}</strong> · ${k.kind === 'manual' ? '人工补词，未核实' : '材料原词'}<br>本轮解释：${esc(k.correction || k.meaning || '未提供')}<br>原 AI 解释 / 补词说明：${esc(k.meaning || '未提供')}</p>`).join('')}${latest?.budget ? `<p>本阶段共享计账 ${esc(latest.budget.accounted_cny)} / ${esc(latest.budget.cap_cny)} 元，含预留；阶段快照，不是账单。</p>` : ''}</details>` : '<p class="recommendation-idle">尚无已完成的推荐。可返回第 2 步调整关键词后，再明确发起。</p>'}
      <details class="selected-drafts" data-detail-key="selected"><summary>已选用 ${chosen.length} 题</summary><ul>${chosen.map(({ task, candidate, number }) => `<li><button class="text-button" type="button" data-round="${esc(task.id)}">第 ${number} 轮 · ${esc(draftValue(candidate, task.result).title)}</button></li>`).join('') || '<li class="field-description">还未选用草稿，可从上方候选中挑选。</li>'}</ul></details>`;
    restoreDetails();
  }

  function render() {
    rememberDetails();
    root.innerHTML = `<div class="keyword-workspace"><div class="section-heading"><h3>创作关键词</h3><span class="badge neutral">${state.keywords.length} 个线索</span></div>
      <p class="field-description">材料原词与 AI 解释；可回查出处、修正含义。</p>
      <div class="recommendation-actions"><div><button class="primary" type="button" data-recommend="direct">直接推荐</button></div>
        <details data-detail-key="manual-mode"><summary>我来挑关键词 · <span data-selection-count>已选 ${state.keyword_ids.length} 个</span></summary>
          <p class="field-description">仅使用下方勾选的词，可分别成题。</p><button class="secondary" type="button" data-recommend="manual">使用本轮选词推荐</button></details><p class="recommendation-cost">推荐消耗模型额度，复用已有材料。</p></div>
      <div data-keyword-editor>${state.keywords.map((k) => `<div class="editable-keyword" data-keyword="${esc(k.id)}">
        <label class="keyword-choice"><input type="checkbox" data-select="${esc(k.id)}" ${state.keyword_ids.includes(k.id) ? 'checked' : ''}><span>${esc(k.term)}${k.kind === 'manual' ? '<small>人工补词 · 未核实</small>' : ''}${k.correction ? '<small class="correction-label">已修正</small>' : ''}</span></label>
        <p class="field-description ${k.correction ? 'saved-correction' : ''}">${esc(k.correction || k.meaning || '未提供解释')}</p>
        <details class="correction-editor" data-detail-key="keyword-${esc(k.id)}"><summary>出处与词义修正</summary>${k.correction ? `<p>原 AI 解释 / 补词说明：${esc(k.meaning || '未提供')}</p>` : ''}${k.kind === 'original' ? `<blockquote>${esc(k.quote)}</blockquote><p>来源：<a class="source-ref" href="#research-${esc(research.id)}-${esc(k.source_id)}">${esc(k.source_id)}</a> · 未核实</p><p>语境：${esc(({ neutral: '中性', affirmed: '肯定', denied: '否定', disputed: '存在分歧', attributed: '来源一方说法' })[k.stance] || '未注明')} · 说话者：${esc(k.speaker || '未注明')}</p><p>延伸概念（非原词）：${esc((k.concepts || []).join('、') || '无')}</p>` : ''}<form data-correction="${esc(k.id)}">
          <label for="correction-${esc(research.id)}-${esc(k.id)}">你的修正解释</label><textarea id="correction-${esc(research.id)}-${esc(k.id)}" rows="2" maxlength="1000">${esc(k.correction || '')}</textarea>
          <button class="secondary" type="submit">保存词义修正</button><p class="field-description">留空保存可撤销；不会改写已有候选。</p></form></details></div>`).join('')}</div>
      <details class="supplement" data-detail-key="supplement"><summary>添加人工补词</summary><form data-supplement>
        <label>创作关键词<input name="term" maxlength="100" required></label><label>补词说明<textarea name="meaning" rows="2" maxlength="1000"></textarea></label>
        <button class="secondary" type="submit">添加补词</button><p class="field-description">添加后默认不选中；旧补词只有勾选才进入本轮人工推荐。</p></form></details>
      <p class="field-description integrity-note">词义修正与补词免费保存；人工补词不是已核实事实。</p></div>
      <p class="edit-feedback" data-feedback role="status" aria-live="polite"></p><div data-recommendation-results></div>`;
    renderResults(false);
    lock(busy);
  }

  function lock(value) {
    if (busy !== value) setBusy(value);
    busy = value;
    root.querySelectorAll('button, input, textarea').forEach((e) => { e.disabled = value; });
    root.querySelector('[data-recommend="manual"]').disabled = value || !state.keyword_ids.length;
    root.querySelector('[data-recommend="direct"]').disabled = value || !state.keywords.some((k) => k.kind === 'original');
    const next = root.querySelector('[data-next-batch]');
    if (next) next.disabled = value || (next.dataset.recommend === 'manual' ? !state.keyword_ids.length : !state.keywords.some((k) => k.kind === 'original'));
  }
  const feedback = (message) => {
    const element = root.querySelector('[data-feedback]');
    element.textContent = message;
    element.classList.toggle('feedback-error', /失败|未完成|未保存|请先/.test(message));
  };
  const current = (id) => {
    const round = tasks.find((t) => t.id === activeId).result;
    return { round, candidate: round.candidates.find((c) => c.id === id) };
  };
  async function saveDraft(id, changes, content = false) {
    if (busy) return;
    const { round, candidate } = current(id);
    lock(true);
    try {
      candidate.draft = await api(`/api/rounds/${round.id}/drafts/${encodeURIComponent(id)}`, 'PATCH', changes);
      if (content) edits.delete(draftKey(round, candidate));
      renderResults();
      feedback('草稿已保存。选用不启动知识核验或制作。');
      root.querySelector(`[data-candidate="${CSS.escape(id)}"] ${content ? '[type="submit"]' : '[data-draft-status]'}`)?.focus({ preventScroll: true });
    } catch (error) { feedback(`草稿保存失败：${error.message}；输入保留，未自动重试。`); }
    finally { lock(false); }
  }
  root.addEventListener('input', (event) => {
    const form = event.target.closest('[data-draft-editor]');
    if (!form) return;
    const { round, candidate } = current(form.dataset.draftEditor);
    const value = { title: form.elements.title.value, opening: form.elements.opening.value };
    const draft = draftValue(candidate, round);
    if (value.title === draft.title && value.opening === draft.opening) edits.delete(draftKey(round, candidate));
    else edits.set(draftKey(round, candidate), value);
    feedback('草稿修改尚未保存；保存不消耗模型额度。');
  });
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
    if (form.matches('[data-draft-editor]')) {
      const changes = { title: form.elements.title.value.trim(), opening: form.elements.opening.value.trim() };
      if (!changes.title || !changes.opening) { feedback('草稿标题和开场不能为空。'); return; }
      saveDraft(form.dataset.draftEditor, changes, true);
    } else if (form.matches('[data-correction]')) {
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
    const reset = event.target.closest('[data-reset-draft]');
    if (reset && !busy) {
      const { round, candidate } = current(reset.dataset.resetDraft);
      edits.delete(draftKey(round, candidate));
      renderResults();
      lock(false);
      feedback('已撤销未保存修改，恢复本地已保存内容。');
      return;
    }
    const status = event.target.closest('[data-draft-status]');
    if (status) { saveDraft(status.dataset.draftId, { status: status.dataset.draftStatus }); return; }
    const round = event.target.closest('[data-round]');
    if (round && !busy) {
      activeId = round.dataset.round;
      renderResults();
      lock(false);
      root.querySelector(`[data-round="${activeId}"]`).focus();
      return;
    }
    const button = event.target.closest('[data-recommend]');
    if (!button || busy) return;
    if (edits.size) { feedback('有未保存的草稿修改，请先保存或撤销后推荐。'); return; }
    const unsaved = [...root.querySelectorAll('[data-correction]')].some((form) => form.querySelector('textarea').value.trim() !== (state.keywords.find((k) => k.id === form.dataset.correction).correction || ''));
    const supplement = root.querySelector('[data-supplement]');
    if (unsaved || supplement.elements.term.value.trim() || supplement.elements.meaning.value.trim()) { feedback('有未保存的词义修正或补词，请先保存或清空后推荐。'); return; }
    lock(true);
    onStage(3);
    feedback('正在调用模型推荐；最多三题，也可能没有合适候选。不追加检索。');
    try {
      const task = await api(`${base}/recommendations`, 'POST', { operation_id: crypto.randomUUID(), mode: button.dataset.recommend });
      tasks.push(task);
      root.dataset.hasAttempts = 'true';
      if (task.result) activeId = task.id;
      renderResults();
      feedback(task.status === 'completed' ? '推荐已保存，内容等待人工审核与知识核验。' : '操作已保存，请查看失败或受阻说明。');
    } catch (error) { feedback(`请求未完成：${error.message}；已有结果保留。重新打开热点可只读检查，不自动重试。`); }
    finally { lock(false); }
  });
  render();
  root.dataset.hasAttempts = String(tasks.length > 0);
}
