// Navigation is a view of saved work; changing steps never starts an API operation.
export function createWorkflow() {
  const steps = [...document.querySelectorAll('.workflow li')];
  const labels = ['选择热点', '研究与选词', '挑选草稿'];
  const headings = ['选一个值得研究的热点', '理解语境，确认创作线索', '挑选值得继续打磨的草稿'];
  let state = { stage: 1, available: 1, busy: false, title: '', message: '从榜单选择，或输入你想研究的话题。' };
  document.querySelector('.desk').insertAdjacentHTML('afterbegin', '<section class="work-context" aria-labelledby="work-title"><div><span id="work-state" class="badge neutral"></span><h2 id="work-title"></h2><p id="work-hint" role="status" aria-live="polite"></p></div><button id="change-hotspot" class="text-button" type="button">修改热点输入</button></section>');
  steps.forEach((step, index) => {
    step.innerHTML = `<button type="button" data-workflow-step="${index + 1}"><span class="step-number">${index + 1}</span><span>${labels[index]}</span></button>`;
    step.querySelector('button').addEventListener('click', () => navigate(index + 1));
  });
  document.querySelector('#change-hotspot').addEventListener('click', () => navigate(1));

  function render() {
    document.querySelector('.workspace').dataset.stage = state.stage;
    document.querySelector('.workspace').setAttribute('aria-busy', String(state.busy));
    document.querySelectorAll('[data-research-history]').forEach((select) => { select.disabled = state.busy; });
    steps.forEach((step, index) => {
      const button = step.querySelector('button');
      step.classList.toggle('current', index + 1 === state.stage);
      step.classList.toggle('complete', index + 1 < state.available && index + 1 !== state.stage);
      step.removeAttribute('aria-current');
      if (index + 1 === state.stage) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.disabled = state.busy || index + 1 > state.available;
    });
    document.querySelector('#work-state').textContent = `当前步骤 ${state.stage} / 3 · ${labels[state.stage - 1]}${state.busy ? ' · 执行中' : ''}`;
    document.querySelector('#work-title').textContent = state.title || headings[state.stage - 1];
    document.querySelector('#work-hint').textContent = state.message;
    document.querySelector('#change-hotspot').hidden = state.stage === 1;
    document.querySelector('#change-hotspot').disabled = state.busy;
    document.querySelector('#output-heading').textContent = state.stage === 3 ? '推荐草稿' : '研究与选词';
  }
  function navigate(stage) {
    if (state.busy || stage > state.available) return;
    update({ stage, message: [
      '修改输入后，请保存或发起研究。',
      '确认关键词含义，再选择推荐方式。',
      '比较标题与开场，选出值得打磨的草稿。',
    ][stage - 1] });
    requestAnimationFrame(() => {
      document.querySelector('.work-context').scrollIntoView({ block: 'start' });
      document.querySelector('#work-title').focus({ preventScroll: true });
    });
  }
  function update(changes) { state = { ...state, ...changes }; render(); }
  document.querySelector('#work-title').tabIndex = -1;
  render();
  return { update, navigate };
}
