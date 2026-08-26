from pathlib import Path


def patch(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    assert old in text, f'{label} guard failed'
    p.write_text(text.replace(old, new, 1))


patch(
    'src/main.jsx',
    '<nav ref={navRef} className="bottom-nav" style={{ \'--active-index\': activeIndex }} aria-label="주요 메뉴">',
    '<nav ref={navRef} className="bottom-nav" style={{ \'--indicator-x\': `${activeIndex * 100}%` }} aria-label="주요 메뉴">',
    'nav indicator percentage',
)

patch(
    'src/styles.css',
    "transform: translate3d(calc(var(--active-index, 0) * 100%), 0, 0) !important;",
    "transform: translate3d(var(--indicator-x, 0%), 0, 0) !important;",
    'safe css indicator transform',
)

p = Path('src/academic-shared.css')
text = p.read_text()
assert 'Unified academic handle placement' not in text
text += r'''

/* Unified academic handle placement: same header-owned handle as Reminder/Timetable. */
body .academic-editor::before {
  display: none !important;
}

body .academic-editor .academic-editor-head {
  position: sticky !important;
  top: 0;
  z-index: 5;
}

body .academic-editor .academic-editor-head::before {
  content: "";
  position: absolute;
  top: 7px;
  left: 50%;
  width: 38px;
  height: 5px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--text-tertiary);
  opacity: 0.42;
  pointer-events: none;
}

body .academic-editor .academic-sheet-close {
  top: 20px;
}
'''
p.write_text(text)

print('UI finalizer applied')
