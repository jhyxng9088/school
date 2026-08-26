from pathlib import Path

p = Path('.github/scripts/apply_async_summary_refinement.py')
t = p.read_text()
old = '''t = replace_once(
    t,
    "      summary: attachmentFiles.length ? withAttachmentManifest(naturalResult.summary, attachmentFiles) : naturalResult.summary || null,",
    "      summary: attachmentFiles.length ? createPendingReminderSummary(attachmentFiles) : naturalResult.summary || null,",
    'manual switch pending summary',
)'''
new = '''manual_summary_old = "      summary: attachmentFiles.length ? withAttachmentManifest(naturalResult.summary, attachmentFiles) : naturalResult.summary || null,"
manual_summary_new = "      summary: attachmentFiles.length ? createPendingReminderSummary(attachmentFiles) : naturalResult.summary || null,"
if manual_summary_old not in t:
    raise SystemExit('manual switch pending summary marker missing')
t = t.replace(manual_summary_old, manual_summary_new, 1)'''
if old not in t:
    raise SystemExit('async patch marker block missing')
p.write_text(t.replace(old, new, 1).rstrip() + '\n')
