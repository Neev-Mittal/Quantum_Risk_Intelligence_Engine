export function formatDiscoveryDate(value, fallback = 'Not recorded') {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') {
    return fallback
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= 86400000) {
    return fallback
  }

  return parsed.toLocaleDateString()
}

export function getIpVersionLabel(ipAddress) {
  if (!ipAddress || ipAddress === '-' || ipAddress === '—') {
    return null
  }

  if (ipAddress.includes(':')) {
    return 'IPv6'
  }

  if (ipAddress.includes('.')) {
    return 'IPv4'
  }

  return null
}

export function formatAssetTypeLabel(assetType) {
  return (assetType || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
