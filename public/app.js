const $ = id => document.getElementById(id);
let overview;
let filter = 'all';
let repoFilter = null;
let selected;
let session;
let dirty = false;
let refreshing;
const el = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const allTasks = () => (overview?.repositories || []).flatMap(repo => repo.reports.map(report => ({ ...report, repository: repo })));
const needsAttention = item => !item.ok || item.task.state === 'blocked';
function render() {
  const tasks = allTasks();
  $('total').textContent = tasks.length;
  $('working').textContent = tasks.filter(item => ['working', 'review'].includes(item.task.state)).length;
  $('attention').textContent = tasks.filter(needsAttention).length;
  $('ready').textContent = tasks.filter(item => item.ok && item.task.state === 'review').length;
  $('task-count').textContent = tasks.length;
  $('mode').textContent = overview.demo ? 'SAMPLE DATA' : 'LOCALHOST';
  $('new-task').disabled = !session?.writable || !overview.repositories.length;
  $('repositories').replaceChildren();
  for (const repo of overview.repositories) {
    const button = el('button', `repo-button${repoFilter === repo.id ? ' selected' : ''}`);
    button.append(el('span', '', '◇'), el('span', '', repo.name), el('small', '', repo.reports.length));
    button.addEventListener('click', () => { repoFilter = repoFilter === repo.id ? null : repo.id; render(); });
    $('repositories').append(button);
  }
  const errors = overview.repositories.filter(repo => repo.error).map(repo => `${repo.name}: ${repo.error}`);
  $('notice').className = errors.length ? 'notice' : '';
  $('notice').textContent = errors.join(' · ');
  $('board').replaceChildren();
  const query = $('search').value.toLowerCase();
  const visible = tasks.filter(item => (!repoFilter || item.repository.id === repoFilter) && `${item.task.id} ${item.task.goal} ${item.task.agent} ${item.repository.name}`.toLowerCase().includes(query) && (filter === 'all' || (filter === 'attention' ? needsAttention(item) : filter === 'working' ? ['working', 'review'].includes(item.task.state) : item.task.state === filter)));
  for (const item of visible) {
    const card = el('button', 'task-card');
    const top = el('div', 'card-top'); top.append(el('span', 'repo-tag', item.repository.name), el('span', 'agent-tag', item.task.agent));
    const meta = el('div', 'card-meta'); meta.append(el('span', `state state-${item.task.state}`, item.task.state.toUpperCase()), el('span', '', `${item.changes.length} changed file${item.changes.length === 1 ? '' : 's'}`), el('span', `scope-status${item.ok ? '' : ' alert'}`, item.ok ? '● Within scope' : '● Review scope'));
    card.append(top, el('h3', '', item.task.goal), el('p', 'summary', item.task.summary || 'No summary yet. Record a note with Agent Lanes.'), meta, el('div', 'branch', `⑂ ${item.branch}`));
    card.addEventListener('click', () => openDetail(item));
    $('board').append(card);
  }
  if (!visible.length) { const empty = el('div', 'empty'); empty.append(el('strong', '', tasks.length ? 'No matching tasks' : 'Your next task starts here'), el('span', '', tasks.length ? 'Try another filter or search.' : session?.writable ? 'Choose New task to define its goal and allowed paths.' : 'Use Agent Lanes to start a task in a configured repository.')); $('board').append(empty); }
  $('updated').textContent = `Checked ${new Date(overview.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function openDetail(item) {
  selected = item;
  dirty = false;
  $('detail-title').textContent = item.task.id;
  $('detail-goal').textContent = item.task.goal;
  $('detail-meta').textContent = `${item.repository.name} · ${item.branch} · ${item.task.state} · agent label: ${item.task.agent}`;
  $('detail-files').replaceChildren();
  for (const file of item.changes) { const row = el('div', 'file-row'); row.append(el('span', `file-verdict${file.verdict === 'allowed' ? '' : ' alert'}`, file.verdict.toUpperCase()), el('span', '', `${file.status} ${file.path}`)); $('detail-files').append(row); }
  if (!item.changes.length) $('detail-files').append(el('p', '', 'No net file changes since the task base.'));
  if (item.conflicts.length || item.submodules.length) $('detail-files').append(el('p', '', 'Conflicts or submodules need a separate review.'));
  $('detail-next').textContent = item.task.next || 'No next step recorded.';
  $('copy-status').textContent = '';
  $('edit-task').hidden = !session?.writable;
  $('edit-state').value = item.task.state;
  $('edit-agent').value = item.task.agent;
  $('edit-summary').value = item.task.summary;
  $('edit-next').value = item.task.next;
  $('edit-status').textContent = '';
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
    render();
    if (selected && $('detail').open) {
      const item = allTasks().find(item => item.repository.id === selected.repository.id && item.task.id === selected.task.id);
      if (item && !dirty) openDetail(item);
      else if (item && item.task.updatedAt !== selected.task.updatedAt) $('edit-status').textContent = 'Task changed elsewhere. Your draft is preserved; close and reopen before saving.';
      else if (!item) { $('detail').close(); selected = undefined; }
    }
  } catch (error) { $('notice').className = 'notice'; $('notice').textContent = `Could not refresh: ${error.message}. Displayed data may be stale.`; $('updated').textContent = 'Refresh failed'; }
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
  try {
    const response = await fetch(`/api/handoff?repo=${encodeURIComponent(selected.repository.id)}&task=${encodeURIComponent(selected.task.id)}`);
    if (!response.ok) throw new Error('Could not export task.');
    await navigator.clipboard.writeText(await response.text());
    $('copy-status').textContent = 'Handoff copied.';
  } catch (error) { $('copy-status').textContent = `${error.message} Check clipboard permission.`; }
});
async function writeTask(method, data) {
  const response = await fetch('/api/tasks', { method, headers: { 'Content-Type': 'application/json', 'X-Agent-Desk-Token': session.token }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Server returned ${response.status}`);
  return result;
}
$('new-task').addEventListener('click', () => {
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
$('create-task').addEventListener('submit', async event => {
  event.preventDefault(); $('create-submit').disabled = true;
  try {
    const repository = $('create-repository').value;
    const task = await writeTask('POST', { repository, task: { id: $('create-id').value, goal: $('create-goal').value, agent: $('create-agent').value, allow: patterns('create-allow'), deny: patterns('create-deny') } });
    $('create-dialog').close(); $('create-task').reset();
    repoFilter = repository; filter = 'all'; $('search').value = '';
    for (const button of document.querySelectorAll('[data-filter]')) { const active = button.dataset.filter === 'all'; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }
    await refresh(true);
    const item = allTasks().find(item => item.repository.id === repository && item.task.id === task.id);
    if (item) openDetail(item);
  } catch (error) { $('create-status').textContent = error.message; }
  finally { $('create-submit').disabled = false; }
});
$('edit-task').addEventListener('input', () => { dirty = true; });
$('edit-task').addEventListener('submit', async event => {
  event.preventDefault(); if (!selected) return;
  $('save-task').disabled = true;
  try {
    await writeTask('PATCH', { repository: selected.repository.id, expectedUpdatedAt: selected.task.updatedAt, task: { id: selected.task.id, state: $('edit-state').value, agent: $('edit-agent').value, summary: $('edit-summary').value, next: $('edit-next').value } });
    dirty = false; await refresh(true); $('edit-status').textContent = 'Notes saved.';
  } catch (error) { $('edit-status').textContent = error.message; }
  finally { $('save-task').disabled = false; }
});
try {
  const response = await fetch('/api/session', { cache: 'no-store' });
  if (!response.ok) throw new Error('Session unavailable.');
  session = await response.json();
} catch (error) { $('notice').textContent = error.message; }
await refresh();
setInterval(() => { if (!document.hidden && $('auto-refresh').checked) refresh(); }, 10000);
