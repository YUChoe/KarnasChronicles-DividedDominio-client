/*
 * 랜딩 사이트 스크립트. 빌드 도구를 쓰지 않는 바닐라 JavaScript 다.
 *
 * 문구는 영어와 한국어를 모두 담는다. 게임 클라이언트가 두 언어를 지원하므로
 * 랜딩만 영어로 두면 한국어 사용자가 소개조차 읽지 못한다.
 *
 * 계정 생성은 여기에 없다. Godot 클라이언트가 게임 채널의 `register` 로 직접
 * 만든다. 이 페이지는 소개와 내려받기 안내만 한다.
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

function start() {
  each('.langs button', function (button) {
    button.addEventListener('click', function () {
      applyLocale(button.getAttribute('data-locale'));
    });
  });

  hideMissingShots();
  applyLocale(initialLocale());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
