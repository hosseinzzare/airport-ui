/**
 * DXB Airport Platform — Customer + OCC engine
 * Themes, RBAC, routing (elham-branch)
 */

document.addEventListener('DOMContentLoaded', () => {
  initUserDatabase()
  restoreSession()
  initCustomerPortalLinks()
  initBottomNav()
  initHashRouter()
  setInterval(updateOpsClock, 1000)
})

const STORAGE_USERS = 'EMIRATES_DXB_USERS_V2'

// The passenger site and the OCC keep completely separate sessions, so signing
// in as staff never takes over the public site (and vice versa). A person can
// be signed in on both surfaces at once without either one affecting the other.
const STORAGE_SESSION_CUSTOMER = 'EMIRATES_DXB_SESSION_CUSTOMER'
const STORAGE_SESSION_STAFF = 'EMIRATES_DXB_SESSION_STAFF'

const DEFAULT_USERS = [
  { name: 'Duty Commander', email: 'admin@dxb.gov.ae', password: 'admin', role: 'admin', date: '11 Aug 2026' },
  { name: 'Sara Al-Mansoor', email: 'passenger@emirates.com', password: '123', role: 'customer', date: '11 Aug 2026' },
  { name: 'Local Tower', email: 'tower@dxb.gov.ae', password: 'tower', role: 'tower', date: '11 Aug 2026' },
  { name: 'Ops Coordinator', email: 'ops@dxb.gov.ae', password: 'ops', role: 'ops', date: '11 Aug 2026' },
  { name: 'Sara Rahimi', email: 'crew@dxb.gov.ae', password: 'Crew123!', role: 'crew', date: '11 Aug 2026' },
]

let USERS_DB = []

const GUEST_USER = { name: 'Guest User', email: '', role: 'guest' }

// Two independent sessions. `currentUser` is whichever one belongs to the
// surface being viewed — it is swapped by switchRoute(), so every module can
// keep reading `currentUser` without knowing which surface it is on.
let customerUser = { ...GUEST_USER }
let staffUser = { ...GUEST_USER }
let currentUser = { ...GUEST_USER }

let currentRoute = 'landing'
let currentAdminModule = 'dashboard'

// Routes that belong to the OCC surface; everything else is the passenger site.
const STAFF_ROUTES = ['admin', 'staff-login']

const SHARED_SCENARIO = {
  flight: 'EK 001',
  route: 'DXB → LHR',
  airport: 'Dubai International Airport — DXB',
  terminal: 'Terminal 3',
  date: 'Tue, 11 Aug',
  boarding: '08:30',
  aircraft: 'A380-800',
}

// Global Shared OCC Telemetry State across Turnaround, Gate Management & Tower Control
window.OCC_SHARED_STATE = {
  flights: [
    { flight: 'EK 202', airline: 'Emirates', aircraft: 'Airbus A380', reg: 'A6-EOD', gate: 'A14', terminal: 'T3', arrival: '08:20', departure: '10:45', estDeparture: '10:45', status: 'On Time', delayMin: 0, runway: '12L', slot: '10:45Z', delayReason: 'On Schedule' },
    { flight: 'EK 501', airline: 'Emirates', aircraft: 'Boeing 777', reg: 'A6-EBF', gate: 'B22', terminal: 'T3', arrival: '09:05', departure: '11:20', estDeparture: '11:29', status: 'At Risk', delayMin: 9, runway: '12R', slot: '11:29Z', delayReason: 'Baggage Loading (+8m)' },
    { flight: 'EK 303', airline: 'Emirates', aircraft: 'Airbus A350', reg: 'A6-XAA', gate: 'B07', terminal: 'T3', arrival: '09:30', departure: '11:35', estDeparture: '11:50', status: 'Delayed', delayMin: 15, runway: '12L', slot: '11:50Z', delayReason: 'Refueling Hydrant (+15m)' },
    { flight: 'FZ 812', airline: 'flydubai', aircraft: 'Boeing 737', reg: 'A6-FDB', gate: 'C12', terminal: 'T2', arrival: '10:00', departure: '12:00', estDeparture: '12:00', status: 'On Time', delayMin: 0, runway: '12R', slot: '12:00Z', delayReason: 'On Schedule' },
    { flight: 'BA 107', airline: 'British Airways', aircraft: 'Boeing 787', reg: 'G-ZBJA', gate: 'D04', terminal: 'T1', arrival: '07:45', departure: '09:30', estDeparture: '09:30', status: 'Completed', delayMin: 0, runway: '12L', slot: '09:30Z', delayReason: 'Departed' },
    { flight: 'LH 630', airline: 'Lufthansa', aircraft: 'Airbus A350', reg: 'D-AIXA', gate: 'D12', terminal: 'T1', arrival: '08:50', departure: '11:10', estDeparture: '11:10', status: 'On Time', delayMin: 0, runway: '12R', slot: '11:10Z', delayReason: 'On Schedule' }
  ],

  reassignGate(flightCode, newGate) {
    const item = this.flights.find(f => f.flight === flightCode || f.flight.replace(' ', '') === flightCode.replace(' ', ''));
    if (item) {
      const oldGate = item.gate;
      item.gate = newGate;
      alert(`[OCC Dispatch] Gate Reassigned for ${item.flight}: Changed from Gate ${oldGate} ➔ Gate ${newGate} to prevent apron delay propagation!`);
      this.notify();
    }
  },

  reassignTowerSlot(flightCode, newRunway, newSlot) {
    const item = this.flights.find(f => f.flight === flightCode || f.flight.replace(' ', '') === flightCode.replace(' ', ''));
    if (item) {
      item.runway = newRunway;
      item.slot = newSlot;
      alert(`[Tower Control] Departure Slot Reassigned for ${item.flight}: Moved to Runway ${newRunway} at ${newSlot} to bypass pushback congestion!`);
      this.notify();
    }
  },

  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  notify() { this.listeners.forEach(fn => fn()); }
};

/* —— Persistence —— */
function initUserDatabase() {
  const stored = localStorage.getItem(STORAGE_USERS)
  if (stored) {
    try {
      USERS_DB = JSON.parse(stored).map((u) => ({ ...u, role: normalizeRole(u.role) }))
    } catch {
      USERS_DB = [...DEFAULT_USERS]
      saveUserDatabase()
    }
  } else {
    // migrate legacy key if present
    const legacy = localStorage.getItem('EMIRATES_DXB_USERS')
    if (legacy) {
      try {
        USERS_DB = JSON.parse(legacy).map((u) => ({ ...u, role: normalizeRole(u.role) }))
      } catch {
        USERS_DB = [...DEFAULT_USERS]
      }
    } else {
      USERS_DB = [...DEFAULT_USERS]
    }
    // ensure demo staff accounts exist
    DEFAULT_USERS.forEach((d) => {
      if (!USERS_DB.some((u) => u.email === d.email)) USERS_DB.push(d)
    })
    saveUserDatabase()
  }
}

function saveUserDatabase() {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(USERS_DB))
}

function readSession(storageKey) {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return { ...GUEST_USER }
  try {
    const session = JSON.parse(raw)
    const user = USERS_DB.find((u) => u.email === session.email)
    if (user) return { ...user, role: normalizeRole(user.role) }
  } catch {
    /* ignore */
  }
  return { ...GUEST_USER }
}

function restoreSession() {
  customerUser = readSession(STORAGE_SESSION_CUSTOMER)
  staffUser = readSession(STORAGE_SESSION_STAFF)

  // A staff account must never occupy the customer session, and vice versa —
  // guards against a stale or hand-edited storage entry.
  if (isStaffRole(customerUser.role)) customerUser = { ...GUEST_USER }
  if (customerUser.role !== 'guest') customerUser.role = 'customer'
  if (staffUser.role !== 'guest' && !isStaffRole(staffUser.role)) staffUser = { ...GUEST_USER }

  currentUser = { ...customerUser }
  window.currentUser = currentUser
}

function writeSession(storageKey, user) {
  if (!user || user.role === 'guest') {
    localStorage.removeItem(storageKey)
    return
  }
  localStorage.setItem(storageKey, JSON.stringify({ email: user.email, role: user.role }))
}

function persistCustomerSession() {
  writeSession(STORAGE_SESSION_CUSTOMER, customerUser)
}

function persistStaffSession() {
  writeSession(STORAGE_SESSION_STAFF, staffUser)
}

/* —— Shell visibility —— */
function applyThemeForRole(role) {
  document.body.classList.remove('theme-ops', 'ops-active', 'customer-active')
  document.body.classList.add('theme-customer')
}

function setOpsShellVisible(visible) {
  document.body.classList.toggle('ops-active', visible)
  const shell = document.getElementById('ops-shell')
  if (shell) shell.style.display = visible ? 'flex' : 'none'
}

function setCustomerPortalVisible(visible) {
  document.body.classList.toggle('customer-active', visible)
  const nameEl = document.getElementById('customer-portal-name')
  if (nameEl) nameEl.textContent = currentUser.name
}

function updateChrome() {
  const role = normalizeRole(currentUser.role)
  applyThemeForRole(role)

  const status = document.getElementById('user-status-display')
  if (status) {
    status.textContent =
      role !== 'guest' ? `${currentUser.name} (${getAccess(role).label})` : 'Guest'
  }

  const isStaff = isStaffRole(role) && currentRoute === 'admin'
  setOpsShellVisible(isStaff)
  // The passenger side is navigated entirely from the app tab bar, so the older
  // customer strip (Book | My Trips | Manage booking | Flight status | Sign out)
  // is not shown — it duplicated those destinations and cost ~117px of a phone
  // screen. Account and sign-out live in the Account tab instead.
  setCustomerPortalVisible(false)

  // Sign In / Sign Up are only offered to a signed-out visitor; a signed-in
  // passenger gets a compact account chip instead. Showing both at once (the
  // previous behaviour) offered a signed-in user a "Sign Up" button.
  const signedIn = !isStaff && role !== 'guest'
  const signInButtons = document.getElementById('user-actions-container')
  const accountChip = document.getElementById('user-account-chip')
  if (signInButtons) signInButtons.style.display = isStaff || signedIn ? 'none' : 'flex'
  if (accountChip) {
    accountChip.style.display = signedIn ? 'flex' : 'none'
    const initial = document.getElementById('app-account-initial')
    const nameEl = document.getElementById('app-account-name')
    if (initial) initial.textContent = (currentUser.name || '?').charAt(0).toUpperCase()
    if (nameEl) nameEl.textContent = (currentUser.name || 'Account').split(' ')[0]
  }

  const publicBits = [
    document.getElementById('public-top-strip'),
    document.getElementById('public-header'),
    document.getElementById('public-bottom-nav'),
    document.getElementById('main-content'),
  ]
  publicBits.forEach((el) => {
    if (!el) return
    if (isStaff) el.style.display = 'none'
    else el.style.removeProperty('display')
  })

  if (isStaff) buildOpsNav()
}

function buildOpsNav() {
  const nav = document.getElementById('ops-nav')
  const badge = document.getElementById('ops-role-badge')
  if (!nav) return

  const role = normalizeRole(currentUser.role)
  const access = getAccess(role)
  if (badge) badge.textContent = `${access.label} · ${role.toUpperCase()}`

  nav.innerHTML = access.modules
    .map((id) => {
      const meta = MODULE_META[id] || { label: id, icon: '•' }
      const active = id === currentAdminModule ? 'active' : ''
      return `<button type="button" class="ops-nav-btn ${active}" data-module="${id}">
        <span class="ops-ico">${meta.icon}</span> ${meta.label}
      </button>`
    })
    .join('')

  nav.querySelectorAll('[data-module]').forEach((btn) => {
    btn.addEventListener('click', () => {
      loadAdminModule(btn.getAttribute('data-module'))
    })
  })
}

function updateOpsClock() {
  const now = new Date()
  const hours = String(now.getUTCHours()).padStart(2, '0')
  const minutes = String(now.getUTCMinutes()).padStart(2, '0')
  const seconds = String(now.getUTCSeconds()).padStart(2, '0')
  const timeStringZ = `${hours}:${minutes}:${seconds}Z`
  const chipTimeString = `Tue, 11 Aug • ${hours}:${minutes}:${seconds}Z`

  const clockMap = {
    'ops-clock': timeStringZ,
    'th-clock': timeStringZ,
    'live-turnaround-clock': chipTimeString,
    'crew-ops-clock': chipTimeString,
    'gate-clock': timeStringZ,
    'gate-ops-clock': timeStringZ,
    'ops-clock-header': timeStringZ
  }

  Object.entries(clockMap).forEach(([id, text]) => {
    const el = document.getElementById(id)
    if (el) el.textContent = text
  })

  document.querySelectorAll('.ops-live-clock, .admin-clock, [data-live-clock]').forEach((el) => {
    el.textContent = timeStringZ
  })
}

/* —— Router —— */
function initHashRouter() {
  window.addEventListener('hashchange', handleHashRoute)
  handleHashRoute()
}

// The deployment serves the same shell at two URLs: / is the passenger site and
// /admin is the Operations Control Center. With no hash present, the pathname is
// what decides which surface opens; the hash takes over from then on.
function defaultRouteForPath() {
  return window.location.pathname.replace(/\/+$/, '').endsWith('/admin')
    ? 'admin'
    : 'landing'
}

function handleHashRoute() {
  const hash = window.location.hash.replace('#', '') || defaultRouteForPath()
  const allowed = [
    'landing',
    'signin',
    'signup',
    'admin',
    'staff-login',
    'my-trips',
    'manage',
    'flight-status',
    'portal',
  ]
  switchRoute(allowed.includes(hash) ? hash : defaultRouteForPath())
}

function switchRoute(route) {
  // Activate the session that belongs to this surface. The passenger site and
  // the OCC are fully independent: being signed in to one has no effect on the
  // other, and a staff member can browse the public site as a normal visitor.
  currentUser = STAFF_ROUTES.includes(route) ? staffUser : customerUser
  window.currentUser = currentUser

  const role = normalizeRole(currentUser.role)

  // Guards
  if (route === 'admin' && !isStaffRole(role)) {
    currentRoute = 'staff-login'
    window.location.hash = 'staff-login'
    updateChrome()
    renderStaffLogin()
    return
  }

  if (['my-trips', 'manage', 'flight-status'].includes(route) && role === 'guest') {
    currentRoute = 'signin'
    window.location.hash = 'signin'
    updateChrome()
    renderSignInView(`Sign in to access ${route.replace('-', ' ')}.`)
    return
  }

  currentRoute = route
  window.location.hash = route
  updateChrome()

  if (route === 'admin') {
    const savedMod = sessionStorage.getItem('EMIRATES_DXB_OCC_MODULE')
    const preferredMod = (savedMod && canAccessModule(role, savedMod)) ? savedMod : currentAdminModule
    const mod = canAccessModule(role, preferredMod)
      ? preferredMod
      : getDefaultModule(role)
    loadAdminModule(mod || 'dashboard')
    return
  }

  // The passenger landing experience IS the Passenger Portal — booking and
  // check-in are the whole passenger product, so there is no separate marketing
  // page in front of them.
  if (route === 'landing') renderPassengerPortalView()
  else if (route === 'signin') renderSignInView()
  else if (route === 'signup') renderSignUpView()
  else if (route === 'staff-login') renderStaffLogin()
  else if (route === 'my-trips') renderMyTrips()
  else if (route === 'manage') renderManageBooking()
  else if (route === 'flight-status') renderFlightStatus()
  else if (route === 'portal') renderPassengerPortalView()
}

function initCustomerPortalLinks() {
  document.querySelectorAll('[data-customer-route]').forEach((btn) => {
    btn.addEventListener('click', () => switchRoute(btn.getAttribute('data-customer-route')))
  })
  const logout = document.getElementById('btn-customer-logout')
  if (logout) logout.addEventListener('click', handleCustomerLogout)
}

/* —— Passenger app tab bar ——
   The passenger side is a single app: Book, My Trips, Pass, and Account are
   views of the Passenger Portal rather than separate pages. The tab bar and the
   header nav both route through here so they can never disagree. */
let currentAppTab = 'book'

const APP_TAB_VIEWS = {
  book: 'pp-view-home',
  trips: 'pp-view-home',
  pass: 'pp-view-boarding-pass',
}

function goToAppTab(tab) {
  currentAppTab = tab

  // A signed-out visitor tapping Account goes straight to sign-in; everything
  // else is a view inside the portal.
  if (tab === 'account' && normalizeRole(customerUser.role) === 'guest') {
    syncAppTabHighlight(tab)
    switchRoute('signin')
    return
  }

  if (currentRoute !== 'landing') {
    switchRoute('landing')
    // The portal is fetched asynchronously; apply the tab once it has mounted.
    window.setTimeout(() => applyAppTab(tab), 260)
    return
  }
  applyAppTab(tab)
}

function applyAppTab(tab) {
  syncAppTabHighlight(tab)

  if (typeof window.ppShowAppTab === 'function') {
    window.ppShowAppTab(tab)
  }
}

function syncAppTabHighlight(tab) {
  document.querySelectorAll('[data-app-tab]').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-app-tab') === tab)
  })
}

function initBottomNav() {
  // Tab bar items call goToAppTab() directly from their onclick handlers.
  syncAppTabHighlight(currentAppTab)
}

/* —— Auth —— */
// Signing out of the passenger site leaves any OCC session untouched.
function handleCustomerLogout() {
  customerUser = { ...GUEST_USER }
  persistCustomerSession()
  window.currentUser = currentUser
  switchRoute('landing')
}

// Signing out of the OCC leaves any passenger session untouched.
function handleStaffLogout() {
  staffUser = { ...GUEST_USER }
  persistStaffSession()
  sessionStorage.removeItem('EMIRATES_DXB_OCC_MODULE')
  applyThemeForRole('guest')
  setOpsShellVisible(false)
  window.currentUser = currentUser
  switchRoute('staff-login')
}

/* —— Customer views —— */
function renderLandingView() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return

  contentArea.innerHTML = `
    <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 24px;">
      <div style="display: flex; background-color: var(--bg-secondary); border-bottom: 1px solid var(--border-color); overflow-x: auto;">
        <button class="search-tab-btn active" type="button">Search flights</button>
        <button class="search-tab-btn" type="button" onclick="switchRoute('manage')">Manage booking / Check-in</button>
        <button class="search-tab-btn" type="button" onclick="switchRoute('flight-status')">Flight status</button>
      </div>
      <div class="search-form-body">
        <form onsubmit="event.preventDefault(); handleBuyTicket();">
          <div style="display: flex; gap: 24px; margin-bottom: 16px; font-size: 14px; font-weight: 600;">
            <label style="display: flex; align-items: center; gap: 6px;"><input type="radio" name="trip" checked style="accent-color: var(--color-primary);"> Return</label>
            <label style="display: flex; align-items: center; gap: 6px;"><input type="radio" name="trip" style="accent-color: var(--color-primary);"> One way</label>
          </div>
          <div class="grid-2col" style="gap: 16px;">
            <div class="input-group">
              <label class="input-label">Departure airport</label>
              <select class="input-field"><option selected>Dubai (DXB) — Terminal 3 Hub</option></select>
            </div>
            <div class="input-group">
              <label class="input-label">Arrival airport</label>
              <select class="input-field">
                <option>London Heathrow (LHR)</option>
                <option>Paris Charles de Gaulle (CDG)</option>
                <option>Frankfurt Airport (FRA)</option>
                <option>New York (JFK)</option>
              </select>
            </div>
          </div>
          <div class="grid-2col" style="gap: 16px; margin-top: 12px;">
            <div class="input-group">
              <label class="input-label">Dates</label>
              <input class="input-field" value="Tue, 11 Aug — Tue, 18 Aug" readonly>
            </div>
            <div class="input-group">
              <label class="input-label">Passengers & Class</label>
              <select class="input-field">
                <option>1 Passenger, Economy Class</option>
                <option>1 Passenger, Business Class</option>
                <option>1 Passenger, First Class</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn-primary" style="margin-top: 16px; width: 100%;">Search flights →</button>
        </form>
      </div>
    </div>

    <div class="grid-2col" style="grid-template-columns: repeat(3, 1fr); gap: 16px;">
      <div class="card"><span class="caption-text" style="color: var(--color-gold);">A380 EXPERIENCE</span><h3 class="display-title card-title">Fly the Emirates A380</h3><p class="supporting-text">Private Suites, Onboard Lounge, and Shower Spas in First Class.</p></div>
      <div class="card"><span class="caption-text" style="color: var(--color-gold);">ENTERTAINMENT</span><h3 class="display-title card-title">6,500 Channels</h3><p class="supporting-text">Award-winning ice entertainment across all cabin classes.</p></div>
      <div class="card"><span class="caption-text" style="color: var(--color-gold);">DXB HUB</span><h3 class="display-title card-title">Terminal 3</h3><p class="supporting-text">World-class lounges and seamless connections.</p></div>
    </div>
  `
}

function handleBuyTicket() {
  if (normalizeRole(currentUser.role) === 'guest') {
    switchRoute('signin')
    return
  }
  alert(`Search started for ${SHARED_SCENARIO.route}. Demo booking flow.`)
  switchRoute('my-trips')
}

function renderSignInView(banner) {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return
  contentArea.innerHTML = `
    <div class="card" style="max-width: 440px; margin: 24px auto;">
      <h1 class="page-title display-title">Sign in</h1>
      <p class="supporting-text" style="margin-bottom: 16px;">Customer portal — book, manage, and track your journey.</p>
      ${banner ? `<p class="chip chip-warning" style="margin-bottom: 12px; display:inline-flex;">${banner}</p>` : ''}
      <form onsubmit="event.preventDefault(); handleCustomerLogin();">
        <div class="input-group">
          <label class="input-label">Email</label>
          <input type="email" id="signin-email" class="input-field" placeholder="name@example.com" required>
        </div>
        <div class="input-group">
          <label class="input-label">Password</label>
          <input type="password" id="signin-password" class="input-field" placeholder="••••••••" required>
        </div>
        <button class="btn-primary" type="submit" style="width:100%; margin-top:8px;">Sign in →</button>
      </form>
      <p class="supporting-text" style="margin-top: 16px;">
        No account? <a href="#signup" onclick="switchRoute('signup')" style="color: var(--color-primary); font-weight:700;">Sign up</a>
        · Staff? <a href="#staff-login" onclick="switchRoute('staff-login')" style="color: var(--color-primary); font-weight:700;">OCC login</a>
      </p>
    </div>
  `
}

function handleCustomerLogin() {
  const email = document.getElementById('signin-email').value.trim()
  const password = document.getElementById('signin-password').value.trim()
  const user = USERS_DB.find((u) => u.email === email && u.password === password)
  if (!user) {
    alert('Invalid credentials.')
    return
  }
  if (user.role === 'crew') {
    let crewJourney = {}
    try {
      crewJourney = JSON.parse(localStorage.getItem('crewflow_journey') || '{}')
    } catch (e) {
      crewJourney = {}
    }
    crewJourney.user = {
      name: user.name || 'Sara Rahimi',
      role: 'Cabin Crew',
      employeeId: 'EK-CC-2847'
    }
    localStorage.setItem('crewflow_journey', JSON.stringify(crewJourney))
    window.location.href = './crew-app/#/crew'
    return
  }
  const role = normalizeRole(user.role)
  if (isStaffRole(role)) {
    alert('This is a staff account. Use Staff / OCC login.')
    switchRoute('staff-login')
    return
  }
  customerUser = { ...user, role: 'customer' }
  persistCustomerSession()
  switchRoute('my-trips')
}

function renderSignUpView() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return
  contentArea.innerHTML = `
    <div class="card" style="max-width: 440px; margin: 24px auto;">
      <h1 class="page-title display-title">Create account</h1>
      <p class="supporting-text" style="margin-bottom: 16px;">New accounts receive the Customer role.</p>
      <form onsubmit="event.preventDefault(); handleSignUp();">
        <div class="input-group"><label class="input-label">Full name</label><input id="signup-name" class="input-field" required></div>
        <div class="input-group"><label class="input-label">Email</label><input type="email" id="signup-email" class="input-field" required></div>
        <div class="input-group"><label class="input-label">Password</label><input type="password" id="signup-password" class="input-field" required></div>
        <button class="btn-primary" type="submit" style="width:100%;">Create customer account →</button>
      </form>
    </div>
  `
}

function handleSignUp() {
  const name = document.getElementById('signup-name').value.trim()
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value.trim()
  if (USERS_DB.some((u) => u.email === email)) {
    alert('Email already registered.')
    return
  }
  const newUser = { name, email, password, role: 'customer', date: '11 Aug 2026' }
  USERS_DB.push(newUser)
  saveUserDatabase()
  customerUser = { ...newUser }
  persistCustomerSession()
  switchRoute('my-trips')
}

function renderMyTrips() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return
  contentArea.innerHTML = `
    <h1 class="page-title display-title" style="margin-bottom: 8px;">My Trips</h1>
    <p class="supporting-text" style="margin-bottom: 20px;">Upcoming journeys for ${currentUser.name}</p>
    <div class="card">
      <div class="card-header">
        <div>
          <span class="caption-text">${SHARED_SCENARIO.date}</span>
          <h2 class="card-title" style="color: var(--color-primary);">${SHARED_SCENARIO.flight}</h2>
        </div>
        <span class="chip chip-completed">Confirmed</span>
      </div>
      <div class="grid-2col">
        <div><span class="caption-text">Route</span><p class="body-text" style="font-weight:600;">${SHARED_SCENARIO.route}</p></div>
        <div><span class="caption-text">Boarding</span><p class="body-text" style="font-weight:600;">${SHARED_SCENARIO.boarding} · ${SHARED_SCENARIO.terminal}</p></div>
        <div><span class="caption-text">Aircraft</span><p class="body-text" style="font-weight:600;">${SHARED_SCENARIO.aircraft}</p></div>
        <div><span class="caption-text">Seat</span><p class="body-text" style="font-weight:600;">24A · Economy</p></div>
      </div>
      <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
        <button class="btn-primary" onclick="switchRoute('manage')">Manage booking</button>
        <button class="btn-header-signin" onclick="switchRoute('flight-status')">Flight status</button>
      </div>
    </div>
  `
}

function renderManageBooking() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return
  contentArea.innerHTML = `
    <div class="card" style="max-width: 520px; margin: 0 auto;">
      <h1 class="page-title display-title">Manage booking</h1>
      <p class="supporting-text" style="margin-bottom: 16px;">Check-in, seat selection, and booking changes.</p>
      <div class="input-group"><label class="input-label">Booking reference</label><input class="input-field" value="EK7X2M"></div>
      <div class="input-group"><label class="input-label">Last name</label><input class="input-field" value="Al-Mansoor"></div>
      <button class="btn-primary" style="width:100%;" onclick="alert('Demo: check-in window opens 48h before departure.')">Continue →</button>
    </div>
  `
}

function renderFlightStatus() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return
  contentArea.innerHTML = `
    <h1 class="page-title display-title" style="margin-bottom: 16px;">Flight status</h1>
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">${SHARED_SCENARIO.flight} · ${SHARED_SCENARIO.route}</h2>
        <span class="chip chip-in-progress">On time</span>
      </div>
      <div class="grid-2col">
        <div><span class="caption-text">Departure</span><p class="body-text" style="font-weight:600;">DXB T3 · ${SHARED_SCENARIO.boarding}</p></div>
        <div><span class="caption-text">Arrival</span><p class="body-text" style="font-weight:600;">LHR T3 · 13:05</p></div>
        <div><span class="caption-text">Gate</span><p class="body-text" style="font-weight:600;">A14</p></div>
        <div><span class="caption-text">Status</span><p class="body-text" style="font-weight:600;">Boarding soon</p></div>
      </div>
    </div>
  `
}

async function renderPassengerPortalView() {
  const contentArea = document.getElementById('main-content')
  if (!contentArea) return

  try {
    const response = await fetch('pages/passenger-portal.html')
    if (response.ok) {
      const htmlText = await response.text()
      contentArea.innerHTML = htmlText

      contentArea.querySelectorAll('script').forEach((oldScript) => {
        const newScript = document.createElement('script')
        Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value))
        newScript.appendChild(document.createTextNode(oldScript.innerHTML))
        oldScript.parentNode.replaceChild(newScript, oldScript)
      })
      return
    }
  } catch {
    /* fallback */
  }

  contentArea.innerHTML = `
    <div class="card" style="max-width: 520px; margin: 0 auto; text-align: center; padding: 28px;">
      <h1 class="page-title" style="margin-bottom: 8px;">Passenger Portal</h1>
      <p class="supporting-text" style="margin-bottom: 16px;">
        Passenger Portal loaded.
      </p>
      <button class="btn-primary" onclick="switchRoute('landing')">Return to Home →</button>
    </div>
  `
}

/* —— Staff login —— */
function renderStaffLogin() {
  applyThemeForRole('guest')
  document.body.classList.remove('customer-active', 'ops-active')
  setOpsShellVisible(false)
  ;['public-top-strip', 'public-header', 'public-bottom-nav'].forEach((id) => {
    const el = document.getElementById(id)
    if (el) el.style.display = 'none'
  })
  const contentArea = document.getElementById('main-content')
  if (contentArea) contentArea.style.display = 'block'

  contentArea.innerHTML = `
    <div class="card" style="max-width: 480px; margin: 40px auto;">
      <span class="caption-text">DXB OPERATIONS</span>
      <h1 class="page-title">Staff / OCC Login</h1>
      <p class="supporting-text" style="margin-bottom: 16px;">Tower, Operations, and Admin access the management workspace here.</p>
      <form onsubmit="event.preventDefault(); handleStaffLogin();">
        <div class="input-group">
          <label class="input-label">Staff email</label>
          <input type="email" id="staff-email" class="input-field" placeholder="staff@dxb.gov.ae" required>
        </div>
        <div class="input-group">
          <label class="input-label">Password</label>
          <input type="password" id="staff-password" class="input-field" placeholder="••••••••" required>
        </div>
        <button class="btn-primary" type="submit" style="width:100%;">Authenticate →</button>
      </form>
      <p style="margin-top:16px; text-align:center;">
        <a href="#landing" onclick="event.preventDefault(); applyThemeForRole('guest'); switchRoute('landing')" style="color: var(--text-secondary);">← Back to customer site</a>
      </p>
    </div>
  `
}

function handleStaffLogin() {
  const email = document.getElementById('staff-email').value.trim()
  const password = document.getElementById('staff-password').value.trim()
  const user = USERS_DB.find((u) => u.email === email && u.password === password)
  if (!user || !isStaffRole(user.role)) {
    alert('Access denied. Use a staff account (admin / tower / ops).')
    return
  }
  staffUser = { ...user, role: normalizeRole(user.role) }
  persistStaffSession()
  currentAdminModule = getDefaultModule(staffUser.role) || 'dashboard'
  switchRoute('admin')
}

/* —— OCC modules —— */
async function loadAdminModule(moduleId) {
  const role = normalizeRole(currentUser.role)

  if (!canAccessModule(role, moduleId)) {
    alert(`Role "${getAccess(role).label}" cannot access this module.`)
    moduleId = getDefaultModule(role) || 'dashboard'
  }

  currentAdminModule = moduleId
  sessionStorage.setItem('EMIRATES_DXB_OCC_MODULE', moduleId)
  buildOpsNav()

  const title = document.getElementById('ops-page-title')
  const meta = document.getElementById('ops-page-meta')
  const metaInfo = MODULE_META[moduleId] || { label: moduleId }
  if (title) title.textContent = metaInfo.label
  if (meta) meta.textContent = `${getAccess(role).label} · ${SHARED_SCENARIO.airport}`

  const host = document.getElementById('ops-content')
  if (!host) return

  if (moduleId === 'user-management') {
    renderUserManagementModule(host)
    return
  }
  if (moduleId === 'dashboard') {
    renderAdminDashboard(host)
    return
  }

  try {

    const response = await fetch(`pages/${moduleId}.html?v=${Date.now()}`)

    if (response.ok) {
      const htmlText = await response.text()
      const cleaned = htmlText.replace(/<!--[\s\S]*?-->/g, '').trim()

      if (cleaned.length > 40) {
        if (
          window.TowerHub &&
          window.TowerHub.destroyTimers
        ) {
          window.TowerHub.destroyTimers()
        }

        host.innerHTML = htmlText

        // Re-run inline scripts only
        host.querySelectorAll('script').forEach((oldScript) => {
          if (oldScript.src) {
            oldScript.remove()
            return
          }

          const newScript = document.createElement('script')
          newScript.textContent = oldScript.textContent
          oldScript.parentNode.replaceChild(newScript, oldScript)
        })

        // Initialize Tower module
        if (
          moduleId === 'tower-control' &&
          window.TowerHub
        ) {
          window.TowerHub.init()
        }

        // Initialize Gate Management Intelligence
        if (moduleId === 'gate-management') {
          if (typeof filterGateTable === 'function') {
            filterGateTable()
          }

          if (window.GateIntelligence) {
            if (
              typeof window.GateIntelligence.renderGateRecommendation === 'function'
            ) {
              window.GateIntelligence.renderGateRecommendation()
            }

            if (
              typeof window.GateIntelligence.renderDelayImpactAlert === 'function'
            ) {
              window.GateIntelligence.renderDelayImpactAlert()
            }

            if (
              typeof window.GateIntelligence.renderTemporalConflictAlert === 'function'
            ) {
              window.GateIntelligence.renderTemporalConflictAlert()
            }
          }
        }

        return
      }
    }
  } catch (error) {
    console.error(
      `[Emirates-DXB] Failed to load module: ${moduleId}`,
      error
    )
  }
    /* fallback */

  renderModulePlaceholder(host, moduleId)
}

function renderAdminDashboard(host) {
  const role = normalizeRole(currentUser.role)
  const access = getAccess(role)
  const moduleChips = access.modules
    .filter((m) => m !== 'dashboard' && m !== 'user-management')
    .map((m) => {
      const meta = MODULE_META[m] || { label: m }
      return `<button class="btn-header-signin" style="margin:4px;" onclick="loadAdminModule('${m}')">${meta.label}</button>`
    })
    .join('')

  host.innerHTML = `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div>
          <span class="caption-text">Live scenario</span>
          <h2 class="card-title" style="color: var(--color-primary);">${SHARED_SCENARIO.flight}</h2>
        </div>
        <span class="chip chip-completed">Scheduled</span>
      </div>
      <p class="supporting-text">${SHARED_SCENARIO.route} · ${SHARED_SCENARIO.terminal} · Boarding ${SHARED_SCENARIO.boarding}</p>
      <div style="margin-top:12px;">${moduleChips}</div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Operational snapshot</h3>
        <span class="supporting-text">${SHARED_SCENARIO.date}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <div><p class="body-text" style="font-weight:600;">Runway 12L & 12R</p><span class="supporting-text">Normal operations</span></div>
          <span class="chip chip-completed">Active</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><p class="body-text" style="font-weight:600;">Gate A14</p><span class="supporting-text">EK 001 boarding</span></div>
          <span class="chip chip-in-progress">In progress</span>
        </div>
      </div>
    </div>
  `
}

function renderRoleMatrixHTML() {
  return `
    <div class="card role-matrix-card" style="margin-bottom: 16px;">
      <h3 class="card-title" style="margin-bottom: 12px;">Role & access matrix</h3>
      <table>
        <thead>
          <tr>
            <th>Area</th>
            <th>Guest</th>
            <th>Customer</th>
            <th>Tower</th>
            <th>Ops</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Book / public site</td><td class="access-yes">✓</td><td class="access-yes">✓</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-yes">✓</td></tr>
          <tr><td>My Trips / Manage</td><td class="access-no">—</td><td class="access-yes">✓</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-no">—</td></tr>
          <tr><td>Tower Control</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-yes">✓</td><td class="access-no">—</td><td class="access-yes">✓</td></tr>
          <tr><td>Gates / Turnaround / Crew</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-yes">✓</td><td class="access-yes">✓</td></tr>
          <tr><td>User management</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-no">—</td><td class="access-yes">✓</td></tr>
        </tbody>
      </table>
    </div>
  `
}

function renderUserManagementModule(host) {
  if (!getAccess(currentUser.role).canManageUsers) {
    host.innerHTML = `<div class="card"><p>Access denied.</p></div>`
    return
  }

  const rows = USERS_DB.map(
    (u) => `
    <tr>
      <td style="padding:10px 8px; font-weight:600;">${u.name}</td>
      <td style="padding:10px 8px;">${u.email}</td>
      <td style="padding:10px 8px;"><span class="chip chip-info">${normalizeRole(u.role).toUpperCase()}</span></td>
      <td style="padding:10px 8px;" class="caption-text">${u.date || '—'}</td>
    </tr>`
  ).join('')

  host.innerHTML = `
    <div class="grid-2col">
      <div class="card">
        <h2 class="card-title" style="margin-bottom:12px;">Add user</h2>
        <form onsubmit="event.preventDefault(); handleAddNewUserByAdmin();">
          <div class="input-group"><label class="input-label">Name</label><input id="newuser-name" class="input-field" required></div>
          <div class="input-group"><label class="input-label">Email</label><input type="email" id="newuser-email" class="input-field" required></div>
          <div class="input-group"><label class="input-label">Password</label><input type="password" id="newuser-password" class="input-field" required></div>
          <div class="input-group">
            <label class="input-label">Role</label>
            <select id="newuser-role" class="input-field">
              <option value="customer">Customer — passenger portal</option>
              <option value="tower">Tower — tower modules only</option>
              <option value="ops">Ops — ground operations modules</option>
              <option value="admin">Admin — full OCC + users</option>
            </select>
          </div>
          <button class="btn-primary" type="submit">Create account →</button>
        </form>
      </div>
      <div class="card">
        <h2 class="card-title" style="margin-bottom:12px;">Users (${USERS_DB.length})</h2>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead><tr style="color:var(--text-secondary); border-bottom:1px solid var(--border-color);">
              <th style="text-align:left; padding:8px;">Name</th>
              <th style="text-align:left; padding:8px;">Email</th>
              <th style="text-align:left; padding:8px;">Role</th>
              <th style="text-align:left; padding:8px;">Date</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
    ${renderRoleMatrixHTML()}
  `
}

function handleAddNewUserByAdmin() {
  const name = document.getElementById('newuser-name').value.trim()
  const email = document.getElementById('newuser-email').value.trim()
  const password = document.getElementById('newuser-password').value.trim()
  const role = document.getElementById('newuser-role').value
  USERS_DB.push({ name, email, password, role, date: '11 Aug 2026' })
  saveUserDatabase()
  loadAdminModule('user-management')
}

function renderModulePlaceholder(host, moduleId) {
  const name = (MODULE_META[moduleId] && MODULE_META[moduleId].label) || moduleId
  host.innerHTML = `
    <div class="card">
      <span class="caption-text">Module base</span>
      <h1 class="page-title">${name}</h1>
      <p class="supporting-text" style="margin: 12px 0 16px;">
        Base shell for <strong>${name}</strong> is ready. Role-gated for your account.
        Extend this module under <code>pages/${moduleId}.html</code>.
      </p>
      <button class="btn-primary" onclick="loadAdminModule('dashboard')">← OCC Dashboard</button>
    </div>
  `
}

// Back-compat aliases used by older inline handlers
function handleAdminLogout() {
  handleStaffLogout()
}