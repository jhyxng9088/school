from pathlib import Path

path = Path('.github/scripts/refine_orb_smooth_v150.py')
text = path.read_text()
old_import = "replace_once('src/s-hub-ai-sheet.jsx', \"        {state.mode === 'import' ? (\", \"        {!working && state.mode === 'import' ? (\")"
new_import = "replace_once('src/s-hub-ai-sheet.jsx', \"        {state.mode === 'import' ? (\\n          <section className=\\\"s-hub-ai-import\\\">\", \"        {!working && state.mode === 'import' ? (\\n          <section className=\\\"s-hub-ai-import\\\">\")"
old_result = "replace_once('src/s-hub-ai-sheet.jsx', \"        {state.mode === 'result' ? (\", \"        {!working && state.mode === 'result' ? (\")"
new_result = "replace_once('src/s-hub-ai-sheet.jsx', \"        {state.mode === 'result' ? (\\n          <section className=\\\"s-hub-ai-save-result\\\">\", \"        {!working && state.mode === 'result' ? (\\n          <section className=\\\"s-hub-ai-save-result\\\">\")"
for old, new in [(old_import, new_import), (old_result, new_result)]:
    if text.count(old) != 1:
        raise SystemExit(f'guard repair expected one source match, found {text.count(old)}')
    text = text.replace(old, new, 1)
path.write_text(text)
print('v150 guard narrowed to result sections')
