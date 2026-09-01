function replaceRequired(source, marker, replacement, label) {
  if (!source.includes(marker)) throw new Error(`Preview AI reminder summary patch marker missing: ${label}`)
  return source.replace(marker, replacement)
}

export function patchPreviewAIReminderSummarySource(source, id) {
  const cleanId = String(id || '').split('?')[0]
  if (!cleanId.endsWith('/main.jsx')) return String(source || '')

  let next = String(source || '')
  next = replaceRequired(
    next,
    "import { buildSchoolAIContext } from './s-hub-ai-core.js'\n",
    `import { buildSchoolAIContext } from './s-hub-ai-core.js'\nimport { parseReminderWithAI } from './firebase-ai.js'\nimport { createPendingReminderSummary, withAttachmentManifest } from './reminder-summary.jsx'\nimport {\n  claimSchoolAIReminderSource,\n  completeSchoolAIReminderSource,\n  releaseSchoolAIReminderSource,\n} from './s-hub-reminder-source.js'\n`,
    'main AI summary imports',
  )

  next = replaceRequired(
    next,
    "  async function importAIItems(items) {\n",
    `  async function enrichImportedAIReminder(savedId, item, sourceClaim) {\n    if (!savedId || !sourceClaim?.claimId || !sourceClaim.files?.length) return\n    const files = sourceClaim.files.slice(0, 4)\n    const targetHint = [\n      sourceClaim.text,\n      'S-Hub AI가 선택한 리마인더: ' + String(item?.title || '').trim(),\n      '분류: ' + String(item?.type || 'task'),\n      '마감: ' + String(item?.dueDate || '') + (item?.dueTime ? ' ' + item.dueTime : ''),\n      '첨부 전체에서 위 리마인더와 직접 관련된 내용만 골라 요약해 주세요.',\n    ].filter(Boolean).join('\\n')\n\n    const uploadsPromise = Promise.all(files.map(async (file, index) => {\n      try {\n        await todoData.uploadOriginalAttachment(savedId, file, 'a' + index)\n        return true\n      } catch (error) {\n        console.error('S-Hub AI reminder original ' + (index + 1) + ' save failed:', error)\n        return false\n      }\n    }))\n\n    const previewSummary = item?.previewSummary?.overview ? item.previewSummary : null\n    let parsed = previewSummary ? { summary: previewSummary, attachment: null } : null\n    for (let attempt = 0; attempt < 2 && !parsed?.summary; attempt += 1) {\n      try {\n        parsed = await parseReminderWithAI(targetHint, new Date(), files)\n      } catch (error) {\n        console.error('S-Hub AI imported reminder summary attempt ' + (attempt + 1) + ' failed:', error)\n      }\n      if (!parsed?.summary && attempt === 0 && navigator.onLine !== false) {\n        await new Promise((resolve) => window.setTimeout(resolve, 1200))\n      }\n    }\n\n    const uploadResults = await uploadsPromise\n    const originalsReady = uploadResults.every(Boolean)\n\n    try {\n      if (parsed?.summary) {\n        const summary = originalsReady ? withAttachmentManifest(parsed.summary, files) : parsed.summary\n        await todoData.enrichTodo(savedId, {\n          summary,\n          attachment: parsed.attachment || null,\n        })\n      } else {\n        const fallback = {\n          overview: '첨부 내용의 자동 요약을 완료하지 못했습니다. 원본 파일에서 내용을 확인해 주세요.',\n          sections: [],\n        }\n        await todoData.enrichTodo(savedId, {\n          summary: originalsReady ? withAttachmentManifest(fallback, files) : fallback,\n          attachment: null,\n        })\n      }\n      completeSchoolAIReminderSource(sourceClaim.claimId)\n    } catch (error) {\n      console.error('S-Hub AI imported reminder summary save failed:', error)\n      releaseSchoolAIReminderSource(sourceClaim.claimId)\n    }\n  }\n\n  async function importAIItems(items) {\n`,
    'AI import enrichment helper',
  )

  next = replaceRequired(
    next,
    `          const targetId = item.resolution === 'replace' ? String(item.existingId || '') : ''\n          if (item.resolution === 'replace' && !targetId) throw new Error('수정할 기존 리마인더를 찾지 못했어.')\n          const savedId = await todoData.saveTodo({\n            id: targetId,\n            type: item.type,\n            title: item.title,\n            dueDate: item.dueDate,\n            dueTime: item.dueTime || '',\n          })\n          if (!savedId) throw new Error('리마인더를 저장하지 못했어.')\n          saved.push({ item, id: savedId })`,
    `          const targetId = item.resolution === 'replace' ? String(item.existingId || '') : ''\n          if (item.resolution === 'replace' && !targetId) throw new Error('수정할 기존 리마인더를 찾지 못했어.')\n          const sourceClaim = claimSchoolAIReminderSource()\n          const previewSummary = item?.previewSummary?.overview ? item.previewSummary : null\n          let savedId = ''\n          try {\n            savedId = await todoData.saveTodo({\n              id: targetId,\n              type: item.type,\n              title: item.title,\n              dueDate: item.dueDate,\n              dueTime: item.dueTime || '',\n              ...(previewSummary\n                ? { summary: previewSummary }\n                : sourceClaim?.files?.length\n                  ? { summary: createPendingReminderSummary(sourceClaim.files) }\n                  : {}),\n            })\n            if (!savedId) throw new Error('리마인더를 저장하지 못했어.')\n          } catch (error) {\n            if (sourceClaim?.claimId) releaseSchoolAIReminderSource(sourceClaim.claimId)\n            throw error\n          }\n          if (sourceClaim?.files?.length) void enrichImportedAIReminder(savedId, item, sourceClaim)\n          saved.push({ item, id: savedId })`,
    'AI reminder import save path',
  )

  return next
}
