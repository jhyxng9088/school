import { adminDb } from '../lib/firebase-admin.js'
import { sendPlan } from '../lib/push.js'

const TARGET_CLASS_ID = 'class-1'
const TARGET_STUDENT_KEY = 'student-a63dc064d4c5227e'
const LOCK_ID = 'targeted-test-8c71'

function subscriptionFromSnapshot(snapshot) {
  const data = snapshot.data() || {}
  const studentKey = String(data.studentKey || '').trim()
  const endpoint = String(data.endpoint || '').trim()
  const p256dh = String(data.p256dh || '').trim()
  const auth = String(data.auth || '').trim()
  if (studentKey !== TARGET_STUDENT_KEY) return null
  if (!snapshot.id.startsWith(`${TARGET_STUDENT_KEY}-`)) return null
  if (!endpoint || !p256dh || !auth) return null
  return { studentKey, endpoint, p256dh, auth, refPath: snapshot.ref.path }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  try {
    const db = adminDb()
    const snapshot = await db
      .collection('classes')
      .doc(TARGET_CLASS_ID)
      .collection('pushSubscriptions')
      .where('studentKey', '==', TARGET_STUDENT_KEY)
      .get()

    const recipients = snapshot.docs.map(subscriptionFromSnapshot).filter(Boolean)
    if (!recipients.length) {
      return res.status(409).json({ ok: false, error: 'target_has_no_valid_subscription' })
    }
    if (recipients.length !== snapshot.size) {
      return res.status(409).json({ ok: false, error: 'target_subscription_validation_failed' })
    }

    const lockRef = db.collection('_system').doc(LOCK_ID)
    try {
      await lockRef.create({
        targetClassId: TARGET_CLASS_ID,
        targetStudentKey: TARGET_STUDENT_KEY,
        subscriptionCount: recipients.length,
        createdAt: Date.now(),
      })
    } catch (error) {
      if (String(error?.code || '').includes('already-exists') || Number(error?.code) === 6) {
        return res.status(409).json({ ok: false, error: 'already_sent' })
      }
      throw error
    }

    const result = await sendPlan(db, {
      recipients,
      payload: {
        title: 'S-Hub',
        body: '☺️ 알림이 잘 도착했는지 살짝 확인하러 왔어. 오늘도 너무 무리하지 말고, 천천히 잘 해내자. 좋은 하루 보내!',
        tag: 'personal-test-8c71',
        url: './',
      },
    })

    return res.status(200).json({
      ok: result.sent > 0,
      targetOnly: true,
      attempted: result.attempted,
      sent: result.sent,
      permanentFailures: result.permanentFailures,
      transientFailures: result.transientFailures,
    })
  } catch (error) {
    console.error('targeted test push failed', error)
    return res.status(500).json({ ok: false, error: 'targeted_test_failed' })
  }
}
