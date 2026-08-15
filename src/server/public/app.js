/*
 * 랜딩 사이트 스크립트. 빌드 도구를 쓰지 않는 바닐라 JavaScript 다.
 *
 * 문구는 영어와 한국어를 모두 담는다. 게임 클라이언트가 두 언어를 지원하므로
 * 랜딩만 영어로 두면 한국어 사용자가 가입 단계에서 막힌다.
 *
 * 검증 규칙은 게이트웨이의 `landing/validate.ts` 와 같다. 여기서 걸러내는 것은
 * 왕복을 줄이려는 것이고 판정은 서버가 한다. 규칙 이름을 공유해서 브라우저
 * 검증과 서버 응답이 같은 문구를 쓴다.
 */

'use strict';

/** 지원 언어. 첫 항목이 기본이다. */
var LOCALES = ['en', 'ko'];

/** 언어 선택을 기억하는 키 */
var STORAGE_KEY = 'karnas.locale';

/**
 * 클라이언트 배포처.
 *
 * 빌드는 디스코드에서 나눈다. 파일을 이 사이트에 올리지 않으므로 받는 사람과
 * 이야기할 자리가 같은 곳에 있다.
 */
var DISCORD_INVITE = 'https://discord.gg/5V87vSUbw';

var TEXT = window.LANDING_TEXT || {};
var locale = LOCALES[0];

function text(key) {
  var entry = TEXT[key];
  if (!entry) {
    return key;
  }
  return entry[locale] || entry[LOCALES[0]];
}

/** 저장된 선택 → 브라우저 언어 → 기본값 순으로 고른다. */
function initialLocale() {
  var stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    stored = null;
  }

  if (LOCALES.indexOf(stored) !== -1) {
    return stored;
  }

  var languages = navigator.languages || [navigator.language || ''];
  for (var i = 0; i < languages.length; i += 1) {
    var prefix = String(languages[i]).slice(0, 2).toLowerCase();
    if (LOCALES.indexOf(prefix) !== -1) {
      return prefix;
    }
  }

  return LOCALES[0];
}

function applyLocale(next) {
  locale = LOCALES.indexOf(next) === -1 ? LOCALES[0] : next;
  document.documentElement.lang = locale;

  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (error) {
    // 저장이 막힌 브라우저에서도 전환 자체는 동작해야 한다
  }

  each('[data-i18n]', function (node) {
    node.textContent = text(node.getAttribute('data-i18n'));
  });
  each('[data-i18n-alt]', function (node) {
    node.setAttribute('alt', text(node.getAttribute('data-i18n-alt')));
  });
  each('[data-i18n-content]', function (node) {
    node.setAttribute('content', text(node.getAttribute('data-i18n-content')));
  });
  each('.langs button', function (button) {
    button.setAttribute(
      'aria-pressed',
      button.getAttribute('data-locale') === locale ? 'true' : 'false'
    );
  });

  document.title = text('hero.title');
  renderDownloads();

  var select = document.getElementById('preferredLocale');
  if (select && !select.dataset.touched) {
    select.value = locale;
  }
}

function each(selector, visit) {
  var nodes = document.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i += 1) {
    visit(nodes[i]);
  }
}

function renderDownloads() {
  var host = document.querySelector('[data-downloads]');
  if (!host) {
    return;
  }

  host.textContent = '';

  var link = document.createElement('a');
  link.className = 'button primary';
  link.href = DISCORD_INVITE;
  // 외부로 나가는 링크다. 원래 탭을 조작하지 못하게 막는다
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text('download.discord');
  host.appendChild(link);
}

/**
 * 이미지가 없으면 그 자리를 비운다.
 *
 * 깨진 이미지 표시를 남기면 준비 중인 자산이 결함처럼 보인다.
 */
function hideMissingShots() {
  var figures = document.querySelectorAll('[data-shot]');
  var remaining = figures.length;
  var pending = document.querySelector('[data-shots-empty]');

  function settle() {
    remaining -= 1;
    if (remaining <= 0 && pending) {
      pending.hidden = document.querySelectorAll('[data-shot]:not([hidden])')
        .length > 0;
    }
  }

  for (var i = 0; i < figures.length; i += 1) {
    (function (figure) {
      var image = figure.querySelector('img');
      if (!image) {
        settle();
        return;
      }
      if (image.complete) {
        if (image.naturalWidth === 0) {
          figure.hidden = true;
        }
        settle();
        return;
      }
      image.addEventListener('load', settle);
      image.addEventListener('error', function () {
        figure.hidden = true;
        settle();
      });
    })(figures[i]);
  }
}

/** 게이트웨이의 `validate.ts` 와 같은 규칙. 첫 위반을 돌려준다. */
function validate(values) {
  if (values.username.length === 0) {
    return { field: 'username', rule: 'required' };
  }
  if (values.username.length < 3 || values.username.length > 20) {
    return { field: 'username', rule: 'length' };
  }
  if (!/^[A-Za-z0-9_]+$/.test(values.username)) {
    return { field: 'username', rule: 'charset' };
  }
  if (values.password.length === 0) {
    return { field: 'password', rule: 'required' };
  }
  if (values.password.length < 8) {
    return { field: 'password', rule: 'length' };
  }
  if (new TextEncoder().encode(values.password).length > 72) {
    return { field: 'password', rule: 'bytes' };
  }
  if (values.password !== values.passwordConfirm) {
    return { field: 'passwordConfirm', rule: 'mismatch' };
  }
  if (values.email.length > 0) {
    if (values.email.length > 254) {
      return { field: 'email', rule: 'length' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      return { field: 'email', rule: 'format' };
    }
  }
  return null;
}

function showResult(kind, message) {
  var node = document.querySelector('[data-result]');
  if (!node) {
    return;
  }
  node.className = 'result' + (kind ? ' ' + kind : '');
  node.textContent = message;
}

function markInvalid(field) {
  each('.field', function (node) {
    node.classList.remove('invalid');
  });

  if (!field) {
    return;
  }

  var input = document.getElementById(field);
  if (input && input.parentNode) {
    input.parentNode.classList.add('invalid');
    input.focus();
  }
}

function failureText(failure) {
  var key = 'error.' + failure.field + '.' + failure.rule;
  return TEXT[key] ? text(key) : text('error.validation');
}

/** 서버 응답을 사용자 문구로 바꾼다. */
function outcomeText(status, payload) {
  if (status === 409) {
    return { kind: 'bad', field: 'username', message: text('error.taken') };
  }
  if (status === 429) {
    return { kind: 'bad', field: null, message: text('error.rate') };
  }
  if (status === 503) {
    return { kind: 'bad', field: null, message: text('error.disabled') };
  }
  if (status === 400 && payload && payload.field && payload.rule) {
    return {
      kind: 'bad',
      field: payload.field,
      message: failureText(payload)
    };
  }
  if (status === 400 || status === 413) {
    return { kind: 'bad', field: null, message: text('error.validation') };
  }
  return { kind: 'bad', field: null, message: text('error.upstream') };
}

async function submit(form) {
  var values = {
    username: form.username.value.trim(),
    password: form.password.value,
    passwordConfirm: form.passwordConfirm.value,
    email: form.email.value.trim(),
    preferredLocale: form.preferredLocale.value
  };

  var failure = validate(values);
  if (failure) {
    markInvalid(failure.field);
    showResult('bad', failureText(failure));
    return;
  }

  markInvalid(null);
  showResult('', text('register.sending'));

  var status = 0;
  var payload = null;

  try {
    var response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    status = response.status;
    payload = await response.json().catch(function () {
      return null;
    });
  } catch (error) {
    showResult('bad', text('error.upstream'));
    return;
  }

  if (status === 201) {
    form.reset();
    markInvalid(null);
    showResult('good', text('register.done'));
    return;
  }

  var outcome = outcomeText(status, payload);
  markInvalid(outcome.field);
  showResult(outcome.kind, outcome.message);
}

function start() {
  each('.langs button', function (button) {
    button.addEventListener('click', function () {
      applyLocale(button.getAttribute('data-locale'));
    });
  });

  var select = document.getElementById('preferredLocale');
  if (select) {
    select.addEventListener('change', function () {
      select.dataset.touched = '1';
    });
  }

  var form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      void submit(form);
    });
  }

  hideMissingShots();
  applyLocale(initialLocale());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
