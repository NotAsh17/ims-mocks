/* ============================================================
   SimCat Auth — minimal client-side user system on localStorage
   Exposes: window.SimCatAuth
   ============================================================ */
(function (window) {
  'use strict';

  const KEY_USERS    = 'simcat_users';
  const KEY_CURRENT  = 'simcat_currentUser';
  const KEY_RESULTS  = 'simcat_results_';   // + userId
  const KEY_PROGRESS = 'simcat_progress_';  // + userId  (in-progress test resume — future use)

  // ── User CRUD ────────────────────────────────────────────────
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(KEY_USERS)) || []; }
    catch { return []; }
  }
  function setUsers(arr) {
    localStorage.setItem(KEY_USERS, JSON.stringify(arr));
  }
  function getCurrentUserId() {
    return localStorage.getItem(KEY_CURRENT);
  }
  function getCurrentUser() {
    const id = getCurrentUserId();
    return id ? getUsers().find(u => u.id === id) || null : null;
  }
  function login(userId) {
    localStorage.setItem(KEY_CURRENT, userId);
  }
  function logout() {
    localStorage.removeItem(KEY_CURRENT);
  }
  function createUser(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Name required');

    // Generate ID from name + short suffix (so duplicate names work)
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20).replace(/^_|_$/g, '');
    const suffix = Date.now().toString(36).slice(-4);
    const id = `${slug || 'user'}_${suffix}`;

    const user = { id, name: trimmed, createdAt: new Date().toISOString() };
    const users = getUsers();
    users.push(user);
    setUsers(users);
    return user;
  }
  function deleteUser(userId) {
    setUsers(getUsers().filter(u => u.id !== userId));
    localStorage.removeItem(KEY_RESULTS + userId);
    localStorage.removeItem(KEY_PROGRESS + userId);
    if (getCurrentUserId() === userId) logout();
  }

  // ── Seed dummy accounts (only if no users exist yet) ─────────
  function seedDummyUsers() {
    if (getUsers().length > 0) return;
    const stamp = new Date().toISOString();
    setUsers([
      { id: 'demo',   name: 'Demo',   createdAt: stamp },
      { id: 'ash',    name: 'Ash',    createdAt: stamp },
      { id: 'friend', name: 'Friend', createdAt: stamp },
    ]);
  }

  // ── Results (per user, keyed by testName) ────────────────────
  function getUserResults(userId) {
    if (!userId) return {};
    try { return JSON.parse(localStorage.getItem(KEY_RESULTS + userId)) || {}; }
    catch { return {}; }
  }
  function saveUserResult(userId, testName, result) {
    if (!userId) return;
    const all = getUserResults(userId);
    all[testName] = all[testName] || [];
    all[testName].unshift({ ...result, date: result.date || new Date().toISOString() });
    all[testName] = all[testName].slice(0, 10);
    localStorage.setItem(KEY_RESULTS + userId, JSON.stringify(all));
  }
  function getTestAttempts(userId, testName) {
    return getUserResults(userId)[testName] || [];
  }
  function clearUserResults(userId) {
    localStorage.removeItem(KEY_RESULTS + userId);
  }

  // ── Avatar colour from id (deterministic) ────────────────────
  function avatarColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const palette = ['#6366f1', '#22c55e', '#f59e0b', '#a855f7', '#38bdf8', '#ec4899', '#14b8a6'];
    return palette[h % palette.length];
  }
  function avatarInitial(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  // ── Public API ───────────────────────────────────────────────
  window.SimCatAuth = {
    getUsers, getCurrentUserId, getCurrentUser,
    login, logout,
    createUser, deleteUser, seedDummyUsers,
    getUserResults, saveUserResult, getTestAttempts, clearUserResults,
    avatarColor, avatarInitial,
  };
})(window);
