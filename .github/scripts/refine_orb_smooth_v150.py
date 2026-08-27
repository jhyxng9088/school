from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text.rstrip() + '\n')

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    write(path, text.replace(old, new, 1))

# Home and working orb sizes.
replace_once('src/main.jsx', '<SHubAIOrb size={23} />', '<SHubAIOrb size={27} />')
replace_once('src/s-hub-ai-sheet.jsx', '<SHubAIOrb size={48} active />', '<SHubAIOrb size={56} active />')

# A longer completion handoff and softer working-copy fade.
replace_once('src/s-hub-ai-sheet.jsx', '}, 180)\n      }, delay)', '}, 240)\n      }, delay)')
replace_once('src/s-hub-ai-sheet.jsx', 'window.setTimeout(resolve, 240)', 'window.setTimeout(resolve, 420)')

# Results never render under the final shrinking frame.
replace_once('src/s-hub-ai-sheet.jsx', "        {state.mode === 'import' ? (", "        {!working && state.mode === 'import' ? (")
replace_once('src/s-hub-ai-sheet.jsx', "        {state.mode === 'result' ? (", "        {!working && state.mode === 'result' ? (")

# Orb motion: 60fps, quintic interpolation, longer/random motions and higher point contrast.
replace_once('src/s-hub-ai-orb.jsx', """const THINKING_MOTIONS = [
  { name: 'focus', duration: [1450, 2200], radiusScale: 0.63, speed: 0.30, tilt: 0.24, wave: 0.008, twist: 0.025, pulse: 0.012, roll: -0.04 },
  { name: 'breathe', duration: [1700, 2700], radiusScale: 0.98, speed: 0.18, tilt: 0.30, wave: 0.025, twist: 0.04, pulse: 0.035, roll: 0.03 },
  { name: 'whirl', duration: [1200, 1850], radiusScale: 0.90, speed: 1.18, tilt: 0.40, wave: 0.018, twist: 0.23, pulse: 0.012, roll: 0.16 },
  { name: 'ripple', duration: [1550, 2350], radiusScale: 0.96, speed: 0.31, tilt: 0.33, wave: 0.11, twist: 0.08, pulse: 0.018, roll: -0.08 },
  { name: 'drift', duration: [1900, 2900], radiusScale: 1.02, speed: 0.12, tilt: 0.50, wave: 0.032, twist: 0.10, pulse: 0.020, roll: 0.22 },
  { name: 'bloom', duration: [1350, 2100], radiusScale: 1.08, speed: 0.39, tilt: 0.19, wave: 0.065, twist: 0.12, pulse: 0.028, roll: -0.15 },
  { name: 'scan', duration: [1450, 2250], radiusScale: 0.94, speed: 0.52, tilt: 0.56, wave: 0.022, twist: 0.28, pulse: 0.010, roll: 0.06 },
]
""", """const THINKING_MOTIONS = [
  { name: 'focus', duration: [1900, 2800], radiusScale: 0.63, speed: 0.26, tilt: 0.24, wave: 0.008, twist: 0.025, pulse: 0.012, roll: -0.04 },
  { name: 'breathe', duration: [2300, 3400], radiusScale: 0.98, speed: 0.17, tilt: 0.30, wave: 0.025, twist: 0.04, pulse: 0.035, roll: 0.03 },
  { name: 'whirl', duration: [1700, 2400], radiusScale: 0.90, speed: 0.95, tilt: 0.40, wave: 0.018, twist: 0.23, pulse: 0.012, roll: 0.16 },
  { name: 'ripple', duration: [2100, 3000], radiusScale: 0.96, speed: 0.29, tilt: 0.33, wave: 0.11, twist: 0.08, pulse: 0.018, roll: -0.08 },
  { name: 'drift', duration: [2500, 3600], radiusScale: 1.02, speed: 0.12, tilt: 0.50, wave: 0.032, twist: 0.10, pulse: 0.020, roll: 0.22 },
  { name: 'bloom', duration: [1900, 2700], radiusScale: 1.08, speed: 0.34, tilt: 0.19, wave: 0.065, twist: 0.12, pulse: 0.028, roll: -0.15 },
  { name: 'scan', duration: [2000, 2900], radiusScale: 0.94, speed: 0.47, tilt: 0.56, wave: 0.022, twist: 0.28, pulse: 0.010, roll: 0.06 },
]
""")
replace_once('src/s-hub-ai-orb.jsx', """function smoothstep(value) {
  const x = clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}
""", """function smootherstep(value) {
  const x = clamp(value, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
""")
replace_once('src/s-hub-ai-orb.jsx', 'const amount = smoothstep((time - motionStart) / Math.max(motionDuration, 1))', 'const amount = smootherstep((time - motionStart) / Math.max(motionDuration, 1))')
replace_once('src/s-hub-ai-orb.jsx', 'if (!force && time - lastDraw < 31) return', 'if (!force && time - lastDraw < 16) return')
replace_once('src/s-hub-ai-orb.jsx', 'const baseDot = Math.max(0.55, Math.min(1.08, cssSize * 0.018))', 'const baseDot = Math.max(0.62, Math.min(1.16, cssSize * 0.019))')
replace_once('src/s-hub-ai-orb.jsx', 'context.globalAlpha = 0.24 + depth * 0.7', 'context.globalAlpha = 0.36 + depth * 0.64')

# Visual contrast, stage size, finishing contraction and slower result reveal.
css = 'src/s-hub-ai.css'
replace_once(css, """.home-ai-trigger {
  width: 38px;
  height: 38px;
""", """.home-ai-trigger {
  width: 40px;
  height: 40px;
""")
replace_once(css, '  color: var(--text-secondary);\n  cursor: pointer;\n  touch-action: manipulation;\n', '  color: var(--text);\n  cursor: pointer;\n  touch-action: manipulation;\n')
replace_once(css, """.s-hub-ai-thinking-stage {
  min-height: 128px;
""", """.s-hub-ai-thinking-stage {
  min-height: 142px;
""")
replace_once(css, '  color: var(--text-secondary);\n  animation: s-hub-ai-thinking-in 360ms var(--motion-ease) both;\n', '  color: var(--text);\n  animation: s-hub-ai-thinking-in 520ms var(--motion-ease) both;\n  transition: min-height 460ms var(--motion-ease), padding 460ms var(--motion-ease), gap 460ms var(--motion-ease);\n')
replace_once(css, '  transition: opacity 180ms var(--motion-soft), transform 180ms var(--motion-soft);\n', '  transition: opacity 240ms var(--motion-soft), transform 240ms var(--motion-soft);\n')
replace_once(css, """@keyframes s-hub-ai-thinking-in {
  from { opacity: 0; transform: translate3d(0, 5px, 0) scale(0.97); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
""", """@keyframes s-hub-ai-thinking-in {
  from { opacity: 0; transform: translate3d(0, 4px, 0) scale(0.985); }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
""")
replace_once(css, """.s-hub-ai-thinking-stage .s-hub-ai-orb {
  opacity: 1;
  transform: scale(1);
  transition: opacity 240ms var(--motion-soft), transform 240ms var(--motion-soft);
}

.s-hub-ai-thinking-stage.is-finishing .s-hub-ai-orb {
  opacity: 0.34;
  transform: scale(0.72);
}
""", """.s-hub-ai-thinking-stage .s-hub-ai-orb {
  opacity: 1;
  transform: scale(1);
  transition: opacity 420ms var(--motion-soft), transform 460ms cubic-bezier(0.16, 1, 0.3, 1);
}

.s-hub-ai-thinking-stage.is-finishing {
  min-height: 48px;
  padding-top: 0;
  padding-bottom: 0;
  gap: 0;
}

.s-hub-ai-thinking-stage.is-finishing .s-hub-ai-orb {
  opacity: 0.06;
  transform: scale(0.32);
}
""")
replace_once(css, '  animation: s-hub-ai-result-reveal 380ms var(--motion-ease) both;\n', '  animation: s-hub-ai-result-reveal 560ms cubic-bezier(0.16, 1, 0.3, 1) both;\n')
replace_once(css, """  from {
    opacity: 0;
    transform: translate3d(0, 7px, 0) scale(0.992);
  }
""", """  from {
    opacity: 0;
    transform: translate3d(0, 5px, 0) scale(0.996);
  }
""")

# Service worker cache refresh and test guards.
replace_once('public/sw.js', 'school-shell-v149', 'school-shell-v150')
for path in ['tests/s-hub-ai-auth.test.js', 'tests/s-hub-ai-server-route.test.js']:
    replace_once(path, 'school-shell-v149', 'school-shell-v150')

# Existing orb identity guard now pins the higher contrast and 60fps behavior.
orb_test = 'tests/reminder-original-scroll-ai-orb.test.js'
replace_once(orb_test, "assert.match(main, /<SHubAIOrb size=\\{23\\}/)", "assert.match(main, /<SHubAIOrb size=\\{27\\}/)")
replace_once(orb_test, "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{48\\} active/)", "assert.match(sheet, /s-hub-ai-thinking-stage[\\s\\S]*?<SHubAIOrb size=\\{56\\} active/)")
replace_once(orb_test, "  assert.match(orb, /requestAnimationFrame/)\n", "  assert.match(orb, /requestAnimationFrame/)\n  assert.match(orb, /smootherstep/)\n  assert.match(orb, /time - lastDraw < 16/)\n  assert.match(orb, /context\\.globalAlpha = 0\\.36 \\+ depth \\* 0\\.64/)\n")

working_test = 'tests/s-hub-ai-working-stage.test.js'
replace_once(working_test, "assert.match(sheet, /<SHubAIOrb size=\\{48\\} active/)", "assert.match(sheet, /<SHubAIOrb size=\\{56\\} active/)")
replace_once(working_test, "assert.match(css, /\\.s-hub-ai-thinking-stage\\s*\\{[\\s\\S]*?min-height:\\s*128px;/)", "assert.match(css, /\\.s-hub-ai-thinking-stage\\s*\\{[\\s\\S]*?min-height:\\s*142px;/)")
replace_once(working_test, "assert.match(css, /transition: opacity 180ms[\\s\\S]*?transform 180ms/)", "assert.match(css, /transition: opacity 240ms[\\s\\S]*?transform 240ms/)")
replace_once(working_test, "assert.match(sheet, /window\\.setTimeout\\(resolve, 240\\)/)", "assert.match(sheet, /window\\.setTimeout\\(resolve, 420\\)/)")
replace_once(working_test, "assert.match(css, /\\.s-hub-ai-answer,[\\s\\S]*?\\.s-hub-ai-import,[\\s\\S]*?animation: s-hub-ai-result-reveal 380ms/)", "assert.match(css, /\\.s-hub-ai-answer,[\\s\\S]*?\\.s-hub-ai-import,[\\s\\S]*?animation: s-hub-ai-result-reveal 560ms/)")
replace_once(working_test, "  assert.match(css, /\\.s-hub-ai-thinking-stage\\.is-finishing \\.s-hub-ai-orb/)\n", "  assert.match(css, /\\.s-hub-ai-thinking-stage\\.is-finishing \\.s-hub-ai-orb[\\s\\S]*?scale\\(0\\.32\\)/)\n  assert.match(sheet, /!working && state\\.mode === 'import'/)\n  assert.match(sheet, /!working && state\\.mode === 'result'/)\n")

print('S-Hub AI orb v150 refinement applied')
