from pathlib import Path


def replace_once(path, old, new):
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    target.write_text(text.replace(old, new, 1))


replace_once(
    'src/main.jsx',
    '''            <span\n              className="class-presence-count"\n              aria-label={`현재 접속 ${presence.online}명, 반 인원 ${presence.total}명`}\n            >\n              {presence.online}/{presence.total}\n            </span>''',
    '''            <span\n              className={`class-presence-count ${presence.total > 0 ? 'is-ready' : ''}`}\n              aria-hidden={presence.total <= 0}\n              aria-label={presence.total > 0 ? `현재 접속 ${presence.online}명, 반 인원 ${presence.total}명` : undefined}\n            >\n              {presence.online}/{presence.total}\n            </span>''',
)

replace_once(
    'src/styles.css',
    '''.class-presence-count {\n  color: var(--text-tertiary);\n  font-size: 11px;\n  font-weight: 680;\n  line-height: 1;\n  letter-spacing: 0.045em;\n  font-variant-numeric: tabular-nums;\n  transform: translateY(-2px);\n}\n''',
    '''.class-presence-count {\n  min-width: 5ch;\n  color: var(--text-tertiary);\n  font-size: 11px;\n  font-weight: 680;\n  line-height: 1;\n  letter-spacing: 0.045em;\n  font-variant-numeric: tabular-nums;\n  opacity: 0;\n  transform: translateY(-2px);\n  transition: opacity 320ms var(--motion-soft);\n}\n\n.class-presence-count.is-ready {\n  opacity: 1;\n}\n''',
)
