// Installation is required on deployed builds. Only a Vite development
// server on this machine can open the regular browser for design imports.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLocalDesignPreview({ isDevelopment, hostname }) {
  return isDevelopment === true
    && LOOPBACK_HOSTNAMES.has(String(hostname || '').toLowerCase())
}
