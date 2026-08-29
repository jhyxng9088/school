from pathlib import Path

path = Path('src/main.jsx')
text = path.read_text()

old = """function InstallGuide({ onDone }) {\n  const browser = getBrowser()\n\n  const guide = browser === 'safari'\n    ? {\n        title: 'Safari에서 홈 화면에 추가해줘',\n        steps: [\n          '더 보기(…)에서 ‘공유’를 눌러.',\n          '‘홈 화면에 추가’를 선택해.',\n          '‘웹 앱으로 열기’를 켜고 ‘추가’를 눌러.',\n        ],\n      }\n    : browser === 'samsung'\n      ? {\n          title: 'Samsung Internet에서 설치해줘',\n          steps: [\n            '주소창의 + 또는 설치 아이콘을 눌러.',\n            '없으면 메뉴에서 ‘홈 화면에 추가’를 선택해.',\n            '추가가 끝나면 아래 버튼을 눌러.',\n          ],\n        }\n      : {\n          title: '먼저 홈 화면에 추가해줘',\n          steps: [\n            '브라우저 메뉴를 열어.',\n            '‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해.',\n            '설치가 끝나면 아래 버튼을 눌러.',\n          ],\n        }\n\n  return (\n    <main className=\"onboarding-page\">\n      <section className=\"onboarding-card\">\n        <div className=\"app-mark\" aria-hidden=\"true\">S</div>\n        <p className=\"eyebrow\">School</p>\n        <h1>{guide.title}</h1>\n        <ol className=\"install-steps\">\n          {guide.steps.map((step, index) => (\n            <li key={step}>\n              <span>{index + 1}</span>\n              <p>{step}</p>\n            </li>\n          ))}\n        </ol>\n        <button className=\"primary-button\" onClick={onDone}>홈 화면에 추가했어</button>\n      </section>\n    </main>\n  )\n}\n"""

new = """function InstallGuide({ onDone, standalone }) {\n  const browser = getBrowser()\n  const ua = navigator.userAgent\n  const appleTouchDevice = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)\n  const androidDevice = /Android/i.test(ua)\n  const desktop = !appleTouchDevice && !androidDevice\n\n  const guide = desktop\n    ? browser === 'safari'\n      ? {\n          title: 'S-Hub를 웹 앱으로 추가해줘',\n          steps: [\n            'Safari 메뉴에서 ‘파일’을 열어.',\n            '‘Dock에 추가’를 선택해 S-Hub를 설치해.',\n            '설치된 S-Hub 앱을 다시 열어.',\n          ],\n        }\n      : {\n          title: 'S-Hub를 앱으로 설치해줘',\n          steps: [\n            '주소창의 설치 아이콘 또는 브라우저 메뉴를 열어.',\n            '‘앱 설치’ 또는 ‘S-Hub 설치’를 선택해.',\n            '설치된 S-Hub 앱을 다시 열어.',\n          ],\n        }\n    : browser === 'safari'\n      ? {\n          title: 'Safari에서 홈 화면에 추가해줘',\n          steps: [\n            '더 보기(…)에서 ‘공유’를 눌러.',\n            '‘홈 화면에 추가’를 선택해.',\n            '‘웹 앱으로 열기’를 켜고 ‘추가’를 눌러.',\n          ],\n        }\n      : browser === 'samsung'\n        ? {\n            title: 'Samsung Internet에서 설치해줘',\n            steps: [\n              '주소창의 + 또는 설치 아이콘을 눌러.',\n              '없으면 메뉴에서 ‘홈 화면에 추가’를 선택해.',\n              '설치된 S-Hub 앱을 다시 열어.',\n            ],\n          }\n        : {\n            title: 'S-Hub를 홈 화면에 추가해줘',\n            steps: [\n              '브라우저 메뉴 또는 설치 아이콘을 열어.',\n              '‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택해.',\n              '설치된 S-Hub 앱을 다시 열어.',\n            ],\n          }\n\n  return (\n    <main className=\"onboarding-page\">\n      <section className=\"onboarding-card\">\n        <div className=\"app-mark\" aria-hidden=\"true\">S</div>\n        <p className=\"eyebrow\">School</p>\n        <h1>{guide.title}</h1>\n        <ol className=\"install-steps\">\n          {guide.steps.map((step, index) => (\n            <li key={step}>\n              <span>{index + 1}</span>\n              <p>{step}</p>\n            </li>\n          ))}\n        </ol>\n        <button className=\"primary-button\" onClick={onDone} disabled={!standalone}>홈 화면에 추가했어</button>\n      </section>\n    </main>\n  )\n}\n"""

if old not in text:
    raise SystemExit('InstallGuide target not found')
text = text.replace(old, new, 1)

old = """  function completeInstallGuide() {\n    localStorage.setItem(INSTALL_DONE_KEY, 'true')\n    setInstallDone(true)\n  }\n"""
new = """  function completeInstallGuide() {\n    if (!isStandalone()) return\n    localStorage.setItem(INSTALL_DONE_KEY, 'true')\n    setInstallDone(true)\n  }\n"""
if old not in text:
    raise SystemExit('completeInstallGuide target not found')
text = text.replace(old, new, 1)

old = """  if (!standalone && !installDone) return <InstallGuide onDone={completeInstallGuide} />\n  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />\n"""
new = """  if (!standalone || !installDone) {\n    return <InstallGuide standalone={standalone} onDone={completeInstallGuide} />\n  }\n  if (!profile) return <StudentSetup initialName={legacyName} onSave={saveProfile} />\n"""
if old not in text:
    raise SystemExit('App gate target not found')
text = text.replace(old, new, 1)

path.write_text(text)
