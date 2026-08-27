from pathlib import Path

for name in ['src/s-hub-ai.css', 'tests/s-hub-ai-working-stage.test.js']:
    path = Path(name)
    text = path.read_text()
    path.write_text(text.rstrip() + '\n')

print('S-Hub AI generated file endings normalized')
