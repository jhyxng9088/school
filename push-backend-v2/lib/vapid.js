import { createECDH, timingSafeEqual } from 'node:crypto'

export function vapidKeyPairMatches(publicKey, privateKey) {
  const publicText = String(publicKey || '').trim()
  const privateText = String(privateKey || '').trim()
  if (!publicText || !privateText) return false

  try {
    const expectedPublic = Buffer.from(publicText, 'base64url')
    const privateBytes = Buffer.from(privateText, 'base64url')
    if (expectedPublic.length !== 65 || privateBytes.length !== 32) return false

    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(privateBytes)
    const derivedPublic = ecdh.getPublicKey(null, 'uncompressed')
    return derivedPublic.length === expectedPublic.length
      && timingSafeEqual(derivedPublic, expectedPublic)
  } catch {
    return false
  }
}
