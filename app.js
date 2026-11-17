'use strict';

const MAX_AMOUNT = 10000000;
const MAX_DIGITS = 8;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const ICON_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'%3E%3Crect width='44' height='44' rx='13' fill='%23121212'/%3E%3Cpath fill='%232e2e2e' d='M22 12l8 4.6v9.2L22 30.4l-8-4.6v-9.2z'/%3E%3C/svg%3E";

const nf = new Intl.NumberFormat('ru-RU');
const group = (value) => nf.format(value);
const digitsOnly = (value) => value.replace(/\D/g, '');
const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const priceFor = (amount) => Math.ceil((amount * 10) / 7);
const receivedFor = (price) => Math.floor((price * 7) / 10);

const amountInput = $('amount');
const amountWrap = $('amountWrap');
const amountHint = $('amountHint');
const priceEl = $('price');
const digitsEl = $('priceDigits');
const rippleEl = $('ripple');
const resultEl = $('result');
const tapHint = $('tapHint');
const fineEl = $('fine');
const tallyEl = $('tally');
const liveEl = $('live');
const ambient = document.querySelector('.ambient');
const presets = [...document.querySelectorAll('.preset')];

const finderToggle = $('finderToggle');
const reveal = $('finderReveal');
const finder = $('finder');
const lookupForm = $('lookupForm');
const lookupRow = lookupForm.querySelector('.lookup__row');
const lookupBtn = $('lookupBtn');
const nickInput = $('nick');
const nickHint = $('nickHint');
const results = $('results');
const orderPanel = $('orderPanel');
let orderRequest = 0;
const crumbs = $('crumbs');
const crumbUser = $('crumbUser');
const crumbGame = $('crumbGame');
const crumbSep = $('crumbSep');
const target = $('target');
const targetValue = $('targetValue');
const targetCopy = $('targetCopy');

let currentPrice = null;
let currentAmount = null;
let shownPrice = 0;
let lastPriceText = '';
let passesTarget = null;
let tweenFrame = 0;
let announceTimer = 0;

const state = { user: null, game: null, games: [], gamesCursor: null, passes: [], passesCursor: null };

/* ── Цена ──────────────────────────────────────────────── */

function paintPrice(value) {
  const text = group(value);
  priceEl.style.setProperty('--k', text.length >= 10 ? 0.74 : text.length >= 8 ? 0.86 : 1);

  if (text !== lastPriceText) {
    const fragment = document.createDocumentFragment();
    let index = 0;
    for (const char of text) {
      const span = document.createElement('span');
      span.className = char === ' ' ? 'price__sep' : 'price__d';
      span.textContent = char === ' ' ? ' ' : char;
      span.style.setProperty('--i', index);
      index += 1;
      fragment.append(span);
    }
    digitsEl.replaceChildren(fragment);
    lastPriceText = text;
  }

  const received = receivedFor(value);
  tallyEl.replaceChildren(
    document.createTextNode('вам '),
    bold(group(received)),
    document.createTextNode(' · roblox '),
    bold(group(value - received)),
  );
}

function bold(text) {
  const node = document.createElement('b');
  node.textContent = text;
  return node;
}

function paintEmpty() {
  cancelAnimationFrame(tweenFrame);
  shownPrice = 0;
  lastPriceText = '—';
  priceEl.style.setProperty('--k', 1);
  const span = document.createElement('span');
  span.className = 'price__d';
  span.textContent = '—';
  digitsEl.replaceChildren(span);
  tallyEl.replaceChildren();
}

function animatePrice(to) {
  cancelAnimationFrame(tweenFrame);
  const from = shownPrice;
  if (reduceMotion.matches || from === to) {
    shownPrice = to;
    paintPrice(to);
    return;
  }
  const duration = Math.min(560, 220 + Math.log10(Math.abs(to - from) + 1) * 80);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    shownPrice = Math.round(from + (to - from) * eased);
    paintPrice(shownPrice);
    if (t < 1) {
      tweenFrame = requestAnimationFrame(step);
    } else {
      shownPrice = to;
      paintPrice(to);
      resultEl.classList.remove('pulse');
      void resultEl.offsetWidth;
      resultEl.classList.add('pulse');
    }
  };
  tweenFrame = requestAnimationFrame(step);
}

function sync() {
  const previousAmount = currentAmount;
  const raw = digitsOnly(amountInput.value);
  const value = raw === '' ? null : Number(raw);
  let error = '';
  if (value !== null && value < 1) error = 'введите число от 1';
  else if (value !== null && value > MAX_AMOUNT) error = `максимум ${group(MAX_AMOUNT)}`;

  amountWrap.dataset.state = error ? 'error' : '';
  amountHint.textContent = error;
  amountInput.setAttribute('aria-invalid', error ? 'true' : 'false');
  currentAmount = value !== null && !error ? value : null;
  if (previousAmount !== currentAmount) clearOrder();

  if (value !== null && !error) {
    currentPrice = priceFor(value);
    priceEl.classList.remove('price--empty');
    resultEl.classList.add('is-live');
    priceEl.setAttribute('aria-label', `Цена геймпасса ${group(currentPrice)} робуксов — нажмите, чтобы скопировать`);
    priceEl.disabled = false;
    tapHint.classList.add('is-live');
    fineEl.hidden = false;
    animatePrice(currentPrice);
  } else {
    currentPrice = null;
    priceEl.classList.add('price--empty');
    resultEl.classList.remove('is-live');
    priceEl.setAttribute('aria-label', 'Цена геймпасса не рассчитана');
    priceEl.disabled = true;
    tapHint.classList.remove('is-live');
    fineEl.hidden = true;
    paintEmpty();
  }

  resetCopyState();

  presets.forEach((preset) => {
    preset.setAttribute('aria-pressed', String(Number(preset.dataset.amount) === value));
  });

  target.hidden = currentPrice === null;
  if (currentPrice !== null) {
    targetValue.textContent = group(currentPrice);
    finderToggle.setAttribute('aria-expanded', 'true');
    reveal.dataset.open = 'true';
    finder.removeAttribute('inert');
  }
  if (state.game && passesTarget !== currentPrice) renderPasses();
  if (guideOpen) refreshGuidePrice();

  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    liveEl.textContent = currentPrice === null ? '' : `Цена геймпасса ${group(currentPrice)} робуксов`;
  }, 800);
}

amountInput.addEventListener('input', () => {
  const caret = amountInput.selectionStart ?? amountInput.value.length;
  const digitsBeforeCaret = digitsOnly(amountInput.value.slice(0, caret)).length;
  const digits = digitsOnly(amountInput.value).slice(0, MAX_DIGITS);
  const formatted = digits === '' ? '' : group(Number(digits));
  amountInput.value = formatted;

  let position = 0;
  let seen = 0;
  while (position < formatted.length && seen < digitsBeforeCaret) {
    if (formatted[position] >= '0' && formatted[position] <= '9') seen += 1;
    position += 1;
  }
  amountInput.setSelectionRange(position, position);
  sync();
});

presets.forEach((preset) => {
  preset.addEventListener('click', () => {
    amountInput.value = group(Number(preset.dataset.amount));
    sync();
  });
});

/* ── Курсорный свет ────────────────────────────────────── */

if (!reduceMotion.matches && window.matchMedia('(pointer:fine)').matches) {
  let queued = false;
  let x = 50;
  let y = 40;
  window.addEventListener('pointermove', (event) => {
    x = (event.clientX / window.innerWidth) * 100;
    y = (event.clientY / window.innerHeight) * 100;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      ambient.style.setProperty('--mx', `${x}%`);
      ambient.style.setProperty('--my', `${y}%`);
      queued = false;
    });
  }, { passive: true });
}

/* ── Копирование ───────────────────────────────────────── */

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* запасной способ ниже */
  }
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(helper);
  helper.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  helper.remove();
  return ok;
}

const flashState = new WeakMap();

function flash(button, label) {
  const textNode = button.querySelector('.btn__text');
  const use = button.querySelector('use');
  const iconOnly = !textNode && Boolean(use);
  let saved = flashState.get(button);
  if (!saved) {
    saved = {
      text: textNode ? textNode.textContent : button.textContent,
      aria: button.getAttribute('aria-label'),
      href: use ? use.getAttribute('href') : null,
      timer: 0,
    };
    flashState.set(button, saved);
  }
  clearTimeout(saved.timer);
  if (textNode) textNode.textContent = label;
  else if (!iconOnly) button.textContent = label;
  if (use) use.setAttribute('href', '#i-check');
  if (iconOnly) button.setAttribute('aria-label', label);
  button.classList.add('is-done');

  saved.timer = setTimeout(() => {
    if (textNode) textNode.textContent = saved.text;
    else if (!iconOnly) button.textContent = saved.text;
    if (use && saved.href) use.setAttribute('href', saved.href);
    if (iconOnly) {
      if (saved.aria) button.setAttribute('aria-label', saved.aria);
      else button.removeAttribute('aria-label');
    }
    button.classList.remove('is-done');
  }, 1700);
}

async function copyWithFeedback(button, text) {
  const ok = await copyText(text);
  flash(button, ok ? 'Скопировано' : 'Не вышло');
  if (!ok) liveEl.textContent = 'Не удалось скопировать. Выделите число вручную.';
}

const TAP_DEFAULT = 'нажмите на число, чтобы скопировать';
let copyResetTimer = 0;

function resetCopyState() {
  clearTimeout(copyResetTimer);
  resultEl.classList.remove('copied');
  tapHint.classList.remove('is-done');
  tapHint.textContent = TAP_DEFAULT;
}

priceEl.addEventListener('click', async (event) => {
  if (currentPrice === null) return;
  const box = priceEl.getBoundingClientRect();
  const x = event.clientX ? event.clientX - box.left : box.width / 2;
  const y = event.clientY ? event.clientY - box.top : box.height / 2;
  rippleEl.style.left = `${x}px`;
  rippleEl.style.top = `${y}px`;
  rippleEl.classList.remove('go');
  void rippleEl.offsetWidth;
  rippleEl.classList.add('go');

  const ok = await copyText(String(currentPrice));
  clearTimeout(copyResetTimer);
  resultEl.classList.remove('copied');
  void resultEl.offsetWidth;
  resultEl.classList.add('copied');
  tapHint.classList.add('is-done');
  tapHint.textContent = ok ? 'скопировано' : 'не вышло — выделите вручную';
  liveEl.textContent = ok ? `Скопировано: ${group(currentPrice)}` : 'Не удалось скопировать';
  copyResetTimer = setTimeout(resetCopyState, 1900);
});

if (!reduceMotion.matches && window.matchMedia('(pointer:fine)').matches) {
  priceEl.addEventListener('pointermove', (event) => {
    const box = priceEl.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width - 0.5;
    const py = (event.clientY - box.top) / box.height - 0.5;
    priceEl.style.setProperty('--ry', `${(px * 14).toFixed(2)}deg`);
    priceEl.style.setProperty('--rx', `${(-py * 12).toFixed(2)}deg`);
  });
  priceEl.addEventListener('pointerleave', () => {
    priceEl.style.setProperty('--ry', '0deg');
    priceEl.style.setProperty('--rx', '0deg');
  });
}
targetCopy.addEventListener('click', () => {
  if (currentPrice !== null) copyWithFeedback(targetCopy, String(currentPrice));
});

/* ── Поиск: раскрытие ──────────────────────────────────── */

finderToggle.addEventListener('click', () => {
  const open = finderToggle.getAttribute('aria-expanded') !== 'true';
  finderToggle.setAttribute('aria-expanded', String(open));
  reveal.dataset.open = String(open);
  if (open) finder.removeAttribute('inert');
  else finder.setAttribute('inert', '');
  if (!open) return;
  setTimeout(() => {
    if (window.innerWidth > 560) nickInput.focus({ preventScroll: true });
    finder.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }, reduceMotion.matches ? 0 : 420);
});

/* ── Поиск: запросы ────────────────────────────────────── */

const serverStatus = $('serverStatus');
const serverRetry = $('serverRetry');
let healthPending = false;
const configuredApi = document.querySelector('meta[name="api-base"]')?.content || '';
const apiOrigin = configuredApi && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  ? new URL(configuredApi).origin : location.origin;

// Free tunnel hosts interpose a browser warning page unless the fetch opts out.
function tunnelHeaders(hostname) {
  if (hostname.endsWith('.loca.lt')) return { 'bypass-tunnel-reminder': 'true' };
  if (['.ngrok-free.app', '.ngrok.io', '.ngrok.app', '.ngrok.dev'].some((suffix) => hostname.endsWith(suffix))) {
    return { 'ngrok-skip-browser-warning': 'true' };
  }
  return {};
}

async function requestJson(url, options = {}, timeout = 35000) {
  const source = new URL(url, location.origin);
  const endpoint = new URL(source.pathname + source.search, apiOrigin);
  let response;
  let payload;
  try {
    response = await fetch(endpoint, {
      ...options,
      headers: { Accept: 'application/json', ...tunnelHeaders(endpoint.hostname), ...options.headers },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    payload = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
  } catch {
    serverStatus.hidden = false;
    throw new Error('Нет связи с сервером. Подождите немного и попробуйте ещё раз.');
  }
  serverStatus.hidden = true;
  if (!response.ok) throw new Error(payload.error || 'Не удалось получить данные. Попробуйте ещё раз.');
  return payload;
}

async function checkServer() {
  if (healthPending) return;
  healthPending = true;
  serverRetry.disabled = true;
  serverRetry.textContent = 'Проверяем связь…';
  try {
    const result = await requestJson('/api/health', {}, 8000);
    serverStatus.hidden = result.ok === true;
  } catch {
    serverStatus.hidden = false;
  } finally {
    healthPending = false;
    serverRetry.disabled = false;
    serverRetry.textContent = 'Проверить связь';
  }
}

serverRetry.addEventListener('click', checkServer);
window.addEventListener('online', checkServer);
window.addEventListener('offline', () => { serverStatus.hidden = false; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkServer(); });
setInterval(() => { if (!document.hidden) checkServer(); }, 30000);

async function api(path, params) {
  const url = new URL(path, location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return requestJson(url);
}

function setBusy(busy) {
  lookupBtn.disabled = busy;
  lookupBtn.setAttribute('aria-busy', String(busy));
}

function setNickError(message) {
  lookupRow.dataset.state = message ? 'error' : '';
  nickInput.setAttribute('aria-invalid', message ? 'true' : 'false');
  nickHint.textContent = message;
}

/* ── Поиск: отрисовка ──────────────────────────────────── */

function icon(src, className) {
  const img = document.createElement('img');
  img.className = className;
  img.width = 46;
  img.height = 46;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  img.src = typeof src === 'string' && /^https:\/\/([\w-]+\.)*rbxcdn\.com\//.test(src) ? src : ICON_PLACEHOLDER;
  img.addEventListener('error', () => { img.src = ICON_PLACEHOLDER; }, { once: true });
  return img;
}

function svgIcon(id, className, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function stagger(container) {
  container.classList.add('stagger');
  [...container.children].forEach((child, index) => {
    child.style.setProperty('--i', Math.min(index, 12));
  });
}

function linkButton(label, href, variant, iconId) {
  const link = document.createElement('a');
  link.className = `btn btn--${variant}`;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const text = document.createElement('span');
  text.className = 'btn__text';
  text.textContent = label;
  link.append(text);
  if (iconId) link.append(svgIcon(iconId, 'btn__icon', 14));
  return link;
}

function renderLoading(rows) {
  const wrap = document.createElement('div');
  wrap.className = 'skeleton';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement('div');
    row.className = 'skeleton__row';
    row.style.animationDelay = `${i * 70}ms`;
    const box = document.createElement('div');
    box.className = 'skeleton__box skeleton__box--icon';
    const long = document.createElement('div');
    long.className = 'skeleton__box skeleton__box--line';
    const short = document.createElement('div');
    short.className = 'skeleton__box skeleton__box--short';
    row.append(box, long, short);
    wrap.append(row);
  }
  results.replaceChildren(wrap);
  liveEl.textContent = 'Загружаем…';
}

function stateBlock({ title, text, error, action }) {
  const block = document.createElement('div');
  block.className = error ? 'state state--error' : 'state';
  block.append(svgIcon(error ? 'i-alert' : 'i-robux', 'state__icon', 22));
  const body = document.createElement('div');
  body.className = 'state__body';
  if (title) {
    const heading = document.createElement('span');
    heading.className = 'state__title';
    heading.textContent = title;
    body.append(heading);
  }
  if (text) body.append(document.createTextNode(text));
  if (action) body.append(action);
  block.append(body);
  results.replaceChildren(block);
  liveEl.textContent = `${title ? `${title}. ` : ''}${text || ''}`;
}

function renderError(message, retry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = 'Ещё раз';
  button.addEventListener('click', retry);
  stateBlock({ title: 'Не получилось', text: message, error: true, action: button });
}

function renderCrumbs() {
  if (!state.user) {
    crumbs.hidden = true;
    return;
  }
  crumbs.hidden = false;
  crumbUser.textContent = state.user.name;
  crumbUser.setAttribute('aria-current', state.game ? 'false' : 'page');
  crumbSep.hidden = !state.game;
  crumbGame.hidden = !state.game;
  if (state.game) {
    crumbGame.textContent = state.game.name;
    crumbGame.setAttribute('aria-current', 'page');
  }
}

crumbUser.addEventListener('click', () => {
  if (!state.game) return;
  clearOrder();
  state.game = null;
  state.passes = [];
  state.passesCursor = null;
  renderGames();
});

function moreButton(onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'more';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = 'Ещё';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Загружаем…';
    try {
      await onClick();
    } catch (error) {
      renderError(error.message, () => onClick().catch((again) => renderError(again.message, onClick)));
    }
  });
  wrap.append(button);
  return wrap;
}

const salesUrl = (universeId, passId) =>
  `https://create.roblox.com/dashboard/creations/experiences/${universeId}/passes/${passId}/sales`;
const newPassUrl = (universeId) =>
  `https://create.roblox.com/dashboard/creations/experiences/${universeId}/monetization/passes`;

/* ── Критерий: нет своей игры ──────────────────────────── */

const NO_GAME_VIDEO_URL = './create-experience.mp4';
const MANAGER_MESSAGE = 'Позовите менеджера, пожалуйста. Не получается создать геймпасс, нужна помощь с аккаунтом.';

const NO_GAME_TREE = {
  start: {
    q: 'Игр не видно. Что подходит вам?',
    options: [
      { label: 'Игры есть, но их не видно', next: 'privacy' },
      { label: 'Игр нет, есть ПК', next: 'pc' },
      { label: 'Игр нет, только телефон', next: 'mobile' },
    ],
  },
  privacy: {
    title: 'Откройте профиль и инвентарь',
    text: 'В Roblox откройте Settings → Privacy и сделайте профиль и инвентарь видимыми. Убедитесь, что игра опубликована, а не стоит в Private. Потом проверьте снова.',
    actions: () => [retryButton()],
  },
  pc: {
    title: 'Нужен Roblox Studio',
    text: 'На ПК создайте и опубликуйте игру в Roblox Studio. Потом вернитесь сюда, найдите её и создайте геймпасс.',
    video: true,
    actions: () => [
      linkButton('Скачать Studio', 'https://create.roblox.com/', 'primary', 'i-external'),
      guideButton('Как создать геймпасс', 'create'),
    ],
  },
  mobile: {
    q: 'Есть ли близкие с ПК, которым вы доверяете свой аккаунт?',
    options: [
      { label: 'Да, есть кому доверить', next: 'trusted' },
      { label: 'Нет, некому', next: 'alone' },
    ],
  },
  trusted: {
    title: 'Попросите помочь',
    text: 'Пусть близкий человек войдёт в ваш аккаунт на ПК, создаст игру и геймпасс по инструкции. Передавайте аккаунт только тем, кому доверяете.',
    video: true,
    note: 'Если аккаунт детский или включён родительский контроль (PIN), настройки приватности без родителя не изменить. В этом случае проще позвать менеджера.',
    actions: () => [
      guideButton('Инструкция для него', 'create'),
      jumpButton('Не выходит — позвать менеджера', 'manager'),
    ],
  },
  alone: {
    q: 'Готовы передать аккаунт менеджеру в Funpay?',
    options: [
      { label: 'Да, позову менеджера', next: 'manager' },
      { label: 'Нет, не хочу передавать аккаунт', next: 'cannot' },
    ],
  },
  manager: {
    title: 'Напишите в чат Funpay',
    text: 'Кнопок в Funpay нет — просто напишите сообщение в чат сделки. Продавец увидит его и ответит. Скопируйте готовый текст:',
    message: MANAGER_MESSAGE,
    actions: () => [copyMessageButton(MANAGER_MESSAGE)],
  },
  cannot: {
    title: 'Покупка невозможна',
    text: 'Без своей игры геймпасс не создать, а передавать аккаунт вы не хотите. В этом случае сделку лучше отменить.',
    actions: () => [],
  },
};

let critPath = [];

function videoSlot() {
  if (NO_GAME_VIDEO_URL) {
    const video = document.createElement('video');
    video.className = 'crit__video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = NO_GAME_VIDEO_URL;
    return video;
  }
  const slot = document.createElement('div');
  slot.className = 'crit__videoslot';
  slot.append(svgIcon('i-play', 'crit__videoslot-icon', 22));
  const label = document.createElement('span');
  label.textContent = 'Видео-инструкция появится здесь';
  slot.append(label);
  return slot;
}

function retryButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary';
  button.textContent = 'Проверить снова';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Проверяем…';
    critPath = [];
    try {
      await loadGames(true);
    } catch (error) {
      renderError(error.message, () => loadGames(true));
    }
  });
  return button;
}

function jumpButton(label, key) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = label;
  button.addEventListener('click', () => {
    critPath.push(key);
    renderNoGame();
  });
  return button;
}

function copyMessageButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary';
  const span = document.createElement('span');
  span.className = 'btn__text';
  span.textContent = 'Скопировать текст';
  button.append(span, svgIcon('i-copy', 'btn__icon', 14));
  button.addEventListener('click', () => copyWithFeedback(button, text));
  return button;
}

function renderNoGame() {
  renderCrumbs();
  const key = critPath.length ? critPath[critPath.length - 1] : 'start';
  const node = NO_GAME_TREE[key];
  const wrap = document.createElement('div');
  wrap.className = 'crit';

  if (!critPath.length) {
    const intro = document.createElement('p');
    intro.className = 'crit__text';
    intro.textContent = 'Своих игр не видно. Геймпасс создаётся только в своей игре — разберёмся, как её получить.';
    wrap.append(intro);
  } else {
    const path = document.createElement('div');
    path.className = 'crit__path';
    for (const step of critPath) {
      const span = document.createElement('span');
      span.textContent = NO_GAME_TREE[step].title || NO_GAME_TREE[step].q;
      path.append(span);
    }
    wrap.append(path);
  }

  if (node.q) {
    const question = document.createElement('p');
    question.className = 'crit__q';
    question.textContent = node.q;
    wrap.append(question);
    const options = document.createElement('div');
    options.className = 'crit__opts';
    for (const option of node.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'crit__opt';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        critPath.push(option.next);
        renderNoGame();
      });
      options.append(button);
    }
    wrap.append(options);
  } else {
    const box = document.createElement('div');
    box.className = 'crit__result';
    const title = document.createElement('p');
    title.className = 'crit__title';
    title.textContent = node.title;
    const text = document.createElement('p');
    text.className = 'crit__text';
    text.textContent = node.text;
    box.append(title, text);
    if (node.video) box.append(videoSlot());
    if (node.message) {
      const quote = document.createElement('p');
      quote.className = 'crit__quote';
      quote.textContent = node.message;
      box.append(quote);
    }
    if (node.note) {
      const note = document.createElement('p');
      note.className = 'crit__note';
      note.append(svgIcon('i-alert', 'crit__note-icon', 14), document.createTextNode(node.note));
      box.append(note);
    }
    const actions = document.createElement('div');
    actions.className = 'crit__actions';
    actions.append(...node.actions());
    if (actions.children.length) box.append(actions);
    wrap.append(box);
  }

  if (critPath.length) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'crit__back';
    back.textContent = 'Назад';
    back.addEventListener('click', () => {
      critPath.pop();
      renderNoGame();
    });
    wrap.append(back);
  }

  results.replaceChildren(wrap);
  liveEl.textContent = node.q || `${node.title}. ${node.text}`;
}

function renderGames() {
  renderCrumbs();
  if (!state.games.length) {
    renderNoGame();
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'games';
  for (const game of state.games) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game';
    button.append(icon(game.iconUrl, 'game__icon'));
    const name = document.createElement('span');
    name.className = 'game__name';
    name.textContent = game.name;
    name.title = game.name;
    button.append(name);
    button.addEventListener('click', () => selectGame(game));
    grid.append(button);
  }
  stagger(grid);
  results.replaceChildren(grid);
  if (state.gamesCursor) results.append(moreButton(() => loadGames(false)));
  liveEl.textContent = `Найдено игр: ${state.games.length}. Выберите игру.`;
}

function chip(kind, label, iconId) {
  const node = document.createElement('span');
  node.className = `chip chip--${kind}`;
  node.append(svgIcon(iconId, 'chip__icon', 12));
  node.append(document.createTextNode(label));
  return node;
}

function guideButton(label, tab) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = label;
  button.addEventListener('click', () => setGuideOpen(true, tab));
  return button;
}

function clearOrder() {
  orderRequest += 1;
  orderPanel.hidden = true;
  orderPanel.replaceChildren();
}

function orderText(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

async function mintOrder(pass, button) {
  if (currentAmount === null || !state.game) return;
  const request = ++orderRequest;
  const data = {
    amount: currentAmount,
    universeId: state.game.id,
    passId: pass.id,
    username: state.user?.name || null,
  };
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  orderPanel.hidden = false;
  orderPanel.replaceChildren(orderText('order__hint', 'Создаём ID заказа…'));
  try {
    const result = await requestJson('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (request !== orderRequest) return;

    const code = document.createElement('button');
    code.type = 'button';
    code.className = 'order__code';
    code.textContent = result.id;
    code.setAttribute('aria-label', 'Скопировать ID заказа');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--primary';
    const label = document.createElement('span');
    label.className = 'btn__text';
    label.textContent = 'Скопировать ID';
    copy.append(label, svgIcon('i-copy', 'btn__icon', 14));
    const copyId = () => copyWithFeedback(copy, result.id);
    copy.addEventListener('click', copyId);
    code.addEventListener('click', copyId);

    const summary = document.createElement('div');
    summary.className = 'order__summary';
    for (const [name, value] of [
      ['Вы получите', `${group(result.order.amount)} робуксов`],
      ['Цена геймпасса', group(result.order.price)],
      ...(result.order.username ? [['Игрок', result.order.username]] : []),
    ]) {
      const row = document.createElement('div');
      row.append(document.createTextNode(name), bold(value));
      summary.append(row);
    }
    orderPanel.replaceChildren(
      orderText('order__title', 'Ваш ID заказа'),
      summary,
      code,
      copy,
      orderText('order__hint', 'Отправьте ID в чат сделки Funpay. Продавец сверит его с вашей покупкой.'),
    );
    liveEl.textContent = 'ID заказа готов. Скопируйте и отправьте его в Funpay.';
    orderPanel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
  } catch (error) {
    if (request !== orderRequest) return;
    orderPanel.replaceChildren(orderText('order__hint', error.message));
    liveEl.textContent = error.message;
  } finally {
    button.disabled = currentAmount === null;
    button.removeAttribute('aria-busy');
  }
}

function renderPasses() {
  passesTarget = currentPrice;
  renderCrumbs();
  const universeId = state.game.id;

  if (!state.passes.length) {
    const actions = document.createElement('div');
    actions.className = 'pass__actions';
    actions.append(linkButton('Создать геймпасс', newPassUrl(universeId), 'primary', 'i-external'), guideButton('Как создать', 'create'));
    stateBlock({
      title: 'Геймпассов нет',
      text: 'Создайте геймпасс, включите продажу и поставьте цену выше.',
      action: actions,
    });
    return;
  }

  const list = document.createElement('div');
  list.className = 'passes';

  for (const pass of state.passes) {
    const row = document.createElement('div');
    row.className = 'pass';
    row.append(icon(pass.iconUrl, 'pass__icon'));

    const name = document.createElement('div');
    name.className = 'pass__name';
    name.textContent = pass.name;
    name.title = pass.name;
    row.append(name);

    const meta = document.createElement('div');
    meta.className = 'pass__meta';
    const price = document.createElement('span');
    price.textContent = pass.isForSale && pass.price !== null ? `${group(pass.price)} R$` : 'продажа выключена';
    meta.append(price);
    const done = pass.isForSale && currentPrice !== null && pass.price === currentPrice;
    if (!pass.isForSale) meta.append(chip('off', 'включить', 'i-alert'));
    else if (done) meta.append(chip('ok', 'готово', 'i-check'));
    else if (currentPrice !== null) meta.append(chip('warn', `нужно ${group(currentPrice)}`, 'i-alert'));
    row.append(meta);

    const actions = document.createElement('div');
    actions.className = 'pass__actions';
    actions.append(linkButton(done ? 'Открыть' : 'Поставить цену', salesUrl(universeId, pass.id), done ? 'ghost' : 'primary', 'i-external'));
    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'btn btn--ghost pass__complete';
    complete.textContent = 'Получить ID';
    complete.disabled = currentAmount === null;
    complete.addEventListener('click', () => mintOrder(pass, complete));
    actions.append(complete);
    row.append(actions);

    const copyLink = document.createElement('button');
    copyLink.type = 'button';
    copyLink.className = 'btn btn--ghost pass__copy';
    copyLink.setAttribute('aria-label', `Скопировать ссылку на геймпасс «${pass.name}»`);
    copyLink.append(svgIcon('i-copy', 'btn__icon', 14));
    copyLink.addEventListener('click', () => copyWithFeedback(copyLink, salesUrl(universeId, pass.id)));
    row.append(copyLink);

    list.append(row);
  }

  stagger(list);
  results.replaceChildren(list);
  if (state.passesCursor) results.append(moreButton(() => loadPasses(false)));
  const create = document.createElement('div');
  create.className = 'more';
  create.append(guideButton('Как обновить цену', 'sales'), linkButton('Новый геймпасс', newPassUrl(universeId), 'ghost', 'i-external'));
  results.append(create);
  liveEl.textContent = `Геймпассов в игре: ${state.passes.length}.`;
}

/* ── Поиск: сценарий ───────────────────────────────────── */

async function loadGames(reset) {
  if (reset) {
    state.games = [];
    state.gamesCursor = null;
    renderLoading(3);
  }
  const data = await api('/api/games', { userId: state.user.id, cursor: state.gamesCursor });
  state.games = reset ? data.games : state.games.concat(data.games);
  state.gamesCursor = data.nextCursor;
  renderGames();
}

async function loadPasses(reset) {
  if (reset) {
    state.passes = [];
    state.passesCursor = null;
    renderLoading(3);
  }
  const data = await api('/api/passes', { universeId: state.game.id, cursor: state.passesCursor });
  state.passes = reset ? data.passes : state.passes.concat(data.passes);
  state.passesCursor = data.nextCursor;
  renderPasses();
  if (reset) {
    if (!state.passes.length) setGuideOpen(true, 'create');
    else if (currentPrice !== null && !state.passes.some((pass) => pass.isForSale && pass.price === currentPrice)) setGuideOpen(true, 'sales');
  }
}

async function selectGame(game) {
  clearOrder();
  state.game = game;
  renderCrumbs();
  try {
    await loadPasses(true);
  } catch (error) {
    renderError(error.message, () => selectGame(game));
  }
}

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const nick = nickInput.value.trim();
  if (!USERNAME_RE.test(nick)) {
    setNickError('3–20 символов: латиница, цифры, _');
    nickInput.focus();
    return;
  }
  setNickError('');
  setBusy(true);
  clearOrder();
  state.user = null;
  state.game = null;
  critPath = [];
  renderCrumbs();
  renderLoading(3);
  try {
    state.user = await api('/api/user', { username: nick });
    await loadGames(true);
  } catch (error) {
    state.user = null;
    renderCrumbs();
    renderError(error.message, () => lookupForm.requestSubmit());
  } finally {
    setBusy(false);
  }
});

nickInput.addEventListener('input', () => {
  if (lookupRow.dataset.state === 'error') setNickError('');
});

/* ── Старт ─────────────────────────────────────────────── */

const requested = Number(digitsOnly(new URLSearchParams(location.search).get('robux') || ''));
if (Number.isFinite(requested) && requested >= 1 && requested <= MAX_AMOUNT) {
  amountInput.value = group(requested);
}
/* ── Инструкция: анимированные макеты dashboard ────────── */

const guideToggle = $('guideToggle');
const guideReveal = $('guideReveal');
const guideEl = $('guide');
const stage = $('stage');
const stageFit = $('stageFit');
const cursorEl = $('cursor');
const ringEl = $('clickring');
const captionEl = $('caption');
const playBtn = $('playBtn');
const playIcon = $('playIcon');
const restartBtn = $('restartBtn');
const dotsEl = $('dots');
const stepCountEl = $('stepCount');
const stepsEl = $('steps');
const gtabCreate = $('gtabCreate');
const gtabSales = $('gtabSales');
const mockCreate = $('mockCreate');
const mockSales = $('mockSales');

const MOCK_W = 560;
const guidePrice = () => (currentPrice === null ? 1429 : currentPrice);

let guideOpen = false;
let guideTab = 'create';
let playing = false;
let clock = 0;
let guideLast = 0;
let guideRaf = 0;
let runToken = null;
let stepIndex = 0;
let cursorPos = { x: 280, y: 330 };

function resetCreate() {
  $('cvList').hidden = false;
  $('cvForm').hidden = true;
  $('cvName').textContent = '';
  $('cvNameField').classList.remove('is-focus');
}
function showCreateForm() {
  $('cvList').hidden = true;
  $('cvForm').hidden = false;
}
function resetSales() {
  $('svSale').classList.remove('is-on');
  $('svPriceWrap').classList.add('is-off');
  $('svPrice').textContent = '';
  $('svPriceField').classList.remove('is-focus');
  $('svRegional').classList.add('is-on');
  $('svRegionalLabel').textContent = 'Enabled';
  $('svModal').hidden = true;
  $('svSave').classList.add('is-disabled');
}
function saleOn() {
  $('svSale').classList.add('is-on');
  $('svPriceWrap').classList.remove('is-off');
}
function fillPrice() {
  $('svPrice').textContent = String(guidePrice());
  $('svSave').classList.remove('is-disabled');
}
function regionalOff() {
  $('svModal').hidden = true;
  $('svRegional').classList.remove('is-on');
  $('svRegionalLabel').textContent = 'Disabled';
}

const CREATE_STEPS = [
  {
    at: '#cvOpen',
    cap: () => ['В разделе Monetization → Passes нажмите ', 'Create Pass', '.'],
    pre: resetCreate,
    post: showCreateForm,
  },
  {
    at: '#cvNameField',
    cap: () => ['Введите любое название, например ', 'Robux', '.'],
    pre: showCreateForm,
    post: () => { showCreateForm(); $('cvName').textContent = 'Robux'; },
    field: 'cvName', wrap: 'cvNameField', text: () => 'Robux',
  },
  {
    at: '#cvDesc',
    cap: () => ['Описание и картинку заполнять ', 'не обязательно', '.'],
    pre: () => { showCreateForm(); $('cvName').textContent = 'Robux'; },
    post: () => { showCreateForm(); $('cvName').textContent = 'Robux'; },
  },
  {
    at: '#cvSave',
    cap: () => ['Нажмите ', 'Create pass', ' — геймпасс создан.'],
    pre: () => { showCreateForm(); $('cvName').textContent = 'Robux'; },
    post: () => { showCreateForm(); $('cvName').textContent = 'Robux'; },
  },
];

const SALES_STEPS = [
  {
    at: '#svSale',
    cap: () => ['Включите ', 'Item for sale', ', чтобы геймпасс продавался.'],
    pre: resetSales,
    post: saleOn,
  },
  {
    at: '#svPriceField',
    cap: () => ['Введите цену из калькулятора — ', group(guidePrice()), '.'],
    pre: saleOn,
    post: () => { saleOn(); fillPrice(); },
    field: 'svPrice', wrap: 'svPriceField', text: () => String(guidePrice()),
  },
  {
    at: '#svRegional',
    cap: () => ['Выключите ', 'Managed pricing', ' — иначе Roblox изменит цену для других стран.'],
    pre: () => { saleOn(); fillPrice(); },
    post: () => { saleOn(); fillPrice(); $('svModal').hidden = false; },
  },
  {
    at: '#svTurnOff',
    cap: () => ['Подтвердите выключение — ', 'Turn off', '.'],
    pre: () => { saleOn(); fillPrice(); $('svModal').hidden = false; },
    post: () => { saleOn(); fillPrice(); regionalOff(); },
  },
  {
    at: '#svSave',
    cap: () => ['Нажмите ', 'Save Changes', '. Цена обновлена.'],
    pre: () => { saleOn(); fillPrice(); regionalOff(); },
    post: () => { saleOn(); fillPrice(); regionalOff(); },
  },
];

const activeSteps = () => (guideTab === 'create' ? CREATE_STEPS : SALES_STEPS);

function setCaption(parts) {
  captionEl.replaceChildren(...parts.map((part) => (typeof part === 'string' ? document.createTextNode(part) : bold(part))));
}

function fitStage() {
  const scale = Math.min(1, stage.clientWidth / MOCK_W);
  stage.style.setProperty('--s', scale);
}

function targetPoint(selector) {
  const node = document.querySelector(selector);
  const box = stageFit.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  const scale = box.width / MOCK_W || 1;
  return {
    x: (rect.left - box.left) / scale + rect.width / scale / 2,
    y: (rect.top - box.top) / scale + rect.height / scale / 2,
  };
}

function guideTick(now) {
  guideRaf = requestAnimationFrame(guideTick);
  const delta = Math.min(50, now - guideLast);
  guideLast = now;
  if (playing && guideOpen && !document.hidden) clock += delta;
}

function startClock() {
  cancelAnimationFrame(guideRaf);
  guideLast = performance.now();
  guideRaf = requestAnimationFrame(guideTick);
}

function stopClock() {
  cancelAnimationFrame(guideRaf);
  guideRaf = 0;
}

function wait(ms, token) {
  return new Promise((resolve) => {
    const target = clock + ms;
    const loop = () => {
      if (token.cancelled || clock >= target) resolve();
      else requestAnimationFrame(loop);
    };
    loop();
  });
}

function moveCursor(x, y, ms, token) {
  return new Promise((resolve) => {
    const from = { ...cursorPos };
    const start = clock;
    const loop = () => {
      if (token.cancelled) return resolve();
      const t = Math.min(1, (clock - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      cursorPos = { x: from.x + (x - from.x) * eased, y: from.y + (y - from.y) * eased };
      cursorEl.style.transform = 'translate(' + cursorPos.x.toFixed(1) + 'px, ' + cursorPos.y.toFixed(1) + 'px)';
      if (t >= 1) resolve();
      else requestAnimationFrame(loop);
    };
    loop();
  });
}

function clickAt(point) {
  ringEl.style.left = point.x + 'px';
  ringEl.style.top = point.y + 'px';
  ringEl.classList.remove('go');
  void ringEl.offsetWidth;
  ringEl.classList.add('go');
}

function hit(selector) {
  const node = document.querySelector(selector);
  node.classList.remove('is-hit');
  void node.offsetWidth;
  node.classList.add('is-hit');
}

async function runStep(step, token) {
  step.pre();
  await wait(200, token);
  if (token.cancelled) return;
  const point = targetPoint(step.at);
  await moveCursor(point.x, point.y, 780, token);
  if (token.cancelled) return;
  await wait(160, token);

  if (step.field) {
    const wrap = $(step.wrap);
    const field = $(step.field);
    wrap.classList.add('is-focus');
    field.textContent = '';
    for (const char of step.text()) {
      if (token.cancelled) return;
      field.textContent += char;
      await wait(75, token);
    }
    await wait(240, token);
    wrap.classList.remove('is-focus');
  } else {
    clickAt(point);
    hit(step.at);
    await wait(300, token);
  }
  if (token.cancelled) return;
  step.post();
  await wait(1050, token);
}

function renderPlayer() {
  const steps = activeSteps();
  dotsEl.replaceChildren(...steps.map((step, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot';
    if (index === stepIndex) dot.classList.add('is-active');
    else if (index < stepIndex) dot.classList.add('is-done');
    dot.setAttribute('aria-label', 'Шаг ' + (index + 1));
    dot.addEventListener('click', () => { playing = true; play(index); });
    return dot;
  }));
  stepCountEl.textContent = Math.min(stepIndex + 1, steps.length) + ' / ' + steps.length;
  playIcon.setAttribute('href', playing ? '#i-pause' : '#i-play');
  playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Продолжить');
}

async function play(from) {
  if (runToken) runToken.cancelled = true;
  const token = { cancelled: false };
  runToken = token;
  const steps = activeSteps();

  if (guideTab === 'create') resetCreate();
  else resetSales();
  for (let j = 0; j < from; j += 1) steps[j].post();

  for (let i = from; i < steps.length; i += 1) {
    if (token.cancelled) return;
    stepIndex = i;
    renderPlayer();
    setCaption(steps[i].cap());
    await runStep(steps[i], token);
  }
  if (token.cancelled) return;
  playing = false;
  stepIndex = steps.length - 1;
  renderPlayer();
  setCaption(guideTab === 'create'
    ? ['Готово. Теперь вкладка ', 'Sales', ' — поставьте цену.']
    : ['Готово. Напишите продавцу, что цена выставлена.']);
}

function showStaticGuide() {
  const steps = activeSteps();
  if (runToken) runToken.cancelled = true;
  playing = false;
  if (guideTab === 'create') resetCreate();
  else resetSales();
  steps.forEach((step) => step.post());
  cursorEl.style.display = 'none';
  stepsEl.replaceChildren(...steps.map((step) => {
    const li = document.createElement('li');
    li.append(...step.cap().map((part) => (typeof part === 'string' ? document.createTextNode(part) : bold(part))));
    return li;
  }));
  stepsEl.hidden = false;
  document.querySelector('.player').hidden = true;
  setCaption(['Пошагово:']);
}

function setTab(tab, autoplay = true) {
  guideTab = tab;
  gtabCreate.classList.toggle('is-active', tab === 'create');
  gtabSales.classList.toggle('is-active', tab === 'sales');
  gtabCreate.setAttribute('aria-selected', String(tab === 'create'));
  gtabSales.setAttribute('aria-selected', String(tab === 'sales'));
  mockCreate.hidden = tab !== 'create';
  mockSales.hidden = tab !== 'sales';
  stepsEl.hidden = true;
  document.querySelector('.player').hidden = false;
  cursorEl.style.display = '';
  cursorPos = { x: 280, y: 330 };
  cursorEl.style.transform = 'translate(280px, 330px)';
  stepIndex = 0;
  fitStage();
  if (reduceMotion.matches) { showStaticGuide(); return; }
  playing = autoplay;
  play(0);
}

function setGuideOpen(open, tab) {
  guideOpen = open;
  guideToggle.setAttribute('aria-expanded', String(open));
  guideReveal.dataset.open = String(open);
  if (open) {
    guideEl.removeAttribute('inert');
    fitStage();
    startClock();
    setTab(tab || (state.passes.length ? 'sales' : 'create'));
    setTimeout(() => {
      guideEl.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }, reduceMotion.matches ? 0 : 420);
  } else {
    guideEl.setAttribute('inert', '');
    playing = false;
    if (runToken) runToken.cancelled = true;
    stopClock();
  }
}

guideToggle.addEventListener('click', () => {
  setGuideOpen(guideToggle.getAttribute('aria-expanded') !== 'true');
});
gtabCreate.addEventListener('click', () => setTab('create'));
gtabSales.addEventListener('click', () => setTab('sales'));
restartBtn.addEventListener('click', () => { playing = true; play(0); });
playBtn.addEventListener('click', () => {
  const steps = activeSteps();
  if (!playing && stepIndex >= steps.length - 1 && runToken && !runToken.cancelled) {
    playing = true;
    play(0);
    return;
  }
  playing = !playing;
  renderPlayer();
});

let stageResizeTimer = 0;
window.addEventListener('resize', () => {
  if (!guideOpen) return;
  clearTimeout(stageResizeTimer);
  stageResizeTimer = setTimeout(fitStage, 140);
}, { passive: true });

function refreshGuidePrice() {
  if (guideTab !== 'sales') return;
  if ($('svPrice').textContent !== '') fillPrice();
  const steps = activeSteps();
  if (steps[stepIndex]) setCaption(steps[stepIndex].cap());
}

sync();
checkServer();