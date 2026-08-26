from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 marker, found {count}')
    return text.replace(old, new, 1)

jsx_path = Path('src/todo-stage5-ai.jsx')
jsx = jsx_path.read_text()
jsx = replace_once(
    jsx,
    "      {meta ? <AnimatedText as=\"small\" value={meta} delay={90} /> : null}\n",
    "",
    'remove meta from title grid',
)
jsx = replace_once(
    jsx,
    "      <div className=\"todo-row-actions\">\n        <span className=\"todo-date-text\">{dateLabel}</span>",
    "      <div className=\"todo-row-actions\">\n        {meta ? <AnimatedText as=\"span\" className=\"todo-meta-text\" value={meta} delay={90} /> : null}\n        <span className=\"todo-date-text\">{dateLabel}</span>",
    'move meta into action rail',
)
jsx_path.write_text(jsx.rstrip() + '\n')

css_path = Path('src/todo-stage5.css')
css = css_path.read_text()
marker = ".todo-stage5 .todo-date-text {\n"
if marker not in css:
    raise SystemExit('date text CSS marker missing')
meta_css = """.todo-stage5 .todo-meta-text {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: -0.015em;
  white-space: nowrap;
}

"""
css = css.replace(marker, meta_css + marker, 1)
css_path.write_text(css.rstrip() + '\n')

print('Moved reminder relative label into vertically centered action rail')
