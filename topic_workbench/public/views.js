// Render-only helpers. Escape user and material text at the HTML boundary.
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Hong_Kong',
});
const time = (value) => value ? `${dateFormatter.format(new Date(value))} +08:00` : '未知 / 未提供';
const sources = (ids) => ids.map((id) => `<a class="source-ref" href="#source-${escapeHtml(id)}" aria-label="查看材料 ${escapeHtml(id)}">${escapeHtml(id)}</a>`).join(' ');

export function hotspotView(item, selected, busy) {
  return `<button type="button" class="hotspot ${selected ? 'selected' : ''}" data-entry="${item.id}" ${busy ? 'disabled' : ''} aria-pressed="${selected}">
    <span class="rank">${String(item.rank).padStart(2, '0')}</span>
    <span><small><span class="platform-mark">${escapeHtml(item.platform)}</span>模拟排名 ${item.rank}</small>
    <strong>${escapeHtml(item.title)}</strong>
    <span class="hotspot-link">${selected ? '已带入研究表单' : '研究这个热点'}${icon(selected ? 'check' : 'arrow')}</span></span>
  </button>`;
}

function keywordView(keyword) {
  return `<section class="keyword">
    <div class="keyword-heading"><span class="keyword-id">${escapeHtml(keyword.id)}</span><h4>${escapeHtml(keyword.term)}</h4>${sources([keyword.source_id])}</div>
    <p>原 AI 解释 · ${escapeHtml(keyword.meaning)}</p><blockquote>“${escapeHtml(keyword.quote)}”</blockquote>
    <small>说话者：${escapeHtml(keyword.speaker)} · 肯定语境 · 未核实</small>
  </section>`;
}

function materialView(material) {
  const manual = material.kind === 'manual';
  const state = manual ? '人工补充 · 未回查' : material.status === 'duplicate' ? '重复内容 · 同一来源链' : '模拟已读正文';
  return `<details class="material" id="source-${escapeHtml(material.id)}">
    <summary>${icon('file')}<span class="material-info"><span class="material-title">${escapeHtml(material.id)} · ${escapeHtml(material.title)}</span><span class="material-state">${state}</span></span><svg class="icon chevron" aria-hidden="true"><use href="#i-chevron"/></svg></summary>
    <div class="material-body"><p>来源：${escapeHtml(material.source_url || material.source_description || '用户未说明')}</p>
    <p>发布时间：${time(material.published_at)}<br>读取时间：${time(material.read_at)}${material.submitted_at ? `<br>人工提交时间：${time(material.submitted_at)}` : ''}</p>
    <p class="material-text">${escapeHtml(material.text)}</p>
    <small>${manual ? '用户提供的原始文本，未访问来源、未核实。' : 'S1 与 S2 为同一虚构材料链，不能当作独立佐证。'}</small></div>
  </details>`;
}

export function researchView(result, input) {
  return `<article class="research-card">
    <div class="result-heading">${icon('file')}<span>模拟研究卡</span><span class="badge success">提词完成</span></div>
    <h3 class="result-title">${escapeHtml(result.event.title)}</h3>
    <div class="notice">${icon('info')}<p>${escapeHtml(result.warnings[0].message)} 有出处不代表事实已核实。</p></div>
    <dl class="event-meta"><div><dt>事件时间 · 用户线索</dt><dd>${escapeHtml(result.event.event_time || '未知 / 未提供')}</dd></div>
    <div><dt>榜单采集时间 · 模拟</dt><dd>${escapeHtml(input.collected_at ? time(input.collected_at) : '手动输入，无榜单采集时间')}</dd></div>
    <div><dt>地点 · 用户线索</dt><dd>${escapeHtml(result.event.location || '未提供')}</dd></div>
    <div><dt>关注点</dt><dd>${escapeHtml(input.focus || '未提供')}</dd></div></dl>
    <p class="source-clue">来源线索：${escapeHtml(input.source_url || '未提供')}（未访问）</p>
    <section class="result-section"><h3>背景与语境</h3>${result.background.map((item) => `<p class="background-text">${escapeHtml(item.text)} ${sources(item.source_ids)}<small class="attribution">来源说法 · ${escapeHtml(item.speaker)} · 未核实</small></p>`).join('')}</section>
    <section class="result-section"><h3>关键词 <span class="count">${result.keywords.length} 个原词 · 模拟提取</span></h3><div class="keywords">${result.keywords.map(keywordView).join('')}</div></section>
    <section class="result-section"><h3>研究缺口</h3><div class="gap">${icon('info')}<p>${escapeHtml(result.gaps[0])}</p></div></section>
    <section class="result-section"><h3>所用材料 <span class="count">${result.materials.length} 份 · 含重复内容</span></h3>${result.materials.map(materialView).join('')}</section>
    <div class="stop">${icon('check')}<div><strong>研究已完成，下一步由你决定。</strong><p>可在下方修正词义或挑选关键词。只有点击推荐才会生成模拟候选。</p></div></div>
  </article>`;
}

export function loadingView() {
  return `<div class="skeleton" aria-hidden="true"><div class="skeleton-line medium"></div><div class="skeleton-line short"></div>${[1, 2, 3].map(() => '<div class="skeleton-group"><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line medium"></div></div>').join('')}</div>`;
}
