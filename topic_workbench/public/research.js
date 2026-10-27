import { escapeHtml as esc, noticeView } from './views.js';

const refs = (task, ids) => ids.map((id) => `<a class="source-ref" href="#research-${esc(task.id)}-${esc(id)}">${esc(id)}</a>`).join(' ');

export function researchTasksView(tasks) {
  return `<section id="research-results" aria-label="研究记录">${tasks.map((task) => {
    const result = task.result;
    return `<article class="research-card" data-research-task="${esc(task.id)}">
      <h3>研究卡 · ${esc(task.input_snapshot.title)}</h3>
      <p>${esc(task.stage)} · ${task.research_completed ? '研究提词已完成，等待推荐操作' : '研究提词未完成'}</p>
      <p class="field-description">本阶段结束：${esc(task.finished_at || '尚未结束，可能执行中或已中断；不会自动续跑')} · ${task.budget ? `共享计账/预留 ${esc(task.budget.accounted_cny)} / ${esc(task.budget.cap_cny)} 元（阶段快照）` : '暂无结束时预算快照'}</p>
      ${noticeView('有出处不代表事实已核实。材料链分组不裁定真假；研究后不会自动推荐。', 'neutral')}
      ${task.error ? noticeView(task.error.message, 'error') : ''}
      ${task.warnings.map((w) => noticeView(w)).join('')}
      ${task.status === 'needs_clarification' ? `<div class="clarification-actions" role="group" aria-label="选择具体事件">${task.event_candidates.map((event) => `<button type="button" class="event-choice" data-task-event="${esc(task.id)}" data-event-id="${esc(event.id)}"><span><strong>${esc(event.label)}</strong><small>对应材料 ${esc(event.source_ids.join('、'))} · 复用材料继续提词</small></span></button>`).join('')}</div><button type="button" class="text-button" data-add-clue>补充事件线索</button><p>补充线索后请明确发起研究；不会自动补查。</p>` : ''}
      ${task.selected_event ? `<p>已选择：${esc(task.selected_event.label)}</p>` : ''}
      ${result ? `${result.event ? `<h4>${esc(result.event.name)}</h4><p>材料所述时间：${esc(result.event.time || '未知')} · 地点：${esc(result.event.location || '未知')}</p><p>${esc(result.event.identity_notes.join('；'))}</p>` : ''}
      <h4>背景与来源说法</h4>${result.background.map((b) => `<p>${esc(b.text)} ${refs(task, b.source_ids)}<small class="attribution">${esc(({ reported: '来源报道', attributed: '来源一方说法', disputed: '存在分歧' })[b.status])} · ${esc(b.speaker || '来源报道')} · 未核实</small></p>`).join('')}
      <h4>关键词 · ${result.keywords.length} 个原词</h4><div class="keywords">${result.keywords.map((k) => `<section class="keyword"><div class="keyword-heading"><span class="keyword-id">${esc(k.id)}</span><h4>${esc(k.term)}</h4>${refs(task, [k.source_id])}</div><p>原 AI 解释：${esc(k.meaning)}</p><blockquote>${esc(k.quote)}</blockquote><small>语境：${esc(({ neutral: '中性', affirmed: '肯定', denied: '否定', disputed: '存在分歧', attributed: '来源一方说法' })[k.stance])} · 说话者：${esc(k.speaker || '未注明')} · 未核实</small><p>延伸概念 / 字面联想：${esc(k.concepts.join('、') || '无')}（不作为原词）</p></section>`).join('')}</div>
      <h4>材料链分组 · 不代表独立佐证或真假裁决</h4>${result.evidence_groups.map((g) => `<p>${esc(g.label)} ${refs(task, g.source_ids)}<br>${esc(g.basis || '')}</p>`).join('')}
      <h4>研究缺口</h4>${result.gaps.map((gap) => `<p class="gap">${esc(gap)}</p>`).join('') || '<p>未列出额外缺口；不代表完成事实核验。</p>'}
      <p class="stop">${result.status === 'no_usable_text' ? '无可引用材料，研究未完成。' : '提词结果已保存。推荐操作将在后续功能接入。'}</p>` : ''}
      <details class="preserved-materials"><summary>本次研究材料与输入快照 · ${task.materials.length} 份</summary><p>地点线索：${esc(task.input_snapshot.location || '未提供')} · 时间线索：${esc(task.input_snapshot.event_time || '未提供')} · 关注点：${esc(task.input_snapshot.focus || '未提供')}</p>${task.materials.map((s) => `<details class="material" id="research-${esc(task.id)}-${esc(s.id)}"><summary>${esc(s.id)} · ${esc(s.title)} · ${s.kind === 'manual' ? '人工提交 · 未回查原网页' : s.status === 'body' ? '已读正文 · 未核实' : esc(s.status)}</summary><div class="material-body"><p>来源身份：${esc(s.source_description || s.url || '未提供')}</p>${s.kind === 'manual' ? `<p>人工提交时间：${esc(s.submitted_at)} · 未读取原网页</p>` : ''}<p class="material-text">${esc(s.text || s.error || '无正文')}</p></div></details>`).join('')}</details>
    </article>`;
  }).join('')}</section>`;
}
