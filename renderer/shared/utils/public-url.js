export function publicUrl(value) {
  const path = String(value || '')

  if (!path.startsWith('/')) {
    return path
  }

  if (typeof window === 'undefined' || window.location.protocol !== 'file:') {
    return path
  }

  const outMarker = '/renderer/out/'
  const pathname = window.location.pathname || ''
  const outIndex = pathname.indexOf(outMarker)

  if (outIndex < 0) {
    return `.${path}`
  }

  const routePath = pathname.slice(outIndex + outMarker.length)
  const routeSegments = routePath.split('/').filter(Boolean)
  const depth = Math.max(0, routeSegments.length - 1)
  const prefix = depth > 0 ? '../'.repeat(depth) : './'

  return `${prefix}${path.replace(/^\/+/, '')}`
}
