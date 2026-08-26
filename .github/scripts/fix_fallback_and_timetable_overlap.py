from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one marker, found {count}')
    return text.replace(old, new, 1)

# 1) AI fallback order: Flash first, then Flash-Lite newest -> oldest active.
p = Path('src/firebase-ai-direct.js')
t = p.read_text()
old_models = "const TITLE_MODELS = ['gemini-3.7-flash', 'gemini-3.1-pro-preview']\nconst RECOVERY_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.7-flash']\n"
new_models = "const FALLBACK_MODELS = [\n  'gemini-3.7-flash',\n  'gemini-3.6-flash',\n  'gemini-3.5-flash-lite',\n  'gemini-3.1-flash-lite',\n  'gemini-2.5-flash-lite',\n]\nconst TITLE_MODELS = FALLBACK_MODELS\nconst RECOVERY_MODELS = FALLBACK_MODELS\n"
t = replace_once(t, old_models, new_models, 'AI fallback model list')
p.write_text(t)

# 2) Timetable date/period fields: contain Safari date control inside its grid track.
p = Path('src/timetable.css')
t = p.read_text()
marker = "body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) minmax(88px, 0.46fr) !important;\n  gap: 10px !important;\n  width: 100% !important;\n  min-width: 0 !important;\n}\n"
replacement = "body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) minmax(96px, 0.34fr) !important;\n  gap: 10px !important;\n  width: 100% !important;\n  min-width: 0 !important;\n}\n\nbody .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid > .change-field {\n  width: 100% !important;\n  min-width: 0 !important;\n  max-width: 100% !important;\n  overflow: hidden !important;\n  justify-self: stretch !important;\n}\n"
t = replace_once(t, marker, replacement, 'timetable primary grid')
old_controls = "body .unified-school-sheet.timetable-unified-sheet .change-field,\nbody .unified-school-sheet.timetable-unified-sheet .change-field input,\nbody .unified-school-sheet.timetable-unified-sheet .change-field select {\n  min-width: 0 !important;\n  max-width: 100% !important;\n  box-sizing: border-box !important;\n}\n"
new_controls = "body .unified-school-sheet.timetable-unified-sheet .change-field {\n  min-width: 0 !important;\n  max-width: 100% !important;\n  box-sizing: border-box !important;\n}\n\nbody .unified-school-sheet.timetable-unified-sheet .change-field input,\nbody .unified-school-sheet.timetable-unified-sheet .change-field select {\n  display: block !important;\n  width: 100% !important;\n  inline-size: 100% !important;\n  min-width: 0 !important;\n  min-inline-size: 0 !important;\n  max-width: 100% !important;\n  max-inline-size: 100% !important;\n  box-sizing: border-box !important;\n}\n"
t = replace_once(t, old_controls, new_controls, 'timetable field sizing')

# Keep the narrow-screen rule from undoing the fixed containment/ratio.
old_mobile = "@media (max-width: 430px) {\n  body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {\n    grid-template-columns: minmax(0, 1fr) 94px !important;\n  }\n}\n"
new_mobile = "@media (max-width: 430px) {\n  body .unified-school-sheet.timetable-unified-sheet .timetable-sheet-primary-grid {\n    grid-template-columns: minmax(0, 1fr) 96px !important;\n  }\n}\n"
t = replace_once(t, old_mobile, new_mobile, 'timetable mobile grid')
p.write_text(t)

print('fallback order and timetable field overlap patch applied')
