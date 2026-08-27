from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'src/s-hub-ai.js',
    """const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
}
""",
    """const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
  },
  required: ['answer'],
}

const ATTACHMENT_HYBRID_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    items: NOTICE_SCHEMA.properties.items,
  },
  required: ['answer', 'items'],
}
""",
)
replace_once(
    'src/s-hub-ai.js',
    "export async function askSchoolHubWithAttachments({ question = '', files = [], context = {}, now = new Date(), signal = null } = {}) {",
    "export async function answerAndAnalyzeSchoolAttachments({ question = '', files = [], context = {}, now = new Date(), signal = null } = {}) {",
)
replace_once(
    'src/s-hub-ai.js',
    """답변 규칙:
- 학생 질문의 의도를 최우선으로 따른다. 일정 후보를 추출하거나 저장 화면용 JSON을 만들지 말고 자연어 답변만 한다.
- 첨부와 SCHOOL_DATA에서 확인할 수 있는 사실만 사용하고, 없는 날짜·과제·준비물·시험을 추측하지 마라.
- 질문이 '오늘 할 일', '오늘 해야 할 것' 같은 요청이면 현재 날짜를 기준으로 오늘 제출·수행·준비·시험·해야 할 일로 확인되는 내용을 짧고 읽기 쉽게 정리한다.
- 첨부와 기존 S-Hub 데이터가 서로 다르면 임의로 하나를 고르지 말고 차이가 있다고 알려라.
- 필요한 정보가 없으면 무엇을 확인할 수 없는지 분명하게 말한다.
- 어떤 데이터도 자동 저장하거나 변경하지 않는다.

SCHOOL_DATA:
${compactJSON(context)}`

    const generated = await generateSchoolStructured({
      prompt,
      attachments,
      responseSchema: QUESTION_SCHEMA,
      maxOutputTokens: 1400,
""",
    """처리 규칙:
- 학생 질문의 의도를 최우선으로 따라 answer에 자연어로 직접 답한다.
- 동시에 첨부에서 실제로 등록할 가치가 있는 학교 정보가 보이면 items에도 최대 10개 추출한다.
- answer와 items는 서로 배타적이지 않다. 질문에 답한 뒤 등록 가능한 일정도 놓치지 마라.
- 첨부와 SCHOOL_DATA에서 확인할 수 있는 사실만 사용하고, 없는 날짜·과제·준비물·시험을 추측하지 마라.
- 질문이 '오늘 할 일', '오늘 해야 할 것' 같은 요청이면 현재 날짜를 기준으로 오늘 제출·수행·준비·시험·해야 할 일을 짧고 읽기 쉽게 정리한다.
- 첨부와 기존 S-Hub 데이터가 서로 다르면 임의로 하나를 고르지 말고 차이가 있다고 알려라.
- 필요한 정보가 없으면 무엇을 확인할 수 없는지 분명하게 말한다.

items 분류 규칙:
- reminder: 과제, 수행평가, 시험, 제출, 준비물처럼 학생이 해야 하는 일
- timetable_change: 특정 날짜의 특정 교시 수업 변경, 자습, 과목 교체, 수업 취소
- academic: 시험기간, 학교행사, 방학, 체험학습, 재량휴업 등 반 전체가 알아야 할 일정
- reminder.type은 수행평가=performance, 준비물=material, 시험=exam, 나머지=task
- 상대 날짜와 요일은 현재 기준 시각에서 실제 YYYY-MM-DD로 계산한다.
- 날짜가 명확하지 않으면 지어내지 말고 해당 필드를 빈 문자열로 두고 confidence=low로 한다.
- 같은 실제 공지를 표현만 바꿔 중복 생성하지 마라.
- 어떤 데이터도 자동 저장하거나 변경하지 않는다.

SCHOOL_DATA:
${compactJSON(context)}`

    const generated = await generateSchoolStructured({
      prompt,
      attachments,
      responseSchema: ATTACHMENT_HYBRID_SCHEMA,
      maxOutputTokens: 3200,
""",
)
replace_once(
    'src/s-hub-ai.js',
    """    return { answer, modelName: generated?.modelName || '', attempts: generated?.attempts || [] }
  } catch (error) {
    throw schoolAIError(error, '첨부 내용을 바탕으로 답하지 못했어.')
  }
}
""",
    """    return {
      answer,
      items: normalizeImportItems(generated?.value, now),
      modelName: generated?.modelName || '',
      attempts: generated?.attempts || [],
    }
  } catch (error) {
    throw schoolAIError(error, '첨부 내용을 바탕으로 답하지 못했어.')
  }
}
""",
)
replace_once('src/s-hub-ai-sheet.jsx', '  askSchoolHubWithAttachments,', '  answerAndAnalyzeSchoolAttachments,')
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """  imageQuestion: ['사진과 질문을 함께 확인하는 중…', '필요한 학교 정보를 찾는 중…', '답변을 정리하는 중…'],
  fileQuestion: ['파일과 질문을 함께 확인하는 중…', '필요한 학교 정보를 찾는 중…', '답변을 정리하는 중…'],
  mixedQuestion: ['첨부와 질문을 함께 확인하는 중…', '필요한 학교 정보를 찾는 중…', '답변을 정리하는 중…'],
""",
    """  imageQuestion: ['사진과 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
  fileQuestion: ['파일과 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
  mixedQuestion: ['첨부와 질문을 함께 확인하는 중…', '질문에 답할 내용을 정리하는 중…', '추가할 일정도 확인하는 중…'],
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """      const result = await askSchoolHubWithAttachments({ question, files, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      if (!await finishWorkingStage(requestId)) return
      setState((current) => ({ ...current, mode: 'answer', answer: result.answer, saveResult: null }))
""",
    """      const result = await answerAndAnalyzeSchoolAttachments({ question, files, context, now, signal: controller.signal })
      if (requestSequenceRef.current !== requestId) return
      const items = result.items || []
      if (items.length) {
        showWorkingMode('conflict')
        const conflicts = await reviewSchoolImportConflicts(items, conflictContext, now, { signal: controller.signal })
        if (requestSequenceRef.current !== requestId) return
        if (!await finishWorkingStage(requestId)) return
        const choices = applyConflictSelection(items, conflicts)
        setState({
          mode: 'import',
          answer: result.answer,
          items,
          selected: choices.selected,
          conflicts,
          resolutions: choices.resolutions,
          saveResult: null,
        })
        setConflictsDirty(false)
      } else {
        if (!await finishWorkingStage(requestId)) return
        setState((current) => ({ ...current, mode: 'answer', answer: result.answer, items: [], selected: {}, conflicts: {}, resolutions: {}, saveResult: null }))
      }
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """        {!working && state.mode === 'answer' ? (
          <section className="s-hub-ai-answer" aria-live="polite">
            <span>답변</span>
            <p>{state.answer}</p>
          </section>
        ) : null}
""",
    """        {!working && state.answer ? (
          <section className="s-hub-ai-answer" aria-live="polite">
            <span>답변</span>
            <p>{state.answer}</p>
          </section>
        ) : null}
""",
)
replace_once(
    'src/s-hub-ai-sheet.jsx',
    """            <div className="s-hub-ai-result-head">
              <strong>{state.items.length}개를 찾았어</strong>
              <span>저장 전 내용을 확인해줘.</span>
            </div>
""",
    """            <div className="s-hub-ai-result-head">
              <strong>{state.answer ? '추가할 수 있는 항목' : `${state.items.length}개를 찾았어`}</strong>
              <span>{state.answer ? `${state.items.length}개를 찾았어. 저장 전 내용을 확인해줘.` : '저장 전 내용을 확인해줘.'}</span>
            </div>
""",
)
replace_once('public/sw.js', 'school-shell-v151', 'school-shell-v152')
replace_once('tests/s-hub-ai-auth.test.js', 'school-shell-v151', 'school-shell-v152')
replace_once('tests/s-hub-ai-server-route.test.js', 'school-shell-v151', 'school-shell-v152')

replace_once(
    'tests/s-hub-ai-attachment-intent.test.js',
    "assert.match(ai, /export async function askSchoolHubWithAttachments/)",
    "assert.match(ai, /export async function answerAndAnalyzeSchoolAttachments/)",
)
replace_once(
    'tests/s-hub-ai-attachment-intent.test.js',
    "assert.match(sheet, /askSchoolHubWithAttachments\\(\\{ question, files, context, now, signal: controller\\.signal \\}\\)/)",
    "assert.match(sheet, /answerAndAnalyzeSchoolAttachments\\(\\{ question, files, context, now, signal: controller\\.signal \\}\\)/)",
)
replace_once(
    'tests/s-hub-ai-working-stage.test.js',
    "assert.match(sheet, /!working && state\\.mode === 'answer'/)",
    "assert.match(sheet, /!working && state\\.answer/)",
)

Path('tests/s-hub-ai-hybrid-attachment.test.js').write_text(r"""
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('attachment questions return answer and actionable items in one AI call', () => {
  const ai = read('src/s-hub-ai.js')
  assert.match(ai, /ATTACHMENT_HYBRID_SCHEMA/)
  assert.match(ai, /required: \['answer', 'items'\]/)
  assert.match(ai, /answerAndAnalyzeSchoolAttachments/)
  assert.match(ai, /responseSchema: ATTACHMENT_HYBRID_SCHEMA/)
  assert.match(ai, /answer와 items는 서로 배타적이지 않다/)
  assert.match(ai, /items: normalizeImportItems\(generated\?\.value, now\)/)
})

test('attachment question UI keeps answer and import candidates together', () => {
  const sheet = read('src/s-hub-ai-sheet.jsx')
  assert.match(sheet, /answerAndAnalyzeSchoolAttachments/)
  assert.match(sheet, /mode: 'import',\n\s+answer: result\.answer/)
  assert.match(sheet, /!working && state\.answer/)
  assert.match(sheet, /추가할 수 있는 항목/)
  assert.match(sheet, /reviewSchoolImportConflicts\(items, conflictContext/)
  assert.match(sheet, /질문에 답할 내용을 정리하는 중…/)
})

test('service worker advances for hybrid attachment answers', () => {
  assert.match(read('public/sw.js'), /school-shell-v152/)
})
""".strip() + '\n')
