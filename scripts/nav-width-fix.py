from pathlib import Path

path = Path('src/styles.css')
text = path.read_text()
old = 'width: calc((100% - (var(--nav-padding) * 2)) / 5);'
new = 'width: calc((100% - var(--nav-padding) - var(--nav-padding)) / 5);'
assert old in text, 'nav width guard failed'
path.write_text(text.replace(old, new, 1))
print('nav width fixed')
