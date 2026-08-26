from pathlib import Path
import re

p = Path('src/todo-stage5-ai.jsx')
t = p.read_text()

old = "      summary: naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,"
new = "      summary: attachmentFiles.length ? withAttachmentManifest(naturalResult.summary, attachmentFiles) : naturalResult.summary || null,\n      attachment: naturalResult.attachment || null,"
if old not in t:
    raise SystemExit('Missing natural reminder summary marker')
t = t.replace(old, new, 1)

old = "    ? (attachmentFile ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)"
new = "    ? (attachmentFiles.length ? !aiResult?.title || !aiResult?.summary : !naturalResult?.title)"
if old not in t:
    raise SystemExit('Missing stale attachmentFile marker')
t = t.replace(old, new, 1)

if re.search(r'\battachmentFile\b', t):
    raise SystemExit('Stale attachmentFile identifier remains')

p.write_text(t.rstrip() + '\n')
