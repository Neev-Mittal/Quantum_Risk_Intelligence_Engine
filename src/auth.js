const SESSION_STORAGE_KEY = 'qrie.auth.session'
const OTP_DIGITS = 6
const OTP_STEP_SECONDS = 30
const OTP_ALLOWED_WINDOW = 1
const OTP_ISSUER = 'QRIE Demo'
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const roleLabels = {
  admin: 'Administrator',
  pnb_checker: 'PNB Checker',
  compliance_auditor: 'Compliance Auditor',
  it_administrator: 'IT Administrator',
}

export const routePermissions = {
  '/': ['admin', 'pnb_checker', 'compliance_auditor', 'it_administrator'],
  '/asset-inventory': ['admin', 'pnb_checker', 'it_administrator'],
  '/asset-discovery': ['admin', 'it_administrator'],
  '/cbom': ['admin', 'pnb_checker'],
  '/posture-pqc': ['admin', 'pnb_checker', 'compliance_auditor'],
  '/cyber-rating': ['admin', 'pnb_checker', 'compliance_auditor'],
  '/reporting': ['admin', 'pnb_checker', 'compliance_auditor'],
  '/business-impact': ['admin', 'compliance_auditor'],
  '/scanner': ['admin', 'it_administrator'],
}

export const demoUsers = [
  {
    username: 'admin',
    email: 'admin@pnb.com',
    password: 'Admin@123',
    otpSecret: '5CZKI7SAP4AHBF5R3ZQRU34ARUXF2YZ3',
    name: 'QRIE Platform Admin',
    employeeId: 'PNB_ADMIN_001',
    role: 'admin',
    clearance: 'Full Platform Access',
  },
  {
    username: 'checker',
    email: 'checker@pnb.com',
    password: 'Checker@123',
    otpSecret: 'QY6CD4GOMLFJRMHGB2MB3YWFZYAL65XY',
    name: 'PNB Validation Officer',
    employeeId: 'PNB_CHECK_014',
    role: 'pnb_checker',
    clearance: 'Validation Operations',
  },
  {
    username: 'auditor',
    email: 'auditor@pnb.com',
    password: 'Auditor@123',
    otpSecret: 'RA3VWETMOYZUMKOPHEG4FPDRROKZFD3I',
    name: 'Compliance Audit Lead',
    employeeId: 'PNB_AUDIT_021',
    role: 'compliance_auditor',
    clearance: 'Compliance Review',
  },
  {
    username: 'itops',
    email: 'itops@pnb.com',
    password: 'ITOps@123',
    otpSecret: 'FJX4XMGGRIWM2X3NGUDJ6XF4I2M3ZKL2',
    name: 'Infrastructure Operations',
    employeeId: 'PNB_ITOPS_033',
    role: 'it_administrator',
    clearance: 'Infrastructure Operations',
  },
]

const normalizeIdentifier = (identifier) => identifier.trim().toLowerCase()

const findDemoUser = (identifier) => {
  const normalizedIdentifier = normalizeIdentifier(identifier)
  return demoUsers.find((user) => (
    user.email.toLowerCase() === normalizedIdentifier ||
    user.username.toLowerCase() === normalizedIdentifier
  ))
}

const createSession = (user) => ({
  username: user.username,
  email: user.email,
  name: user.name,
  employeeId: user.employeeId,
  role: user.role,
  clearance: user.clearance,
  lastLogin: new Date().toISOString(),
  otpEnabled: true,
  authMethod: 'password+totp',
})

const persistSession = (session) => {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

const buildOtpAuthUri = (user) => (
  `otpauth://totp/${encodeURIComponent(`${OTP_ISSUER}:${user.email}`)}?secret=${user.otpSecret}&issuer=${encodeURIComponent(OTP_ISSUER)}&algorithm=SHA1&digits=${OTP_DIGITS}&period=${OTP_STEP_SECONDS}`
)

const base32ToBytes = (value) => {
  const cleanedValue = value.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''

  for (const char of cleanedValue) {
    const charIndex = BASE32_ALPHABET.indexOf(char)
    if (charIndex === -1) {
      throw new Error('Invalid OTP secret encoding.')
    }
    bits += charIndex.toString(2).padStart(5, '0')
  }

  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }

  return new Uint8Array(bytes)
}

const counterToBytes = (counter) => {
  const buffer = new ArrayBuffer(8)
  const view = new DataView(buffer)
  const high = Math.floor(counter / 2 ** 32)
  const low = counter >>> 0

  view.setUint32(0, high)
  view.setUint32(4, low)

  return new Uint8Array(buffer)
}

const generateTotpAtCounter = async (secret, counter) => {
  const secretBytes = base32ToBytes(secret)
  const counterBytes = counterToBytes(counter)
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await window.crypto.subtle.sign('HMAC', cryptoKey, counterBytes))
  const offset = signature[signature.length - 1] & 0x0f
  const binaryCode = (
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)
  )

  return String(binaryCode % (10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0')
}

export const getStoredSession = () => {
  if (typeof window === 'undefined') {
    return null
  }

  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!rawSession) {
    return null
  }

  try {
    return JSON.parse(rawSession)
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export const clearStoredSession = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export const getOtpSetupDetails = (identifier) => {
  const matchedUser = findDemoUser(identifier)
  if (!matchedUser) {
    return null
  }

  return {
    issuer: OTP_ISSUER,
    accountName: matchedUser.email,
    secret: matchedUser.otpSecret,
    otpauthUrl: buildOtpAuthUri(matchedUser),
    qrCodePath: `/otp-qr/${matchedUser.username}.svg`,
  }
}

export const getOtpTimeRemaining = (timestamp = Date.now()) => {
  const seconds = Math.floor(timestamp / 1000)
  const remainder = seconds % OTP_STEP_SECONDS
  return remainder === 0 ? OTP_STEP_SECONDS : OTP_STEP_SECONDS - remainder
}

export const beginPasswordSignIn = async ({ identifier, password }) => {
  const matchedUser = findDemoUser(identifier)

  if (!matchedUser || matchedUser.password !== password) {
    return {
      success: false,
      message: 'Invalid username or password. Use one of the approved QRIE demo accounts.',
    }
  }

  return {
    success: true,
    requiresOtp: true,
    user: {
      username: matchedUser.username,
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role,
      clearance: matchedUser.clearance,
    },
    otpSetup: getOtpSetupDetails(matchedUser.email),
    message: 'Password verified. Enter the 6-digit code from your authenticator app to continue.',
  }
}

export const completeOtpSignIn = async ({ identifier, password, otp }) => {
  const matchedUser = findDemoUser(identifier)

  if (!matchedUser || matchedUser.password !== password) {
    return {
      success: false,
      message: 'Your password session expired. Re-enter your credentials and try again.',
    }
  }

  const normalizedOtp = otp.trim()
  if (!/^\d{6}$/.test(normalizedOtp)) {
    return {
      success: false,
      message: 'Enter a valid 6-digit OTP code.',
    }
  }

  const currentCounter = Math.floor(Date.now() / 1000 / OTP_STEP_SECONDS)

  for (let offset = -OTP_ALLOWED_WINDOW; offset <= OTP_ALLOWED_WINDOW; offset += 1) {
    const expectedOtp = await generateTotpAtCounter(matchedUser.otpSecret, currentCounter + offset)
    if (expectedOtp === normalizedOtp) {
      const session = createSession(matchedUser)
      persistSession(session)

      return {
        success: true,
        user: session,
      }
    }
  }

  return {
    success: false,
    message: 'Invalid OTP code. Check the authenticator app and try the newest 6-digit code.',
  }
}

export const userHasAccess = (user, path) => {
  if (!user) {
    return false
  }

  const allowedRoles = routePermissions[path]
  if (!allowedRoles) {
    return user.role === 'admin'
  }

  return allowedRoles.includes(user.role)
}

export const getFirstAuthorizedRoute = (user) => {
  return Object.keys(routePermissions).find((path) => userHasAccess(user, path)) || '/'
}
