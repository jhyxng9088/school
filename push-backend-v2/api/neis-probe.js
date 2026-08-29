import { getClassTimetable, getSujiHighSchool, weekRange, weeklyScheduleFromRows, ymd } from '../lib/neis-timetable.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  try {
    const classNumber = Number(req.query?.classNumber || 1)
    const { monday, friday } = weekRange(new Date('2026-08-31T12:00:00+09:00'))
    const [school, rows] = await Promise.all([
      getSujiHighSchool(),
      getClassTimetable(classNumber, monday, friday),
    ])
    return res.status(200).json({
      ok: true,
      school,
      grade: 2,
      classNumber,
      from: ymd(monday),
      to: ymd(friday),
      rowCount: rows.length,
      weeklySchedule: weeklyScheduleFromRows(rows),
      rows,
    })
  } catch (error) {
    console.error('NEIS probe failed', { code: error?.code, message: error?.message })
    return res.status(500).json({ ok: false, error: String(error?.message || 'neis_probe_failed') })
  }
}
