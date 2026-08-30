import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  POLITE_AI_TONE,
  POLITE_COPY_REPLACEMENTS,
  POLITE_SOURCE_FRAGMENTS,
} from './src/polite-copy-runtime.js'

const AI_PROMPT_MARKERS = [
  '너는 한국 고등학생용 S-Hub의 학교 공지 분석기다.',
  '너는 S-Hub의 학교 정보 질문 도우미다.',
  '너는 S-Hub 내부 학교 정보 검색 도우미다.',
  '너는 한국 고등학생용 학교 리마인더 정리 AI다.',
]

const BUILD_COPY_REPLACEMENTS = [
  ...POLITE_COPY_REPLACEMENTS.filter(([from]) => from !== '등록된 급식이 없어'),
  ['같은 학사일정이 이미 있어.', '같은 학사일정이 이미 있어요.'],
]

function replacePairs(source, pairs) {
  let next = String(source || '')
  const applied = []
  pairs.forEach(([from, to], index) => {
    if (!next.includes(from)) return
    const token = `__S_HUB_POLITE_COPY_${index}_${applied.length}__`
    next = next.split(from).join(token)
    applied.push([token, to])
  })
  for (const [token, to] of applied) next = next.split(token).join(to)
  return next
}

function replaceCopy(source) {
  let next = replacePairs(source, [...BUILD_COPY_REPLACEMENTS, ...POLITE_SOURCE_FRAGMENTS])
  for (const marker of AI_PROMPT_MARKERS) {
    const withTone = `${marker}\n${POLITE_AI_TONE}`
    if (!next.includes(withTone)) next = next.split(marker).join(withTone)
  }
  return next
}

function patchPublicBuildFiles(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const filePath = path.join(directory, entry.name)
    const current = fs.readFileSync(filePath, 'utf8')
    const next = replaceCopy(current)
    if (next !== current) fs.writeFileSync(filePath, next)
  }
}

function politeCopyPlugin() {
  return {
    name: 'school-polite-copy',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0]
      if (!cleanId.includes('/src/') || cleanId.endsWith('/polite-copy-runtime.js')) return null

      const next = replaceCopy(code)
      return next === code ? null : { code: next, map: null }
    },
    closeBundle() {
      patchPublicBuildFiles(path.resolve('dist'))
    },
  }
}

const appBase = String(process.env.SHUB_PREVIEW_BASE || '/school/').trim() || '/school/'

export default defineConfig({
  plugins: [politeCopyPlugin(), react()],
  base: appBase,
})
