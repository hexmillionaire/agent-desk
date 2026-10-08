const $ = id => document.getElementById(id);
let overview;
let filter = 'all';
let repoFilter = null;
let selected;
let session;
let dirty = false;
let refreshing;
let refreshError = '';
let sessionError = '';
let actionNotice = '';
let detailGeneration = 0;
let draftRevision = 0;
let createGeneration = 0;
let createRevision = 0;
let repositorySignature;
let boardSignature;
const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const allTasks = () => (overview?.repositories || []).flatMap(repo => repo.reports.map(report => ({ ...report, repository: repo })));
const needsAttention = item => !item.ok || item.task.state === 'blocked';
function renderNotice() {
  const errors = (overview?.repositories || []).filter(repo => repo.error).map(repo => `${repo.name}: ${repo.error}`);
  const messages = [sessionError, refreshError, actionNotice, ...errors].filter(Boolean);
  $('notice').className = messages.length ? 'notice' : '';
  $('notice').textContent = messages.join(' · ');
}
function render() {
  const tasks = allTasks();
  $('total').textContent = tasks.length;
  $('working').textContent = tasks.filter(item => ['working', 'review'].includes(item.task.state)).length;
  $('attention').textContent = tasks.filter(needsAttention).length;
  $('ready').textContent = tasks.filter(item => item.ok && item.task.state === 'review').length;
  $('task-count').textContent = tasks.length;
  $('mode').textContent = overview.demo ? 'SAMPLE DATA' : 'LOCALHOST';
  $('new-task').disabled = !session?.writable || !overview.repositories.length;
  const nextRepositorySignature = JSON.stringify([repoFilter, overview.repositories.map(repo => [repo.id, repo.name, repo.reports.length])]);
  if (repositorySignature !== nextRepositorySignature) {
    repositorySignature = nextRepositorySignature;
    const focused = document.activeElement?.dataset?.repository;
    $('repositories').replaceChildren();
    for (const repo of overview.repositories) {
      const button = el('button', `repo-button${repoFilter === repo.id ? ' selected' : ''}`);
      button.dataset.repository = repo.id;
      button.setAttribute('aria-pressed', String(repoFilter === repo.id));
      button.append(el('span', '', '◇'), el('span', '', repo.name), el('small', '', repo.reports.length));
      button.addEventListener('click', () => { repoFilter = repoFilter === repo.id ? null : repo.id; render(); });
      $('repositories').append(button);
      if (focused === repo.id) button.focus({ preventScroll: true });
    }
  }
  renderNotice();
  const query = $('search').value.toLowerCase();
  const visible = tasks.filter(item => (!repoFilter || item.repository.id === repoFilter) && `${item.task.id} ${item.task.goal} ${item.task.agent} ${item.repository.name}`.toLowerCase().includes(query) && (filter === 'all' || (filter === 'attention' ? needsAttention(item) : filter === 'working' ? ['working', 'review'].includes(item.task.state) : item.task.state === filter)));
  const nextBoardSignature = JSON.stringify([!!session?.writable, tasks.length, visible.map(item => [item.repository.id, item.repository.name, item.task.id, item.task.goal, item.task.agent, item.task.state, item.task.summary, item.changes.length, item.ok, item.branch])]);
  if (boardSignature !== nextBoardSignature) {
    boardSignature = nextBoardSignature;
    const focused = document.activeElement?.dataset?.task;
    $('board').replaceChildren();
    for (const item of visible) {
      const card = el('button', 'task-card');
      const top = el('div', 'card-top'); top.append(el('span', 'repo-tag', item.repository.name), el('span', 'agent-tag', item.task.agent));
      const meta = el('div', 'card-meta'); meta.append(el('span', `state state-${item.task.state}`, item.task.state.toUpperCase()), el('span', '', `${item.changes.length} changed file${item.changes.length === 1 ? '' : 's'}`), el('span', `scope-status${item.ok ? '' : ' alert'}`, item.ok ? '● Within scope' : '● Review scope'));
      card.append(top, el('h3', '', item.task.goal), el('p', 'summary', item.task.summary || 'No summary yet. Record a note with Agent Lanes.'), meta, el('div', 'branch', `⑂ ${item.branch}`));
      const key = `${item.repository.id}:${item.task.id}`;
      card.dataset.task = key;
      // A card can survive several audits; open the latest report, not its old closure.
      card.addEventListener('click', () => {
        const latest = allTasks().find(report => report.repository.id === item.repository.id && report.task.id === item.task.id);
        if (latest) openDetail(latest);
      });
      $('board').append(card);
      if (focused === key) card.focus({ preventScroll: true });
    }
    if (!visible.length) { const empty = el('div', 'empty'); empty.append(el('strong', '', tasks.length ? 'No matching tasks' : 'Your next task starts here'), el('span', '', tasks.length ? 'Try another filter or search.' : session?.writable ? 'Choose New task to define its goal and allowed paths.' : 'Use Agent Lanes to start a task in a configured repository.')); $('board').append(empty); }
  }
  $('updated').textContent = refreshError ? 'Refresh failed' : `Checked ${new Date(overview.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function renderDetailAudit(item) {
  $('detail-title').textContent = item.task.id;
  $('detail-goal').textContent = item.task.goal;
  $('detail-meta').textContent = `${item.repository.name} · ${item.branch} · ${item.task.state} · agent label: ${item.task.agent}`;
  $('detail-files').replaceChildren();
  for (const file of item.changes) { const row = el('div', 'file-row'); row.append(el('span', `file-verdict${file.verdict === 'allowed' ? '' : ' alert'}`, file.verdict.toUpperCase()), el('span', '', `${file.status} ${file.path}`)); $('detail-files').append(row); }
  if (!item.changes.length) $('detail-files').append(el('p', '', 'No net file changes since the task base.'));
  if (item.conflicts.length || item.submodules.length) $('detail-files').append(el('p', '', 'Conflicts or submodules need a separate review.'));
  $('detail-next').textContent = item.task.next || 'No next step recorded.';
}
function openDetail(item, { updating = false } = {}) {
  if (!updating) detailGeneration++;
  selected = item;
  dirty = false;
  renderDetailAudit(item);
  if (!updating) $('copy-status').textContent = '';
  $('edit-task').hidden = !session?.writable;
  $('edit-state').value = item.task.state;
  $('edit-agent').value = item.task.agent;
  $('edit-summary').value = item.task.summary;
  $('edit-next').value = item.task.next;
  if (!updating) $('edit-status').textContent = '';
  if (!$('detail').open) $('detail').showModal();
}
async function refresh(fresh = false) {
  if (refreshing) {
    await refreshing;
    if (fresh === true) return refresh();
    return;
  }
  let finished;
  refreshing = new Promise(resolve => { finished = resolve; });
  $('refresh').disabled = true;
  try {
    const response = await fetch('/api/overview', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    overview = await response.json();
    refreshError = '';
    render();
    if (selected && $('detail').open) {
      const item = allTasks().find(item => item.repository.id === selected.repository.id && item.task.id === selected.task.id);
      if (item && !dirty) openDetail(item, { updating: true });
      else if (item) {
        renderDetailAudit(item);
        if (item.task.updatedAt !== selected.task.updatedAt) $('edit-status').textContent = 'Task changed elsewhere. Your draft is preserved; close and reopen before saving.';
      }
      else if (!item && !dirty) { $('detail').close(); selected = undefined; }
      else if (!item) $('edit-status').textContent = 'Task is no longer available. Your draft is preserved.';
    }
  } catch (error) { refreshError = `Could not refresh: ${error.message}. Displayed data may be stale.`; renderNotice(); $('updated').textContent = 'Refresh failed'; }
  finally { $('refresh').disabled = false; finished(); refreshing = undefined; }
}
$('refresh').addEventListener('click', refresh);
$('search').addEventListener('input', () => overview && render());
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  filter = button.dataset.filter;
  for (const sibling of document.querySelectorAll('[data-filter]')) { sibling.classList.toggle('active', sibling === button); sibling.setAttribute('aria-pressed', String(sibling === button)); }
  if (overview) render();
});
$('close-detail').addEventListener('click', () => $('detail').close());
$('copy-handoff').addEventListener('click', async () => {
  if (!selected) return;
  const generation = detailGeneration;
  const item = selected;
  const active = () => $('detail').open && generation === detailGeneration;
  try {
    const response = await fetch(`/api/handoff?repo=${encodeURIComponent(item.repository.id)}&task=${encodeURIComponent(item.task.id)}`);
    if (!response.ok) throw new Error('Could not export task.');
    const text = await response.text();
    if (!active()) return;
    await navigator.clipboard.writeText(text);
    if (active()) $('copy-status').textContent = 'Handoff copied.';
  } catch (error) { if (active()) $('copy-status').textContent = `${error.message} Check clipboard permission.`; }
});
async function writeTask(method, data) {
  const response = await fetch('/api/tasks', { method, headers: { 'Content-Type': 'application/json', 'X-Agent-Desk-Token': session.token }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Server returned ${response.status}`);
  return result;
}
$('new-task').addEventListener('click', () => {
  createGeneration++;
  $('create-repository').replaceChildren();
  for (const repo of overview.repositories) {
    const option = el('option', '', repo.name); option.value = repo.id; $('create-repository').append(option);
  }
  if (repoFilter) $('create-repository').value = repoFilter;
  $('create-status').textContent = '';
  $('create-dialog').showModal();
});
$('close-create').addEventListener('click', () => $('create-dialog').close());
const patterns = id => $(id).value.split('\n').map(value => value.trim()).filter(Boolean);
$('create-task').addEventListener('input', () => { createRevision++; });
$('create-task').addEventListener('submit', async event => {
  event.preventDefault(); $('create-submit').disabled = true;
  const generation = createGeneration;
  const revision = createRevision;
  const active = () => $('create-dialog').open && generation === createGeneration;
  actionNotice = '';
  try {
    const repository = $('create-repository').value;
    const task = await writeTask('POST', { repository, task: { id: $('create-id').value, goal: $('create-goal').value, agent: $('create-agent').value, allow: patterns('create-allow'), deny: patterns('create-deny') } });
    const followCreatedTask = active() && revision === createRevision;
    if (followCreatedTask) {
      $('create-dialog').close(); $('create-task').reset();
      repoFilter = repository; filter = 'all'; $('search').value = '';
      for (const button of document.querySelectorAll('[data-filter]')) { const isAll = button.dataset.filter === 'all'; button.classList.toggle('active', isAll); button.setAttribute('aria-pressed', String(isAll)); }
    } else if (active()) $('create-status').textContent = `Task ${task.id} created. Your newer draft is preserved.`;
    await refresh(true);
    const item = allTasks().find(item => item.repository.id === repository && item.task.id === task.id);
    if (item && followCreatedTask && !$('detail').open && !$('create-dialog').open && generation === createGeneration) openDetail(item);
  } catch (error) {
    if (active()) $('create-status').textContent = error.message;
    else { actionNotice = `Could not create task: ${error.message}`; renderNotice(); }
  }
  finally { $('create-submit').disabled = false; }
});
$('edit-task').addEventListener('input', () => { dirty = true; draftRevision++; });
$('edit-task').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected) return;
  $('save-task').disabled = true;
  const generation = detailGeneration;
  const revision = draftRevision;
  const editing = selected;
  const active = () => $('detail').open && generation === detailGeneration;
  actionNotice = '';
  try {
    const saved = await writeTask('PATCH', { repository: editing.repository.id, expectedUpdatedAt: editing.task.updatedAt, task: { id: editing.task.id, state: $('edit-state').value, agent: $('edit-agent').value, summary: $('edit-summary').value, next: $('edit-next').value } });
    if (active()) {
      selected = { ...selected, task: saved };
      if (revision === draftRevision) dirty = false;
    }
    await refresh(true);
    if (active()) $('edit-status').textContent = dirty ? 'Notes saved. Your newer draft changes still need saving.' : 'Notes saved.';
  } catch (error) {
    if (active()) $('edit-status').textContent = error.message;
    else { actionNotice = `Could not save notes for ${editing.task.id}: ${error.message}`; renderNotice(); }
  }
  finally { $('save-task').disabled = false; }
});
try {
  const response = await fetch('/api/session', { cache: 'no-store' });
  if (!response.ok) throw new Error('Session unavailable.');
  session = await response.json();
} catch (error) { sessionError = `${error.message} Editing is unavailable; reload to reconnect.`; renderNotice(); }
await refresh();
setInterval(() => { if (!document.hidden && $('auto-refresh').checked) refresh(); }, 10000);
