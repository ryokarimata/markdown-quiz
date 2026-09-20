/* Markdown Quiz — no build step or external runtime dependencies. */
const { Plugin, MarkdownRenderChild, MarkdownRenderer, Component, parseYaml } = require('obsidian');

function validateQuiz(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('question / options / answer / explanation を指定してください。');
  }
  if (typeof value.question !== 'string' || !value.question.trim()) {
    throw new Error('question に空でない問題文を指定してください。');
  }
  if (!Array.isArray(value.options) || value.options.length !== 4 ||
      value.options.some(option => typeof option !== 'string' || !option.trim())) {
    throw new Error('options には空でない文字列を4つ指定してください。数値だけの選択肢は引用符で囲みます。');
  }
  if (!Number.isInteger(value.answer) || value.answer < 1 || value.answer > 4) {
    throw new Error('answer は1〜4の整数で指定してください（先頭の選択肢は1）。');
  }
  if (typeof value.explanation !== 'string' || !value.explanation.trim()) {
    throw new Error('explanation に空でない解説を指定してください。');
  }
  return {
    question: value.question.trim(), options: value.options.map(option => option.trim()),
    answer: value.answer - 1, explanation: value.explanation.trim()
  };
}

function element(parent, tag, className, text) {
  const el = parent.ownerDocument.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

class QuizView extends MarkdownRenderChild {
  constructor(container, app, quiz, sourcePath) {
    super(container);
    this.app = app;
    this.quiz = quiz;
    this.sourcePath = sourcePath;
    this.selected = null;
    this.explanationComponent = null;
  }

  onload() {
    const { containerEl: root, quiz } = this;
    root.replaceChildren();
    root.classList.add('markdown-quiz');
    element(root, 'div', 'markdown-quiz-label', '4択問題');
    element(root, 'div', 'markdown-quiz-question', quiz.question);
    element(root, 'p', 'markdown-quiz-hint', '選択肢を1つクリックすると、その場で採点します。');
    const options = element(root, 'div', 'markdown-quiz-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', '回答の選択肢');
    this.buttons = quiz.options.map((option, index) => {
      const button = element(options, 'button', 'markdown-quiz-option');
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      element(button, 'span', 'markdown-quiz-number', String(index + 1));
      element(button, 'span', 'markdown-quiz-option-text', option);
      this.registerDomEvent(button, 'click', () => this.answer(index));
      return button;
    });
    // No answer or explanation is inserted into the DOM until an explicit answer.
    this.result = element(root, 'div', 'markdown-quiz-result');
    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    this.result.setAttribute('aria-atomic', 'true');
    this.explanation = element(root, 'div', 'markdown-quiz-explanation');
    this.explanation.hidden = true;
    this.resetButton = element(root, 'button', 'markdown-quiz-reset', 'リセット');
    this.resetButton.type = 'button';
    this.resetButton.disabled = true;
    this.registerDomEvent(this.resetButton, 'click', () => this.reset());
  }

  answer(index) {
    if (this.selected !== null) return;
    this.selected = index; // Lock synchronously before any asynchronous rendering.
    const correct = index === this.quiz.answer;
    this.buttons.forEach((button, i) => {
      button.disabled = true;
      button.setAttribute('aria-pressed', String(i === index));
      if (i === this.quiz.answer) button.classList.add('is-correct');
      if (i === index && !correct) button.classList.add('is-incorrect');
    });
    element(this.result, 'p', correct ? 'markdown-quiz-success' : 'markdown-quiz-failure',
      correct ? '○ 正解' : '× 不正解');
    element(this.result, 'p', 'markdown-quiz-selection',
      `あなたの回答：${index + 1}. ${this.quiz.options[index]}`);
    element(this.result, 'p', 'markdown-quiz-correct-answer',
      `正解：${this.quiz.answer + 1}. ${this.quiz.options[this.quiz.answer]}`);
    this.resetButton.disabled = false;
    this.explanation.hidden = false;
    element(this.explanation, 'h4', '', '解説');
    const body = element(this.explanation, 'div', 'markdown-quiz-explanation-body');
    const component = new Component();
    this.explanationComponent = component;
    this.addChild(component);
    // Each attempt gets a separate node/component. A late render cannot restore
    // an explanation that has been removed by Reset.
    try {
      Promise.resolve(MarkdownRenderer.render(this.app, this.quiz.explanation,
        body, this.sourcePath, component)).catch(() => {
        if (this.explanationComponent === component) body.textContent = this.quiz.explanation;
      });
    } catch (_) {
      body.textContent = this.quiz.explanation;
    }
  }

  reset() {
    if (this.explanationComponent) {
      this.removeChild(this.explanationComponent);
      this.explanationComponent = null;
    }
    this.selected = null;
    this.result.replaceChildren();
    this.explanation.replaceChildren();
    this.explanation.hidden = true;
    this.buttons.forEach(button => {
      button.disabled = false;
      button.classList.remove('is-correct', 'is-incorrect');
      button.setAttribute('aria-pressed', 'false');
    });
    this.resetButton.disabled = true;
    this.buttons[0].focus();
  }

  onunload() {
    this.explanationComponent = null;
    this.containerEl.replaceChildren();
    this.containerEl.classList.remove('markdown-quiz');
  }
}

const TEMPLATE = [
  '```quiz',
  'question: ソフトウェアの統合開発環境として提供されているOSSはどれか。',
  '', 'options:', '  - Apache Tomcat', '  - Eclipse', '  - GCC', '  - Linux',
  '', 'answer: 2', '', 'explanation: |',
  '  Eclipseは統合開発環境（IDE）です。', '  ',
  '  - Apache Tomcat → Webアプリケーションサーバ',
  '  - Eclipse → 統合開発環境', '  - GCC → コンパイラ', '  - Linux → OS',
  '```', ''
].join('\n');

module.exports = class MarkdownQuizPlugin extends Plugin {
  onload() {
    this.registerMarkdownCodeBlockProcessor('quiz', (source, el, ctx) => {
      let quiz;
      try {
        let data;
        try { data = parseYaml(source); }
        catch (_) { throw new Error('YAMLを読み取れません。インデント・引用符・コロンを確認してください。'); }
        quiz = validateQuiz(data);
      } catch (error) {
        el.replaceChildren();
        const message = element(el, 'div', 'markdown-quiz-error');
        message.setAttribute('role', 'alert');
        element(message, 'strong', '', '問題の記述を確認してください');
        element(message, 'p', '', error.message);
        return;
      }
      ctx.addChild(new QuizView(el, this.app, quiz, ctx.sourcePath));
    });
    this.addCommand({
      id: 'insert-quiz-template', name: '4択問題のテンプレートを挿入',
      editorCallback: editor => editor.replaceSelection(TEMPLATE)
    });
  }
};
