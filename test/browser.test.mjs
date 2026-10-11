import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(value), text: async () => String(value) });
const report = (id = 'fix', extra = {}) => ({
  task: { version: 1, id, goal: `Fix ${id}`, base: 'a'.repeat(40), allow: ['src/**'], deny: [], agent: 'Codex', state: 'working', summary: '', next: '', createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z', ...extra },
  branch: 'main', changes: [], conflicts: [], submodules: [], ok: true,
});
const overview = reports => ({ demo: false, writable: true, checkedAt: '2026-10-08T00:00:00.000Z', repositories: [{ id: 'repo-1', name: 'Fixture', reports }] });

// Exercise the shipped browser script and its real event handlers without adding
// a browser runtime dependency. Layout, focus trapping, and rendering still need
// the manual browser smoke check; this harness targets asynchronous ownership.
async function browser(initial = overview([report()]), { sessionUnavailable = false } = {}) {
  const elements = new Map();
  const document = { hidden: false, activeElement: null };
  class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = new Map(); this.value = ''; this.textContent = ''; this.open = false; this.disabled = false; this.checked = true; this.attributes = {}; this.classList = { toggle() {} }; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    emit(name, event = {}) { return this.listeners.get(name)?.({ preventDefault() {}, ...event }); }
    append(...children) { const empty = !this.children.length; this.children.push(...children); if (this.tagName === 'select' && empty && children[0]) this.value = children[0].value; }
    replaceChildren(...children) { this.children = []; if (this.tagName === 'select') this.value = ''; this.append(...children); }
    setAttribute(name, value) { this.attributes[name] = value; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    reset() {}
    focus() { document.activeElement = this; }
  }
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)) elements.set(match[2], new Element(match[1]));
  const filters = ['all', 'working', 'attention', 'done'].map(value => { const element = new Element('button'); element.dataset.filter = value; return element; });
  document.getElementById = id => { assert.ok(elements.has(id), `Unknown UI element ${id}`); return elements.get(id); };
  document.querySelectorAll = query => { assert.equal(query, '[data-filter]'); return filters; };
  document.createElement = tag => new Element(tag);
  let current = initial;
  let intercept;
  let interval;
  const clipboard = [];
  const calls = [];
  const context = vm.createContext({
    document, navigator: { clipboard: { writeText: async text => { clipboard.push(text); } } },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const intercepted = intercept?.(url, options);
      if (intercepted !== undefined) return intercepted;
      if (url === '/api/session') {
        if (sessionUnavailable) throw new Error('Disconnected');
        return response({ writable: true, token: 'test' });
      }
      if (url === '/api/overview') return response(current);
      if (url.startsWith('/api/templates?')) return response({ repository: new URL(url, 'http://localhost').searchParams.get('repo'), version: 1, templates: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    },
    setInterval: fn => { interval = fn; },
  });
  await vm.runInContext(`(async () => { ${source}\n})()`, context);
  return {
    get: id => elements.get(id), focused: () => document.activeElement, filters, clipboard, calls,
    data: value => { current = value; }, intercept: fn => { intercept = fn; },
    refresh: () => elements.get('refresh').emit('click'), tick: () => interval(),
    open: (index = 0) => elements.get('board').children[index].emit('click'),
  };
}

test('refresh failures remain visible while filtering cached data', async () => {
  const page = await browser();
  page.intercept(url => url === '/api/overview' ? response({}, 503) : undefined);
  await page.refresh();
  assert.match(page.get('notice').textContent, /Displayed data may be stale/);
  page.get('search').emit('input');
  assert.match(page.get('notice').textContent, /Displayed data may be stale/);
  assert.equal(page.get('updated').textContent, 'Refresh failed');
  page.intercept(undefined);
  await page.refresh();
  assert.equal(page.get('notice').textContent, '');
});

test('session failures remain visible after a successful overview and disable editing', async () => {
  const page = await browser(undefined, { sessionUnavailable: true });
  assert.match(page.get('notice').textContent, /Editing is unavailable/);
  assert.equal(page.get('new-task').disabled, true);
  page.get('search').emit('input');
  assert.match(page.get('notice').textContent, /Editing is unavailable/);
  page.open();
  assert.equal(page.get('edit-task').hidden, true);
});

test('unchanged cards keep focus and open the latest task notes', async () => {
  const page = await browser();
  const card = page.get('board').children[0];
  card.focus();
  page.data(overview([report('fix', { next: 'A newly recorded next step', updatedAt: '2026-10-08T00:01:00.000Z' })]));
  await page.refresh();
  assert.equal(page.get('board').children[0], card);
  assert.equal(page.focused(), card);
  await card.emit('click');
  assert.equal(page.get('edit-next').value, 'A newly recorded next step');
  page.get('close-detail').emit('click');
  page.data(overview([report('fix', { summary: 'Changed card content' })]));
  await page.refresh();
  assert.notEqual(page.get('board').children[0], card);
  assert.equal(page.focused(), page.get('board').children[0]);
});

test('notes typed during a pending save survive refresh and use the saved revision next time', async () => {
  const page = await browser();
  page.open();
  page.get('edit-summary').value = 'First draft';
  page.get('edit-task').emit('input');
  const pending = deferred();
  const saved = report('fix', { summary: 'First draft', updatedAt: '2026-10-08T00:01:00.000Z' });
  page.intercept((url, options) => url === '/api/tasks' && options.method === 'PATCH' ? pending.promise : undefined);
  const saving = page.get('edit-task').emit('submit');
  page.get('edit-summary').value = 'Newer unsaved draft';
  page.get('edit-task').emit('input');
  page.data(overview([saved]));
  pending.resolve(response(saved.task));
  await saving;
  assert.equal(page.get('edit-summary').value, 'Newer unsaved draft');
  assert.match(page.get('edit-status').textContent, /newer draft/);
  page.intercept((url, options) => url === '/api/tasks' ? response({ ...saved.task, summary: 'Newer unsaved draft' }) : undefined);
  await page.get('edit-task').emit('submit');
  const request = page.calls.filter(call => call.url === '/api/tasks').at(-1);
  assert.equal(JSON.parse(request.options.body).expectedUpdatedAt, saved.task.updatedAt);
});

test('a completed save cannot clear drafts or show success on a different task', async () => {
  const page = await browser(overview([report(), report('second')]));
  page.open();
  page.get('edit-summary').value = 'First task';
  page.get('edit-task').emit('input');
  const pending = deferred();
  page.intercept(url => url === '/api/tasks' ? pending.promise : undefined);
  const saving = page.get('edit-task').emit('submit');
  page.get('close-detail').emit('click');
  page.open(1);
  page.get('edit-summary').value = 'Second task draft';
  page.get('edit-task').emit('input');
  pending.resolve(response(report('fix', { summary: 'First task' }).task));
  await saving;
  assert.equal(page.get('detail-title').textContent, 'second');
  assert.equal(page.get('edit-summary').value, 'Second task draft');
  assert.equal(page.get('edit-status').textContent, '');
});

test('a delayed handoff cannot overwrite clipboard or show success for a different task', async () => {
  const page = await browser(overview([report(), report('second')]));
  page.open();
  const pending = deferred();
  page.intercept(url => url.startsWith('/api/handoff') ? pending.promise : undefined);
  const copying = page.get('copy-handoff').emit('click');
  page.get('close-detail').emit('click');
  page.open(1);
  pending.resolve(response('First task handoff'));
  await copying;
  assert.deepEqual(page.clipboard, []);
  assert.equal(page.get('copy-status').textContent, '');
});

test('new task drafts typed during creation are preserved', async () => {
  const page = await browser();
  page.get('new-task').emit('click');
  page.get('create-id').value = 'first';
  page.get('create-goal').value = 'First task';
  page.get('create-allow').value = 'src/**';
  const pending = deferred();
  page.intercept(url => url === '/api/tasks' ? pending.promise : undefined);
  const creating = page.get('create-task').emit('submit');
  page.get('create-id').value = 'second';
  page.get('create-task').emit('input');
  pending.resolve(response(report('first').task));
  await creating;
  assert.equal(page.get('create-dialog').open, true);
  assert.equal(page.get('create-id').value, 'second');
  assert.match(page.get('create-status').textContent, /newer draft is preserved/);
});

test('task disappearance does not discard an unsaved note draft', async () => {
  const page = await browser();
  page.open();
  page.get('edit-summary').value = 'Keep my draft';
  page.get('edit-task').emit('input');
  page.data(overview([]));
  await page.refresh();
  assert.equal(page.get('detail').open, true);
  assert.equal(page.get('edit-summary').value, 'Keep my draft');
  assert.match(page.get('edit-status').textContent, /no longer available/);
});

test('scope results stay fresh while a note draft is being edited', async () => {
  const page = await browser();
  page.open();
  page.get('edit-summary').value = 'Still typing';
  page.get('edit-task').emit('input');
  page.data(overview([{ ...report(), changes: [{ path: 'outside.txt', status: '?', verdict: 'outside' }], ok: false }]));
  await page.refresh();
  assert.equal(page.get('edit-summary').value, 'Still typing');
  assert.equal(page.get('detail-files').children[0].children[1].textContent, '? outside.txt');
});

test('an earlier task creation cannot close a newly reopened creation dialog', async () => {
  const page = await browser();
  page.get('new-task').emit('click');
  page.get('create-id').value = 'first';
  page.get('create-allow').value = 'src/**';
  const pending = deferred();
  page.intercept(url => url === '/api/tasks' ? pending.promise : undefined);
  const creating = page.get('create-task').emit('submit');
  page.get('close-create').emit('click');
  page.get('new-task').emit('click');
  page.get('create-id').value = 'second';
  pending.resolve(response(report('first').task));
  await creating;
  assert.equal(page.get('create-dialog').open, true);
  assert.equal(page.get('create-id').value, 'second');
  assert.equal(page.get('create-status').textContent, '');
});

test('saved scope and the full captured base are visible as literal read-only data', async () => {
  const base = 'b'.repeat(64);
  const page = await browser(overview([report('fix', { base, allow: ['src/**', '<script>.js'], deny: ['src/private/**'] })]));
  page.open();
  assert.equal(page.get('detail-base').textContent, base);
  assert.deepEqual(page.get('detail-allow').children.map(item => item.textContent), ['src/**', '<script>.js']);
  assert.equal(page.get('detail-deny').children[0].textContent, 'src/private/**');
  assert.equal(page.get('detail-allow').children[1].children.length, 0);
});

test('conflict review combines independent field edits without saving automatically', async () => {
  const page = await browser(overview([report('fix', { summary: 'Original summary', next: 'Original next' })]));
  page.open();
  page.get('edit-summary').value = 'My summary'; page.get('edit-task').emit('input');
  const latest = report('fix', { summary: 'Original summary', next: 'CLI next step', updatedAt: '2026-10-08T00:01:00.000Z' });
  page.data(overview([latest])); await page.refresh();
  assert.equal(page.get('note-conflict').hidden, false);
  assert.equal(page.get('apply-note-review').disabled, false);
  assert.equal(page.get('save-task').disabled, true);
  page.get('apply-note-review').emit('click');
  assert.equal(page.get('edit-summary').value, 'My summary');
  assert.equal(page.get('edit-next').value, 'CLI next step');
  assert.equal(page.calls.filter(call => call.url === '/api/tasks').length, 0);
  page.intercept(url => url === '/api/tasks' ? response({ ...latest.task, summary: 'My summary' }) : undefined);
  await page.get('edit-task').emit('submit');
  const saved = JSON.parse(page.calls.find(call => call.url === '/api/tasks').options.body);
  assert.equal(saved.expectedUpdatedAt, latest.task.updatedAt);
  assert.equal(saved.task.summary, 'My summary'); assert.equal(saved.task.next, 'CLI next step');
});

test('overlapping note edits require an explicit choice and repeat conflicts remain reviewable', async () => {
  const page = await browser(overview([report('fix', { summary: 'Original' })]));
  page.open(); page.get('edit-summary').value = 'Mine'; page.get('edit-task').emit('input');
  const latest = report('fix', { summary: 'CLI edit', updatedAt: '2026-10-08T00:01:00.000Z' });
  page.intercept(url => url === '/api/tasks' ? response({ error: 'Changed', currentTask: latest.task }, 409) : undefined);
  await page.get('edit-task').emit('submit');
  assert.equal(page.get('edit-summary').value, 'Mine');
  assert.equal(page.get('apply-note-review').disabled, true);
  const summary = page.get('conflict-fields').children[2];
  const mine = summary.children.filter(item => item.tagName === 'label')[1].children[0];
  mine.emit('change');
  assert.equal(page.get('apply-note-review').disabled, false);
  page.get('apply-note-review').emit('click');
  assert.equal(page.get('edit-summary').value, 'Mine');
  const again = report('fix', { summary: 'Another CLI edit', updatedAt: '2026-10-08T00:02:00.000Z' });
  page.intercept(url => url === '/api/tasks' ? response({ error: 'Changed again', currentTask: again.task }, 409) : undefined);
  await page.get('edit-task').emit('submit');
  assert.equal(page.get('note-conflict').hidden, false);
  assert.equal(page.get('apply-note-review').disabled, true);
  assert.equal(page.get('edit-summary').value, 'Mine');
  page.get('use-latest-notes').emit('click');
  assert.equal(page.get('edit-summary').value, 'Another CLI edit');
  assert.equal(page.get('note-conflict').hidden, true);
});

test('typing after conflict choices invalidates the review and late conflict responses cannot change another task', async () => {
  const page = await browser(overview([report('fix', { summary: 'Original' }), report('other')]));
  page.open(); page.get('edit-summary').value = 'Mine'; page.get('edit-task').emit('input');
  const latest = report('fix', { summary: 'CLI edit', updatedAt: '2026-10-08T00:01:00.000Z' });
  page.data(overview([latest, report('other')])); await page.refresh();
  page.get('conflict-fields').children[2].children.filter(item => item.tagName === 'label')[0].children[0].emit('change');
  assert.equal(page.get('apply-note-review').disabled, false);
  page.get('edit-summary').value = 'More typing'; page.get('edit-task').emit('input');
  assert.equal(page.get('apply-note-review').disabled, true);
  page.get('use-latest-notes').emit('click');
  const pending = deferred(); page.intercept(url => url === '/api/tasks' ? pending.promise : undefined);
  const saving = page.get('edit-task').emit('submit');
  page.get('close-detail').emit('click'); page.open(1);
  pending.resolve(response({ error: 'Changed', currentTask: latest.task }, 409)); await saving;
  assert.equal(page.get('detail-title').textContent, 'other');
  assert.equal(page.get('note-conflict').hidden, true);
});

test('templates are previewed and explicitly applied without replacing the authored goal or ID', async () => {
  const page = await browser();
  const template = { id: 'docs', name: '<Docs>', description: 'Review documentation', allow: ['docs/**', 'README.md'], deny: ['docs/private/**'] };
  page.intercept(url => url.startsWith('/api/templates?') ? response({ repository: 'repo-1', version: 1, templates: [template] }) : undefined);
  await page.get('new-task').emit('click');
  page.get('create-id').value = 'my-task'; page.get('create-goal').value = 'My goal'; page.get('create-allow').value = 'src/**';
  page.get('create-template').value = 'docs'; page.get('create-template').emit('change');
  assert.equal(page.get('template-name').textContent, '<Docs>');
  assert.equal(page.get('create-allow').value, 'src/**');
  page.get('apply-template').emit('click');
  assert.equal(page.get('create-allow').value, 'docs/**\nREADME.md');
  assert.equal(page.get('create-deny').value, 'docs/private/**');
  assert.equal(page.get('create-id').value, 'my-task'); assert.equal(page.get('create-goal').value, 'My goal');
  assert.equal(page.calls.filter(call => call.url === '/api/tasks').length, 0);
});

test('late template responses cannot replace a newer repository selection', async () => {
  const data = overview([report()]); data.repositories.push({ id: 'repo-2', name: 'Second', reports: [] });
  const page = await browser(data);
  const pending = deferred();
  page.intercept(url => url.endsWith('repo=repo-1') ? pending.promise : url.endsWith('repo=repo-2') ? response({ version: 1, templates: [{ id: 'second', name: 'Second scope', description: '', allow: ['test/**'], deny: [] }] }) : undefined);
  const opening = page.get('new-task').emit('click');
  page.get('create-repository').value = 'repo-2'; await page.get('create-repository').emit('change');
  pending.resolve(response({ version: 1, templates: [{ id: 'first', name: 'Old scope', description: '', allow: ['src/**'], deny: [] }] })); await opening;
  assert.deepEqual(page.get('create-template').children.map(item => item.textContent), ['Custom paths', 'Second scope']);
});

test('invalid templates do not prevent custom task creation', async () => {
  const page = await browser();
  page.intercept(url => url.startsWith('/api/templates?') ? response({ error: 'Invalid templates' }, 400) : undefined);
  await page.get('new-task').emit('click');
  assert.match(page.get('template-status').textContent, /still enter custom paths/);
  assert.equal(page.get('create-submit').disabled, false);
  assert.equal(page.get('create-template').disabled, true);
});

test('busy writer responses preserve newer browser drafts and allow an explicit retry', async () => {
  const page = await browser(); page.open();
  page.get('edit-summary').value = 'First draft'; page.get('edit-task').emit('input');
  const pending = deferred(); page.intercept(url => url === '/api/tasks' ? pending.promise : undefined);
  const saving = page.get('edit-task').emit('submit');
  page.get('edit-summary').value = 'Newer draft'; page.get('edit-task').emit('input');
  pending.resolve(response({ error: 'Task metadata is busy in another process. Try saving again after it finishes.' }, 423)); await saving;
  assert.equal(page.get('edit-summary').value, 'Newer draft');
  assert.match(page.get('edit-status').textContent, /Try saving again/);
  assert.equal(page.get('save-task').disabled, false);
  assert.equal(page.get('note-conflict').hidden, true);
  page.intercept(url => url === '/api/tasks' ? response(report('fix', { summary: 'Newer draft' }).task) : undefined);
  await page.get('edit-task').emit('submit');
  assert.equal(JSON.parse(page.calls.filter(call => call.url === '/api/tasks').at(-1).options.body).task.summary, 'Newer draft');
});
