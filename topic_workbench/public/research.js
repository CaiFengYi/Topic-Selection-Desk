import { escapeHtml as esc, noticeView } from './views.js';

const refs = (task, ids) => ids.map((id) => `<a class="source-ref" href="#research-${esc(task.id)}-${esc(id)}">${esc(id)}</a>`).join(' ');

export function researchTasksView(tasks) {
  return `<section id="research-results" aria-label="研究记录">
    ${tasks.length > 1 ? `<label class="research-history">研究版本<select data-research-history>${tasks.map((t, i) => `<option value="${esc(t.id)}" ${i === 0 ? 'selected' : ''}>第 ${tasks.length - i} 次 · ${esc(t.stage)}</option>`).join('')}</select></label>` : ''}
    ${tasks.map((task, index) => {
      const result = task.result;
      return `<article class="research-card" data-research-task="${esc(task.id)}" ${index > 0 ? 'hidden' : ''}>
      <div class="research-overview">
        <div class="section-heading"><h3>${task.research_completed ? '事件摘要' : '研究进度'}</h3><span class="badge ${task.research_completed ? 'neutral' : 'warning'}">${task.research_completed ? '来源说法 · 未核实' : esc(task.stage)}</span></div>
        ${task.status === 'running' ? noticeView('研究尚未完成，可能仍在执行或已中断；已有材料与费用预留保留，不会自动续跑。') : ''}
        ${task.error ? noticeView(task.error.message, 'error') : ''}
        ${task.warnings.map((w) => noticeView(w)).join('')}
        ${task.status === 'needs_clarification' ? `<h4>先确认是哪件事</h4><div class="clarification-actions" role="group" aria-label="选择具体事件">${task.event_candidates.map((event) => `<button type="button" class="event-choice" data-task-event="${esc(task.id)}" data-event-id="${esc(event.id)}"><span><strong>${esc(event.label)}</strong><small>对应材料 ${esc(event.source_ids.join('、'))} · 复用材料继续提词</small></span></button>`).join('')}</div><button type="button" class="text-button" data-add-clue>补充事件线索</button>` : ''}
        ${task.selected_event ? `<p>已选择：${esc(task.selected_event.label)}</p>` : ''}
        ${result ? `<div class="background-summary">${result.background.slice(0, 1).map((b) => `<p>${esc(b.text)} ${refs(task, b.source_ids)}</p>`).join('')}</div>
          <details class="research-evidence"><summary>完整背景与来源说法 · ${result.background.length} 条</summary>
            ${result.event ? `<p class="event-identity">${esc(result.event.name)} · 材料所述时间 ${esc(result.event.time || '未知')} · ${esc(result.event.location || '地点未知')}</p>` : ''}
            ${result.event ? `<p>${esc(result.event.identity_notes.join('；'))}</p>` : ''}
            ${result.background.map((b) => `<p>${esc(b.text)} ${refs(task, b.source_ids)}<small class="attribution">${esc(({ reported: '来源报道', attributed: '来源一方说法', disputed: '存在分歧' })[b.status])} · ${esc(b.speaker || '来源报道')} · 未核实</small></p>`).join('')}
            <h4>材料链 · 不代表独立佐证</h4>${result.evidence_groups.map((g) => `<p>${esc(g.label)} ${refs(task, g.source_ids)}<br>${esc(g.basis || '')}</p>`).join('')}
          </details>
          ${result.gaps.length ? `<details class="research-gaps"><summary>研究缺口 · ${result.gaps.length} 项待确认</summary>${result.gaps.map((gap) => `<p>${esc(gap)}</p>`).join('')}</details>` : ''}
          ${!task.research_completed ? noticeView('尚无可用的研究提词结果；请查看材料或失败说明。') : ''}` : ''}
        <details class="stage-receipt"><summary>本阶段费用与执行记录</summary><p>结束：${esc(task.status === 'running' ? '尚未结束，可能执行中或已中断' : task.finished_at || '尚未结束')}</p><p>${task.budget ? `共享计账 ${esc(task.budget.accounted_cny)} / ${esc(task.budget.cap_cny)} 元（阶段快照，含预留）` : '暂无费用快照'}；费用不是账户账单。</p></details>
      </div>
      ${task.research_completed && result ? `<section class="recommendation" data-live-recommendation="${esc(task.id)}" aria-label="关键词修正与推荐">正在读取关键词与推荐记录…</section>` : ''}
      <details class="preserved-materials"><summary>研究引用材料与输入快照 · ${task.materials.length} 份</summary><p>地点线索：${esc(task.input_snapshot.location || '未提供')} · 时间线索：${esc(task.input_snapshot.event_time || '未提供')} · 关注点：${esc(task.input_snapshot.focus || '未提供')}</p>${task.materials.map((s) => `<details class="material" id="research-${esc(task.id)}-${esc(s.id)}"><summary>${esc(s.id)} · ${esc(s.title)} · ${s.kind === 'manual' ? '人工提交 · 未回查' : s.status === 'body' ? '已读正文 · 未核实' : esc(s.status)}</summary><div class="material-body"><p>来源：${esc(s.source_description || s.url || '未提供')}</p>${s.kind === 'manual' ? `<p>人工提交：${esc(s.submitted_at)} · 未读取原网页</p>` : ''}<p class="material-text">${esc(s.text || s.error || '无正文')}</p></div></details>`).join('')}</details>
    </article>`;
    }).join('')}</section>`;
}
