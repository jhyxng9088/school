import webpush from 'web-push'

export const CURRENT_VAPID_PUBLIC_KEY = 'BDZVTlyGKMCXMCo8hRv4jsPorQYXaboTtUcj5GwLaKB1cqYWlHq8O5tOxDwFyv50MJPESNAR6XNq5Ftd_ZvHFqw'

let configured = false

function configure() {
  if (configured) return
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || process.env.WEB_PUSH_PUBLIC_KEY || CURRENT_VAPID_PUBLIC_KEY).trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || process.env.WEB_PUSH_PRIVATE_KEY || '').trim()
  const subject = String(process.env.VAPID_SUBJECT || process.env.WEB_PUSH_SUBJECT || 'https://github.com/jhyxng9088/school').trim()
  if (!publicKey) throw new Error('VAPID public key is missing')
  if (!privateKey) throw new Error('VAPID_PRIVATE_KEY is missing')
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

function webPushSubscription(value) {
  return {
    endpoint: String(value?.endpoint || ''),
    keys: {
      p256dh: String(value?.p256dh || ''),
      auth: String(value?.auth || ''),
    },
  }
}

export async function sendPush(db, recipient, payload) {
  configure()
  const subscription = webPushSubscription(recipient)
  if (!subscription.endpoint || !subscription.keys.p256dh || !subscription.keys.auth) {
    return { ok: false, permanent: true, statusCode: 0 }
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: 'normal',
    })
    return { ok: true, permanent: false, statusCode: 201 }
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0)
    const permanent = statusCode === 404 || statusCode === 410
    if (permanent && recipient?.refPath) {
      await db.doc(recipient.refPath).delete().catch(() => {})
    }
    return { ok: false, permanent, statusCode }
  }
}

export async function sendPlan(db, plan) {
  const results = await Promise.all((plan.recipients || []).map((recipient) => sendPush(db, recipient, plan.payload)))
  return {
    attempted: results.length,
    sent: results.filter((result) => result.ok).length,
    permanentFailures: results.filter((result) => !result.ok && result.permanent).length,
    transientFailures: results.filter((result) => !result.ok && !result.permanent).length,
  }
}
