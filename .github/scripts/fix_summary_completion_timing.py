from pathlib import Path

p = Path('src/todo-stage5-ai.jsx')
t = p.read_text()
old = '''    const uploadResults = await uploadResultsPromise
    if (!parsed?.summary) return
    const finalSummary = uploadResults.every(Boolean)
      ? withAttachmentManifest(parsed.summary, files)
      : parsed.summary
    try {
      await enrichTodo(todoId, {
        summary: finalSummary,
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder enrichment save failed:', error)
    }
'''
new = '''    if (!parsed?.summary) {
      await uploadResultsPromise
      return
    }

    try {
      await enrichTodo(todoId, {
        summary: parsed.summary,
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder summary save failed:', error)
      await uploadResultsPromise
      return
    }

    const uploadResults = await uploadResultsPromise
    if (!uploadResults.every(Boolean)) return
    try {
      await enrichTodo(todoId, {
        summary: withAttachmentManifest(parsed.summary, files),
        attachment: parsed.attachment || null,
      })
    } catch (error) {
      console.error('Background reminder original manifest save failed:', error)
    }
'''
if t.count(old) != 1:
    raise SystemExit(f'Expected one enrichment timing block, found {t.count(old)}')
p.write_text(t.replace(old, new, 1).rstrip() + '\n')
