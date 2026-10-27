import { mockApi } from './mock-api.js';
import { escapeHtml as esc, icon } from './views.js';

// Round identity scopes every draft, including repeated candidate IDs.
export function mountRounds(root, { regenerate, updateContract }) {
  let rounds = [];
  let active = null;
  let checkpoint = null;
  let running = false;
  const edits = new Map();
  const key = (round, candidate) => `${round.id}:${candidate.id}`;
  const feedback = (message) => { root.querySelector('#draft-feedback').textContent = message; };
  const selectedDrafts = () => rounds.flatMap((round, index) => round.candidates
    .filter((candidate) => candidate.draft.selected)
    .map((candidate) => ({ round, candidate, number: index + 1 })));

  function candidateView(round, candidate, index) {
    const draft = candidate.draft;
    const edit = edits.get(key(round, candidate));
    const edited = draft.title !== candidate.title || draft.opening !== candidate.opening;
    return `<article class="candidate" data-draft="${esc(candidate.id)}">
      <div class="draft-heading"><span class="badge ${draft.selected ? 'success' : 'neutral'}">${draft.selected ? '已选用 · 待核验' : '待选用 · 待核验'}</span><span class="count">候选 ${String(index + 1).padStart(2, '0')}${edited ? ' · 已修改' : ''}</span></div>
      <h4>${esc(draft.title)}</h4><p class="candidate-opening">${esc(draft.opening)}</p>
      <div class="draft-actions"><label class="keyword-choice"><input type="checkbox" data-draft-select ${draft.selected ? 'checked' : ''}><span>选用此草稿<small>可多选，仅表示继续打磨</small></span></label><button class="secondary" type="button" data-edit>${edit ? '正在编辑' : '编辑标题与开场'}</button></div>
      ${edit ? `<form data-draft-editor><label for="draft-title-${index}">草稿标题</label><input id="draft-title-${index}" data-edit-field="title" value="${esc(edit.title)}" maxlength="200" required>
        <label for="draft-opening-${index}">开场</label><textarea id="draft-opening-${index}" data-edit-field="opening" rows="3" maxlength="2000" required>${esc(edit.opening)}</textarea>
        <p class="field-description">仅保存到当前页面；保留原始候选，不执行知识核验。</p><div class="draft-buttons"><button class="secondary" type="submit">保存草稿修改</button><button class="text-button" type="button" data-cancel>取消编辑</button></div></form>` : ''}
      <dl><div><dt>知识问题</dt><dd>${esc(candidate.knowledge_question)}</dd></div>
        <div><dt>所用词</dt><dd>${candidate.used_keyword_ids.map((id) => esc(round.keyword_snapshot.find((keyword) => keyword.id === id).term)).join('、')}</dd></div>
        <div><dt>关联理由</dt><dd>${esc(candidate.association_reason)}</dd></div>
        <div><dt>画面方向</dt><dd>${esc(candidate.visual_direction)}</dd></div>
        <div><dt>待查证点</dt><dd><ul>${candidate.verification_points.map((point) => `<li>${esc(point)}</li>`).join('')}</ul></dd></div></dl></article>`;
  }

  function render(focus) {
    if (!rounds.length) return;
    const disclosures = [...root.querySelectorAll('details[open]')].map((details) => details.className);
    const round = rounds.find((item) => item.id === active);
    const number = rounds.indexOf(round) + 1;
    const chosen = selectedDrafts();
    root.innerHTML = `<section class="candidate-results" aria-labelledby="candidates-heading">
      <div class="section-heading"><h3 id="candidates-heading" tabindex="-1">模拟选题草稿</h3><span class="badge neutral">${rounds.length} 轮 · 已选用 ${chosen.length} 题</span></div>
      <p class="field-description">固定交互示例，未分析真实事件。选用不启动知识核验、脚本或视频制作。</p>
      <nav class="round-history" aria-label="历史推荐轮次">${rounds.map((item, index) => `<button type="button" data-round="${esc(item.id)}" aria-pressed="${item.id === active}"><strong>第 ${index + 1} 轮</strong><span>${item.mode === 'direct' ? '直接推荐' : '人工选词'} · ${item.candidates.length} 题${item.candidates.some((candidate) => candidate.draft.selected) ? ' · 有选用' : ''}</span></button>`).join('')}</nav>
      <div class="round-toolbar"><div><strong>第 ${number} 轮 <span class="count">${round.mode === 'direct' ? '直接推荐' : '人工选词'} · ${round.candidates.length} / 3 题</span></strong><p class="field-description">历史轮次、编辑与选用独立保留。</p></div><button id="regenerate" class="secondary" type="button" aria-describedby="regenerate-help">${icon('retry')}换一批</button></div>
      <p id="regenerate-help" class="field-description">仅重新推荐，不重新检索。沿用当前关键词与已保存修正，使用${round.mode === 'direct' ? '直接推荐' : '人工选词'}方式。真实模式将消耗模型额度；本原型零付费调用。</p>
      <details class="round-snapshot"><summary>查看本次关键词与解释快照${icon('chevron')}</summary>${round.keyword_snapshot.map((keyword) => `<p><strong>${esc(keyword.term)}</strong> · ${keyword.kind === 'manual' ? '人工补词 · 未核实' : '材料原词'}<br>本轮解释：${esc(keyword.correction || keyword.meaning || '未提供')}${keyword.correction ? '<br>已采用保存的词义修正' : ''}</p>`).join('')}</details>
      <details class="prototype-checkpoint"><summary>模拟保存与恢复${icon('chevron')}</summary><p class="field-description">仅在当前页面内存中保存轮次、已保存的草稿编辑与选用。恢复会覆盖当前轮次和编辑（含未保存编辑）；不恢复上方关键词。刷新或切换热点后清空，不代表数据库、真实持久化或费用控制已验证。</p><div class="draft-buttons"><button id="save-checkpoint" class="secondary" type="button">模拟保存快照</button><button id="restore-checkpoint" class="secondary" type="button" ${checkpoint ? '' : 'disabled'}>恢复快照</button></div><p id="checkpoint-status" class="field-description">${checkpoint ? `已有内存快照 · ${checkpoint.rounds.length} 轮 · 已选用 ${checkpoint.selectedCount} 题` : '尚无快照，先模拟保存。'}</p></details>
      <details class="selected-drafts"><summary>已选用草稿 <span class="count">${chosen.length} 题 · 跨轮次</span>${icon('chevron')}</summary>${chosen.length ? `<ul>${chosen.map(({ round: item, candidate, number: n }) => `<li><button class="text-button" type="button" data-selected-round="${esc(item.id)}" data-selected-draft="${esc(candidate.id)}">第 ${n} 轮 · ${esc(candidate.draft.title)}</button></li>`).join('')}</ul>` : '<p class="field-description">还未选用草稿。可在任意轮次勾选多个候选。</p>'}</details>
      <p id="draft-feedback" class="edit-feedback" role="status" aria-live="polite"></p>
      ${round.candidates.length ? round.candidates.map((candidate, index) => candidateView(round, candidate, index)).join('') : `<div class="gap">${icon('info')}<div><strong>本轮没有合适候选</strong><p>${esc(round.empty_reason)}</p></div></div>`}</section>`;
    disclosures.forEach((className) => { root.querySelector(`.${className}`).open = true; });
    lock(running);
    if (focus) root.querySelector(focus)?.focus();
  }

  function lock(value) {
    running = value;
    root.querySelectorAll('button, input, textarea').forEach((field) => { field.disabled = value; });
    const restore = root.querySelector('#restore-checkpoint');
    if (restore) restore.disabled = value || !checkpoint;
  }

  function currentCandidate(target) {
    const round = rounds.find((item) => item.id === active);
    return { round, candidate: round?.candidates.find((item) => item.id === target.closest('[data-draft]')?.dataset.draft) };
  }

  root.addEventListener('input', (event) => {
    event.target.setCustomValidity?.('');
    if (!event.target.dataset.editField || running) return;
    const { round, candidate } = currentCandidate(event.target);
    edits.get(key(round, candidate))[event.target.dataset.editField] = event.target.value;
    feedback('草稿修改尚未保存；切换轮次会保留编辑中的内容。');
  });
  root.addEventListener('change', (event) => {
    if (!event.target.matches('[data-draft-select]') || running) return;
    const { round, candidate } = currentCandidate(event.target);
    candidate.draft.selected = event.target.checked;
    mockApi.saveDraft(round.id, candidate.id, { selected: candidate.draft.selected });
    render(`[data-draft="${candidate.id}"] [data-draft-select]`);
    feedback(candidate.draft.selected ? '已选用此草稿，可继续选用其他候选。未启动后续制作。' : '已取消选用此草稿，其他草稿不受影响。');
    updateContract();
  });
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-draft-editor]')) return;
    event.preventDefault();
    event.stopPropagation();
    if (running) return;
    const { round, candidate } = currentCandidate(event.target);
    const edit = edits.get(key(round, candidate));
    const empty = Object.keys(edit).find((field) => !edit[field].trim());
    if (empty) {
      const field = event.target.querySelector(`[data-edit-field="${empty}"]`);
      field.setCustomValidity('请输入非空的标题与开场');
      field.reportValidity();
      return;
    }
    Object.assign(candidate.draft, { title: edit.title.trim(), opening: edit.opening.trim() });
    mockApi.saveDraft(round.id, candidate.id, { title: candidate.draft.title, opening: candidate.draft.opening });
    edits.delete(key(round, candidate));
    render(`[data-draft="${candidate.id}"] [data-edit]`);
    feedback('草稿修改已保存到当前页面，原始候选与其他轮次保留；尚未执行知识核验。');
    updateContract();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || running) return;
    if (button.dataset.round || button.dataset.selectedRound) {
      active = button.dataset.round || button.dataset.selectedRound;
      render(button.dataset.round ? `[data-round="${active}"]` : `[data-draft="${button.dataset.selectedDraft}"] [data-draft-select]`);
      feedback('已切换轮次，保留各轮编辑与选用；未发起推荐。');
    } else if (button.id === 'regenerate') {
      regenerate(rounds.find((item) => item.id === active).mode);
    } else if (button.id === 'save-checkpoint') {
      checkpoint = { rounds: structuredClone(rounds), active, selectedCount: selectedDrafts().length };
      render('#save-checkpoint');
      root.querySelector('.prototype-checkpoint').open = true;
      root.querySelector('#save-checkpoint').focus();
      feedback('模拟快照已保存在页面内存，仅含已保存编辑；刷新后丢失，未写入数据库。');
    } else if (button.id === 'restore-checkpoint' && checkpoint) {
      rounds = structuredClone(checkpoint.rounds);
      active = checkpoint.active;
      edits.clear();
      render();
      root.querySelector('.prototype-checkpoint').open = true;
      root.querySelector('#restore-checkpoint').focus();
      feedback('已恢复内存快照中的轮次、编辑与选用；上方关键词未回退。未发起检索或模型调用。');
    } else if (button.matches('[data-edit], [data-cancel]')) {
      const { round, candidate } = currentCandidate(button);
      if (button.hasAttribute('data-cancel')) edits.delete(key(round, candidate));
      else if (!edits.has(key(round, candidate))) edits.set(key(round, candidate), { title: candidate.draft.title, opening: candidate.draft.opening });
      render(`[data-draft="${candidate.id}"] ${button.hasAttribute('data-cancel') ? '[data-edit]' : '[data-edit-field="title"]'}`);
      if (button.hasAttribute('data-cancel')) feedback('已取消未保存的编辑，保留上次保存的内容。');
    }
  });

  return {
    add(round) {
      const saved = structuredClone(round);
      saved.candidates.forEach((candidate) => { candidate.draft = { title: candidate.title, opening: candidate.opening, selected: false }; });
      rounds.push(saved);
      active = saved.id;
      render('#candidates-heading');
    },
    lock,
  };
}
