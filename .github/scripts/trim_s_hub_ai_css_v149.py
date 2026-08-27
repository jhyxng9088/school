from pathlib import Path

path = Path('src/s-hub-ai.css')
text = path.read_text()
path.write_text(text.rstrip() + '\n')
print('S-Hub AI CSS line ending normalized')
