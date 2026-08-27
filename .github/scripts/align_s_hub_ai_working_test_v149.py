from pathlib import Path

path = Path('tests/s-hub-ai-working-stage.test.js')
text = path.read_text()
old = "assert.match(css, /\\.s-hub-ai-thinking-stage\\s*\\{[\\s\\S]*?min-height:\\s*118px;/)"
new = "assert.match(css, /\\.s-hub-ai-thinking-stage\\s*\\{[\\s\\S]*?min-height:\\s*128px;/)"
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one 118px working-stage assertion, found {count}')
path.write_text(text.replace(old, new, 1))
print('working-stage regression guard aligned')
