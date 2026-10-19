import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, sendEmailVerification, reload
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, query, orderByChild,
  equalTo, limitToLast, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, OWNER_EMAIL, DEFAULT_SYSTEM_CONFIG } from "./firebase-config.js";
import { JOBS, SHOPS, PRODUCTS, STORE_CATEGORIES, CARDS, BANK_PRODUCTS, CRYPTO } from "./catalog.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// The HTML shell owns a watchdog so a failed ES-module import cannot leave a spinner forever.
function finishInitialBoot() { window.__TLA_BOOT?.success?.(); }

let currentUser = null;
let profile = null;
let game = null;
let isAdmin = false;
let currentView = "home";
let authMode = "login";
let identityMode = "email";
let jobFilter = "all";
let jobSearch = "";
let storeFilter = "all";
let storeSearch = "";
let selectedShop = null;
let productSearch = "";
let cardSearch = "";
let leaderboard = [];
let liveCasinoFeed = [];
let activeDuels = [];
let adminUsers = [];
let adminSelectedUid = null;
let systemConfig = { ...DEFAULT_SYSTEM_CONFIG };
let latestTransactions = [];
let pendingInbox = [];
let pendingChecks = [];
let listeners = [];
let saveQueue = Promise.resolve();
let resolvingInbox = false;
let resolvingChecks = false;
let activeTicker = null;
let passwordVisible = false;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const normalizeUsername = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20);
const compactName = value => String(value || "L").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase().slice(0, 2) || "L";
const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimalFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const money = value => `Cr$ ${numberFmt.format(Math.max(0, Number(value) || 0))}`;
const signedMoney = value => `${Number(value) >= 0 ? "+" : "−"}Cr$ ${numberFmt.format(Math.abs(Number(value) || 0))}`;
const number = value => Number(value) || 0;
const dateLabel = value => value ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Agora";
const timeLabel = milliseconds => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const adminClaim = user => Boolean(user?.email && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase() && user.emailVerified === true);
const totalWealth = g => number(g?.cash) + number(g?.bank) + number(g?.vault) + number(g?.investments) + Object.entries(g?.cryptoHoldings || {}).reduce((sum, [symbol, units]) => sum + number(units) * cryptoPrice(symbol), 0) + (g?.inventory || []).reduce((sum, item) => sum + number(item.currentValue || item.price * 0.7), 0);
const DEFAULT_AVATAR_COLORS = ["#c5a86e", "#8e9ad2", "#6bb69a", "#c28a9c", "#7ba5c5", "#b2a071"];

function defaultGame() {
  return {
    cash: number(systemConfig.startingCash ?? DEFAULT_SYSTEM_CONFIG.startingCash),
    bank: number(systemConfig.startingBank ?? DEFAULT_SYSTEM_CONFIG.startingBank),
    vault: 0,
    investments: 0,
    investmentPositions: [],
    cryptoHoldings: {},
    inventory: [],
    ownedCards: [],
    activeCardId: null,
    activeWork: null,
    history: [],
    checks: [],
    xp: 0,
    level: 1,
    completedJobs: 0,
    totalEarned: 0,
    totalCasinoWinnings: 0,
    claimedTransfers: {},
    claimedChecks: {},
    claimedDuels: {},
    savingsLastAccruedAt: Date.now(),
    createdAt: Date.now(),
    preferences: { compactNumbers: false }
  };
}

function addHistory(targetGame, title, amount = 0, type = "info", meta = "") {
  const history = Array.isArray(targetGame.history) ? targetGame.history : [];
  history.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, amount: number(amount), type, meta, at: Date.now() });
  targetGame.history = history.slice(0, 100);
}

function toast(title, message = "", type = "success") {
  const stack = $("#toast-stack");
  if (!stack) return;
  const element = document.createElement("div");
  element.className = `toast ${type === "error" ? "error" : ""}`;
  element.innerHTML = `<span class="toast-icon"><i data-lucide="${type === "error" ? "alert-circle" : "check-circle-2"}"></i></span><div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
  stack.appendChild(element);
  window.lucide?.createIcons();
  setTimeout(() => { element.style.opacity = "0"; element.style.transform = "translateY(8px)"; setTimeout(() => element.remove(), 250); }, 4400);
}

function showAuthError(message) {
  const box = $("#auth-error");
  if (!box) return;
  box.textContent = message;
  box.classList.remove("hidden");
}
function clearAuthError() { $("#auth-error")?.classList.add("hidden"); }
function errorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/invalid-credential": "E-mail/nome de usuário ou senha incorretos.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/user-not-found": "Esta conta não foi encontrada.",
    "auth/email-already-in-use": "Este e-mail ou nome de usuário já está cadastrado.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "O e-mail informado não é válido.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes da conclusão.",
    "auth/unauthorized-domain": "Este domínio ainda não está autorizado no Firebase Authentication.",
    "auth/operation-not-allowed": "Ative este método de login no Firebase Console.",
    "auth/network-request-failed": "Falha de conexão. Verifique a internet e tente novamente.",
    "PERMISSION_DENIED": "O Firebase recusou o acesso. Confira as regras do Realtime Database.",
    "NETWORK_ERROR": "Não foi possível conectar ao banco de dados. Confira a URL do Realtime Database."
  };
  if (messages[code]) return messages[code];
  if (String(error?.message || "").includes("permission_denied")) return messages.PERMISSION_DENIED;
  if (String(error?.message || "").toLowerCase().includes("database url")) return messages.NETWORK_ERROR;
  return error?.message || "Ocorreu um erro inesperado. Tente novamente.";
}

function identityEmail(value, mode = identityMode) {
  if (mode === "email" || String(value).includes("@")) return String(value).trim().toLowerCase();
  const username = normalizeUsername(value);
  return `${username}@username.thelifeapp.app`;
}

function toggleIdentityMode(mode) {
  identityMode = mode;
  $$("[data-identity-mode]").forEach(button => button.classList.toggle("active", button.dataset.identityMode === mode));
  const label = $("#identity-label");
  const input = $("#auth-identity");
  const hint = $("#auth-identity-hint");
  if (!label || !input || !hint) return;
  if (mode === "email") {
    label.textContent = "E-mail";
    input.placeholder = "voce@exemplo.com";
    input.autocomplete = "username";
    hint.textContent = authMode === "register" ? "Use um e-mail válido para sua conta." : "Use seu e-mail cadastrado.";
  } else {
    label.textContent = "Nome de usuário";
    input.placeholder = "seu_nome";
    input.autocomplete = "username";
    hint.textContent = "Use o nome escolhido ao criar sua conta por nome de usuário.";
  }
  const nameGroup = $("#register-name-group");
  if (authMode === "register") nameGroup?.classList.remove("hidden");
  else nameGroup?.classList.add("hidden");
}

function setAuthMode(mode) {
  authMode = mode;
  clearAuthError();
  $$("[data-auth-mode]").forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
  $("#auth-title").textContent = mode === "login" ? "Entre no seu mundo." : "Crie sua próxima história.";
  $("#auth-subtitle").textContent = mode === "login" ? "Continue de onde sua história parou." : "Uma conta. Um universo inteiro para construir.";
  $("#auth-submit span").textContent = mode === "login" ? "Entrar na plataforma" : "Criar minha conta";
  $("#register-name-group").classList.toggle("hidden", mode !== "register");
  $("#google-login").classList.toggle("hidden", mode === "register" && identityMode === "username");
  $("#auth-password").autocomplete = mode === "login" ? "current-password" : "new-password";
  toggleIdentityMode(identityMode);
}

function reserveUsername(username, uid) {
  const key = normalizeUsername(username);
  if (key.length < 3) return Promise.resolve({ ok: false, reason: "O nome de usuário precisa ter pelo menos 3 caracteres." });
  return runTransaction(ref(database, `usernameIndex/${key}`), current => current === null ? uid : current === uid ? uid : undefined)
    .then(result => result.committed || result.snapshot.val() === uid ? { ok: true, key } : { ok: false, reason: "Este nome de usuário já está em uso. Escolha outro." });
}

function createPublicProfile(uid, profileData, gameData) {
  return {
    uid,
    username: profileData.username || "Jogador",
    usernameKey: normalizeUsername(profileData.username || "Jogador"),
    displayName: profileData.displayName || profileData.username || "Jogador",
    level: number(gameData?.level) || 1,
    netWorth: Math.round(totalWealth(gameData)),
    joinedAt: number(profileData.joinedAt) || Date.now(),
    avatarColor: profileData.avatarColor || DEFAULT_AVATAR_COLORS[uid.charCodeAt(0) % DEFAULT_AVATAR_COLORS.length]
  };
}

async function ensureUserRecord(user, incoming = {}) {
  const initialConfigSnap = await get(ref(database, "system/config"));
  systemConfig = { ...DEFAULT_SYSTEM_CONFIG, ...(initialConfigSnap.val() || {}) };
  if (adminClaim(user) && !initialConfigSnap.exists()) {
    await set(ref(database, "system/config"), systemConfig);
  }
  const userPath = `users/${user.uid}`;
  const snap = await get(ref(database, userPath));
  let savedProfile = snap.exists() ? (snap.child("profile").val() || {}) : {};
  let savedGame = snap.exists() ? (snap.child("game").val() || {}) : {};
  if (!snap.exists() || !snap.child("profile").exists()) {
    const userEmail = user.email || "";
    let chosenName = incoming.username || user.displayName || (userEmail.includes("@") && !userEmail.endsWith("@username.thelifeapp.app") ? userEmail.split("@")[0] : `player${user.uid.slice(0, 6)}`);
    let reserved = await reserveUsername(chosenName, user.uid);
    if (!reserved.ok) {
      chosenName = `player${user.uid.slice(0, 6)}`;
      reserved = await reserveUsername(chosenName, user.uid);
    }
    if (!reserved.ok) throw new Error(reserved.reason);
    if (incoming.username && normalizeUsername(incoming.username) !== reserved.key) throw new Error("Este nome de usuário já está em uso. Tente outro.");
    savedProfile = {
      email: userEmail.endsWith("@username.thelifeapp.app") ? null : userEmail,
      accountType: userEmail.endsWith("@username.thelifeapp.app") ? "username" : "email",
      username: incoming.username || chosenName,
      displayName: incoming.username || chosenName,
      joinedAt: Date.now(),
      avatarColor: DEFAULT_AVATAR_COLORS[user.uid.charCodeAt(0) % DEFAULT_AVATAR_COLORS.length]
    };
    if (incoming.username && !userEmail.endsWith("@username.thelifeapp.app") && incoming.username !== chosenName) {
      // O nome informado no cadastro é a identidade pública; a reserva é feita acima.
      savedProfile.username = incoming.username;
      savedProfile.displayName = incoming.username;
    }
  } else {
    if (incoming.username && incoming.username !== savedProfile.username) {
      const reserved = await reserveUsername(incoming.username, user.uid);
      if (!reserved.ok) throw new Error(reserved.reason);
      const oldKey = normalizeUsername(savedProfile.username);
      if (oldKey !== reserved.key) await set(ref(database, `usernameIndex/${oldKey}`), null);
      savedProfile.username = incoming.username;
      savedProfile.displayName = incoming.username;
    }
  }

  savedGame = { ...defaultGame(), ...savedGame };
  savedGame.investmentPositions = Array.isArray(savedGame.investmentPositions) ? savedGame.investmentPositions : [];
  savedGame.inventory = Array.isArray(savedGame.inventory) ? savedGame.inventory : [];
  savedGame.ownedCards = Array.isArray(savedGame.ownedCards) ? savedGame.ownedCards : [];
  savedGame.history = Array.isArray(savedGame.history) ? savedGame.history : [];
  savedGame.cryptoHoldings = savedGame.cryptoHoldings || {};
  savedGame.claimedTransfers = savedGame.claimedTransfers || {};
  savedGame.claimedChecks = savedGame.claimedChecks || {};
  savedGame.claimedDuels = savedGame.claimedDuels || {};
  savedGame.level = Math.max(1, number(savedGame.level));
  if (isAdmin && !savedGame.activeCardId && savedGame.ownedCards.length) savedGame.activeCardId = savedGame.ownedCards[0].id;

  profile = savedProfile;
  game = savedGame;
  isAdmin = adminClaim(user);
  if (!snap.exists() || !snap.child("game").exists() || !snap.child("profile").exists()) {
    await Promise.all([
      set(ref(database, `${userPath}/profile`), profile),
      set(ref(database, `${userPath}/game`), game),
      set(ref(database, `publicProfiles/${user.uid}`), createPublicProfile(user.uid, profile, game))
    ]);
  } else {
    await set(ref(database, `publicProfiles/${user.uid}`), createPublicProfile(user.uid, profile, game));
  }
  await accrueOfflineReturns();
  await settleCompletedWork();
  await applyKnownDuelResults();
  await persistGame(true);
}

function persistGame(silent = false) {
  if (!currentUser || !game || !profile) return Promise.resolve();
  const gameCopy = clone(game);
  const profileCopy = clone(profile);
  const publicCopy = createPublicProfile(currentUser.uid, profileCopy, gameCopy);
  saveQueue = saveQueue.catch(() => {}).then(() => Promise.all([
    set(ref(database, `users/${currentUser.uid}/game`), gameCopy),
    set(ref(database, `publicProfiles/${currentUser.uid}`), publicCopy)
  ])).catch(error => {
    if (!silent) toast("Falha ao salvar", errorMessage(error), "error");
    throw error;
  });
  return saveQueue;
}

function updateUserShell() {
  if (!profile || !game) return;
  const shownName = profile.displayName || profile.username || "Jogador";
  $("#sidebar-name").textContent = shownName;
  $("#sidebar-avatar").textContent = compactName(shownName);
  $("#topbar-avatar").textContent = compactName(shownName);
  $("#sidebar-tier").textContent = isAdmin ? "PROPRIETÁRIO" : (number(game.level) >= 20 ? "MEMBRO ELITE" : number(game.level) >= 8 ? "MEMBRO PLUS" : "MEMBRO");
  $("#topbar-cash").textContent = money(game.cash);
  $$(".admin-nav").forEach(item => item.classList.toggle("hidden", !isAdmin));
}

function showApplication() {
  $("#auth-screen").classList.add("hidden");
  $("#application").classList.remove("hidden");
  updateUserShell();
  render();
  installRealtimeListeners();
  if (activeTicker) clearInterval(activeTicker);
  activeTicker = setInterval(() => {
    updateWorkClock();
    if (game?.activeWork && !game.activeWork.ready && Date.now() >= game.activeWork.startedAt + game.activeWork.durationMs) settleCompletedWork();
    processIncomingTransfers();
    processIncomingChecks();
    if (currentView === "casino") updateCasinoFeedOnly();
  }, 1000);
}

function stopListeners() {
  listeners.forEach(unsubscribe => { try { unsubscribe(); } catch {} });
  listeners = [];
  if (activeTicker) clearInterval(activeTicker);
  activeTicker = null;
}

function installRealtimeListeners() {
  stopListeners();
  if (!currentUser) return;
  const uid = currentUser.uid;
  listeners.push(onValue(ref(database, "system/config"), snap => {
    systemConfig = { ...DEFAULT_SYSTEM_CONFIG, ...(snap.val() || {}) };
    if (currentView === "admin") render();
  }));
  listeners.push(onValue(ref(database, "publicProfiles"), snap => {
    const data = snap.val() || {};
    leaderboard = Object.entries(data).map(([id, item]) => ({ uid: id, ...item })).sort((a, b) => number(b.netWorth) - number(a.netWorth)).slice(0, 100);
    if (currentView === "rankings") render();
  }));
  listeners.push(onValue(query(ref(database, "casinoFeed"), limitToLast(18)), snap => {
    const data = snap.val() || {};
    liveCasinoFeed = Object.entries(data).map(([id, item]) => ({ id, ...item })).sort((a, b) => number(b.at) - number(a.at));
    updateCasinoFeedOnly();
  }));
  listeners.push(onValue(ref(database, "duels"), snap => {
    const data = snap.val() || {};
    activeDuels = Object.entries(data).map(([id, duel]) => ({ id, ...duel })).filter(duel => !duel.result && Date.now() - number(duel.createdAt) < 24 * 3600000).sort((a, b) => number(b.createdAt) - number(a.createdAt));
    resolveOpenDuelsAsCreator();
    applyKnownDuelResults();
    if (currentView === "casino") updateDuelListOnly();
  }));
  listeners.push(onValue(ref(database, `transfers/${uid}`), snap => {
    pendingInbox = Object.entries(snap.val() || {}).map(([id, item]) => ({ id, ...item }));
    processIncomingTransfers();
  }));
  listeners.push(onValue(ref(database, `checkbook/${uid}`), snap => {
    pendingChecks = Object.entries(snap.val() || {}).map(([id, item]) => ({ id, ...item }));
    processIncomingChecks();
  }));
}

async function accrueOfflineReturns() {
  if (!game) return;
  const now = Date.now();
  const previous = number(game.savingsLastAccruedAt) || now;
  const elapsedHours = Math.max(0, Math.min(24 * 365, (now - previous) / 3600000));
  if (number(game.vault) > 0 && elapsedHours > 0) {
    const gain = Math.floor(number(game.vault) * (0.007 / 24) * elapsedHours);
    if (gain > 0) {
      game.vault += gain;
      addHistory(game, "Rendimento do cofrinho", gain, "positive", "Rendimento simulado por tempo decorrido");
    }
  }
  game.savingsLastAccruedAt = now;
  let investmentChanged = false;
  game.investmentPositions = (game.investmentPositions || []).map(position => {
    const last = number(position.lastAccruedAt) || number(position.startedAt) || now;
    const term = Math.max(3600000, number(position.termMs) || 30 * 86400000);
    const remainingMs = Math.max(0, term - (last - number(position.startedAt || last)));
    const elapsed = Math.min(Math.max(0, now - last), Math.max(term, 365 * 86400000));
    const alreadyPaid = number(position.profitPaid) || 0;
    const totalProfit = number(position.investedAmount) * number(position.rate);
    const targetProfit = Math.min(totalProfit, totalProfit * Math.min(1, (now - number(position.startedAt || now)) / term));
    const profit = Math.max(0, Math.floor(targetProfit - alreadyPaid));
    if (profit > 0 && elapsed > 0) {
      position.currentValue = number(position.currentValue) + profit;
      position.profitPaid = alreadyPaid + profit;
      game.investments = number(game.investments) + profit;
      investmentChanged = true;
      addHistory(game, `Rendimento: ${position.name}`, profit, "positive", "Retorno de investimento virtual");
    }
    position.lastAccruedAt = now;
    position.matured = now >= number(position.startedAt) + term;
    return position;
  });
  if (investmentChanged) toast("Investimentos atualizados", "Os rendimentos do período foram creditados.");
}

async function settleCompletedWork() {
  if (!game?.activeWork || game.activeWork.ready) return;
  const work = game.activeWork;
  if (Date.now() < number(work.startedAt) + number(work.durationMs)) return;
  const job = JOBS.find(item => item.id === work.jobId);
  if (work.challenge || job?.challenge) {
    game.activeWork.ready = true;
    game.activeWork.readyAt = Date.now();
    game.activeWork.challenge = game.activeWork.challenge || makeChallenge(job || { difficulty: "Moderada" });
    addHistory(game, `Etapa finalizada: ${work.title}`, 0, "info", "Desafio final disponível");
    await persistGame();
    if (currentView === "work") render();
    toast("Trabalho concluído", "Resolva a etapa final para receber a recompensa.");
    return;
  }
  const payout = Math.round(number(work.payout) * number(systemConfig.workRewardMultiplier || 1));
  game.cash = number(game.cash) + payout;
  game.xp = number(game.xp) + Math.max(25, Math.round(payout / 100));
  game.completedJobs = number(game.completedJobs) + 1;
  game.totalEarned = number(game.totalEarned) + payout;
  addHistory(game, `Salário: ${work.title}`, payout, "positive", `Trabalho de ${work.durationMin} min`);
  game.activeWork = null;
  levelUpIfNeeded();
  await persistGame();
  updateUserShell();
  if (currentView === "work" || currentView === "home") render();
  toast("Salário creditado", `${work.title}: ${money(payout)} adicionados à carteira.`);
}

function makeChallenge(job) {
  const hard = job?.difficulty === "Alta" || job?.tier === "fortune";
  const a = hard ? 17 + Math.floor(Math.random() * 34) : 6 + Math.floor(Math.random() * 22);
  const b = hard ? 7 + Math.floor(Math.random() * 29) : 3 + Math.floor(Math.random() * 18);
  const op = hard ? ["×", "+", "−"][Math.floor(Math.random() * 3)] : ["+", "−"][Math.floor(Math.random() * 2)];
  const answer = op === "×" ? a * b : op === "+" ? a + b : a - b;
  return { a, b, op, answer, difficulty: hard ? "Alta" : "Moderada", attempts: 0 };
}

function levelUpIfNeeded() {
  const xp = number(game.xp);
  const nextLevel = Math.max(1, Math.floor(Math.sqrt(xp / 150)) + 1);
  if (nextLevel > number(game.level)) {
    game.level = nextLevel;
    toast("Novo nível desbloqueado", `Você agora está no nível ${nextLevel}.`);
  }
}

async function applyKnownDuelResults() {
  if (!currentUser || !game) return;
  const snap = await get(ref(database, "duels"));
  const duels = snap.val() || {};
  let changed = false;
  for (const [id, duel] of Object.entries(duels)) {
    if (!duel?.result || duel.result.winnerUid !== currentUser.uid || game.claimedDuels?.[id]) continue;
    const participants = Object.values(duel.participants || {});
    const stake = number(duel.stake);
    const payout = Math.floor(stake * participants.length * 0.95);
    game.cash = number(game.cash) + payout;
    game.claimedDuels[id] = true;
    addHistory(game, "Vitória em duelo", payout, "positive", `Partida multiplayer #${id.slice(-5)}`);
    game.totalCasinoWinnings = number(game.totalCasinoWinnings) + payout;
    changed = true;
    toast("Vitória no duelo", `Você recebeu ${money(payout)}.`);
  }
  if (changed) await persistGame(true);
}

async function resolveOpenDuelsAsCreator() {
  if (!currentUser || !activeDuels.length) return;
  for (const duel of activeDuels) {
    const participants = Object.values(duel.participants || {});
    if (participants.length < 2 || duel.creatorUid !== currentUser.uid || duel.result) continue;
    const winner = participants[Math.floor(Math.random() * participants.length)];
    try {
      await runTransaction(ref(database, `duels/${duel.id}/result`), current => current || { winnerUid: winner.uid, winnerName: winner.name, resolvedAt: Date.now() });
    } catch (error) { console.debug("Duel resolution pending", error); }
  }
}

async function processIncomingTransfers() {
  if (resolvingInbox || !currentUser || !game) return;
  resolvingInbox = true;
  try {
    let changed = false;
    for (const item of pendingInbox) {
      if (item.type === "pix" || item.type === "transfer") {
        if (number(item.availableAt) > Date.now()) continue;
        if (game.claimedTransfers?.[item.id]) continue;
        const claimRef = ref(database, `transferClaims/${currentUser.uid}/${item.id}`);
        const claimResult = await runTransaction(claimRef, current => current === null ? currentUser.uid : undefined);
        if (!claimResult.committed) { game.claimedTransfers[item.id] = true; continue; }
        game.claimedTransfers[item.id] = true;
        game.bank = number(game.bank) + number(item.amount);
        addHistory(game, `Recebimento ${item.type === "pix" ? "Pix" : "por transferência"}`, number(item.amount), "positive", `De ${item.senderName || "outro jogador"}`);
        changed = true;
      }
    }
    if (changed) {
      await persistGame(true);
      updateUserShell();
      if (["bank", "transfer", "home"].includes(currentView)) render();
      toast("Valor recebido", "Um crédito foi depositado em seu banco privado.");
    }
  } catch (error) { console.error(error); }
  finally { resolvingInbox = false; }
}

async function processIncomingChecks() {
  if (resolvingChecks || !currentUser || !game) return;
  resolvingChecks = true;
  try {
    let changed = false;
    for (const item of pendingChecks) {
      if (game.claimedChecks?.[item.id]) continue;
      const claimRef = ref(database, `checkClaims/${currentUser.uid}/${item.id}`);
      const claimResult = await runTransaction(claimRef, current => current === null ? currentUser.uid : undefined);
      if (!claimResult.committed) { game.claimedChecks[item.id] = true; continue; }
      game.claimedChecks[item.id] = true;
      game.bank = number(game.bank) + number(item.amount);
      addHistory(game, "Cheque compensado", number(item.amount), "positive", `Emitido por ${item.senderName || "outro jogador"}`);
      changed = true;
    }
    if (changed) {
      await persistGame(true);
      updateUserShell();
      if (["bank", "checks", "home"].includes(currentView)) render();
      toast("Cheque compensado", "O valor foi creditado em seu banco privado.");
    }
  } catch (error) { console.error(error); }
  finally { resolvingChecks = false; }
}

function icon(name, extra = "") { return `<i data-lucide="${esc(name)}" ${extra}></i>`; }
function renderIcons() { window.lucide?.createIcons(); }
function netWorth() { return totalWealth(game); }
function activityIcon(type) {
  if (type === "positive") return "arrow-down-left";
  if (type === "negative") return "arrow-up-right";
  if (type === "casino") return "club";
  if (type === "work") return "briefcase-business";
  if (type === "bank") return "landmark";
  return "activity";
}

function render() {
  if (!currentUser || !game) return;
  updateUserShell();
  const view = $("#view-container");
  const routeMap = {
    home: renderHome, work: renderWork, casino: renderCasino, bank: renderBank,
    cards: renderCards, market: renderMarket, stores: renderStores, transfer: renderTransfers,
    checks: renderChecks, rankings: renderRankings, apps: renderApps, admin: renderAdmin
  };
  if (!routeMap[currentView] || (currentView === "admin" && !isAdmin)) currentView = "home";
  const labels = { home: "Visão geral", work: "Carreira", casino: "Clube", bank: "Banco privado", cards: "Cartões", market: "Investimentos", stores: "Shopping", transfer: "Transferências", checks: "Cheques", rankings: "Classificação", apps: "Central de apps", admin: "Administração" };
  $("#current-section").textContent = labels[currentView] || "Visão geral";
  $$("[data-view]").forEach(button => {
    const buttonView = button.dataset.view;
    button.classList.toggle("active", buttonView === currentView);
  });
  view.innerHTML = routeMap[currentView]();
  renderIcons();
}

function pageHeading(eyebrow, title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span>${esc(eyebrow)}</div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
}
function statCard(label, value, iconName, meta, color = "gold", up = false) {
  const vars = color === "green" ? "--stat-color:#60d4a5;--stat-bg:rgba(96,212,165,.1);--stat-glow:rgba(96,212,165,.06)" : color === "blue" ? "--stat-color:#82aaff;--stat-bg:rgba(130,170,255,.1);--stat-glow:rgba(130,170,255,.07)" : color === "violet" ? "--stat-color:#ba9dff;--stat-bg:rgba(186,157,255,.1);--stat-glow:rgba(186,157,255,.06)" : "";
  return `<div class="stat-card" style="${vars}"><div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon(iconName)}</span></div><strong class="stat-value">${value}</strong><div class="stat-meta ${up ? "up" : ""}">${icon(up ? "trending-up" : "activity")}${meta}</div></div>`;
}
function renderActivity(rows, limit = 6) {
  const list = (rows || []).slice(0, limit);
  if (!list.length) return `<div class="empty-state"><span class="empty-icon">${icon("receipt-text")}</span><strong>Seu histórico começa aqui</strong><p>Suas movimentações e conquistas vão aparecer nesta lista.</p></div>`;
  return `<div class="activity-list">${list.map(item => `<div class="activity-row"><span class="activity-icon">${icon(activityIcon(item.type))}</span><div class="activity-content"><strong>${esc(item.title)}</strong><small>${esc(item.meta || "Movimentação virtual")} · ${esc(dateLabel(item.at))}</small></div><span class="activity-amount ${item.amount > 0 ? "amount-positive" : item.amount < 0 ? "amount-negative" : "amount-neutral"}">${item.amount ? signedMoney(item.amount) : "—"}</span></div>`).join("")}</div>`;
}
function appShortcut(title, ico, view, bg = "rgba(213,183,122,.1)", color = "#d5b77a") {
  return `<button class="quick-app" data-view="${esc(view)}" style="--app-bg:${bg};--app-color:${color}"><span>${icon(ico)}</span><strong>${esc(title)}</strong></button>`;
}

function renderHome() {
  const active = game.activeWork;
  const history = game.history || [];
  const topJobs = JOBS.slice(0, 3);
  const currentCard = (game.ownedCards || []).find(card => card.id === game.activeCardId) || (game.ownedCards || [])[0];
  const cardLabel = currentCard ? currentCard.name : "Nenhum cartão ativo";
  return `${`<section class="dashboard-hero"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-dot"></span> SEU UNIVERSO PARTICULAR</div><h1>Bem-vindo de volta,<br /><em>${esc((profile.displayName || profile.username || "jogador").split(/\s+/)[0])}.</em></h1><p>Seu próximo capítulo começa com uma escolha. Construa patrimônio, descubra novas oportunidades e defina o tamanho da sua história.</p><div class="hero-buttons"><button class="button button-primary" data-view="work">Explorar carreiras ${icon("arrow-up-right")}</button><button class="button button-outline" data-view="bank">Acessar banco ${icon("landmark")}</button></div></div><div class="hero-art"><div class="hero-orbit"></div><div class="hero-orbit two"></div><div class="hero-emblem"><span>L</span></div></div></section>`}
  <div class="stat-grid" style="margin-top:15px">
    ${statCard("PATRIMÔNIO TOTAL", money(netWorth()), "gem", `${number(game.level)}º nível · ${number(game.xp)} XP`, "gold", true)}
    ${statCard("CARTEIRA DISPONÍVEL", money(game.cash), "wallet", "Saldo para gastos e apostas", "green", true)}
    ${statCard("BANCO PRIVADO", money(game.bank), "landmark", "Pix, transferências e cheques", "blue", false)}
    ${statCard("TOTAL GANHO EM CARREIRAS", money(game.totalEarned), "briefcase-business", `${number(game.completedJobs)} trabalhos concluídos`, "violet", true)}
  </div>
  <div class="dashboard-lower-grid">
    <section class="panel panel-pad"><div class="panel-header"><div><h3>${active ? "Trabalho em andamento" : "Próximas oportunidades"}</h3><p>${active ? "O tempo continua contando mesmo quando você fecha o site." : "Escolha como quer construir seu patrimônio."}</p></div><button class="subtle-link" data-view="work">Ver carreiras ${icon("arrow-right")}</button></div>
      ${active ? `<div class="work-mini-row"><span class="mini-job-icon">${icon("briefcase-business")}</span><div class="mini-job-info"><strong>${esc(active.title)}</strong><span>${active.ready ? "Etapa final disponível" : `Trabalho iniciado · ${active.durationMin} min`}</span><div class="work-progress"><span data-mini-progress style="width:${Math.min(100, Math.max(0, (Date.now() - active.startedAt) / active.durationMs * 100))}%"></span></div></div><div class="mini-job-pay"><strong>${money(active.payout)}</strong><span data-work-remaining>${timeLabel(Math.max(0, active.startedAt + active.durationMs - Date.now()))}</span></div></div><div style="margin-top:12px"><button class="button ${active.ready ? "button-primary" : "button-outline"}" data-action="go-work">${active.ready ? "Resolver etapa final" : "Acompanhar trabalho"}</button></div>` : `<div class="work-mini-list">${topJobs.map(job => `<div class="work-mini-row"><span class="mini-job-icon">${icon("briefcase-business")}</span><div class="mini-job-info"><strong>${esc(job.title)}</strong><span>${esc(job.sector)} · ${job.durationMin} min</span></div><div class="mini-job-pay"><strong>${money((job.minPay + job.maxPay) / 2)}</strong><span>salário estimado</span></div></div>`).join("")}</div>`}
    </section>
    <section class="panel panel-pad"><div class="panel-header"><div><h3>Seus aplicativos</h3><p>Serviços conectados ao seu perfil.</p></div><button class="subtle-link" data-view="apps">Abrir central ${icon("arrow-right")}</button></div><div class="quick-app-grid">${appShortcut("Cassino", "club", "casino", "rgba(220,91,113,.11)", "#ee8293")}${appShortcut("Banco", "landmark", "bank", "rgba(130,170,255,.1)", "#88afff")}${appShortcut("Cartões", "credit-card", "cards")}${appShortcut("Investir", "chart-no-axes-combined", "market", "rgba(96,212,165,.1)", "#60d4a5")}${appShortcut("Shopping", "shopping-bag", "stores", "rgba(186,157,255,.1)", "#b99cff")}${appShortcut("Pix", "arrow-left-right", "transfer", "rgba(96,212,165,.1)", "#60d4a5")}</div><div style="border-top:1px solid rgba(255,255,255,.05);margin-top:18px;padding-top:14px"><div class="label-mini">CARTÃO EM USO</div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px"><div style="display:flex;align-items:center;gap:9px"><span class="mini-job-icon">${icon("credit-card")}</span><div><strong style="display:block;font-size:10px">${esc(cardLabel)}</strong><small style="display:block;color:#748198;font-size:8px;margin-top:3px">${currentCard ? `Limite ${money(currentCard.limit)}` : "Explore a coleção de cartões"}</small></div></div><button class="button button-quiet" data-view="cards">Gerenciar</button></div></div></section>
  </div>
  <div class="dashboard-lower-grid"><section class="panel panel-pad"><div class="panel-header"><div><h3>Movimentações recentes</h3><p>Um resumo das suas atividades mais recentes.</p></div><button class="subtle-link" data-view="bank">Ver extrato ${icon("arrow-right")}</button></div>${renderActivity(history, 5)}</section><section class="panel panel-pad"><div class="panel-header"><div><h3>Seu progresso</h3><p>Conquistas desbloqueadas nesta jornada.</p></div><span class="badge gold">NÍVEL ${number(game.level)}</span></div><div style="display:flex;align-items:center;gap:15px;padding:8px 0"><div style="height:70px;width:70px;flex-shrink:0;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(213,183,122,.27);background:radial-gradient(circle,rgba(213,183,122,.1),transparent);font:800 23px Manrope;color:var(--gold-bright)">${number(game.level)}</div><div style="flex:1"><strong style="font:700 12px Manrope">${number(game.level) >= 20 ? "Ícone da cidade" : number(game.level) >= 8 ? "Construtor de patrimônio" : "Primeiros passos"}</strong><p style="font-size:9px;color:#8591a5;line-height:1.8;margin:6px 0 10px">Cada trabalho concluído contribui para seu nível. Quanto mais você evolui, mais oportunidades encontra.</p><div class="work-progress"><span style="width:${Math.min(100, number(game.xp) % 150)}%"></span></div><div style="font-size:8px;color:#6f7c91;margin-top:6px">${number(game.xp)} XP acumulados</div></div></div><button class="button button-outline" style="margin-top:13px;width:100%" data-view="rankings">Ver classificação ${icon("arrow-up-right")}</button></section></div>
  <div style="margin-top:14px;font-size:8px;color:#59657a;line-height:1.7">The Life App é uma experiência de jogo com economia virtual. Créditos, investimentos, cartões e resultados não têm valor monetário real e não podem ser convertidos em dinheiro.</div>`;
}

function renderActiveWork() {
  const active = game.activeWork;
  if (!active) return "";
  const remaining = Math.max(0, number(active.startedAt) + number(active.durationMs) - Date.now());
  const progress = Math.min(100, Math.max(0, ((Date.now() - active.startedAt) / active.durationMs) * 100));
  return `<section class="panel active-work-panel"><div class="active-work-head"><div><div class="eyebrow"><span class="eyebrow-dot"></span>${active.ready ? "TRABALHO FINALIZADO" : "VOCÊ ESTÁ EM SERVIÇO"}</div><h3>${esc(active.title)}</h3></div><div class="work-timer" data-work-remaining>${active.ready ? "PRONTO" : timeLabel(remaining)}</div></div><div class="work-progress"><span data-work-progress style="width:${progress}%"></span></div><div class="active-work-bottom"><p>${active.ready ? "Conclua a etapa final para receber o salário." : `O trabalho continua em andamento se você sair do site. Salário previsto: ${money(active.payout)}.`}</p>${active.ready ? `<button class="button button-primary" data-action="show-challenge">Finalizar trabalho ${icon("arrow-right")}</button>` : `<span class="badge gold">${active.durationMin} MIN · EM ANDAMENTO</span>`}</div>${active.ready ? renderChallengeBox() : ""}</section>`;
}
function renderChallengeBox() {
  const active = game.activeWork;
  if (!active?.ready || !active.challenge) return "";
  const c = active.challenge;
  return `<div class="challenge-box"><p><strong>Etapa final (${esc(c.difficulty)}):</strong> Quanto é ${c.a} ${c.op} ${c.b}?</p><form id="job-challenge-form" class="challenge-line"><input id="challenge-answer" class="form-control" type="number" inputmode="numeric" placeholder="Sua resposta" required /><button class="button button-primary" type="submit">Confirmar</button></form><p style="font-size:8px;color:#7f8ba0;margin-top:8px">Após concluir o desafio, o salário será creditado automaticamente.</p></div>`;
}

function renderWork() {
  const activeId = game.activeWork?.jobId;
  const tabs = `<div class="segmented"><button class="${jobFilter === "all" ? "active" : ""}" data-action="job-filter" data-filter="all">Todas (120)</button><button class="${jobFilter === "quick" ? "active" : ""}" data-action="job-filter" data-filter="quick">Rápidas</button><button class="${jobFilter === "pro" ? "active" : ""}" data-action="job-filter" data-filter="pro">Profissionais</button><button class="${jobFilter === "fortune" ? "active" : ""}" data-action="job-filter" data-filter="fortune">Grandes fortunas</button></div>`;
  const jobs = JOBS.filter(job => (jobFilter === "all" || job.tier === jobFilter) && `${job.title} ${job.sector} ${job.company}`.toLowerCase().includes(jobSearch.toLowerCase()));
  return `${pageHeading("CARREIRA & OPORTUNIDADES", "Seu próximo salário começa aqui.", "Mais de 120 caminhos de carreira, do serviço rápido a missões de alto impacto. O tempo segue contando mesmo quando você está offline.", `<span class="badge gold">120+ OPORTUNIDADES</span>`)}
  ${renderActiveWork()}
  <div class="work-toolbar"><label class="search-field">${icon("search")}<input id="job-search" type="search" value="${esc(jobSearch)}" placeholder="Buscar cargo, setor ou empresa..." /></label>${tabs}</div>
  <div class="shop-stat-strip"><span class="shop-stat-pill">${icon("clock-3")} <strong>5 min</strong> trabalhos rápidos</span><span class="shop-stat-pill">${icon("briefcase-business")} <strong>10–50 min</strong> carreiras profissionais</span><span class="shop-stat-pill">${icon("crown")} <strong>1–3 horas</strong> missões de fortuna</span><span class="shop-stat-pill">${icon("wifi-off")} <strong>Offline</strong> progresso persistente</span></div>
  <div class="job-grid">${jobs.map(job => renderJobCard(job, activeId)).join("") || `<div class="panel panel-pad" style="grid-column:1/-1"><div class="empty-state"><strong>Nenhuma oportunidade encontrada</strong><p>Tente outra busca ou categoria.</p></div></div>`}</div>`;
}
function renderJobCard(job, activeId) {
  const isActive = activeId === job.id;
  const isBusy = Boolean(activeId) && !isActive;
  const active = isActive ? game.activeWork : null;
  const ready = Boolean(active?.ready);
  const iconName = job.tier === "quick" ? "coffee" : job.tier === "pro" ? "briefcase-business" : "crown";
  const range = `${money(job.minPay)} – ${money(job.maxPay)}`;
  const action = isActive ? (ready ? `<button class="button button-primary" data-action="show-challenge">Finalizar ${icon("arrow-right")}</button>` : `<button class="button button-outline" data-action="go-work">Em andamento</button>`) : `<button class="button ${isBusy ? "button-quiet" : "button-primary"}" data-action="start-job" data-job-id="${job.id}" ${isBusy ? "disabled" : ""}>${isBusy ? "Slot ocupado" : "Aceitar vaga"}</button>`;
  return `<article class="job-card"><div class="job-card-top"><span class="job-logo">${icon(iconName)}</span><div class="job-badges"><span class="badge ${job.tier === "fortune" ? "gold" : job.tier === "pro" ? "green" : ""}">${job.tier === "quick" ? "RÁPIDO" : job.tier === "pro" ? "PROFISSIONAL" : "FORTUNA"}</span>${job.challenge ? `<span class="badge">DESAFIO</span>` : ""}</div></div><h3>${esc(job.title)}</h3><div class="job-company">${esc(job.company)} · ${esc(job.sector)}</div><p class="job-description">${esc(job.description)}</p><div class="job-meta"><span>${icon("clock-3")}${job.durationMin >= 60 ? `${job.durationMin / 60} h` : `${job.durationMin} min`}</span><span>${icon(job.difficulty === "Alta" ? "gauge" : "target")}${esc(job.difficulty)}</span><span>${icon(job.offline ? "wifi-off" : "mouse-pointer-click")}${job.offline ? "Offline" : "Etapa ativa"}</span></div><div class="job-card-bottom"><div class="job-pay"><small>FAIXA DE PAGAMENTO</small><strong>${range}</strong></div>${action}</div>${""}</article>`;
}

function cryptoPrice(symbol) {
  const asset = CRYPTO.find(item => item.symbol === symbol);
  if (!asset) return 0;
  const hour = Math.floor(Date.now() / 3600000);
  const wobble = 1 + Math.sin(hour * 0.72 + symbol.length * 2.11) * asset.volatility * 0.7;
  return Math.max(0.0001, asset.price * wobble);
}

function casinoResult() {
  const n = Math.random() * 100;
  if (n < 47) return "red";
  if (n < 94) return "blue";
  return "white";
}
function renderCasino() {
  const casinoDisabled = systemConfig.casinoEnabled === false;
  return `${pageHeading("THE LIFE CLUB", "O jogo está na mesa.", "Aposte créditos virtuais em rodadas de cores ou desafie outros jogadores. Cada partida é simulada e não envolve dinheiro real.", `<span class="badge gold">MESA ABERTA</span>`)}
  <section class="casino-hero"><div><div class="eyebrow"><span class="eyebrow-dot"></span> CLUBE PRIVADO · RODADAS AO VIVO</div><h1>Escolha sua cor.<br /><span style="color:var(--gold-bright)">Confie na estratégia.</span></h1><p>Vermelho e azul oferecem recompensas de 2×. Branco é raro e paga 14×. Resultados são aleatórios; apostar mais não aumenta a chance de ganhar.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><span class="badge">VERMELHO · 47% · 2×</span><span class="badge">AZUL · 47% · 2×</span><span class="badge gold">BRANCO · 6% · 14×</span></div></div><div class="casino-hero-orbit"><span>L</span></div></section>
  ${casinoDisabled ? `<div class="panel panel-pad" style="margin-top:15px;color:var(--red)">O cassino foi desativado pelo administrador.</div>` : ""}
  <div class="casino-grid"><section class="panel casino-table"><div class="panel-header"><div><h3>Mesa de cores</h3><p>Selecione um valor e escolha seu resultado.</p></div><span class="badge green">SOLO</span></div><div class="casino-colors"><button class="color-bet red-bet" data-action="bet-color" data-color="red" ${casinoDisabled ? "disabled" : ""}><span class="color-disc"></span><strong>VERMELHO</strong><span>2× retorno · 47%</span></button><button class="color-bet blue-bet" data-action="bet-color" data-color="blue" ${casinoDisabled ? "disabled" : ""}><span class="color-disc"></span><strong>AZUL</strong><span>2× retorno · 47%</span></button><button class="color-bet white-bet" data-action="bet-color" data-color="white" ${casinoDisabled ? "disabled" : ""}><span class="color-disc"></span><strong>BRANCO</strong><span>14× retorno · 6%</span></button></div><div class="casino-controls"><div><label for="casino-stake">VALOR DA APOSTA</label><input id="casino-stake" class="form-control" type="number" min="100" step="100" value="1000" /></div><button class="button button-outline" data-action="set-stake" data-stake="5000">+ Cr$ 5 mil</button><button class="button button-quiet" data-action="set-stake" data-stake="25000">+ Cr$ 25 mil</button></div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:13px;color:#78859a;font-size:9px"><span>Disponível: <strong style="color:#d8e0eb">${money(game.cash)}</strong></span><span>Retorno potencial: <strong id="casino-potential" style="color:var(--green)">Cr$ 2.000</strong></span></div></section>
  <div class="casino-side-stack"><section class="panel panel-pad"><div class="panel-header"><div><h3>Atividade em tempo real</h3><p>Últimas jogadas registradas no clube.</p></div><span class="nav-live"></span></div><div id="live-bets">${renderCasinoFeed()}</div></section><section class="panel panel-pad"><div class="panel-header"><div><h3>Duelo entre jogadores</h3><p>Entre em uma mesa ou crie o desafio.</p></div><span class="badge">MULTIPLAYER</span></div><div class="form-grid" style="margin-bottom:12px"><div class="form-field"><label for="duel-stake">Valor por jogador</label><input id="duel-stake" class="form-control" type="number" min="500" step="500" value="5000" /></div><div class="form-field" style="display:flex;align-items:flex-end"><button class="button button-primary" data-action="create-duel" style="width:100%">Criar duelo</button></div></div><div id="duel-list">${renderDuelList()}</div></section></div></div>
  <div class="panel panel-pad" style="margin-top:14px"><div class="panel-header"><div><h3>Últimas rodadas pessoais</h3><p>Seus resultados e os valores creditados.</p></div><span class="badge">HISTÓRICO</span></div>${renderActivity((game.history || []).filter(item => item.type === "casino").slice(0, 8), 8)}</div>`;
}
function renderCasinoFeed() {
  if (!liveCasinoFeed.length) return `<div class="empty-state" style="padding:16px 8px"><span class="empty-icon">${icon("radio-tower")}</span><strong>Aguardando novas rodadas</strong><p>Os resultados recentes dos jogadores aparecem aqui em tempo real.</p></div>`;
  return liveCasinoFeed.slice(0, 8).map(item => `<div class="live-bet-row"><span class="player-dot">${esc(compactName(item.playerName))}</span><div class="live-bet-info"><strong>${esc(item.playerName || "Jogador")}</strong><span>${esc(({ red: "Vermelho", blue: "Azul", white: "Branco" })[item.picked] || "Rodada")} · ${item.won ? "Vitória" : "Sem prêmio"}</span></div><div class="live-bet-value ${item.won ? "amount-positive" : "amount-negative"}">${item.won ? "+" : "−"}${money(item.won ? item.payout : item.stake)}<small>${esc(dateLabel(item.at))}</small></div></div>`).join("");
}
function renderDuelList() {
  const open = activeDuels.filter(duel => duel.creatorUid !== currentUser?.uid && Object.keys(duel.participants || {}).length < 2 && duel.state === "open");
  if (!open.length) return `<div class="empty-state" style="padding:13px 8px"><strong>Nenhum duelo aberto</strong><p>Crie uma mesa. Quando alguém entrar, o resultado será processado.</p></div>`;
  return open.slice(0, 5).map(duel => `<div class="multiplayer-row"><span class="player-dot">${esc(compactName(duel.creatorName))}</span><div class="multi-info"><strong>${esc(duel.creatorName || "Jogador")}</strong><small>${money(duel.stake)} por jogador · ${Object.keys(duel.participants || {}).length}/2 participantes</small></div><button class="button button-outline" data-action="join-duel" data-duel-id="${esc(duel.id)}">Entrar</button></div>`).join("");
}
function updateCasinoFeedOnly() {
  const feed = $("#live-bets");
  if (feed && currentView === "casino") feed.innerHTML = renderCasinoFeed();
  const duel = $("#duel-list");
  if (duel && currentView === "casino") duel.innerHTML = renderDuelList();
}
function updateDuelListOnly() {
  const duel = $("#duel-list");
  if (duel) duel.innerHTML = renderDuelList();
}

function renderBank() {
  const history = (game.history || []).filter(item => ["positive", "negative", "bank", "info"].includes(item.type));
  const positions = game.investmentPositions || [];
  return `${pageHeading("AUREON PRIVATE BANK", "Seu patrimônio, sob seu controle.", "Uma experiência bancária completa com carteira, saldo bancário, cofrinho, extrato e investimentos virtuais.", `<span class="badge gold">BANCO DIGITAL</span>`)}
  <div class="balance-overview"><section class="main-balance-card"><div class="main-balance-label">SALDO TOTAL EM CONTA</div><strong class="main-balance-number"><small>Cr$</small> ${numberFmt.format(number(game.bank))}</strong><div class="main-balance-footer">${icon("shield-check")}Conta virtual · Atualizada em tempo real</div><div class="bank-action-grid"><button class="bank-action" data-action="open-money-modal" data-money-action="deposit"><span>${icon("arrow-down-to-line")}</span>Depositar</button><button class="bank-action" data-action="open-money-modal" data-money-action="withdraw"><span>${icon("arrow-up-from-line")}</span>Sacar</button><button class="bank-action" data-view="transfer"><span>${icon("arrow-left-right")}</span>Enviar Pix</button><button class="bank-action" data-view="checks"><span>${icon("file-check-2")}</span>Cheques</button></div></section><div class="balance-secondary"><div class="balance-tile"><span class="tile-icon">${icon("wallet")}</span><small>CARTEIRA</small><strong>${money(game.cash)}</strong></div><div class="balance-tile"><span class="tile-icon">${icon("piggy-bank")}</span><small>COFRINHO</small><strong>${money(game.vault)}</strong><button class="subtle-link" data-action="open-vault-modal" style="padding:7px 0 0">Gerenciar ${icon("arrow-right")}</button></div><div class="balance-tile"><span class="tile-icon">${icon("chart-no-axes-combined")}</span><small>INVESTIDO</small><strong>${money(game.investments)}</strong></div><div class="balance-tile"><span class="tile-icon">${icon("bitcoin")}</span><small>CRIPTOATIVOS</small><strong>${money(Object.entries(game.cryptoHoldings || {}).reduce((sum, [s, units]) => sum + number(units) * cryptoPrice(s), 0))}</strong></div></div></div>
  <div class="bank-lower"><section class="panel panel-pad"><div class="panel-header"><div><h3>Extrato da conta</h3><p>Últimas entradas, saídas e rendimentos.</p></div><span class="badge">${history.length} REGISTROS</span></div>${renderActivity(history, 12)}</section><section class="panel panel-pad"><div class="panel-header"><div><h3>Cofrinho privado</h3><p>Separe uma parte do saldo e acompanhe o crescimento.</p></div><span class="badge gold">0,7% / DIA</span></div><div style="padding:16px;border:1px solid rgba(213,183,122,.13);background:rgba(213,183,122,.035);border-radius:13px"><div class="label-mini">SALDO GUARDADO</div><strong style="display:block;font:700 23px Manrope;margin-top:8px">${money(game.vault)}</strong><p style="color:#7f8ba0;font-size:9px;line-height:1.8;margin:9px 0 14px">O rendimento é calculado pelo tempo decorrido dentro do jogo. Cofrinho e rentabilidade são simulados.</p><div style="display:flex;gap:8px"><button class="button button-primary" data-action="open-vault-modal">Adicionar / retirar</button><button class="button button-quiet" data-view="market">Investir ${icon("arrow-right")}</button></div></div><div class="section-title-row"><h2>Investimentos ativos</h2><button class="subtle-link" data-view="market">Ver carteira ${icon("arrow-right")}</button></div>${positions.length ? `<div class="product-list">${positions.slice(0, 4).map(position => `<div class="investment-row"><span class="investment-mark">${icon("chart-no-axes-combined")}</span><div class="investment-info"><strong>${esc(position.name)}</strong><span>${position.matured ? "Prazo concluído" : `Prazo ${esc(position.termLabel || "variável")}`}</span></div><div class="investment-data"><strong>${money(position.currentValue)}</strong><span>+${(number(position.rate) * 100).toFixed(1).replace(".", ",")}% potencial</span></div></div>`).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("chart-no-axes-combined")}</span><strong>Nenhum investimento ativo</strong><p>Explore as opções disponíveis e comece com um valor que faça sentido para sua estratégia de jogo.</p><button class="button button-outline" data-view="market">Explorar investimentos</button></div>`}</section></div>`;
}

function renderTransfers() {
  const sent = (game.history || []).filter(item => /Pix enviado|Transferência enviada|Pix recebido|transferência/.test(item.title));
  return `${pageHeading("PAGAMENTOS DIGITAIS", "Movimente seus créditos.", "Pix virtual é instantâneo e sem tarifa. A transferência comum tem uma taxa configurável e pode levar até 60 segundos para chegar.", `<span class="badge green">PIX SEM TAXA</span>`)}
  <div class="dashboard-lower-grid"><section class="panel panel-pad"><div class="panel-header"><div><h3>Enviar valor</h3><p>Envie créditos para outro jogador usando o nome público.</p></div><span class="badge">P2P</span></div><form id="transfer-form" class="form-stack"><div class="form-field"><label for="transfer-recipient">DESTINATÁRIO</label><input id="transfer-recipient" class="form-control" placeholder="Nome de usuário" required minlength="3" /><p class="form-note" style="margin-top:6px">Use o nome de usuário exato da pessoa que vai receber.</p></div><div class="form-grid"><div class="form-field"><label for="transfer-amount">VALOR (Cr$)</label><input id="transfer-amount" class="form-control" type="number" min="1" step="1" value="1000" required /></div><div class="form-field"><label for="transfer-type">MÉTODO</label><select id="transfer-type" class="form-control"><option value="pix">Pix — sem taxa</option><option value="transfer">Transferência comum</option></select></div></div><div id="transfer-cost-preview" class="panel" style="padding:13px;background:rgba(255,255,255,.018)"><div style="display:flex;justify-content:space-between;color:#8591a6;font-size:9px"><span>Saldo bancário</span><strong style="color:#e0e5ee">${money(game.bank)}</strong></div><div style="display:flex;justify-content:space-between;color:#8591a6;font-size:9px;margin-top:8px"><span>Taxa estimada</span><strong id="transfer-fee-preview" style="color:var(--green)">Cr$ 0</strong></div><div style="display:flex;justify-content:space-between;color:#8591a6;font-size:9px;margin-top:8px"><span>Total debitado</span><strong id="transfer-total-preview" style="color:#e0e5ee">Cr$ 1.000</strong></div></div><button class="button button-primary" type="submit">Confirmar envio ${icon("arrow-up-right")}</button><p class="form-note">Transferências são créditos virtuais do jogo. Confirme o destinatário antes de enviar; não existe saque para dinheiro real.</p></form></section>
  <section class="panel panel-pad"><div class="panel-header"><div><h3>Recebimentos pendentes</h3><p>Valores enviados a você aparecem aqui até serem compensados.</p></div><span class="badge">${pendingInbox.filter(item => !game.claimedTransfers?.[item.id]).length} PENDENTES</span></div>${renderPendingTransfers()}<div class="section-title-row"><h2>Envios recentes</h2></div>${renderActivity(sent, 7)}</section></div>`;
}
function renderPendingTransfers() {
  const items = pendingInbox.filter(item => !game.claimedTransfers?.[item.id]);
  if (!items.length) return `<div class="empty-state"><span class="empty-icon">${icon("inbox")}</span><strong>Nenhum recebimento pendente</strong><p>Quando alguém enviar créditos para seu nome de usuário, os valores aparecerão aqui.</p></div>`;
  return `<div class="product-list">${items.map(item => `<div class="investment-row"><span class="investment-mark">${icon(item.type === "pix" ? "zap" : "arrow-left-right")}</span><div class="investment-info"><strong>${esc(item.senderName || "Jogador")}</strong><span>${item.type === "pix" ? "Pix instantâneo" : "Transferência"} · ${esc(dateLabel(item.createdAt))}</span></div><div class="investment-data"><strong class="amount-positive">+${money(item.amount)}</strong><span>${number(item.availableAt) > Date.now() ? `Chega em ${timeLabel(number(item.availableAt) - Date.now())}` : "Processando"}</span></div></div>`).join("")}</div>`;
}

function renderChecks() {
  const checks = Array.isArray(game.checks) ? game.checks : [];
  return `${pageHeading("THE LIFE CHECKBOOK", "Cheques, com controle total.", "Emita cheques virtuais a partir do seu saldo bancário e envie-os para outro jogador compensar na conta.", `<span class="badge gold">CHEQUE DIGITAL</span>`)}
  <div class="dashboard-lower-grid"><section class="panel panel-pad"><div class="panel-header"><div><h3>Emitir novo cheque</h3><p>O valor será reservado do seu saldo bancário.</p></div><span class="badge">COMPENSAÇÃO</span></div><form id="check-form" class="form-stack"><div class="form-field"><label for="check-recipient">FAVORECIDO</label><input id="check-recipient" class="form-control" required placeholder="Nome de usuário" minlength="3" /></div><div class="form-field"><label for="check-amount">VALOR DO CHEQUE</label><input id="check-amount" class="form-control" type="number" min="1" step="1" value="5000" required /></div><div class="panel" style="padding:13px;background:rgba(255,255,255,.018)"><div style="display:flex;justify-content:space-between;font-size:9px;color:#8591a6"><span>Disponível no banco</span><strong style="color:#dce2ed">${money(game.bank)}</strong></div></div><button class="button button-primary" type="submit">Emitir cheque ${icon("file-check-2")}</button><p class="form-note">Cheque emitido é registrado no histórico. Ao ser creditado, não pode ser compensado uma segunda vez pelo fluxo normal da interface.</p></form></section><section class="panel panel-pad"><div class="panel-header"><div><h3>Cheques recebidos</h3><p>Cheques enviados por outros jogadores.</p></div><span class="badge">${pendingChecks.filter(item => !game.claimedChecks?.[item.id]).length} NOVOS</span></div>${pendingChecks.filter(item => !game.claimedChecks?.[item.id]).length ? `<div class="product-list">${pendingChecks.filter(item => !game.claimedChecks?.[item.id]).map(item => `<div class="investment-row"><span class="investment-mark">${icon("file-check-2")}</span><div class="investment-info"><strong>Cheque de ${esc(item.senderName || "Jogador")}</strong><span>${esc(dateLabel(item.createdAt))}</span></div><div class="investment-data"><strong>${money(item.amount)}</strong><span>Compensação automática</span></div></div>`).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("file-check-2")}</span><strong>Você está em dia</strong><p>Quando um cheque for emitido para seu usuário, ele aparecerá nesta área.</p></div>`}<div class="section-title-row"><h2>Cheques emitidos</h2></div>${checks.length ? `<div class="product-list">${checks.slice(0, 8).map(item => `<div class="investment-row"><span class="investment-mark">${icon("file-text")}</span><div class="investment-info"><strong>${esc(item.recipientName)}</strong><span>${esc(dateLabel(item.at))} · ${esc(item.status)}</span></div><div class="investment-data"><strong>${money(item.amount)}</strong><span>Emitido</span></div></div>`).join("")}</div>` : `<p class="form-note">Nenhum cheque emitido por você ainda.</p>`}</section></div>`;
}

function renderCards() {
  const owned = game.ownedCards || [];
  const active = owned.find(card => card.id === game.activeCardId) || owned[0];
  const cards = CARDS.filter(card => `${card.name} ${card.tier} ${card.finish}`.toLowerCase().includes(cardSearch.toLowerCase()));
  return `${pageHeading("PRIVATE CARD COLLECTION", "Um cartão para cada conquista.", "Explore mais de 60 cartões de níveis diferentes, cada um com preço, limite virtual e benefícios próprios.", `<span class="badge gold">${CARDS.length} MODELOS</span>`)}
  <section class="card-promo"><div><div class="eyebrow"><span class="eyebrow-dot"></span> COLEÇÃO PRIVADA</div><h2>${active ? esc(active.name) : "Seu próximo cartão está aqui."}</h2><p>${active ? `Limite virtual de ${money(active.limit)}. Use a coleção para desbloquear estilos, prestígio e benefícios dentro do jogo.` : "Comece com um cartão de entrada e evolua para versões exclusivas conforme sua fortuna cresce."}</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:15px"><span class="badge">${owned.length} CARTÕES ADQUIRIDOS</span><span class="badge green">SEM CRÉDITO REAL</span></div></div><div class="card-promo-visual">${renderCardVisual(active || { name: "The Life Signature", tier: "Signature", color: "gold", pan: "•••• •••• •••• 2048" })}</div></section>
  <div class="section-title-row"><div><h2>Galeria de cartões</h2><p>Cartões virtuais para colecionar e definir seu estilo.</p></div></div><div class="work-toolbar"><label class="search-field">${icon("search")}<input id="card-search" type="search" value="${esc(cardSearch)}" placeholder="Buscar modelo ou nível..." /></label><span class="badge">${CARDS.length} MODELOS</span></div><div class="card-gallery">${cards.map(card => renderCardItem(card, owned.some(item => item.id === card.id))).join("")}</div>`;
}
function cardPalette(color) {
  const palettes = {
    silver: ["#414b5d", "#202837", "#9da9be"], blue: ["#23466b", "#111e35", "#7caeff"], gold: ["#5b4828", "#1e1b18", "#e6c98a"], platinum: ["#46515d", "#1b222b", "#d7e0e9"], diamond: ["#2c5660", "#15252c", "#91e1e7"], black: ["#292c33", "#0c0e13", "#c5c9d0"], violet: ["#514071", "#20182d", "#c2aaff"], green: ["#2d5b4f", "#11221e", "#90e0ba"], navy: ["#2b4165", "#0e1729", "#8faee5"], obsidian: ["#32313a", "#0c0c12", "#ccadf7"], imperial: ["#5a422c", "#17120c", "#f0d49a"], royal: ["#35295e", "#100e20", "#c5a6ff"]
  };
  return palettes[color] || palettes.gold;
}
function renderCardVisual(card) {
  const palette = cardPalette(card.color || "gold");
  const pan = card.pan || "••••  ••••  ••••  2048";
  return `<div class="premium-card" style="background:radial-gradient(circle at 90% 0%,${palette[2]}20,transparent 43%),linear-gradient(140deg,${palette[0]},${palette[1]} 72%);border-color:${palette[2]}55"><div class="card-brand"><span>THE LIFE</span><span>${esc(card.tier || "SIGNATURE").toUpperCase()}</span></div><div class="card-chip"></div><div class="card-number">${esc(pan)}</div><div class="card-bottom"><div><small>MEMBER NAME</small><strong>${esc((profile.displayName || profile.username || "MEMBER").toUpperCase())}</strong></div><span class="card-network">TLA</span></div></div>`;
}
function renderCardItem(card, owned) {
  const palette = cardPalette(card.color);
  const active = game.activeCardId === card.id;
  return `<article class="card-item">${renderCardVisual({ ...card, pan: owned ? owned.pan : "••••  ••••  ••••  0000" })}<h3>${esc(card.name)}</h3><div class="card-tier-copy">${esc(card.tier)} · ${esc(card.perk)}</div><div class="card-item-foot"><div><strong>${money(card.price)}</strong><div style="font-size:8px;color:#738097;margin-top:3px">Limite ${money(card.limit)}</div></div>${owned ? `<button class="button ${active ? "button-soft" : "button-outline"}" data-action="set-active-card" data-card-id="${card.id}" ${active ? "disabled" : ""}>${active ? "Em uso" : "Ativar"}</button>` : `<button class="button button-primary" data-action="buy-card" data-card-id="${card.id}">Adquirir</button>`}</div></article>`;
}

function renderMarket() {
  const positions = game.investmentPositions || [];
  const cryptoValue = Object.entries(game.cryptoHoldings || {}).reduce((sum, [symbol, units]) => sum + number(units) * cryptoPrice(symbol), 0);
  return `${pageHeading("AUREON ASSET MANAGEMENT", "Faça seu patrimônio trabalhar.", "Invista em fundos virtuais, acompanhe ativos digitais e diversifique seu saldo dentro da economia do jogo.", `<span class="badge gold">MERCADO VIRTUAL</span>`)}
  <div class="stat-grid">${statCard("TOTAL INVESTIDO", money(game.investments), "chart-no-axes-combined", `${positions.length} posições ativas`, "green", true)}${statCard("CRIPTOATIVOS", money(cryptoValue), "bitcoin", `${Object.keys(game.cryptoHoldings || {}).length} ativos na carteira`, "blue", false)}${statCard("SALDO PARA INVESTIR", money(game.bank), "landmark", "Usado para ordens de compra", "gold", false)}${statCard("RENDIMENTO DO COFRINHO", money(game.vault), "piggy-bank", "Acumulado automaticamente", "violet", true)}</div>
  <div class="section-title-row"><div><h2>Fundos e oportunidades</h2><p>Retornos e prazos ilustrativos; valores de mercado não são reais.</p></div></div><div class="product-grid">${BANK_PRODUCTS.map(item => `<article class="product-card"><div class="product-art">${icon("chart-no-axes-combined")}</div><div class="badge ${item.risk === "Alto" ? "red" : item.risk === "Baixo" ? "green" : "gold"}" style="align-self:flex-start">RISCO ${esc(item.risk.toUpperCase())}</div><h3 style="margin-top:10px">${esc(item.name)}</h3><p>${esc(item.description)}<br />Prazo: ${esc(item.term)}</p><div class="product-card-foot"><div><strong>${(item.rate * 100).toFixed(1).replace(".", ",")}%</strong><div style="font-size:8px;color:#76839a;margin-top:3px">potencial por prazo</div></div><button class="button button-primary" data-action="buy-investment" data-product-id="${item.id}">Investir</button></div><div style="font-size:8px;color:#737f93;margin-top:9px">Mínimo ${money(item.min)}</div></article>`).join("")}</div>
  <div class="section-title-row"><div><h2>Mercado de criptoativos</h2><p>Preços fictícios oscilam ao longo do tempo. Compre ou venda a partir do seu saldo bancário.</p></div><span class="badge">${CRYPTO.length} ATIVOS</span></div><div class="panel panel-pad"><div class="product-list">${CRYPTO.map(asset => { const price = cryptoPrice(asset.symbol); const held = number(game.cryptoHoldings?.[asset.symbol]); return `<div class="investment-row"><span class="investment-mark" style="background:rgba(130,170,255,.08)">${esc(asset.symbol.slice(0,2))}</span><div class="investment-info"><strong>${esc(asset.name)} <span style="color:#748198;font-size:8px">${esc(asset.symbol)}</span></strong><span>Preço simulado · variação dinâmica</span></div><div class="investment-data"><strong>${money(price)}</strong><span>${held ? `${decimalFmt.format(held)} ${esc(asset.symbol)}` : "Sem posição"}</span></div><button class="button button-outline" data-action="crypto-trade" data-symbol="${asset.symbol}" data-side="buy">Comprar</button><button class="button button-quiet" data-action="crypto-trade" data-symbol="${asset.symbol}" data-side="sell" ${held <= 0 ? "disabled" : ""}>Vender</button></div>`; }).join("")}</div></div>
  <div class="section-title-row"><div><h2>Suas posições</h2><p>Gerencie os investimentos que você já contratou.</p></div></div><section class="panel panel-pad">${positions.length ? `<div class="product-list">${positions.map(position => `<div class="investment-row"><span class="investment-mark">${icon("landmark")}</span><div class="investment-info"><strong>${esc(position.name)}</strong><span>${esc(position.termLabel)} · ${position.matured ? "Prazo cumprido" : `Ativo desde ${esc(dateLabel(position.startedAt))}`}</span></div><div class="investment-data"><strong>${money(position.currentValue)}</strong><span class="${number(position.currentValue) >= number(position.investedAmount) ? "amount-positive" : "amount-negative"}">${signedMoney(number(position.currentValue) - number(position.investedAmount))}</span></div><button class="button button-outline" data-action="sell-investment" data-position-id="${position.id}">Resgatar</button></div>`).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("chart-no-axes-combined")}</span><strong>Sem posições ativas</strong><p>Escolha uma oportunidade acima para abrir seu primeiro investimento virtual.</p></div>`}</section>`;
}

function renderStores() {
  const category = STORE_CATEGORIES.find(item => item.id === storeFilter);
  const shops = SHOPS.filter(shop => (storeFilter === "all" || shop.categoryId === storeFilter) && `${shop.name} ${shop.category} ${shop.city}`.toLowerCase().includes(storeSearch.toLowerCase()));
  const products = PRODUCTS.filter(product => (storeFilter === "all" || product.categoryId === storeFilter) && (!selectedShop || product.shopId === selectedShop) && `${product.name} ${product.category}`.toLowerCase().includes(productSearch.toLowerCase()));
  const selectedShopData = SHOPS.find(item => item.id === selectedShop);
  return `${pageHeading("THE LIFE DEPARTMENT STORES", "Uma cidade inteira para explorar.", "Mais de 120 lojas virtuais em imóveis, automóveis, aviação, náutica, negócios, moda, tecnologia e experiências exclusivas.", `<span class="badge gold">${SHOPS.length} LOJAS</span>`)}
  <div class="shop-stat-strip"><span class="shop-stat-pill">${icon("store")} <strong>${SHOPS.length}</strong> lojas</span><span class="shop-stat-pill">${icon("package") }<strong>${PRODUCTS.length}</strong> itens</span><span class="shop-stat-pill">${icon("globe-2")} <strong>10</strong> cidades</span><span class="shop-stat-pill">${icon("shopping-bag")} <strong>${(game.inventory || []).length}</strong> aquisições</span></div>
  <div class="work-toolbar"><label class="search-field">${icon("search")}<input id="store-search" type="search" value="${esc(storeSearch)}" placeholder="Buscar lojas, categorias ou cidades..." /></label><label class="search-field" style="max-width:290px">${icon("package-search")}<input id="product-search" type="search" value="${esc(productSearch)}" placeholder="Buscar produtos..." /></label></div>
  <div class="store-layout"><aside class="panel panel-pad store-sidebar-panel"><div class="panel-header"><div><h3>Categorias</h3><p>Explore por estilo de vida.</p></div></div><div class="store-category-list"><button class="store-category ${storeFilter === "all" ? "active" : ""}" data-action="store-filter" data-filter="all"><span>Todas as lojas</span><span>${SHOPS.length}</span></button>${STORE_CATEGORIES.map(item => `<button class="store-category ${storeFilter === item.id ? "active" : ""}" data-action="store-filter" data-filter="${item.id}"><span>${esc(item.name)}</span><span>${SHOPS.filter(shop => shop.categoryId === item.id).length}</span></button>`).join("")}</div><div style="border-top:1px solid rgba(255,255,255,.055);margin-top:15px;padding-top:15px"><div class="label-mini">SEU INVENTÁRIO</div><strong style="display:block;font:700 20px Manrope;margin-top:5px">${(game.inventory || []).length}</strong><small style="color:#738097;font-size:8px">itens adquiridos</small><button class="button button-outline" style="width:100%;margin-top:11px" data-action="open-inventory">Ver inventário</button></div></aside>
  <div><section class="panel panel-pad" style="margin-bottom:14px"><div class="panel-header"><div><h3>${selectedShopData ? esc(selectedShopData.name) : category ? `Lojas de ${esc(category.name)}` : "Todas as lojas"}</h3><p>${selectedShopData ? `${esc(selectedShopData.city)} · ${esc(selectedShopData.specialty)}` : `${shops.length} estabelecimentos disponíveis. Selecione um para filtrar seus produtos.`}</p></div>${selectedShop ? `<button class="button button-quiet" data-action="clear-shop">Ver tudo</button>` : ""}</div><div class="shop-grid">${shops.map(shop => `<button class="shop-card ${selectedShop === shop.id ? "active" : ""}" data-action="select-shop" data-shop-id="${shop.id}"><div class="shop-card-top"><span class="shop-symbol">${icon(shop.categoryId === "carros" ? "car-front" : shop.categoryId === "avioes" ? "plane" : shop.categoryId === "imoveis" ? "building-2" : shop.categoryId === "tecnologia" ? "cpu" : shop.categoryId === "moda" ? "shirt" : shop.categoryId === "nautica" ? "ship" : "store")}</span><span class="shop-stars">${"★".repeat(shop.prestige)}<span style="color:#455066">${"★".repeat(5 - shop.prestige)}</span></span></div><h3>${esc(shop.name)}</h3><p>${esc(shop.specialty)}</p><div class="shop-card-foot"><span>${esc(shop.category)}</span><span>${esc(shop.city)}</span></div></button>`).join("") || `<div class="empty-state" style="grid-column:1/-1"><strong>Nenhuma loja encontrada</strong><p>Tente outra busca.</p></div>`}</div></section>
  <section class="panel panel-pad"><div class="panel-header"><div><h3>Catálogo de produtos</h3><p>Selecione um item para comprar com seu saldo bancário.</p></div><span class="badge">${products.length} ITENS</span></div><div class="product-grid">${products.slice(0, 60).map(product => `<article class="product-card"><div class="product-art">${icon(product.categoryId === "carros" ? "car-front" : product.categoryId === "imoveis" ? "house" : product.categoryId === "avioes" ? "plane" : product.categoryId === "nautica" ? "ship" : product.categoryId === "moda" ? "shirt" : product.categoryId === "tecnologia" ? "cpu" : "gem")}</div><span class="badge" style="align-self:flex-start">${esc(product.category)}</span><h3 style="margin-top:8px">${esc(product.name)}</h3><p>${esc(product.description)}</p><div class="product-card-foot"><strong>${money(product.price)}</strong><button class="button button-primary" data-action="buy-product" data-product-id="${product.id}">Comprar</button></div><small style="display:block;color:#626f84;font-size:7px;margin-top:7px">${esc(SHOPS.find(shop => shop.id === product.shopId)?.name || "The Life Store")}</small></article>`).join("")}</div>${products.length > 60 ? `<p class="form-note" style="margin-top:12px">Mostrando 60 de ${products.length} produtos neste filtro. Use a busca para localizar outros itens.</p>` : ""}</section></div></div>`;
}

function renderRankings() {
  const rows = [...leaderboard].sort((a, b) => number(b.netWorth) - number(a.netWorth)).slice(0, 50);
  const myRank = rows.findIndex(item => item.uid === currentUser.uid) + 1;
  return `${pageHeading("THE LIFE INDEX", "Toda fortuna deixa uma marca.", "A classificação global reúne o patrimônio virtual público dos jogadores. A economia e as posições pertencem apenas ao universo do jogo.", `<span class="badge gold">${leaderboard.length} PERFIS</span>`)}
  <div class="stat-grid">${statCard("SUA POSIÇÃO", myRank ? `#${myRank}` : "—", "trophy", myRank ? "Entre os perfis listados" : "Continue evoluindo", "gold", false)}${statCard("SEU PATRIMÔNIO", money(netWorth()), "gem", "Carteira + banco + ativos", "green", true)}${statCard("JOGADORES NO ÍNDICE", numberFmt.format(leaderboard.length), "users", "Perfis sincronizados", "blue", false)}${statCard("NÍVEL ATUAL", numberFmt.format(game.level), "medal", `${numberFmt.format(game.xp)} XP`, "violet", true)}</div>
  <div class="dashboard-lower-grid"><section class="panel panel-pad"><div class="panel-header"><div><h3>Índice de patrimônio</h3><p>Os maiores patrimônios virtuais registrados.</p></div><span class="badge">TOP 50</span></div>${rows.length ? `<div class="leaderboard-list">${rows.map((item, index) => `<div class="leaderboard-item"><span class="leaderboard-rank ${index < 3 ? "top" : ""}">${String(index + 1).padStart(2, "0")}</span><span class="leaderboard-avatar" style="border-color:${item.uid === currentUser.uid ? "rgba(213,183,122,.4)" : "rgba(255,255,255,.05)"}">${esc(compactName(item.displayName || item.username))}</span><div class="leaderboard-info"><strong>${esc(item.displayName || item.username || "Jogador")}${item.uid === currentUser.uid ? " (você)" : ""}</strong><span>Nível ${number(item.level) || 1} · membro desde ${esc(new Date(number(item.joinedAt) || Date.now()).toLocaleDateString("pt-BR"))}</span></div><div class="leaderboard-worth">${money(item.netWorth)}<small>patrimônio virtual</small></div></div>`).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("trophy")}</span><strong>Classificação sendo formada</strong><p>Assim que outros perfis entrarem no jogo, eles aparecerão neste índice.</p></div>`}</section><section class="panel panel-pad"><div class="panel-header"><div><h3>Como subir no índice</h3><p>Três caminhos para crescer com consistência.</p></div></div><div class="product-list"><div class="investment-row"><span class="investment-mark">${icon("briefcase-business")}</span><div class="investment-info"><strong>Construa sua carreira</strong><span>Conclua trabalhos e acumule salários.</span></div><button class="button button-outline" data-view="work">Explorar</button></div><div class="investment-row"><span class="investment-mark">${icon("landmark")}</span><div class="investment-info"><strong>Organize suas finanças</strong><span>Use o banco e o cofrinho para planejar.</span></div><button class="button button-outline" data-view="bank">Abrir</button></div><div class="investment-row"><span class="investment-mark">${icon("shopping-bag")}</span><div class="investment-info"><strong>Adquira ativos</strong><span>Imóveis, veículos e negócios contam para o patrimônio.</span></div><button class="button button-outline" data-view="stores">Visitar</button></div></div></section></div>`;
}

function renderApps() {
  const apps = [
    ["Visão geral", "layout-dashboard", "home", "rgba(213,183,122,.14)", "#d8bc7d"],
    ["Carreira", "briefcase-business", "work", "rgba(96,212,165,.13)", "#60d4a5"],
    ["The Life Club", "club", "casino", "rgba(240,124,138,.13)", "#f07c8a"],
    ["Banco privado", "landmark", "bank", "rgba(130,170,255,.13)", "#82aaff"],
    ["Cartões", "credit-card", "cards", "rgba(213,183,122,.13)", "#d5b77a"],
    ["Investimentos", "chart-no-axes-combined", "market", "rgba(96,212,165,.13)", "#60d4a5"],
    ["Shopping", "shopping-bag", "stores", "rgba(186,157,255,.13)", "#ba9dff"],
    ["Pix e transferências", "arrow-left-right", "transfer", "rgba(96,212,165,.13)", "#60d4a5"],
    ["Cheques", "file-check-2", "checks", "rgba(130,170,255,.13)", "#82aaff"],
    ["Classificação", "trophy", "rankings", "rgba(213,183,122,.13)", "#d5b77a"],
    ["Inventário", "package", "stores", "rgba(130,170,255,.13)", "#82aaff"],
    ["Perfil", "user-round-cog", "profile", "rgba(186,157,255,.13)", "#ba9dff"]
  ];
  if (isAdmin) apps.push(["Administração", "shield-check", "admin", "rgba(96,212,165,.13)", "#60d4a5"]);
  return `${pageHeading("THE LIFE APP STORE", "Tudo o que você precisa. Em um só lugar.", "Abra seus aplicativos internos como em um sistema operacional pessoal. Cada serviço usa seu perfil e sua economia virtual.", `<span class="badge">${apps.length} APPS</span>`)}
  <section class="apps-launcher"><div class="apps-topline"><strong>LAUNCHPAD <span style="color:var(--gold)">/</span> APLICATIVOS</strong><span>THE LIFE OS · 01.0</span></div><div class="apps-grid">${apps.map(([name, ico, view, bg, color]) => `<button class="app-icon-tile" data-view="${view}" style="--tile-bg:${bg};--tile-color:${color}"><span class="app-icon-square">${icon(ico)}</span><strong>${esc(name)}</strong></button>`).join("")}</div></section>
  <div class="dashboard-lower-grid"><section class="panel panel-pad"><div class="panel-header"><div><h3>Resumo de conta</h3><p>Dados sincronizados com seu perfil.</p></div></div><div class="activity-list"><div class="activity-row"><span class="activity-icon">${icon("wallet")}</span><div class="activity-content"><strong>Carteira disponível</strong><small>Saldo para gastos e jogos</small></div><span class="activity-amount">${money(game.cash)}</span></div><div class="activity-row"><span class="activity-icon">${icon("landmark")}</span><div class="activity-content"><strong>Banco privado</strong><small>Saldo bancário atual</small></div><span class="activity-amount">${money(game.bank)}</span></div><div class="activity-row"><span class="activity-icon">${icon("gem")}</span><div class="activity-content"><strong>Patrimônio total</strong><small>Inclui ativos de inventário</small></div><span class="activity-amount">${money(netWorth())}</span></div></div></section><section class="panel panel-pad"><div class="panel-header"><div><h3>Privacidade e segurança</h3><p>Controle suas sessões e mantenha sua conta protegida.</p></div></div><p class="form-note" style="font-size:10px">The Life App usa Firebase Authentication para o login e Realtime Database para sincronizar os dados do jogo. Nunca compartilhe sua senha. A moeda é virtual, sem resgate financeiro.</p><button class="button button-outline" style="margin-top:14px" data-action="open-profile">Ver perfil e conta ${icon("arrow-up-right")}</button></section></div>`;
}

function renderAdmin() {
  if (!isAdmin) return `<section class="panel panel-pad"><h2>Acesso restrito</h2><p>Este painel é exclusivo da conta proprietária.</p></section>`;
  const selected = adminUsers.find(item => item.uid === adminSelectedUid);
  const userList = [...adminUsers].sort((a, b) => number(b.game?.cash) + number(b.game?.bank) - number(a.game?.cash) - number(a.game?.bank));
  return `${pageHeading("OWNER CONTROL CENTER", "Controle total do universo.", "Painel privado do proprietário. Selecione qualquer conta para editar seus dados de jogo ou ajustar as regras econômicas globais.", `<span class="badge green">OWNER VERIFIED</span>`)}
  <div class="admin-banner"><div><span class="admin-mark">${icon("shield-check")}</span><div><strong>Modo proprietário ativo</strong><p>Autorização conferida pela conta autenticada e pelas regras do Realtime Database.</p></div></div><span class="badge green">${esc(OWNER_EMAIL)}</span></div>
  <div class="admin-layout"><section class="panel panel-pad"><div class="panel-header"><div><h3>Contas de jogadores</h3><p>Selecione um perfil para editar seu estado completo.</p></div><button class="button button-outline" data-action="refresh-admin">Atualizar</button></div><label class="search-field">${icon("search")}<input id="admin-user-search" type="search" placeholder="Buscar por nome, e-mail ou UID..." /></label><div class="admin-user-list" id="admin-user-list">${userList.map(item => `<button class="admin-user-row ${item.uid === adminSelectedUid ? "active" : ""}" data-action="admin-select" data-uid="${item.uid}"><span class="leaderboard-avatar">${esc(compactName(item.profile?.displayName || item.profile?.username))}</span><span class="user-row-copy"><strong>${esc(item.profile?.displayName || item.profile?.username || "Jogador")}</strong><span>${esc(item.profile?.email || item.profile?.accountType || "Conta")}</span></span><small>${money(number(item.game?.cash) + number(item.game?.bank) + number(item.game?.vault) + number(item.game?.investments))}</small></button>`).join("") || `<div class="empty-state"><strong>Nenhuma conta carregada</strong><p>Atualize a lista após entrar com a conta proprietária.</p></div>`}</div><p class="form-note" style="margin-top:12px">Contas exibidas: ${adminUsers.length}. Dados carregados diretamente do Realtime Database.</p></section>
  <div style="display:flex;flex-direction:column;gap:14px"><section class="panel panel-pad"><div class="panel-header"><div><h3>Editor completo de conta</h3><p>${selected ? `Editando ${esc(selected.profile?.displayName || selected.profile?.username || selected.uid)} · ${esc(selected.uid)}` : "Escolha uma conta na lista ao lado."}</p></div><span class="badge gold">JSON</span></div><textarea id="admin-game-json" class="form-control admin-editor" spellcheck="false" ${selected ? "" : "disabled"}>${selected ? esc(JSON.stringify(selected.game || defaultGame(), null, 2)) : "Selecione um jogador para carregar os dados."}</textarea><div class="form-action-row" style="margin-top:12px"><button class="button button-quiet" data-action="admin-reload-json" ${selected ? "" : "disabled"}>Recarregar</button><button class="button button-primary" data-action="admin-save-json" ${selected ? "" : "disabled"}>Salvar estado completo</button></div><div class="form-note" style="margin-top:10px">Este editor altera o estado completo do jogo selecionado. Dados JSON inválidos não serão salvos.</div></section>
  <section class="panel panel-pad"><div class="panel-header"><div><h3>Ajuste rápido de saldo</h3><p>Adicione ou remova créditos de uma conta.</p></div></div><div class="form-grid"><div class="form-field"><label for="admin-wallet-field">CAMPO</label><select id="admin-wallet-field" class="form-control"><option value="cash">Carteira</option><option value="bank">Banco</option><option value="vault">Cofrinho</option><option value="investments">Investimentos</option><option value="xp">XP</option><option value="level">Nível</option></select></div><div class="form-field"><label for="admin-wallet-amount">VALOR (+ / −)</label><input id="admin-wallet-amount" class="form-control" type="number" value="100000" /></div></div><button class="button button-primary" style="margin-top:13px" data-action="admin-adjust-wallet" ${selected ? "" : "disabled"}>Aplicar ajuste</button><button class="button button-danger" style="margin:13px 0 0 7px" data-action="admin-max-player" ${selected ? "" : "disabled"}>Fortuna máxima de teste</button></section></div></div>
  <section class="panel panel-pad" style="margin-top:14px"><div class="panel-header"><div><h3>Configuração global da economia</h3><p>As configurações abaixo afetam trabalhos, cassino e transferências comuns.</p></div><span class="badge">SYSTEM CONFIG</span></div><div class="admin-config-grid"><div class="form-field"><label for="config-work-multiplier">MULTIPLICADOR DE SALÁRIO</label><input id="config-work-multiplier" class="form-control" type="number" min="0" step="0.1" value="${number(systemConfig.workRewardMultiplier)}" /></div><div class="form-field"><label for="config-casino-multiplier">MULTIPLICADOR DE PRÊMIO</label><input id="config-casino-multiplier" class="form-control" type="number" min="0" step="0.1" value="${number(systemConfig.casinoRewardMultiplier)}" /></div><div class="form-field"><label for="config-transfer-fee">TAXA DA TRANSFERÊNCIA COMUM (%)</label><input id="config-transfer-fee" class="form-control" type="number" min="0" max="50" step="0.1" value="${number(systemConfig.transferFeeRate) * 100}" /></div><div class="form-field"><label for="config-transfer-delay">ATRASO DA TRANSFERÊNCIA (SEGUNDOS)</label><input id="config-transfer-delay" class="form-control" type="number" min="0" max="86400" step="1" value="${Math.round(number(systemConfig.standardTransferDelayMs) / 1000)}" /></div><div class="form-field"><label for="config-starting-cash">SALDO INICIAL DA CARTEIRA</label><input id="config-starting-cash" class="form-control" type="number" min="0" value="${number(systemConfig.startingCash)}" /></div><div class="form-field"><label for="config-starting-bank">SALDO INICIAL DO BANCO</label><input id="config-starting-bank" class="form-control" type="number" min="0" value="${number(systemConfig.startingBank)}" /></div></div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px"><label style="display:flex;gap:8px;align-items:center;color:#aab4c6;font-size:10px"><input id="config-casino-enabled" type="checkbox" ${systemConfig.casinoEnabled !== false ? "checked" : ""} /> Cassino habilitado</label><button class="button button-primary" data-action="save-system-config">Salvar configurações globais</button></div></section>`;
}

let pendingSignupName = null;
let setupInProgress = null;
let verificationRequestedForUid = null;
try { verificationRequestedForUid = sessionStorage.getItem("tla_owner_verification_uid") || null; } catch {}
onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    profile = null;
    game = null;
    isAdmin = false;
    stopListeners();
    $("#application")?.classList.add("hidden");
    $("#auth-screen")?.classList.remove("hidden");
    renderIcons();
    finishInitialBoot();
    return;
  }
  currentUser = user;
  try {
    // A privileged email must be verified. Email/password users get a verification message;
    // reload lets a player become the owner after clicking that message and returning here.
    if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() && !user.emailVerified) {
      try {
        await reload(user);
        if (user.emailVerified) await user.getIdToken(true);
      } catch (error) { console.warn("Could not refresh owner verification status", error); }
      if (!user.emailVerified && verificationRequestedForUid !== user.uid) {
        verificationRequestedForUid = user.uid;
        try {
          try { sessionStorage.setItem("tla_owner_verification_uid", user.uid); } catch {}
          await sendEmailVerification(user);
        } catch (error) {
          console.warn("Could not send owner verification email", error);
          verificationRequestedForUid = null;
          try { sessionStorage.removeItem("tla_owner_verification_uid"); } catch {}
        }
      }
      if (user.emailVerified && verificationRequestedForUid === user.uid) {
        verificationRequestedForUid = null;
        try { sessionStorage.removeItem("tla_owner_verification_uid"); } catch {}
      }
    }
    isAdmin = adminClaim(user);
    if (setupInProgress && setupInProgress.uid === user.uid) await setupInProgress.promise;
    else {
      const username = pendingSignupName;
      pendingSignupName = null;
      const promise = ensureUserRecord(user, username ? { username } : {});
      setupInProgress = { uid: user.uid, promise };
      await promise;
      setupInProgress = null;
    }
    showApplication();
    if (user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase() && !user.emailVerified) {
      toast("Verifique o e-mail do proprietário", "Enviamos uma mensagem de verificação. Confirme o endereço e recarregue o site para liberar a administração.", "error");
    }
    if (isAdmin) await refreshAdminUsers();
    finishInitialBoot();
  } catch (error) {
    setupInProgress = null;
    console.error("Account initialization failed", error);
    $("#auth-screen").classList.remove("hidden");
    $("#application").classList.add("hidden");
    showAuthError(errorMessage(error));
    finishInitialBoot();
    try { await signOut(auth); } catch {}
  }
});

$("#auth-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  clearAuthError();
  const identity = $("#auth-identity").value.trim();
  const password = $("#auth-password").value;
  const publicName = $("#auth-display-name")?.value.trim();
  const submit = $("#auth-submit");
  submit.disabled = true;
  submit.innerHTML = `<span>${authMode === "login" ? "Conectando..." : "Criando conta..."}</span><i data-lucide="loader-circle"></i>`;
  renderIcons();
  try {
    if (authMode === "login") {
      if (!identity) throw new Error("Informe seu e-mail ou nome de usuário.");
      if (identityMode === "username" && normalizeUsername(identity).length < 3) throw new Error("Informe um nome de usuário com ao menos 3 caracteres.");
      const email = identityEmail(identity, identityMode);
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      if (identityMode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) throw new Error("Informe um e-mail válido.");
      const publicUsername = identityMode === "username" ? normalizeUsername(identity) : normalizeUsername(publicName || identity.split("@")[0]);
      if (publicUsername.length < 3) throw new Error("O nome público deve ter pelo menos 3 caracteres.");
      if (identityMode === "username" && publicUsername !== normalizeUsername(identity)) throw new Error("Escolha um nome de usuário válido.");
      const old = await get(ref(database, `usernameIndex/${publicUsername}`));
      if (old.exists()) throw new Error("Este nome de usuário já está em uso. Escolha outro.");
      pendingSignupName = publicUsername;
      await createUserWithEmailAndPassword(auth, identityMode === "username" ? identityEmail(publicUsername, "username") : identity.toLowerCase(), password);
      if (auth.currentUser && publicName && identityMode === "email") {
        try { await updateProfile(auth.currentUser, { displayName: publicUsername }); } catch {}
      }
    }
  } catch (error) {
    pendingSignupName = null;
    showAuthError(errorMessage(error));
  } finally {
    submit.disabled = false;
    submit.innerHTML = `<span>${authMode === "login" ? "Entrar na plataforma" : "Criar minha conta"}</span><i data-lucide="arrow-up-right"></i>`;
    renderIcons();
  }
});

$("#google-login")?.addEventListener("click", async () => {
  clearAuthError();
  const button = $("#google-login");
  button.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    showAuthError(errorMessage(error));
  } finally { button.disabled = false; }
});

$("#toggle-password")?.addEventListener("click", () => {
  passwordVisible = !passwordVisible;
  $("#auth-password").type = passwordVisible ? "text" : "password";
  $("#toggle-password").innerHTML = icon(passwordVisible ? "eye-off" : "eye");
  renderIcons();
});

function navigate(view) {
  if (view === "profile") { openProfileModal(); return; }
  if (view === "admin" && !isAdmin) { toast("Acesso restrito", "Esta área é exclusiva do proprietário.", "error"); return; }
  currentView = view;
  $("#sidebar")?.classList.remove("mobile-open");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("click", async event => {
  const authModeButton = event.target.closest("[data-auth-mode]");
  if (authModeButton) { setAuthMode(authModeButton.dataset.authMode); return; }
  const identityModeButton = event.target.closest("[data-identity-mode]");
  if (identityModeButton) { toggleIdentityMode(identityModeButton.dataset.identityMode); return; }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton || actionButton.disabled) return;
  const action = actionButton.dataset.action;
  try {
    switch (action) {
      case "logout": await signOut(auth); break;
      case "open-profile": openProfileModal(); break;
      case "go-work": navigate("work"); break;
      case "show-challenge": navigate("work"); break;
      case "start-job": await startJob(actionButton.dataset.jobId); break;
      case "job-filter": jobFilter = actionButton.dataset.filter || "all"; render(); break;
      case "bet-color": await betColor(actionButton.dataset.color); break;
      case "set-stake": if ($("#casino-stake")) { $("#casino-stake").value = actionButton.dataset.stake; updateCasinoPotential(); } break;
      case "create-duel": await createDuel(); break;
      case "join-duel": await joinDuel(actionButton.dataset.duelId); break;
      case "open-money-modal": openMoneyModal(actionButton.dataset.moneyAction); break;
      case "open-vault-modal": openVaultModal(); break;
      case "buy-card": await buyCard(actionButton.dataset.cardId); break;
      case "set-active-card": await setActiveCard(actionButton.dataset.cardId); break;
      case "buy-investment": openInvestmentModal(actionButton.dataset.productId); break;
      case "sell-investment": await sellInvestment(actionButton.dataset.positionId); break;
      case "crypto-trade": openCryptoModal(actionButton.dataset.symbol, actionButton.dataset.side); break;
      case "store-filter": storeFilter = actionButton.dataset.filter; selectedShop = null; render(); break;
      case "select-shop": selectedShop = actionButton.dataset.shopId; storeFilter = SHOPS.find(shop => shop.id === selectedShop)?.categoryId || storeFilter; render(); break;
      case "clear-shop": selectedShop = null; render(); break;
      case "buy-product": await buyProduct(actionButton.dataset.productId); break;
      case "open-inventory": openInventoryModal(); break;
      case "send-check": break;
      case "refresh-admin": await refreshAdminUsers(); toast("Lista atualizada", `${adminUsers.length} contas carregadas.`); break;
      case "admin-select": adminSelectedUid = actionButton.dataset.uid; render(); break;
      case "admin-reload-json": loadSelectedGameJson(); break;
      case "admin-save-json": await adminSaveGameJson(); break;
      case "admin-adjust-wallet": await adminAdjustWallet(); break;
      case "admin-max-player": await adminMaxPlayer(); break;
      case "save-system-config": await saveSystemConfig(); break;
    }
  } catch (error) {
    console.error(action, error);
    toast("Não foi possível concluir", errorMessage(error), "error");
  }
});

$("#mobile-menu")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("mobile-open"));
document.addEventListener("click", event => {
  if (window.innerWidth > 800) return;
  const sidebar = $("#sidebar");
  if (sidebar?.classList.contains("mobile-open") && !event.target.closest("#sidebar") && !event.target.closest("#mobile-menu")) sidebar.classList.remove("mobile-open");
});

$("#view-container")?.addEventListener("input", event => {
  const el = event.target;
  if (el.id === "job-search") { jobSearch = el.value; rerenderPreservingInput(el, () => render()); }
  if (el.id === "store-search") { storeSearch = el.value; rerenderPreservingInput(el, () => render()); }
  if (el.id === "product-search") { productSearch = el.value; rerenderPreservingInput(el, () => render()); }
  if (el.id === "card-search") { cardSearch = el.value; rerenderPreservingInput(el, () => render()); }
  if (el.id === "casino-stake") updateCasinoPotential();
  if (el.id === "transfer-amount" || el.id === "transfer-type") updateTransferPreview();
  if (el.id === "admin-user-search") updateAdminUserList(el.value);
});
$("#view-container")?.addEventListener("change", event => {
  if (event.target.id === "transfer-type") updateTransferPreview();
});
function rerenderPreservingInput(input, callback) {
  const id = input.id;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  callback();
  const next = document.getElementById(id);
  if (next) { next.focus(); if (typeof start === "number" && next.setSelectionRange) next.setSelectionRange(start, end); }
}

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  try {
    if (form.id === "job-challenge-form") await submitJobChallenge();
    if (form.id === "transfer-form") await submitTransfer();
    if (form.id === "check-form") await submitCheck();
    if (form.id === "crypto-trade-form") await executeCryptoTrade(form.dataset.symbol, form.dataset.side);
    if (form.id === "investment-buy-form") await executeInvestmentBuy(form.dataset.productId);
    if (form.id === "money-move-form") await executeMoneyMove(form.dataset.kind);
    if (form.id === "vault-move-form") await executeVaultMove(form.dataset.kind);
  } catch (error) {
    console.error("form submit", error);
    toast("Operação não concluída", errorMessage(error), "error");
  }
});

function updateWorkClock() {
  const active = game?.activeWork;
  if (!active) return;
  const remaining = Math.max(0, active.startedAt + active.durationMs - Date.now());
  $$('[data-work-remaining]').forEach(node => node.textContent = active.ready ? "PRONTO" : timeLabel(remaining));
  const progress = Math.min(100, Math.max(0, (Date.now() - active.startedAt) / active.durationMs * 100));
  $$('[data-work-progress], [data-mini-progress]').forEach(node => node.style.width = `${progress}%`);
}

async function startJob(jobId) {
  if (game.activeWork) throw new Error("Você já tem um trabalho em andamento. Conclua-o antes de aceitar outro.");
  const job = JOBS.find(item => item.id === jobId);
  if (!job) throw new Error("Esta vaga não está disponível.");
  const payout = Math.round(job.minPay + Math.random() * (job.maxPay - job.minPay));
  game.activeWork = {
    jobId: job.id,
    title: job.title,
    tier: job.tier,
    durationMin: job.durationMin,
    durationMs: job.durationMin * 60000,
    payout,
    challenge: Boolean(job.challenge),
    difficulty: job.difficulty,
    startedAt: Date.now(),
    ready: false,
    challengeState: job.challenge ? makeChallenge(job) : null
  };
  if (game.activeWork.challengeState) game.activeWork.challenge = game.activeWork.challengeState;
  delete game.activeWork.challengeState;
  addHistory(game, `Trabalho iniciado: ${job.title}`, 0, "work", `${job.durationMin} minutos · ${job.company}`);
  await persistGame();
  toast("Vaga aceita", `Seu progresso em ${job.title} será mantido mesmo se você fechar o site.`);
  render();
}

async function submitJobChallenge() {
  const active = game.activeWork;
  if (!active?.ready || !active.challenge) throw new Error("A etapa final ainda não está disponível.");
  const input = $("#challenge-answer");
  if (!input || input.value.trim() === "") throw new Error("Digite uma resposta antes de confirmar.");
  const value = Number(input.value);
  const expected = number(active.challenge.answer);
  if (value !== expected && number(active.challenge.attempts) < 2) {
    active.challenge.attempts = number(active.challenge.attempts) + 1;
    await persistGame();
    toast("Resposta incorreta", `Confira os sinais e tente novamente. Tentativa ${active.challenge.attempts} de 3.`, "error");
    render();
    return;
  }
  const payout = Math.round(number(active.payout) * (value === expected ? 1 : 0.7) * number(systemConfig.workRewardMultiplier || 1));
  game.cash = number(game.cash) + payout;
  game.xp = number(game.xp) + Math.max(25, Math.round(payout / 100));
  game.completedJobs = number(game.completedJobs) + 1;
  game.totalEarned = number(game.totalEarned) + payout;
  addHistory(game, `Salário: ${active.title}`, payout, "positive", value === expected ? "Desafio final concluído" : "Pagamento parcial após tentativas");
  game.activeWork = null;
  levelUpIfNeeded();
  await persistGame();
  render();
  toast("Trabalho finalizado", `Você recebeu ${money(payout)} na carteira.`);
}

function updateCasinoPotential() {
  const stake = Math.max(0, number($("#casino-stake")?.value));
  const potential = $("#casino-potential");
  if (potential) potential.textContent = money(Math.round(stake * 2 * number(systemConfig.casinoRewardMultiplier || 1)));
}

async function betColor(picked) {
  if (systemConfig.casinoEnabled === false) throw new Error("O cassino foi desativado pelo administrador.");
  const stake = Math.floor(number($("#casino-stake")?.value));
  if (!Number.isFinite(stake) || stake < 100) throw new Error("A aposta mínima é Cr$ 100.");
  if (stake > number(game.cash)) throw new Error("Saldo da carteira insuficiente para esta aposta.");
  game.cash = number(game.cash) - stake;
  const result = casinoResult();
  const won = result === picked;
  const multiplier = picked === "white" ? 14 : 2;
  const payout = won ? Math.floor(stake * multiplier * number(systemConfig.casinoRewardMultiplier || 1)) : 0;
  if (payout) {
    game.cash += payout;
    game.totalCasinoWinnings = number(game.totalCasinoWinnings) + Math.max(0, payout - stake);
  }
  const colorLabel = { red: "Vermelho", blue: "Azul", white: "Branco" };
  const resultLabel = colorLabel[result] || result;
  addHistory(game, `${won ? "Vitória" : "Aposta perdida"}: ${colorLabel[picked]}`, won ? payout - stake : -stake, "casino", `Resultado ${resultLabel} · aposta ${money(stake)}`);
  await persistGame();
  try {
    const record = push(ref(database, "casinoFeed"));
    await set(record, { uid: currentUser.uid, playerName: profile.displayName || profile.username, picked, result, stake, payout, won, at: Date.now() });
  } catch (error) { console.warn("Could not publish casino feed", error); }
  render();
  toast(won ? "Você venceu a rodada" : "Fim da rodada", won ? `${resultLabel}: ${money(payout)} retornaram à carteira.` : `Saiu ${resultLabel}. Você pode tentar novamente quando quiser.` , won ? "success" : "error");
}

async function createDuel() {
  const stake = Math.floor(number($("#duel-stake")?.value));
  if (stake < 500) throw new Error("O valor mínimo por jogador é Cr$ 500.");
  if (stake > number(game.cash)) throw new Error("Sua carteira não possui saldo suficiente.");
  const duelRef = push(ref(database, "duels"));
  const id = duelRef.key;
  game.cash -= stake;
  addHistory(game, "Entrada em duelo", -stake, "negative", "Aposta multiplayer reservada");
  await persistGame();
  try {
    await set(duelRef, {
      creatorUid: currentUser.uid,
      creatorName: profile.displayName || profile.username,
      stake,
      createdAt: Date.now(),
      state: "open",
      participants: { [currentUser.uid]: { uid: currentUser.uid, name: profile.displayName || profile.username, joinedAt: Date.now() } }
    });
  } catch (error) {
    game.cash += stake;
    addHistory(game, "Reembolso de duelo", stake, "positive", "Não foi possível abrir a mesa");
    await persistGame(true);
    throw error;
  }
  toast("Duelo criado", "A mesa está aberta para outro jogador entrar.");
  render();
}

async function joinDuel(id) {
  const duel = activeDuels.find(item => item.id === id);
  if (!duel) throw new Error("Este duelo já não está aberto.");
  if (duel.creatorUid === currentUser.uid) throw new Error("Você não pode entrar no próprio duelo.");
  if (Object.keys(duel.participants || {}).length >= 2) throw new Error("Esta mesa já está completa.");
  const stake = number(duel.stake);
  if (stake > number(game.cash)) throw new Error("Sua carteira não possui saldo suficiente.");
  const memberRef = ref(database, `duels/${id}/participants/${currentUser.uid}`);
  const existing = await get(memberRef);
  if (existing.exists()) throw new Error("Você já entrou nesta mesa.");
  game.cash -= stake;
  addHistory(game, "Entrada em duelo", -stake, "negative", `Mesa de ${duel.creatorName || "jogador"}`);
  await persistGame();
  try {
    await set(memberRef, { uid: currentUser.uid, name: profile.displayName || profile.username, joinedAt: Date.now() });
  } catch (error) {
    game.cash += stake;
    addHistory(game, "Reembolso de duelo", stake, "positive", "Não foi possível entrar na mesa");
    await persistGame(true);
    throw error;
  }
  toast("Você entrou no duelo", "A rodada será resolvida quando a mesa estiver completa.");
  render();
}

async function submitTransfer() {
  const recipientName = $("#transfer-recipient").value.trim();
  const key = normalizeUsername(recipientName);
  const amount = Math.floor(number($("#transfer-amount").value));
  const type = $("#transfer-type").value;
  if (key.length < 3) throw new Error("Informe um nome de usuário válido.");
  if (amount < 1) throw new Error("O valor deve ser maior que zero.");
  const snapshot = await get(query(ref(database, "publicProfiles"), orderByChild("usernameKey"), equalTo(key)));
  const matches = Object.entries(snapshot.val() || {});
  if (!matches.length) throw new Error("Não encontramos este nome de usuário.");
  const [recipientUid, recipient] = matches[0];
  if (recipientUid === currentUser.uid) throw new Error("Não é possível enviar créditos para você mesmo.");
  const fee = type === "pix" ? 0 : Math.ceil(amount * number(systemConfig.transferFeeRate));
  const total = amount + fee;
  if (total > number(game.bank)) throw new Error(`Saldo bancário insuficiente. Total com taxa: ${money(total)}.`);
  const now = Date.now();
  const transferRef = push(ref(database, `transfers/${recipientUid}`));
  const transfer = {
    id: transferRef.key,
    senderUid: currentUser.uid,
    senderName: profile.displayName || profile.username,
    recipientUid,
    recipientName: recipient.displayName || recipient.username,
    amount,
    fee,
    type,
    createdAt: now,
    availableAt: now + (type === "pix" ? 0 : number(systemConfig.standardTransferDelayMs))
  };
  const before = clone(game);
  game.bank -= total;
  addHistory(game, type === "pix" ? `Pix enviado para ${transfer.recipientName}` : `Transferência enviada para ${transfer.recipientName}`, -total, "negative", `${type === "pix" ? "Sem taxa" : `Taxa ${money(fee)}`} · crédito virtual`);
  try {
    await persistGame();
    await set(transferRef, transfer);
  } catch (error) {
    game = before;
    await persistGame(true);
    throw error;
  }
  $("#transfer-form")?.reset();
  if (currentView === "transfer") render();
  toast(type === "pix" ? "Pix enviado" : "Transferência enviada", `${money(amount)} para ${transfer.recipientName}. ${type === "pix" ? "O valor chega imediatamente." : "O valor será liberado após o prazo configurado."}`);
}

async function submitCheck() {
  const recipientName = $("#check-recipient").value.trim();
  const key = normalizeUsername(recipientName);
  const amount = Math.floor(number($("#check-amount").value));
  if (key.length < 3 || amount <= 0) throw new Error("Informe um favorecido válido e um valor positivo.");
  const snapshot = await get(query(ref(database, "publicProfiles"), orderByChild("usernameKey"), equalTo(key)));
  const matches = Object.entries(snapshot.val() || {});
  if (!matches.length) throw new Error("Não encontramos este nome de usuário.");
  const [recipientUid, recipient] = matches[0];
  if (recipientUid === currentUser.uid) throw new Error("Não é possível emitir um cheque para você mesmo.");
  if (amount > number(game.bank)) throw new Error("Seu saldo bancário é insuficiente.");
  const checkRef = push(ref(database, `checkbook/${recipientUid}`));
  const entry = { id: checkRef.key, senderUid: currentUser.uid, senderName: profile.displayName || profile.username, recipientUid, recipientName: recipient.displayName || recipient.username, amount, createdAt: Date.now() };
  const before = clone(game);
  game.bank -= amount;
  game.checks = [{ id: entry.id, recipientName: entry.recipientName, amount, at: Date.now(), status: "Emitido" }, ...(game.checks || [])].slice(0, 100);
  addHistory(game, `Cheque emitido para ${entry.recipientName}`, -amount, "negative", "Valor reservado para compensação");
  try { await persistGame(); await set(checkRef, entry); }
  catch (error) { game = before; await persistGame(true); throw error; }
  render();
  toast("Cheque emitido", `${money(amount)} enviado a ${entry.recipientName}.`);
}

function openModal(title, subtitle, body, width = "520px") {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal-card" style="max-width:${width}" role="dialog" aria-modal="true"><div class="modal-header"><div><div class="eyebrow">THE LIFE APP</div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">${icon("x")}</button></div>${body}</section></div>`;
  renderIcons();
}
function closeModal() { $("#modal-root").innerHTML = ""; }
document.addEventListener("click", event => {
  if (event.target.closest('[data-action="close-modal"]')) closeModal();
  if (event.target.matches("[data-modal-backdrop]")) closeModal();
});

function openMoneyModal(kind) {
  const deposit = kind === "deposit";
  openModal(deposit ? "Depositar na conta" : "Sacar para carteira", deposit ? "Transfira créditos disponíveis da carteira para o banco." : "Mova créditos do banco privado para sua carteira.", `<form id="money-move-form" class="form-stack" data-kind="${kind}"><div class="form-field"><label for="money-move-amount">VALOR (Cr$)</label><input class="form-control" id="money-move-amount" type="number" min="1" step="1" value="${Math.min(10000, deposit ? game.cash : game.bank)}" required /></div><div class="panel" style="padding:13px;background:rgba(255,255,255,.02)"><div style="display:flex;justify-content:space-between;font-size:9px;color:#8a96aa"><span>Carteira disponível</span><strong style="color:#dde3ec">${money(game.cash)}</strong></div><div style="display:flex;justify-content:space-between;font-size:9px;color:#8a96aa;margin-top:8px"><span>Saldo bancário</span><strong style="color:#dde3ec">${money(game.bank)}</strong></div></div><div class="form-action-row"><button class="button button-quiet" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">${deposit ? "Depositar" : "Sacar"}</button></div></form>`);
}
async function executeMoneyMove(kind) {
  const amount = Math.floor(number($("#money-move-amount").value));
  if (amount <= 0) throw new Error("Informe um valor positivo.");
  if (kind === "deposit") {
    if (amount > number(game.cash)) throw new Error("A carteira não possui saldo suficiente.");
    game.cash -= amount; game.bank += amount;
  } else {
    if (amount > number(game.bank)) throw new Error("O banco não possui saldo suficiente.");
    game.bank -= amount; game.cash += amount;
  }
  addHistory(game, kind === "deposit" ? "Depósito em conta" : "Saque para carteira", kind === "deposit" ? -amount : amount, kind === "deposit" ? "negative" : "positive", "Movimentação entre seus próprios saldos");
  closeModal(); await persistGame(); render(); toast(kind === "deposit" ? "Depósito realizado" : "Saque realizado", `${money(amount)} transferidos entre seus saldos.`);
}

function openVaultModal() {
  openModal("Cofrinho privado", "Guarde créditos e acompanhe rendimentos virtuais calculados pelo tempo decorrido.", `<form id="vault-move-form" class="form-stack" data-kind="deposit"><div class="form-field"><label for="vault-move-kind">OPERAÇÃO</label><select class="form-control" id="vault-move-kind"><option value="deposit">Guardar da carteira</option><option value="withdraw">Retirar para carteira</option></select></div><div class="form-field"><label for="vault-move-amount">VALOR (Cr$)</label><input class="form-control" id="vault-move-amount" type="number" min="1" step="1" value="${Math.min(5000, game.cash)}" required /></div><div class="panel" style="padding:13px;background:rgba(255,255,255,.02)"><div style="display:flex;justify-content:space-between;font-size:9px;color:#8a96aa"><span>Carteira</span><strong style="color:#dde3ec">${money(game.cash)}</strong></div><div style="display:flex;justify-content:space-between;font-size:9px;color:#8a96aa;margin-top:8px"><span>Cofrinho</span><strong style="color:#dde3ec">${money(game.vault)}</strong></div><p class="form-note" style="margin-top:11px">Rendimento simulado de até 0,7% ao dia, calculado ao retornar ao jogo.</p></div><div class="form-action-row"><button class="button button-quiet" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Confirmar</button></div></form>`);
  $("#vault-move-kind")?.addEventListener("change", event => { const form = $("#vault-move-form"); if (form) form.dataset.kind = event.target.value; });
}
async function executeVaultMove(kind) {
  const amount = Math.floor(number($("#vault-move-amount").value));
  if (amount <= 0) throw new Error("Informe um valor positivo.");
  if (kind === "deposit") {
    if (amount > number(game.cash)) throw new Error("A carteira não possui saldo suficiente.");
    game.cash -= amount; game.vault += amount;
  } else {
    if (amount > number(game.vault)) throw new Error("O cofrinho não possui saldo suficiente.");
    game.vault -= amount; game.cash += amount;
  }
  addHistory(game, kind === "deposit" ? "Depósito no cofrinho" : "Retirada do cofrinho", kind === "deposit" ? -amount : amount, kind === "deposit" ? "negative" : "positive", "Movimentação de poupança virtual");
  closeModal(); await persistGame(); render(); toast("Cofrinho atualizado", `${money(amount)} movimentados.`);
}

async function buyCard(cardId) {
  const card = CARDS.find(item => item.id === cardId);
  if (!card) throw new Error("Este cartão não existe.");
  if ((game.ownedCards || []).some(item => item.id === cardId)) throw new Error("Você já possui este cartão.");
  if (number(game.bank) < number(card.price)) throw new Error(`Saldo bancário insuficiente. O cartão custa ${money(card.price)}.`);
  game.bank -= card.price;
  const owned = { ...card, pan: `••••  ••••  ••••  ${String(Math.floor(1000 + Math.random() * 9000))}`, acquiredAt: Date.now() };
  game.ownedCards.push(owned);
  if (!game.activeCardId) game.activeCardId = card.id;
  addHistory(game, `Cartão adquirido: ${card.name}`, -card.price, "negative", "Compra da coleção privada");
  await persistGame(); render(); toast("Cartão adquirido", `${card.name} já está em sua coleção.`);
}
async function setActiveCard(cardId) {
  const card = (game.ownedCards || []).find(item => item.id === cardId);
  if (!card) throw new Error("Este cartão não está em sua coleção.");
  game.activeCardId = cardId;
  addHistory(game, `Cartão ativado: ${card.name}`, 0, "info", "Cartão principal atualizado");
  await persistGame(); render(); toast("Cartão atualizado", `${card.name} agora é seu cartão principal.`);
}

function openInvestmentModal(productId) {
  const product = BANK_PRODUCTS.find(item => item.id === productId);
  if (!product) return;
  openModal(`Investir em ${product.name}`, `${product.description} Prazo: ${product.term}. Retorno potencial: ${(product.rate * 100).toFixed(1).replace(".", ",")}% no prazo informado.`, `<form id="investment-buy-form" class="form-stack" data-product-id="${product.id}"><div class="form-field"><label for="investment-amount">VALOR DO APORTE</label><input id="investment-amount" class="form-control" type="number" min="${product.min}" step="100" value="${product.min}" required /></div><div class="panel" style="padding:13px;background:rgba(255,255,255,.02)"><div style="display:flex;justify-content:space-between;font-size:9px;color:#8b97ab"><span>Aplicação mínima</span><strong style="color:#dce2ec">${money(product.min)}</strong></div><div style="display:flex;justify-content:space-between;font-size:9px;color:#8b97ab;margin-top:8px"><span>Saldo bancário</span><strong style="color:#dce2ec">${money(game.bank)}</strong></div><p class="form-note" style="margin-top:11px">O retorno é calculado ao longo do prazo virtual. O valor pode variar conforme as regras do jogo.</p></div><div class="form-action-row"><button class="button button-quiet" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Confirmar aplicação</button></div></form>`);
}
async function executeInvestmentBuy(productId) {
  const product = BANK_PRODUCTS.find(item => item.id === productId);
  const amount = Math.floor(number($("#investment-amount").value));
  if (!product || amount < product.min) throw new Error(`O aporte mínimo é ${money(product?.min || 0)}.`);
  if (amount > number(game.bank)) throw new Error("Seu saldo bancário é insuficiente.");
  const termMatch = product.term.match(/(\d+)/);
  const termDays = termMatch ? number(termMatch[1]) : 30;
  const termMs = termDays * 86400000;
  game.bank -= amount;
  game.investments = number(game.investments) + amount;
  const position = { id: push(ref(database, `users/${currentUser.uid}/game/investmentPositions`)).key, productId, name: product.name, investedAmount: amount, currentValue: amount, rate: product.rate, termMs, termLabel: product.term, startedAt: Date.now(), lastAccruedAt: Date.now(), profitPaid: 0, matured: false };
  game.investmentPositions.push(position);
  addHistory(game, `Investimento: ${product.name}`, -amount, "negative", `Prazo ${product.term} · aporte inicial`);
  closeModal(); await persistGame(); render(); toast("Investimento contratado", `${money(amount)} aplicados em ${product.name}.`);
}
async function sellInvestment(positionId) {
  const index = (game.investmentPositions || []).findIndex(item => item.id === positionId);
  if (index < 0) throw new Error("Esta posição não foi encontrada.");
  const position = game.investmentPositions[index];
  const amount = Math.floor(number(position.currentValue));
  game.investments = Math.max(0, number(game.investments) - amount);
  game.bank = number(game.bank) + amount;
  game.investmentPositions.splice(index, 1);
  addHistory(game, `Resgate: ${position.name}`, amount, "positive", "Valor resgatado para o banco");
  await persistGame(); render(); toast("Resgate concluído", `${money(amount)} creditados no seu banco.`);
}

function openCryptoModal(symbol, side) {
  const asset = CRYPTO.find(item => item.symbol === symbol);
  if (!asset) return;
  const price = cryptoPrice(symbol);
  const held = number(game.cryptoHoldings?.[symbol]);
  const buy = side === "buy";
  openModal(`${buy ? "Comprar" : "Vender"} ${asset.name}`, `Cotação simulada atual: ${money(price)} por unidade de ${asset.symbol}.`, `<form id="crypto-trade-form" class="form-stack" data-symbol="${symbol}" data-side="${side}"><div class="form-field"><label for="crypto-amount">${buy ? "VALOR DA COMPRA (Cr$)" : `QUANTIDADE A VENDER (${symbol})`}</label><input id="crypto-amount" class="form-control" type="number" min="0.0001" step="${buy ? "100" : "0.0001"}" value="${buy ? Math.min(5000, game.bank) : held}" required /></div><div class="panel" style="padding:13px;background:rgba(255,255,255,.02)"><div style="display:flex;justify-content:space-between;font-size:9px;color:#8995aa"><span>Saldo bancário</span><strong style="color:#e0e5ef">${money(game.bank)}</strong></div><div style="display:flex;justify-content:space-between;font-size:9px;color:#8995aa;margin-top:8px"><span>Posição atual</span><strong style="color:#e0e5ef">${decimalFmt.format(held)} ${symbol}</strong></div><div style="display:flex;justify-content:space-between;font-size:9px;color:#8995aa;margin-top:8px"><span>Cotação</span><strong style="color:#e0e5ef">${money(price)}</strong></div></div><div class="form-action-row"><button class="button button-quiet" type="button" data-action="close-modal">Cancelar</button><button class="button button-primary" type="submit">Confirmar ordem</button></div></form>`);
}
async function executeCryptoTrade(symbol, side) {
  const asset = CRYPTO.find(item => item.symbol === symbol);
  const price = cryptoPrice(symbol);
  const amount = number($("#crypto-amount").value);
  if (!asset || amount <= 0) throw new Error("Informe uma quantidade válida.");
  game.cryptoHoldings = game.cryptoHoldings || {};
  if (side === "buy") {
    const spend = Math.floor(amount);
    if (spend > number(game.bank)) throw new Error("Saldo bancário insuficiente.");
    const units = spend / price;
    game.bank -= spend;
    game.cryptoHoldings[symbol] = number(game.cryptoHoldings[symbol]) + units;
    addHistory(game, `Compra de ${symbol}`, -spend, "negative", `${decimalFmt.format(units)} unidades a ${money(price)}`);
  } else {
    const held = number(game.cryptoHoldings[symbol]);
    if (amount > held) throw new Error("Você não possui essa quantidade para vender.");
    const proceeds = Math.floor(amount * price);
    game.cryptoHoldings[symbol] = Math.max(0, held - amount);
    game.bank += proceeds;
    addHistory(game, `Venda de ${symbol}`, proceeds, "positive", `${decimalFmt.format(amount)} unidades a ${money(price)}`);
  }
  closeModal(); await persistGame(); render(); toast("Ordem executada", `${side === "buy" ? "Compra" : "Venda"} de ${symbol} concluída no mercado virtual.`);
}

async function buyProduct(productId) {
  const product = PRODUCTS.find(item => item.id === productId);
  if (!product) throw new Error("Este produto não existe.");
  if (number(game.bank) < product.price) throw new Error(`Saldo bancário insuficiente. Você precisa de ${money(product.price)}.`);
  const shop = SHOPS.find(item => item.id === product.shopId);
  game.bank -= product.price;
  game.inventory = [...(game.inventory || []), { id: `${product.id}-${Date.now()}`, productId: product.id, name: product.name, category: product.category, price: product.price, currentValue: Math.round(product.price * 0.72), purchasedAt: Date.now(), shopName: shop?.name || "The Life Store" }];
  addHistory(game, `Compra: ${product.name}`, -product.price, "negative", shop?.name || product.category);
  await persistGame(); render(); toast("Compra confirmada", `${product.name} foi adicionado ao seu inventário.`);
}

function openInventoryModal() {
  const inventory = game.inventory || [];
  openModal("Seu inventário", "Todos os itens que você adquiriu nas lojas do universo The Life App.", inventory.length ? `<div class="product-list">${inventory.map((item, index) => `<div class="investment-row"><span class="investment-mark">${icon("package")}</span><div class="investment-info"><strong>${esc(item.name)}</strong><span>${esc(item.category)} · ${esc(item.shopName)} · ${esc(dateLabel(item.purchasedAt))}</span></div><div class="investment-data"><strong>${money(item.currentValue || item.price * .72)}</strong><span>valor estimado</span></div><button class="button button-outline" data-action="sell-item" data-item-id="${esc(item.id)}">Vender</button></div>`).join("")}</div>` : `<div class="empty-state"><span class="empty-icon">${icon("package")}</span><strong>Inventário vazio</strong><p>Visite o shopping para adquirir seus primeiros itens.</p><button class="button button-primary" data-action="close-modal">Entendi</button></div>`, "680px");
}

async function sellItem(itemId) {
  const index = (game.inventory || []).findIndex(item => item.id === itemId);
  if (index < 0) throw new Error("Este item não foi encontrado.");
  const item = game.inventory[index];
  const amount = Math.floor(number(item.currentValue || item.price * 0.7));
  game.inventory.splice(index, 1);
  game.cash = number(game.cash) + amount;
  addHistory(game, `Venda: ${item.name}`, amount, "positive", "Revenda virtual do inventário");
  await persistGame(); openInventoryModal(); render(); toast("Item vendido", `${money(amount)} adicionados à carteira.`);
}

async function submitProfileForm() {
  const newName = $("#profile-name").value.trim();
  if (newName.length < 3 || newName.length > 24) throw new Error("O nome precisa ter entre 3 e 24 caracteres.");
  const newKey = normalizeUsername(newName);
  if (newKey.length < 3) throw new Error("Use um nome sem caracteres especiais e com pelo menos 3 letras ou números.");
  const oldKey = normalizeUsername(profile.username);
  if (newKey !== oldKey) {
    const reserved = await reserveUsername(newName, currentUser.uid);
    if (!reserved.ok) throw new Error(reserved.reason);
    await set(ref(database, `usernameIndex/${oldKey}`), null);
  }
  profile.username = newName;
  profile.displayName = newName;
  await set(ref(database, `users/${currentUser.uid}/profile`), profile);
  await persistGame();
  closeModal(); updateUserShell(); render(); toast("Perfil atualizado", "Seu nome público foi alterado.");
}

function openProfileModal() {
  openModal("Perfil e conta", "Gerencie o nome público e confira as informações da sua sessão.", `<form id="profile-form" class="form-stack"><div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.05);border-radius:12px;background:rgba(255,255,255,.018)"><span class="leaderboard-avatar" style="height:45px;width:45px">${esc(compactName(profile.displayName || profile.username))}</span><div><strong style="display:block;font-size:11px">${esc(profile.displayName || profile.username)}</strong><small style="font-size:8px;color:#758198">${isAdmin ? "Proprietário" : "Jogador"} · nível ${number(game.level)}</small></div></div><div class="form-field"><label for="profile-name">NOME PÚBLICO / NOME DE USUÁRIO</label><input id="profile-name" class="form-control" minlength="3" maxlength="24" value="${esc(profile.username || "")}" required /></div><div class="form-field"><label>CONTA</label><div class="form-control" style="display:flex;align-items:center;color:#8d99ad">${esc(profile.email || (currentUser.email?.endsWith("@username.thelifeapp.app") ? "Login por nome de usuário" : currentUser.email || "Conta conectada"))}</div></div><div class="form-grid"><div class="form-field"><label>PATRIMÔNIO VIRTUAL</label><div class="form-control">${money(netWorth())}</div></div><div class="form-field"><label>UID DA CONTA</label><div class="form-control" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(currentUser.uid)}</div></div></div><div class="form-action-row"><button type="button" class="button button-danger" data-action="logout">Sair da conta</button><button type="button" class="button button-quiet" data-action="close-modal">Cancelar</button><button type="submit" class="button button-primary">Salvar perfil</button></div></form>`, "540px");
  $("#profile-form")?.addEventListener("submit", async event => { event.preventDefault(); try { await submitProfileForm(); } catch (error) { toast("Perfil não atualizado", errorMessage(error), "error"); } });
}

async function refreshAdminUsers() {
  if (!isAdmin) return;
  const snap = await get(ref(database, "users"));
  const data = snap.val() || {};
  adminUsers = Object.entries(data).map(([uid, item]) => ({ uid, profile: item.profile || {}, game: item.game || {} }));
  if (adminSelectedUid && !adminUsers.some(item => item.uid === adminSelectedUid)) adminSelectedUid = null;
  if (!adminSelectedUid && adminUsers.length) adminSelectedUid = currentUser.uid;
  if (currentView === "admin") render();
}
function updateAdminUserList(search = $("#admin-user-search")?.value || "") {
  const root = $("#admin-user-list");
  if (!root) return;
  const searchKey = search.toLowerCase();
  const list = adminUsers.filter(item => `${item.profile?.displayName || ""} ${item.profile?.username || ""} ${item.profile?.email || ""} ${item.uid}`.toLowerCase().includes(searchKey));
  root.innerHTML = list.map(item => `<button class="admin-user-row ${item.uid === adminSelectedUid ? "active" : ""}" data-action="admin-select" data-uid="${item.uid}"><span class="leaderboard-avatar">${esc(compactName(item.profile?.displayName || item.profile?.username))}</span><span class="user-row-copy"><strong>${esc(item.profile?.displayName || item.profile?.username || "Jogador")}</strong><span>${esc(item.profile?.email || item.profile?.accountType || "Conta")}</span></span><small>${money(number(item.game?.cash) + number(item.game?.bank) + number(item.game?.vault) + number(item.game?.investments))}</small></button>`).join("") || `<div class="empty-state"><strong>Nenhum resultado</strong><p>Tente outro nome, e-mail ou UID.</p></div>`;
  renderIcons();
}
function loadSelectedGameJson() {
  const selected = adminUsers.find(item => item.uid === adminSelectedUid);
  const textarea = $("#admin-game-json");
  if (selected && textarea) textarea.value = JSON.stringify(selected.game || defaultGame(), null, 2);
}
async function adminSaveGameJson() {
  if (!isAdmin) throw new Error("Acesso restrito.");
  if (!adminSelectedUid) throw new Error("Selecione uma conta.");
  let parsed;
  try { parsed = JSON.parse($("#admin-game-json").value); }
  catch { throw new Error("O JSON contém erro de sintaxe. Corrija antes de salvar."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("O estado do jogo precisa ser um objeto JSON.");
  await set(ref(database, `users/${adminSelectedUid}/game`), parsed);
  const index = adminUsers.findIndex(item => item.uid === adminSelectedUid);
  if (index >= 0) adminUsers[index].game = parsed;
  if (adminSelectedUid === currentUser.uid) {
    game = { ...defaultGame(), ...parsed };
    await persistGame(true);
    updateUserShell();
  } else {
    const item = adminUsers.find(user => user.uid === adminSelectedUid);
    if (item) await set(ref(database, `publicProfiles/${adminSelectedUid}`), createPublicProfile(adminSelectedUid, item.profile, parsed));
  }
  addAdminLog("edit-game-json", adminSelectedUid, { keys: Object.keys(parsed).length });
  render(); toast("Estado salvo", "O jogo desta conta foi atualizado pelo painel do proprietário.");
}
async function adminAdjustWallet() {
  if (!isAdmin || !adminSelectedUid) throw new Error("Selecione uma conta para ajustar.");
  const field = $("#admin-wallet-field").value;
  const amount = number($("#admin-wallet-amount").value);
  const selected = adminUsers.find(item => item.uid === adminSelectedUid);
  if (!selected) throw new Error("A conta selecionada não foi encontrada.");
  const updated = { ...defaultGame(), ...clone(selected.game || {}) };
  updated[field] = field === "level" ? Math.max(1, Math.floor(number(updated[field]) + amount)) : Math.max(0, number(updated[field]) + amount);
  await set(ref(database, `users/${adminSelectedUid}/game`), updated);
  selected.game = updated;
  if (adminSelectedUid === currentUser.uid) game = updated;
  await set(ref(database, `publicProfiles/${adminSelectedUid}`), createPublicProfile(adminSelectedUid, selected.profile, updated));
  await addAdminLog("adjust-wallet", adminSelectedUid, { field, amount });
  render(); toast("Ajuste aplicado", `${field}: ${signedMoney(amount)}.`);
}
async function adminMaxPlayer() {
  if (!isAdmin || !adminSelectedUid) throw new Error("Selecione uma conta.");
  const selected = adminUsers.find(item => item.uid === adminSelectedUid);
  if (!selected) throw new Error("Conta não encontrada.");
  const updated = { ...defaultGame(), ...clone(selected.game || {}) };
  updated.cash = 999999999999;
  updated.bank = 999999999999;
  updated.vault = 999999999999;
  updated.investments = 999999999999;
  updated.xp = Math.max(number(updated.xp), 1000000);
  updated.level = 100;
  await set(ref(database, `users/${adminSelectedUid}/game`), updated);
  selected.game = updated;
  if (adminSelectedUid === currentUser.uid) game = updated;
  await set(ref(database, `publicProfiles/${adminSelectedUid}`), createPublicProfile(adminSelectedUid, selected.profile, updated));
  await addAdminLog("max-player", adminSelectedUid, { level: 100 });
  render(); toast("Fortuna máxima aplicada", "Os saldos virtuais da conta selecionada foram atualizados.");
}
async function saveSystemConfig() {
  if (!isAdmin) throw new Error("Somente o proprietário pode alterar as regras globais.");
  const workRewardMultiplier = Math.max(0, number($("#config-work-multiplier").value));
  const casinoRewardMultiplier = Math.max(0, number($("#config-casino-multiplier").value));
  const transferFeeRate = Math.min(0.5, Math.max(0, number($("#config-transfer-fee").value) / 100));
  const standardTransferDelayMs = Math.min(86400, Math.max(0, number($("#config-transfer-delay").value))) * 1000;
  const startingCash = Math.max(0, number($("#config-starting-cash").value));
  const startingBank = Math.max(0, number($("#config-starting-bank").value));
  systemConfig = { ...systemConfig, workRewardMultiplier, casinoRewardMultiplier, transferFeeRate, standardTransferDelayMs, startingCash, startingBank, casinoEnabled: $("#config-casino-enabled").checked };
  await set(ref(database, "system/config"), systemConfig);
  await addAdminLog("update-system-config", "global", systemConfig);
  toast("Economia atualizada", "As regras globais foram salvas no Realtime Database.");
  render();
}
async function addAdminLog(action, targetUid, details) {
  if (!isAdmin) return;
  try { await set(push(ref(database, "adminLog")), { action, targetUid, details, actorUid: currentUser.uid, actorEmail: currentUser.email || OWNER_EMAIL, at: Date.now() }); }
  catch (error) { console.warn("Admin log not saved", error); }
}

// Owner's duel is resolved by its creator. The result is stored once so all participants can see it.
resolveOpenDuelsAsCreator = async function () {
  if (!currentUser || !activeDuels.length) return;
  for (const duel of activeDuels) {
    const participants = Object.values(duel.participants || {});
    if (participants.length < 2 || duel.creatorUid !== currentUser.uid || duel.result) continue;
    const winner = participants[Math.floor(Math.random() * participants.length)];
    try {
      await runTransaction(ref(database, `duels/${duel.id}/result`), current => current || { winnerUid: winner.uid, winnerName: winner.name, resolvedAt: Date.now() });
      await applyKnownDuelResults();
    } catch (error) { console.debug("Duel resolution pending", error); }
  }
};

// Actions added after the initial renderer to keep all owned inventory operations in one handler.
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-action='sell-item']");
  if (button && !button.disabled) {
    try { await sellItem(button.dataset.itemId); } catch (error) { toast("Venda não concluída", errorMessage(error), "error"); }
  }
});

// Keep the fee preview informative before a payment is submitted.
function updateTransferPreview() {
  const amount = Math.floor(number($("#transfer-amount")?.value));
  const type = $("#transfer-type")?.value || "pix";
  const fee = type === "pix" ? 0 : Math.ceil(amount * number(systemConfig.transferFeeRate));
  if ($("#transfer-fee-preview")) $("#transfer-fee-preview").textContent = money(fee);
  if ($("#transfer-total-preview")) $("#transfer-total-preview").textContent = money(amount + fee);
}

// Initialize the auth screen controls.
setAuthMode("login");
toggleIdentityMode("email");
renderIcons();
