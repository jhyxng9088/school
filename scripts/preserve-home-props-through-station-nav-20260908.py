from pathlib import Path

path = Path('src/preview-station-nav-patch.js')
source = path.read_text()

old = r"""  const contentReplacement = `  const content = {\n    home: (\n      <Home\n        name={name}\n"""
new = r"""  const sourceOwnedHomeProps = next.includes('onNavigate={navigateHomeSignal}')
    ? `        profile={profile}\n        onNavigate={navigateHomeSignal}\n`
    : ''

  const contentReplacement = `  const content = {\n    home: (\n      <Home\n${sourceOwnedHomeProps}        name={name}\n"""

count = source.count(old)
if count != 1:
    raise SystemExit(f'station nav Home content marker: expected exactly one match, found {count}')

path.write_text(source.replace(old, new, 1))
