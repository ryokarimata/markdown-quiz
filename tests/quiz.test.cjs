const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const YAML = require('yaml');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const sample = fs.readFileSync(path.join(__dirname, '..', 'サンプル問題.md'), 'utf8').replace(/\r\n/g, '\n');
const blocks = [...sample.matchAll(/```quiz\n([\s\S]*?)```/g)].map(match => match[1]);

function harness(render) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const calls = [];
  class Component {
    constructor() { this.children = []; this.cleanups = []; }
    addChild(child) { this.children.push(child); child.onload?.(); return child; }
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.unload(); return child; }
    registerDomEvent(el, event, handler) {
      el.addEventListener(event, handler);
      this.cleanups.push(() => el.removeEventListener(event, handler));
    }
    unload() {
      this.children.forEach(child => child.unload());
      this.cleanups.forEach(cleanup => cleanup());
      this.onunload?.();
    }
  }
  class MarkdownRenderChild extends Component {
    constructor(el) { super(); this.containerEl = el; }
  }
  class Plugin extends Component {
    app = {};
    registerMarkdownCodeBlockProcessor(language, processor) {
      assert.equal(language, 'quiz'); this.processor = processor;
    }
    addCommand(command) { this.command = command; }
  }
  const api = {
    Plugin, Component, MarkdownRenderChild, parseYaml: YAML.parse,
    MarkdownRenderer: { render: (...args) => {
      calls.push(args);
      if (render) return render(...args);
      args[2].textContent = args[1];
      return Promise.resolve();
    } }
  };
  const sandbox = { module: { exports: {} }, require: name => {
    assert.equal(name, 'obsidian'); return api;
  } };
  vm.runInNewContext(source, sandbox);
  const plugin = new sandbox.module.exports(); plugin.onload();
  function mount(text = blocks[0]) {
    const root = dom.window.document.createElement('div');
    dom.window.document.body.append(root);
    let child;
    plugin.processor(text, root, { sourcePath: 'folder/quiz.md', addChild: value => {
      child = value; value.onload();
    } });
    return { root, get child() { return child; },
      buttons: () => [...root.querySelectorAll('.markdown-quiz-option')],
      reset: () => root.querySelector('.markdown-quiz-reset').click() };
  }
  return { mount, plugin, calls, dom };
}

test('unanswered: exactly four enabled options; no answer, explanation, or render call', () => {
  const h = harness(); const q = h.mount();
  assert.equal(q.buttons().length, 4);
  assert.ok(q.buttons().every(button => !button.disabled));
  assert.equal(q.root.querySelector('.markdown-quiz-result').textContent, '');
  assert.equal(q.root.querySelector('.markdown-quiz-explanation').textContent, '');
  assert.equal(q.root.querySelector('.markdown-quiz-explanation').hidden, true);
  assert.equal(h.calls.length, 0);
  assert.equal(q.root.querySelector('.markdown-quiz-reset').disabled, true);
});

test('wrong answer is graded immediately, correct answer precedes explanation, and selection locks', () => {
  const h = harness(); const q = h.mount(); q.buttons()[0].click();
  assert.match(q.root.textContent, /× 不正解/);
  assert.match(q.root.textContent, /正解：2\. Eclipse/);
  assert.ok(q.root.textContent.indexOf('正解：2.') < q.root.textContent.indexOf('解説'));
  assert.ok(q.buttons().every(button => button.disabled));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][3], 'folder/quiz.md');
  q.buttons()[1].click();
  // Also dispatch an event directly to verify the synchronous state guard.
  q.buttons()[1].dispatchEvent(new h.dom.window.Event('click'));
  assert.match(q.root.textContent, /× 不正解/);
  assert.equal(h.calls.length, 1);
});

test('reset fully clears feedback and permits another answer repeatedly', () => {
  const h = harness(); const q = h.mount();
  for (let attempt = 0; attempt < 3; attempt++) {
    q.buttons()[1].click();
    assert.match(q.root.textContent, /○ 正解/);
    assert.equal(q.buttons()[1].getAttribute('aria-pressed'), 'true');
    q.reset();
    assert.equal(q.root.querySelector('.markdown-quiz-result').textContent, '');
    assert.equal(q.root.querySelector('.markdown-quiz-explanation').textContent, '');
    assert.ok(q.buttons().every(button => !button.disabled && !button.classList.contains('is-correct')));
    assert.equal(q.child.children.length, 0);
    assert.equal(h.dom.window.document.activeElement, q.buttons()[0]);
  }
  q.buttons()[3].click(); assert.match(q.root.textContent, /× 不正解/);
});

test('multiple quiz blocks are independent, including quoted numeric options', () => {
  const h = harness(); const a = h.mount(); const b = h.mount(blocks[1]);
  a.buttons()[0].click();
  assert.ok(b.buttons().every(button => !button.disabled));
  b.buttons()[2].click(); assert.match(b.root.textContent, /○ 正解/);
  a.reset(); assert.ok(b.buttons().every(button => button.disabled));
});

test('invalid YAML and schema show an error and never reveal raw source', () => {
  const h = harness();
  const base = YAML.parse(blocks[0]);
  const invalid = [
    'question: [', '', '- test',
    YAML.stringify({ ...base, question: '' }),
    YAML.stringify({ ...base, options: ['a', 'b', 'c'] }),
    YAML.stringify({ ...base, options: ['a', 'b', 'c', 10] }),
    ...[0, 5, 1.5, '2'].map(answer => YAML.stringify({ ...base, answer })),
    YAML.stringify({ ...base, explanation: null })
  ];
  for (const input of invalid) {
    const q = h.mount(input);
    assert.ok(q.root.querySelector('[role="alert"]'));
    assert.equal(q.buttons().length, 0);
    assert.ok(!q.root.textContent.includes('Eclipseは'));
  }
  assert.equal(h.calls.length, 0);
});

test('reset while Markdown rendering is pending cannot restore a stale explanation', async () => {
  let finish;
  const h = harness((_app, text, body) => new Promise(resolve => {
    finish = () => { body.textContent = text; resolve(); };
  }));
  const q = h.mount(); q.buttons()[0].click(); q.reset();
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(q.root.querySelector('.markdown-quiz-explanation').textContent, '');
  assert.equal(q.root.querySelector('.markdown-quiz-explanation').hidden, true);
});

test('renderer failure falls back to text only after answering', async () => {
  const h = harness(() => Promise.reject(new Error('render failure')));
  const q = h.mount(); q.buttons()[1].click(); await new Promise(resolve => setImmediate(resolve));
  assert.match(q.root.querySelector('.markdown-quiz-explanation').textContent, /Eclipseは/);
});

test('question and option markup stays literal, and unloading removes listeners', () => {
  const h = harness(); const data = YAML.parse(blocks[0]);
  data.question = '<img src=x onerror=alert(1)>';
  data.options[0] = '<script>alert(1)</script>';
  const q = h.mount(YAML.stringify(data));
  assert.equal(q.root.querySelector('img,script'), null);
  const button = q.buttons()[0]; q.child.unload(); button.click();
  assert.equal(h.calls.length, 0);
  assert.equal(q.root.textContent, '');
});

test('template command inserts a valid complete quiz block', () => {
  const h = harness(); let inserted;
  h.plugin.command.editorCallback({ replaceSelection: text => { inserted = text; } });
  const match = inserted.match(/^```quiz\n([\s\S]*?)```\n$/);
  assert.ok(match); assert.equal(h.mount(match[1]).buttons().length, 4);
});
