// Karnas Chronicles: Divided Dominion - Admin Panel SPA
// 순수 JavaScript (ES6+), 외부 프레임워크 없음
'use strict';

/* ================================================================
 * API 통신 모듈
 * ================================================================ */
const api = (() => {
  const BASE = '/webadmin/api';

  /**
   * 공통 fetch 래퍼
   * 401 응답 시 자동으로 로그인 화면 표시
   */
  async function request(method, path, body) {
    const opts = {
      method,
      credentials: 'same-origin',
      headers: {},
    };

    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE}${path}`, opts);

    if (res.status === 401) {
      showLogin();
      throw new Error('Authentication required');
    }

    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.field = data.field;
      throw err;
    }

    return data;
  }

  return {
    get:  (path)       => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put:  (path, body) => request('PUT', path, body),
    del:  (path)       => request('DELETE', path),
  };
})();


/* ================================================================
 * 알림 시스템
 * ================================================================ */
const notify = (() => {
  function show(message, type) {
    const container = document.getElementById('notifications');
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button class="notification-close" aria-label="Close">&times;</button>
    `;

    el.querySelector('.notification-close').addEventListener('click', () => el.remove());
    container.appendChild(el);

    // 3초 후 자동 제거
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 3000);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error:   (msg) => show(msg, 'error'),
    info:    (msg) => show(msg, 'info'),
    warning: (msg) => show(msg, 'warning'),
  };
})();

/** HTML 이스케이프 유틸리티 */
function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* ================================================================
 * 모달 시스템
 * ================================================================ */
const modal = (() => {
  function open(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').hidden = false;
  }

  function close() {
    document.getElementById('modal-overlay').hidden = true;
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-footer').innerHTML = '';
    // 대시보드에서 모달을 닫으면 자동 새로고침 타이머 재시작
    if (getCurrentSection() === 'dashboard' && !_dashboardRefreshInterval) {
      startDashboardTimer();
    }
  }

  return { open, close };
})();

/* ================================================================
 * 삭제 확인 대화상자
 * ================================================================ */
const confirm = (() => {
  let _onConfirm = null;

  function open(message, onConfirm, options) {
    _onConfirm = onConfirm;
    var opts = options || {};
    document.getElementById('confirm-title').textContent = opts.title || 'Confirm Deletion';
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok').textContent = opts.okText || 'Delete';
    document.getElementById('confirm-ok').className = opts.okClass || 'btn btn-danger';
    document.getElementById('confirm-overlay').hidden = false;
  }

  function close() {
    _onConfirm = null;
    document.getElementById('confirm-overlay').hidden = true;
  }

  function handleOk() {
    if (typeof _onConfirm === 'function') {
      _onConfirm();
    }
    close();
  }

  // 이벤트 바인딩은 DOMContentLoaded에서 수행
  function bindEvents() {
    document.getElementById('confirm-ok').addEventListener('click', handleOk);
    document.getElementById('confirm-cancel').addEventListener('click', close);
    document.getElementById('confirm-close').addEventListener('click', close);
  }

  return { open, close, bindEvents };
})();


/* ================================================================
 * 인증 UI
 * ================================================================ */

/** 로그인 화면 표시 */
function showLogin() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

/** 앱 레이아웃 표시 */
function showApp() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app').hidden = false;
}

/** 로그인 폼 제출 핸들러 */
async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.hidden = true;

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    errorEl.textContent = 'Please enter username and password.';
    errorEl.hidden = false;
    return;
  }

  try {
    await api.post('/auth/login', { username, password });
    showApp();
    navigate();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed.';
    errorEl.hidden = false;
  }
}

/** 로그아웃 핸들러 */
async function handleLogout() {
  try {
    await api.post('/auth/logout');
  } catch (_) {
    // 로그아웃 실패해도 로그인 화면으로 전환
  }
  showLogin();
}

/** 세션 확인 (페이지 로드 시) */
async function checkSession() {
  try {
    const result = await api.get('/auth/check');
    return result.authenticated === true;
  } catch (_) {
    return false;
  }
}


/* ================================================================
 * 해시 기반 라우팅
 * ================================================================ */
const SECTIONS = ['dashboard', 'players', 'rooms', 'monsters', 'objects'];

/** 현재 해시에서 섹션 이름 추출 */
function getCurrentSection() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  return SECTIONS.includes(hash) ? hash : 'dashboard';
}

/** 해시에 따라 섹션 표시/숨김 및 내비게이션 active 토글 */
function navigate() {
  const section = getCurrentSection();

  // 대시보드가 아닌 섹션으로 이동 시 타이머 정리
  if (section !== 'dashboard') {
    clearDashboardTimer();
  }

  // 섹션 표시/숨김
  SECTIONS.forEach((name) => {
    const el = document.getElementById(`section-${name}`);
    if (el) el.hidden = (name !== section);
  });

  // 내비게이션 active 클래스 토글
  document.querySelectorAll('.nav-link').forEach((link) => {
    const linkSection = link.getAttribute('data-section');
    if (linkSection === section) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 섹션별 렌더링 함수 호출
  const renderers = {
    dashboard: renderDashboard,
    players:   renderPlayers,
    rooms:     renderRooms,
    monsters:  renderMonsters,
    objects:   renderObjects,
  };

  if (renderers[section]) {
    renderers[section]();
  }
}

/* ================================================================
 * 대시보드 & 월드 맵 렌더러
 * ================================================================ */

// 대시보드 자동 새로고침 타이머 상태
let _dashboardRefreshInterval = null;
let _dashboardCountdown = 60;

// 팩션별 인디케이터 색상 매핑
const FACTION_COLOURS = {
  ash_knights: '#4a9eff',
  goblins: '#ff4444',
  animals: '#ff9800',
  townspeople: '#9c27b0',
  undead: '#607d8b',
};

function getFactionColour(factionId) {
  return FACTION_COLOURS[factionId] || '#4a9eff';
}

/** 대시보드 자동 새로고침 타이머 정리 */
function clearDashboardTimer() {
  if (_dashboardRefreshInterval) {
    clearInterval(_dashboardRefreshInterval);
    _dashboardRefreshInterval = null;
  }
}

/** 대시보드 렌더링 */
async function renderDashboard() {
  // 이전 타이머 정리
  clearDashboardTimer();

  const container = document.getElementById('section-dashboard');
  container.innerHTML = '<p class="text-muted">Loading dashboard...</p>';

  try {
    const [mapData, statsData] = await Promise.all([
      api.get('/map'),
      api.get('/stats'),
    ]);

    const rooms = mapData.rooms || [];
    const stats = statsData || {};

    // 통계 카드 + 새로고침 타이머 + 맵 + 상세 패널
    let html = buildStatsCards(stats);
    html += buildRefreshTimer();
    html += buildMapGrid(rooms);
    html += buildRoomDetailsPanel();
    container.innerHTML = html;

    // 이벤트 바인딩
    bindMapEvents(rooms);
    startDashboardTimer();
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Failed to load dashboard: ' + escapeHtml(err.message) + '</p>';
  }
}

/** 통계 요약 카드 HTML */
function buildStatsCards(stats) {
  return '<div class="stats-grid">'
    + statCard('Players', stats.players)
    + statCard('Rooms', stats.rooms)
    + statCard('Monsters', stats.monsters)
    + statCard('Objects', stats.gameObjects)
    + '</div>';
}

function statCard(label, value) {
  return '<div class="stat-card">'
    + '<div class="stat-value">' + escapeHtml(value != null ? value : '-') + '</div>'
    + '<div class="stat-label">' + escapeHtml(label) + '</div>'
    + '</div>';
}

/** 새로고침 카운트다운 타이머 HTML */
function buildRefreshTimer() {
  return '<div class="refresh-timer mb-8">'
    + 'Auto refresh in <span id="dashboard-countdown">60</span>s'
    + '</div>';
}

/** 좌표 기반 그리드 맵 HTML 생성 */
function buildMapGrid(rooms) {
  if (!rooms.length) {
    return '<p class="text-muted">No rooms found.</p>';
  }

  // 좌표 범위 계산
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const roomMap = {};
  for (const room of rooms) {
    if (room.x < minX) minX = room.x;
    if (room.x > maxX) maxX = room.x;
    if (room.y < minY) minY = room.y;
    if (room.y > maxY) maxY = room.y;
    roomMap[room.x + ',' + room.y] = room;
  }

  let html = '<div class="map-container"><table>';

  // 행: maxY → minY (위에서 아래로)
  for (let y = maxY; y >= minY; y--) {
    html += '<tr>';
    // 열: minX → maxX (왼쪽에서 오른쪽으로)
    for (let x = minX; x <= maxX; x++) {
      const room = roomMap[x + ',' + y];
      if (room) {
        html += '<td class="room" data-x="' + x + '" data-y="' + y + '">';
        html += buildIndicators(room);
        html += '<div class="map-tooltip"></div>';
        html += '</td>';
      } else {
        html += '<td class="empty" data-x="' + x + '" data-y="' + y + '"></td>';
      }
    }
    html += '</tr>';
  }

  html += '</table></div>';
  return html;
}

/** 방 셀 내 인디케이터 HTML */
function buildIndicators(room) {
  const indicators = [];

  // 플레이어 인디케이터 (초록색)
  if (room.players && room.players.length > 0) {
    for (let i = 0; i < room.players.length; i++) {
      indicators.push('<div class="map-indicator map-indicator-player"></div>');
    }
  }

  // 몬스터 인디케이터 (팩션별 색상)
  if (room.creatures && room.creatures.length > 0) {
    for (const c of room.creatures) {
      const colour = getFactionColour(c.faction_id || c.faction);
      indicators.push('<div class="map-indicator" style="background-color:' + colour + ';"></div>');
    }
  }

  if (!indicators.length) return '';
  return '<div class="map-indicators">' + indicators.join('') + '</div>';
}

/** 방 상세 패널 HTML (빈 상태) — 모달로 대체되어 더 이상 사용하지 않음 */
function buildRoomDetailsPanel() {
  return '';
}

/** 출구 방향 계산 */
function computeExits(room, roomMap) {
  const dirs = [];
  const blocked = Array.isArray(room.blocked_exits) ? room.blocked_exits : [];
  const checks = [
    { dir: 'north', dx: 0, dy: 1, symbol: '↑' },
    { dir: 'south', dx: 0, dy: -1, symbol: '↓' },
    { dir: 'east', dx: 1, dy: 0, symbol: '→' },
    { dir: 'west', dx: -1, dy: 0, symbol: '←' },
  ];
  for (const c of checks) {
    const key = (room.x + c.dx) + ',' + (room.y + c.dy);
    if (roomMap[key] && !blocked.includes(c.dir)) {
      dirs.push(c.symbol);
    }
  }
  return dirs.join('');
}

/** 툴팁 텍스트 생성 */
function buildTooltipText(room, roomMap) {
  const exits = computeExits(room, roomMap);
  let text = exits + '(' + room.x + ',' + room.y + ')';

  // 몬스터/플레이어 요약
  if (room.players && room.players.length > 0) {
    text += ' 🟢Players:' + room.players.length;
  }
  if (room.creatures && room.creatures.length > 0) {
    // 팩션별 그룹핑
    const factions = {};
    for (const c of room.creatures) {
      const fid = c.faction_id || c.faction || 'unknown';
      factions[fid] = (factions[fid] || 0) + 1;
    }
    for (const [fid, count] of Object.entries(factions)) {
      text += ' 🔴' + fid + ':' + count;
    }
  }
  return text;
}

/** 방 상세 정보를 모달로 표시 */
function showRoomDetail(room) {
  // 모달이 열려있는 동안 자동 새로고침 일시 정지
  clearDashboardTimer();

  let html = '';

  // 한국어/영어 설명
  html += '<div class="description">';
  html += '<div>한국어: ' + escapeHtml(room.description_ko || '설명 없음') + '</div>';
  html += '<div style="margin-top:8px;">English: ' + escapeHtml(room.description_en || 'No description') + '</div>';
  html += '</div>';

  // 생명체 목록
  if (room.creatures && room.creatures.length > 0) {
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Creatures (' + room.creatures.length + ')</div>';
    html += '<div class="detail-item-list">';
    for (const c of room.creatures) {
      html += '• ' + escapeHtml(c.name_ko || '') + ' (' + escapeHtml(c.name_en || '') + ') HP:' + escapeHtml(c.hp) + ' [' + escapeHtml(c.faction_id || c.faction || '') + ']<br>';
    }
    html += '</div></div>';
  }

  // 플레이어 목록
  if (room.players && room.players.length > 0) {
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Players (' + room.players.length + ')</div>';
    html += '<div class="detail-item-list">';
    for (const p of room.players) {
      html += '• ' + escapeHtml(p.username) + (p.is_admin ? ' (admin)' : '') + '<br>';
    }
    html += '</div></div>';
  }

  // 아이템 목록
  if (room.items && room.items.length > 0) {
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Items (' + room.items.length + ')</div>';
    html += '<div class="detail-item-list">';
    for (const i of room.items) {
      html += '• ' + escapeHtml(i.name_ko || '') + ' (' + escapeHtml(i.name_en || '') + ') [' + escapeHtml(i.category || '') + ']<br>';
    }
    html += '</div></div>';
  }

  // Enter 연결 정보
  if (room.enter_connections && room.enter_connections.length > 0) {
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title">Enter Connections</div>';
    html += '<div class="detail-item-list">';
    for (const c of room.enter_connections) {
      html += '• → (' + c.to_x + ', ' + c.to_y + ')<br>';
    }
    html += '</div></div>';
  }

  var footerHtml = '<button class="btn btn-primary" id="map-edit-room-btn" data-id="' + escapeHtml(room.id) + '">Edit Room</button>'
    + ' <button class="btn btn-secondary" id="map-room-close-btn">Close</button>';

  modal.open('Room (' + room.x + ', ' + room.y + ')', html, footerHtml);

  document.getElementById('map-room-close-btn').addEventListener('click', function () {
    modal.close();
    // 모달 닫힌 후 자동 새로고침 재시작
    startDashboardTimer();
  });

  document.getElementById('map-edit-room-btn').addEventListener('click', function () {
    var roomId = this.getAttribute('data-id');
    modal.close();
    // Rooms 섹션으로 이동 후 해당 룸 수정 모달 표시
    window.location.hash = '#rooms';
    // 약간의 딜레이 후 수정 모달 표시 (섹션 렌더링 완료 대기)
    setTimeout(function () {
      showEditRoomModal(roomId);
    }, 300);
  });
}

/** 맵 이벤트 바인딩 (툴팁, 클릭, 상세 패널 닫기) */
function bindMapEvents(rooms) {
  // roomMap 구축
  const roomMap = {};
  for (const room of rooms) {
    roomMap[room.x + ',' + room.y] = room;
  }

  // 방 셀 이벤트
  document.querySelectorAll('.map-container td.room').forEach(function (td) {
    const x = parseInt(td.getAttribute('data-x'), 10);
    const y = parseInt(td.getAttribute('data-y'), 10);
    const room = roomMap[x + ',' + y];
    if (!room) return;

    const tooltip = td.querySelector('.map-tooltip');
    if (tooltip) {
      const tooltipText = buildTooltipText(room, roomMap);
      tooltip.textContent = tooltipText;

      td.addEventListener('mouseenter', function (e) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
      });
      td.addEventListener('mousemove', function (e) {
        tooltip.style.left = (e.clientX + 15) + 'px';
        tooltip.style.top = (e.clientY - 10) + 'px';
      });
      td.addEventListener('mouseleave', function () {
        tooltip.style.display = 'none';
      });
    }

    td.addEventListener('click', function () {
      showRoomDetail(room);
    });
  });

  // 빈 셀 클릭 → 방 생성 확인
  document.querySelectorAll('.map-container td.empty').forEach(function (td) {
    const x = parseInt(td.getAttribute('data-x'), 10);
    const y = parseInt(td.getAttribute('data-y'), 10);
    if (isNaN(x) || isNaN(y)) return;

    td.addEventListener('click', function () {
      clearDashboardTimer();
      confirm.open('Create a new room at (' + x + ', ' + y + ')?', function () {
        // Rooms 섹션으로 이동 후 생성 모달 표시 (좌표 자동 채움)
        window.location.hash = '#rooms';
        setTimeout(function () {
          showCreateRoomModalWithCoords(x, y);
        }, 300);
      }, { title: 'Create Room', okText: 'Create', okClass: 'btn btn-primary' });
      // confirm 닫힐 때 타이머 재시작을 위해 cancel 이벤트 오버라이드
      var origCancel = document.getElementById('confirm-cancel');
      var origClose = document.getElementById('confirm-close');
      var restartTimer = function () { startDashboardTimer(); };
      origCancel.addEventListener('click', restartTimer, { once: true });
      origClose.addEventListener('click', restartTimer, { once: true });
    });
  });
}

/** 60초 자동 새로고침 타이머 시작 */
function startDashboardTimer() {
  _dashboardCountdown = 60;
  const el = document.getElementById('dashboard-countdown');
  if (el) el.textContent = _dashboardCountdown;

  _dashboardRefreshInterval = setInterval(function () {
    _dashboardCountdown--;
    const el = document.getElementById('dashboard-countdown');
    if (el) el.textContent = _dashboardCountdown;

    if (_dashboardCountdown <= 0) {
      clearDashboardTimer();
      // 모달이 열려있으면 새로고침 건너뛰고 타이머만 리셋
      var modalOpen = !document.getElementById('modal-overlay').hidden;
      var confirmOpen = !document.getElementById('confirm-overlay').hidden;
      if (modalOpen || confirmOpen) {
        _dashboardCountdown = 60;
        var el2 = document.getElementById('dashboard-countdown');
        if (el2) el2.textContent = _dashboardCountdown;
        startDashboardTimer();
        return;
      }
      // 현재 섹션이 대시보드인 경우에만 새로고침
      if (getCurrentSection() === 'dashboard') {
        renderDashboard();
      }
    }
  }, 1000);
}

/* ================================================================
 * 플레이어 관리 UI
 * ================================================================ */

// 플레이어 페이지네이션 상태
let _playersPage = 1;
const _playersLimit = 20;

/** 플레이어 섹션 렌더링 */
async function renderPlayers() {
  const container = document.getElementById('section-players');
  container.innerHTML = '<p class="text-muted">Loading players...</p>';

  try {
    const result = await api.get('/players?page=' + _playersPage + '&limit=' + _playersLimit);
    const players = result.data || [];
    const pagination = result.pagination || {};

    let html = '<div class="section-header">'
      + '<h2>Players</h2>'
      + '<button class="btn btn-primary" id="btn-create-player">Create Player</button>'
      + '</div>';

    // 플레이어 목록 테이블
    html += '<div class="table-container"><table class="data-table">';
    html += '<thead><tr>'
      + '<th>Username</th>'
      + '<th>Display Name</th>'
      + '<th>Admin</th>'
      + '<th>Faction</th>'
      + '<th>Last Login</th>'
      + '<th>Position (x,y)</th>'
      + '<th>Actions</th>'
      + '</tr></thead>';
    html += '<tbody>';

    if (players.length === 0) {
      html += '<tr><td colspan="7" class="text-muted text-center">No players found.</td></tr>';
    } else {
      for (const p of players) {
        html += '<tr>'
          + '<td>' + escapeHtml(p.username) + '</td>'
          + '<td>' + escapeHtml(p.display_name || '-') + '</td>'
          + '<td>' + (p.is_admin ? 'Yes' : 'No') + '</td>'
          + '<td>' + escapeHtml(p.faction_id || '-') + '</td>'
          + '<td>' + escapeHtml(p.last_login || '-') + '</td>'
          + '<td>' + escapeHtml(p.last_room_x) + ', ' + escapeHtml(p.last_room_y) + '</td>'
          + '<td class="actions-cell">'
          + '<button class="btn btn-sm btn-secondary btn-edit-player" data-id="' + escapeHtml(p.id) + '">Edit</button> '
          + '<button class="btn btn-sm btn-danger btn-delete-player" data-id="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(p.username) + '">Delete</button> '
          + '<button class="btn btn-sm btn-secondary btn-inventory-player" data-id="' + escapeHtml(p.id) + '" data-name="' + escapeHtml(p.username) + '">Inventory</button>'
          + '</td>'
          + '</tr>';
      }
    }

    html += '</tbody></table></div>';

    // 페이지네이션 컨트롤
    html += buildPlayersPagination(pagination);

    container.innerHTML = html;
    bindPlayersEvents();
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Failed to load players: ' + escapeHtml(err.message) + '</p>';
  }
}

/** 플레이어 페이지네이션 HTML */
function buildPlayersPagination(pagination) {
  const page = pagination.page || 1;
  const totalPages = pagination.totalPages || 1;

  let html = '<div class="pagination">';
  html += '<button class="btn btn-sm btn-secondary" id="players-prev"'
    + (page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
  html += '<span class="pagination-info">Page ' + page + ' / ' + totalPages + '</span>';
  html += '<button class="btn btn-sm btn-secondary" id="players-next"'
    + (page >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
  html += '</div>';
  return html;
}

/** 플레이어 섹션 이벤트 바인딩 */
function bindPlayersEvents() {
  // Create Player 버튼
  const createBtn = document.getElementById('btn-create-player');
  if (createBtn) {
    createBtn.addEventListener('click', showCreatePlayerModal);
  }

  // Edit 버튼들
  document.querySelectorAll('.btn-edit-player').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showEditPlayerModal(btn.getAttribute('data-id'));
    });
  });

  // Delete 버튼들
  document.querySelectorAll('.btn-delete-player').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      confirm.open('Are you sure you want to delete player "' + name + '"?', async function () {
        try {
          await api.del('/players/' + id);
          notify.success('Player deleted successfully.');
          renderPlayers();
        } catch (err) {
          notify.error('Failed to delete player: ' + err.message);
        }
      });
    });
  });

  // Inventory 버튼들
  document.querySelectorAll('.btn-inventory-player').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showPlayerInventoryModal(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
    });
  });

  // 페이지네이션 버튼
  const prevBtn = document.getElementById('players-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (_playersPage > 1) {
        _playersPage--;
        renderPlayers();
      }
    });
  }

  const nextBtn = document.getElementById('players-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      _playersPage++;
      renderPlayers();
    });
  }
}

/** 플레이어 생성 모달 표시 */
function showCreatePlayerModal() {
  const bodyHtml = '<form id="player-create-form">'
    + '<div class="form-group"><label for="pf-username">Username *</label>'
    + '<input type="text" id="pf-username" required></div>'
    + '<div class="form-group"><label for="pf-password">Password *</label>'
    + '<input type="password" id="pf-password" required></div>'
    + '<div class="form-group"><label for="pf-email">Email</label>'
    + '<input type="email" id="pf-email"></div>'
    + '<div class="form-group"><label for="pf-display-name">Display Name</label>'
    + '<input type="text" id="pf-display-name"></div>'
    + '<div class="form-group"><label for="pf-locale">Preferred Locale</label>'
    + '<select id="pf-locale"><option value="en">en</option><option value="ko">ko</option></select></div>'
    + '<div class="form-group"><label for="pf-faction">Faction ID</label>'
    + '<input type="text" id="pf-faction" value="ash_knights"></div>'
    + '<div class="form-group"><label><input type="checkbox" id="pf-admin"> Is Admin</label></div>'
    + '</form>';

  const footerHtml = '<button class="btn btn-secondary" id="player-create-cancel">Cancel</button>'
    + ' <button class="btn btn-primary" id="player-create-submit">Create</button>';

  modal.open('Create Player', bodyHtml, footerHtml);

  document.getElementById('player-create-cancel').addEventListener('click', modal.close);
  document.getElementById('player-create-submit').addEventListener('click', handleCreatePlayer);
}

/** 플레이어 생성 처리 */
async function handleCreatePlayer() {
  const username = document.getElementById('pf-username').value.trim();
  const password = document.getElementById('pf-password').value;
  const email = document.getElementById('pf-email').value.trim();
  const displayName = document.getElementById('pf-display-name').value.trim();
  const locale = document.getElementById('pf-locale').value;
  const factionId = document.getElementById('pf-faction').value.trim();
  const isAdmin = document.getElementById('pf-admin').checked;

  if (!username || !password) {
    notify.error('Username and password are required.');
    return;
  }

  const body = { username: username, password: password };
  if (email) body.email = email;
  if (displayName) body.display_name = displayName;
  if (locale) body.preferred_locale = locale;
  if (factionId) body.faction_id = factionId;
  body.is_admin = isAdmin;

  try {
    await api.post('/players', body);
    modal.close();
    notify.success('Player created successfully.');
    renderPlayers();
  } catch (err) {
    notify.error('Failed to create player: ' + err.message);
  }
}

/** 플레이어 수정 모달 표시 */
async function showEditPlayerModal(playerId) {
  try {
    const player = await api.get('/players/' + playerId);
    const p = player.data || player;

    const bodyHtml = '<form id="player-edit-form">'
      + '<div class="form-group"><label for="pe-username">Username</label>'
      + '<input type="text" id="pe-username" value="' + escapeHtml(p.username || '') + '"></div>'
      + '<div class="form-group"><label for="pe-email">Email</label>'
      + '<input type="email" id="pe-email" value="' + escapeHtml(p.email || '') + '"></div>'
      + '<div class="form-group"><label for="pe-display-name">Display Name</label>'
      + '<input type="text" id="pe-display-name" value="' + escapeHtml(p.display_name || '') + '"></div>'
      + '<div class="form-group"><label for="pe-locale">Preferred Locale</label>'
      + '<select id="pe-locale">'
      + '<option value="en"' + (p.preferred_locale === 'en' ? ' selected' : '') + '>en</option>'
      + '<option value="ko"' + (p.preferred_locale === 'ko' ? ' selected' : '') + '>ko</option>'
      + '</select></div>'
      + '<div class="form-group"><label for="pe-faction">Faction ID</label>'
      + '<input type="text" id="pe-faction" value="' + escapeHtml(p.faction_id || '') + '"></div>'
      + '<div class="form-group"><label><input type="checkbox" id="pe-admin"'
      + (p.is_admin ? ' checked' : '') + '> Is Admin</label></div>'
      + '<div class="form-group"><label for="pe-room-x">Last Room X</label>'
      + '<input type="number" id="pe-room-x" value="' + escapeHtml(p.last_room_x != null ? p.last_room_x : 0) + '"></div>'
      + '<div class="form-group"><label for="pe-room-y">Last Room Y</label>'
      + '<input type="number" id="pe-room-y" value="' + escapeHtml(p.last_room_y != null ? p.last_room_y : 0) + '"></div>'
      + '</form>';

    const footerHtml = '<button class="btn btn-secondary" id="player-edit-cancel">Cancel</button>'
      + ' <button class="btn btn-primary" id="player-edit-submit">Save</button>';

    modal.open('Edit Player: ' + (p.username || ''), bodyHtml, footerHtml);

    document.getElementById('player-edit-cancel').addEventListener('click', modal.close);
    document.getElementById('player-edit-submit').addEventListener('click', function () {
      handleEditPlayer(playerId);
    });
  } catch (err) {
    notify.error('Failed to load player: ' + err.message);
  }
}

/** 플레이어 수정 처리 */
async function handleEditPlayer(playerId) {
  const body = {
    username: document.getElementById('pe-username').value.trim(),
    email: document.getElementById('pe-email').value.trim() || null,
    display_name: document.getElementById('pe-display-name').value.trim() || null,
    preferred_locale: document.getElementById('pe-locale').value,
    faction_id: document.getElementById('pe-faction').value.trim() || null,
    is_admin: document.getElementById('pe-admin').checked,
    last_room_x: parseInt(document.getElementById('pe-room-x').value, 10) || 0,
    last_room_y: parseInt(document.getElementById('pe-room-y').value, 10) || 0,
  };

  try {
    await api.put('/players/' + playerId, body);
    modal.close();
    notify.success('Player updated successfully.');
    renderPlayers();
  } catch (err) {
    notify.error('Failed to update player: ' + err.message);
  }
}

/** 플레이어 인벤토리 모달 표시 */
async function showPlayerInventoryModal(playerId, playerName) {
  try {
    const result = await api.get('/players/' + playerId + '/inventory');
    const items = result.data || result || [];

    let bodyHtml = '';
    if (!Array.isArray(items) || items.length === 0) {
      bodyHtml = '<p class="text-muted">No items in inventory.</p>';
    } else {
      bodyHtml = '<table class="data-table">';
      bodyHtml += '<thead><tr>'
        + '<th>Name (EN)</th>'
        + '<th>Name (KO)</th>'
        + '<th>Category</th>'
        + '<th>Location</th>'
        + '<th>Equipped</th>'
        + '</tr></thead>';
      bodyHtml += '<tbody>';
      for (const item of items) {
        bodyHtml += '<tr>'
          + '<td>' + escapeHtml(item.name_en || '') + '</td>'
          + '<td>' + escapeHtml(item.name_ko || '') + '</td>'
          + '<td>' + escapeHtml(item.category || '') + '</td>'
          + '<td>' + escapeHtml(item.location_type || '') + '</td>'
          + '<td>' + (item.is_equipped ? 'Yes' : 'No') + '</td>'
          + '</tr>';
      }
      bodyHtml += '</tbody></table>';
    }

    const footerHtml = '<button class="btn btn-secondary" id="inventory-close">Close</button>';
    modal.open('Inventory: ' + (playerName || playerId), bodyHtml, footerHtml);

    document.getElementById('inventory-close').addEventListener('click', modal.close);
  } catch (err) {
    notify.error('Failed to load inventory: ' + err.message);
  }
}

/* ================================================================
 * 방 관리 UI
 * ================================================================ */

// 방 페이지네이션 상태
let _roomsPage = 1;
const _roomsLimit = 20;

// 전체 방 좌표 Set (출구 화살표 계산용)
let _roomsCoordsSet = new Set();

/** 방의 출구 화살표 계산 (인접 방이 존재하고 blocked_exits에 없는 방향) */
function computeRoomExits(x, y, blockedExits) {
  const dirs = [];
  const checks = [
    { dir: 'north', dx: 0, dy: 1, symbol: '↑' },
    { dir: 'south', dx: 0, dy: -1, symbol: '↓' },
    { dir: 'east', dx: 1, dy: 0, symbol: '→' },
    { dir: 'west', dx: -1, dy: 0, symbol: '←' },
  ];
  for (const c of checks) {
    const key = (x + c.dx) + ',' + (y + c.dy);
    if (_roomsCoordsSet.has(key) && !blockedExits.includes(c.dir)) {
      dirs.push(c.symbol);
    }
  }
  return dirs.join('') || '-';
}

/** 방 섹션 렌더링 */
async function renderRooms() {
  const container = document.getElementById('section-rooms');
  container.innerHTML = '<p class="text-muted">Loading rooms...</p>';

  try {
    // 페이지네이션된 방 목록 + 출구 계산용 전체 방 좌표 맵 로드
    const [result, mapData] = await Promise.all([
      api.get('/rooms?page=' + _roomsPage + '&limit=' + _roomsLimit),
      api.get('/map'),
    ]);
    const rooms = result.data || [];
    const pagination = result.pagination || {};

    // 전체 방 좌표 Set 구축 (출구 화살표 계산용)
    _roomsCoordsSet = new Set();
    if (mapData.rooms) {
      for (const mr of mapData.rooms) {
        _roomsCoordsSet.add(mr.x + ',' + mr.y);
      }
    }

    let html = '<div class="section-header">'
      + '<h2>Rooms</h2>'
      + '<button class="btn btn-primary" id="btn-create-room">Create Room</button>'
      + '</div>';

    // 방 목록 테이블
    html += '<div class="table-container"><table class="data-table">';
    html += '<thead><tr>'
      + '<th>Coords</th>'
      + '<th>Exits</th>'
      + '<th>Description (EN)</th>'
      + '<th>Description (KO)</th>'
      + '<th>Actions</th>'
      + '</tr></thead>';
    html += '<tbody>';

    if (rooms.length === 0) {
      html += '<tr><td colspan="5" class="text-muted text-center">No rooms found.</td></tr>';
    } else {
      // 출구 화살표 계산을 위해 전체 방 좌표 맵 구축
      // _roomsCoordsMap은 renderRooms 시작 시 맵 API에서 로드
      for (const r of rooms) {
        const blocked = Array.isArray(r.blocked_exits) ? r.blocked_exits : [];
        const exits = computeRoomExits(r.x, r.y, blocked);
        html += '<tr>'
          + '<td>' + escapeHtml(r.x) + ', ' + escapeHtml(r.y) + '</td>'
          + '<td>' + escapeHtml(exits) + '</td>'
          + '<td>' + escapeHtml(r.description_en || '-') + '</td>'
          + '<td>' + escapeHtml(r.description_ko || '-') + '</td>'
          + '<td class="actions-cell">'
          + '<button class="btn btn-sm btn-secondary btn-edit-room" data-id="' + escapeHtml(r.id) + '">Edit</button> '
          + '<button class="btn btn-sm btn-danger btn-delete-room" data-id="' + escapeHtml(r.id) + '" data-coords="(' + escapeHtml(r.x) + ',' + escapeHtml(r.y) + ')">Delete</button> '
          + '<button class="btn btn-sm btn-secondary btn-connections-room" data-id="' + escapeHtml(r.id) + '" data-x="' + escapeHtml(r.x) + '" data-y="' + escapeHtml(r.y) + '">Connections</button>'
          + '</td>'
          + '</tr>';
      }
    }

    html += '</tbody></table></div>';

    // 페이지네이션 컨트롤
    html += buildRoomsPagination(pagination);

    container.innerHTML = html;
    bindRoomsEvents();
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Failed to load rooms: ' + escapeHtml(err.message) + '</p>';
  }
}

/** 방 페이지네이션 HTML */
function buildRoomsPagination(pagination) {
  const page = pagination.page || 1;
  const totalPages = pagination.totalPages || 1;

  let html = '<div class="pagination">';
  html += '<button class="btn btn-sm btn-secondary" id="rooms-prev"'
    + (page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
  html += '<span class="pagination-info">Page ' + page + ' / ' + totalPages + '</span>';
  html += '<button class="btn btn-sm btn-secondary" id="rooms-next"'
    + (page >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
  html += '</div>';
  return html;
}

/** 방 섹션 이벤트 바인딩 */
function bindRoomsEvents() {
  // Create Room 버튼
  const createBtn = document.getElementById('btn-create-room');
  if (createBtn) {
    createBtn.addEventListener('click', showCreateRoomModal);
  }

  // Edit 버튼들
  document.querySelectorAll('.btn-edit-room').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showEditRoomModal(btn.getAttribute('data-id'));
    });
  });

  // Delete 버튼들
  document.querySelectorAll('.btn-delete-room').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-id');
      const coords = btn.getAttribute('data-coords');
      confirm.open('Are you sure you want to delete room ' + coords + '?', async function () {
        try {
          await api.del('/rooms/' + id);
          notify.success('Room deleted successfully.');
          renderRooms();
        } catch (err) {
          notify.error('Failed to delete room: ' + err.message);
        }
      });
    });
  });

  // Connections 버튼들
  document.querySelectorAll('.btn-connections-room').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showRoomConnectionsModal(
        btn.getAttribute('data-id'),
        parseInt(btn.getAttribute('data-x'), 10),
        parseInt(btn.getAttribute('data-y'), 10)
      );
    });
  });

  // 페이지네이션 버튼
  const prevBtn = document.getElementById('rooms-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (_roomsPage > 1) {
        _roomsPage--;
        renderRooms();
      }
    });
  }

  const nextBtn = document.getElementById('rooms-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      _roomsPage++;
      renderRooms();
    });
  }
}

/** 좌표가 미리 채워진 방 생성 모달 표시 (대시보드 맵에서 빈 셀 클릭 시) */
function showCreateRoomModalWithCoords(x, y) {
  showCreateRoomModal();
  // 모달이 열린 후 좌표 자동 채움
  var xInput = document.getElementById('rf-x');
  var yInput = document.getElementById('rf-y');
  if (xInput) xInput.value = x;
  if (yInput) yInput.value = y;
}

/** 방 생성 모달 표시 */
function showCreateRoomModal() {
  const bodyHtml = '<form id="room-create-form">'
    + '<div class="form-group"><label for="rf-x">X *</label>'
    + '<input type="number" id="rf-x" required></div>'
    + '<div class="form-group"><label for="rf-y">Y *</label>'
    + '<input type="number" id="rf-y" required></div>'
    + '<div class="form-group"><label for="rf-desc-en">Description (EN)</label>'
    + '<textarea id="rf-desc-en" rows="3"></textarea></div>'
    + '<div class="form-group"><label for="rf-desc-ko">Description (KO)</label>'
    + '<textarea id="rf-desc-ko" rows="3"></textarea></div>'
    + '<div class="form-group"><label for="rf-blocked">Blocked Exits (comma separated)</label>'
    + '<input type="text" id="rf-blocked" placeholder="e.g. north, south"></div>'
    + '</form>';

  const footerHtml = '<button class="btn btn-secondary" id="room-create-cancel">Cancel</button>'
    + ' <button class="btn btn-primary" id="room-create-submit">Create</button>';

  modal.open('Create Room', bodyHtml, footerHtml);

  document.getElementById('room-create-cancel').addEventListener('click', modal.close);
  document.getElementById('room-create-submit').addEventListener('click', handleCreateRoom);
}

/** 방 생성 처리 */
async function handleCreateRoom() {
  const xVal = document.getElementById('rf-x').value.trim();
  const yVal = document.getElementById('rf-y').value.trim();

  if (xVal === '' || yVal === '') {
    notify.error('X and Y coordinates are required.');
    return;
  }

  const body = {
    x: parseInt(xVal, 10),
    y: parseInt(yVal, 10),
  };

  if (isNaN(body.x) || isNaN(body.y)) {
    notify.error('X and Y must be valid numbers.');
    return;
  }

  const descEn = document.getElementById('rf-desc-en').value.trim();
  const descKo = document.getElementById('rf-desc-ko').value.trim();
  const blockedStr = document.getElementById('rf-blocked').value.trim();

  if (descEn) body.description_en = descEn;
  if (descKo) body.description_ko = descKo;
  if (blockedStr) {
    body.blocked_exits = blockedStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  try {
    await api.post('/rooms', body);
    modal.close();
    notify.success('Room created successfully.');
    renderRooms();
  } catch (err) {
    notify.error('Failed to create room: ' + err.message);
  }
}

/** 방 수정 모달 표시 */
async function showEditRoomModal(roomId) {
  try {
    const room = await api.get('/rooms/' + roomId);
    const r = room.data || room;

    const blockedStr = Array.isArray(r.blocked_exits) ? r.blocked_exits.join(', ') : '';

    const bodyHtml = '<form id="room-edit-form">'
      + '<div class="form-group"><label for="re-x">X</label>'
      + '<input type="number" id="re-x" value="' + escapeHtml(r.x != null ? r.x : '') + '"></div>'
      + '<div class="form-group"><label for="re-y">Y</label>'
      + '<input type="number" id="re-y" value="' + escapeHtml(r.y != null ? r.y : '') + '"></div>'
      + '<div class="form-group"><label for="re-desc-en">Description (EN)</label>'
      + '<textarea id="re-desc-en" rows="3">' + escapeHtml(r.description_en || '') + '</textarea></div>'
      + '<div class="form-group"><label for="re-desc-ko">Description (KO)</label>'
      + '<textarea id="re-desc-ko" rows="3">' + escapeHtml(r.description_ko || '') + '</textarea></div>'
      + '<div class="form-group"><label for="re-blocked">Blocked Exits (comma separated)</label>'
      + '<input type="text" id="re-blocked" value="' + escapeHtml(blockedStr) + '"></div>'
      + '</form>';

    const footerHtml = '<button class="btn btn-secondary" id="room-edit-cancel">Cancel</button>'
      + ' <button class="btn btn-primary" id="room-edit-submit">Save</button>';

    modal.open('Edit Room (' + r.x + ', ' + r.y + ')', bodyHtml, footerHtml);

    document.getElementById('room-edit-cancel').addEventListener('click', modal.close);
    document.getElementById('room-edit-submit').addEventListener('click', function () {
      handleEditRoom(roomId);
    });
  } catch (err) {
    notify.error('Failed to load room: ' + err.message);
  }
}

/** 방 수정 처리 */
async function handleEditRoom(roomId) {
  const xVal = document.getElementById('re-x').value.trim();
  const yVal = document.getElementById('re-y').value.trim();

  const body = {};

  if (xVal !== '') body.x = parseInt(xVal, 10);
  if (yVal !== '') body.y = parseInt(yVal, 10);

  body.description_en = document.getElementById('re-desc-en').value.trim() || null;
  body.description_ko = document.getElementById('re-desc-ko').value.trim() || null;

  const blockedStr = document.getElementById('re-blocked').value.trim();
  body.blocked_exits = blockedStr
    ? blockedStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    : [];

  try {
    await api.put('/rooms/' + roomId, body);
    modal.close();
    notify.success('Room updated successfully.');
    renderRooms();
  } catch (err) {
    notify.error('Failed to update room: ' + err.message);
  }
}

/** 방 연결 모달 표시 */
async function showRoomConnectionsModal(roomId, fromX, fromY) {
  try {
    const connections = await api.get('/rooms/' + roomId + '/connections');
    const conns = Array.isArray(connections) ? connections : (connections.data || []);

    let bodyHtml = '<h4 style="margin-bottom:8px;">Connections from (' + fromX + ', ' + fromY + ')</h4>';

    // 연결 목록 테이블
    if (conns.length === 0) {
      bodyHtml += '<p class="text-muted">No connections found.</p>';
    } else {
      bodyHtml += '<table class="data-table">';
      bodyHtml += '<thead><tr>'
        + '<th>ID</th>'
        + '<th>To X</th>'
        + '<th>To Y</th>'
        + '<th>Actions</th>'
        + '</tr></thead>';
      bodyHtml += '<tbody>';
      for (const c of conns) {
        const shortId = c.id ? c.id.substring(0, 8) : '-';
        bodyHtml += '<tr>'
          + '<td title="' + escapeHtml(c.id) + '">' + escapeHtml(shortId) + '</td>'
          + '<td>' + escapeHtml(c.to_x) + '</td>'
          + '<td>' + escapeHtml(c.to_y) + '</td>'
          + '<td>'
          + '<button class="btn btn-sm btn-danger btn-delete-conn" data-id="' + escapeHtml(c.id) + '">Delete</button>'
          + '</td>'
          + '</tr>';
      }
      bodyHtml += '</tbody></table>';
    }

    // 새 연결 생성 폼
    bodyHtml += '<hr style="margin:12px 0;">';
    bodyHtml += '<h4 style="margin-bottom:8px;">Add Connection</h4>';
    bodyHtml += '<form id="conn-create-form" style="display:flex;gap:8px;align-items:flex-end;">'
      + '<div class="form-group" style="margin-bottom:0;"><label for="cf-to-x">To X</label>'
      + '<input type="number" id="cf-to-x" style="width:80px;"></div>'
      + '<div class="form-group" style="margin-bottom:0;"><label for="cf-to-y">To Y</label>'
      + '<input type="number" id="cf-to-y" style="width:80px;"></div>'
      + '<button type="button" class="btn btn-primary btn-sm" id="conn-create-submit">Add</button>'
      + '</form>';

    const footerHtml = '<button class="btn btn-secondary" id="conn-modal-close">Close</button>';

    modal.open('Room Connections', bodyHtml, footerHtml);

    document.getElementById('conn-modal-close').addEventListener('click', modal.close);

    // 연결 삭제 버튼 이벤트
    document.querySelectorAll('.btn-delete-conn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const connId = btn.getAttribute('data-id');
        try {
          await api.del('/room-connections/' + connId);
          notify.success('Connection deleted.');
          // 모달 새로고침
          showRoomConnectionsModal(roomId, fromX, fromY);
        } catch (err) {
          notify.error('Failed to delete connection: ' + err.message);
        }
      });
    });

    // 연결 생성 버튼 이벤트
    document.getElementById('conn-create-submit').addEventListener('click', async function () {
      const toXVal = document.getElementById('cf-to-x').value.trim();
      const toYVal = document.getElementById('cf-to-y').value.trim();

      if (toXVal === '' || toYVal === '') {
        notify.error('To X and To Y are required.');
        return;
      }

      const toX = parseInt(toXVal, 10);
      const toY = parseInt(toYVal, 10);

      if (isNaN(toX) || isNaN(toY)) {
        notify.error('To X and To Y must be valid numbers.');
        return;
      }

      try {
        await api.post('/room-connections', {
          from_x: fromX,
          from_y: fromY,
          to_x: toX,
          to_y: toY,
        });
        notify.success('Connection created.');
        // 모달 새로고침
        showRoomConnectionsModal(roomId, fromX, fromY);
      } catch (err) {
        notify.error('Failed to create connection: ' + err.message);
      }
    });
  } catch (err) {
    notify.error('Failed to load connections: ' + err.message);
  }
}

/* ================================================================
 * 몬스터 관리 UI
 * ================================================================ */

// 몬스터 페이지네이션 상태
let _monstersPage = 1;
const _monstersLimit = 20;

/** 몬스터 섹션 렌더링 */
async function renderMonsters() {
  const container = document.getElementById('section-monsters');
  container.innerHTML = '<p class="text-muted">Loading monsters...</p>';

  try {
    const result = await api.get('/monsters?page=' + _monstersPage + '&limit=' + _monstersLimit);
    const monsters = result.data || [];
    const pagination = result.pagination || {};

    let html = '<div class="section-header">'
      + '<h2>Monsters</h2>'
      + '<button class="btn btn-primary" id="btn-create-monster">Create Monster</button>'
      + '</div>';

    // 몬스터 목록 테이블
    html += '<div class="table-container"><table class="data-table">';
    html += '<thead><tr>'
      + '<th>Name (EN)</th>'
      + '<th>Name (KO)</th>'
      + '<th>Type</th>'
      + '<th>Behaviour</th>'
      + '<th>Position (x,y)</th>'
      + '<th>Alive</th>'
      + '<th>Faction</th>'
      + '<th>Actions</th>'
      + '</tr></thead>';
    html += '<tbody>';

    if (monsters.length === 0) {
      html += '<tr><td colspan="8" class="text-muted text-center">No monsters found.</td></tr>';
    } else {
      for (const m of monsters) {
        const pos = (m.x != null && m.y != null) ? (m.x + ', ' + m.y) : '-';
        html += '<tr>'
          + '<td>' + escapeHtml(m.name_en || '') + '</td>'
          + '<td>' + escapeHtml(m.name_ko || '') + '</td>'
          + '<td>' + escapeHtml(m.monster_type || '-') + '</td>'
          + '<td>' + escapeHtml(m.behavior || '-') + '</td>'
          + '<td>' + escapeHtml(pos) + '</td>'
          + '<td>' + (m.is_alive ? 'Yes' : 'No') + '</td>'
          + '<td>' + escapeHtml(m.faction_id || '-') + '</td>'
          + '<td class="actions-cell">'
          + '<button class="btn btn-sm btn-secondary btn-edit-monster" data-id="' + escapeHtml(m.id) + '">Edit</button> '
          + '<button class="btn btn-sm btn-danger btn-delete-monster" data-id="' + escapeHtml(m.id) + '" data-name="' + escapeHtml(m.name_en || '') + '">Delete</button>'
          + '</td>'
          + '</tr>';
      }
    }

    html += '</tbody></table></div>';

    // 페이지네이션 컨트롤
    html += buildMonstersPagination(pagination);

    container.innerHTML = html;
    bindMonstersEvents();
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Failed to load monsters: ' + escapeHtml(err.message) + '</p>';
  }
}

/** 몬스터 페이지네이션 HTML */
function buildMonstersPagination(pagination) {
  const page = pagination.page || 1;
  const totalPages = pagination.totalPages || 1;

  let html = '<div class="pagination">';
  html += '<button class="btn btn-sm btn-secondary" id="monsters-prev"'
    + (page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
  html += '<span class="pagination-info">Page ' + page + ' / ' + totalPages + '</span>';
  html += '<button class="btn btn-sm btn-secondary" id="monsters-next"'
    + (page >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
  html += '</div>';
  return html;
}

/** 몬스터 섹션 이벤트 바인딩 */
function bindMonstersEvents() {
  var createBtn = document.getElementById('btn-create-monster');
  if (createBtn) {
    createBtn.addEventListener('click', showCreateMonsterModal);
  }

  document.querySelectorAll('.btn-edit-monster').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showEditMonsterModal(btn.getAttribute('data-id'));
    });
  });

  document.querySelectorAll('.btn-delete-monster').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id');
      var name = btn.getAttribute('data-name');
      confirm.open('Are you sure you want to delete monster "' + name + '"?', async function () {
        try {
          await api.del('/monsters/' + id);
          notify.success('Monster deleted successfully.');
          renderMonsters();
        } catch (err) {
          notify.error('Failed to delete monster: ' + err.message);
        }
      });
    });
  });

  var prevBtn = document.getElementById('monsters-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (_monstersPage > 1) {
        _monstersPage--;
        renderMonsters();
      }
    });
  }

  var nextBtn = document.getElementById('monsters-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      _monstersPage++;
      renderMonsters();
    });
  }
}

/** 몬스터 생성 모달 폼 HTML */
function buildMonsterFormHtml(m) {
  var isEdit = !!m;
  var p = m || {};

  var statsStr = '';
  try { statsStr = p.stats ? JSON.stringify(p.stats, null, 2) : ''; } catch (_) { statsStr = ''; }
  var dropStr = '';
  try { dropStr = p.drop_items ? JSON.stringify(p.drop_items, null, 2) : ''; } catch (_) { dropStr = ''; }
  var propsStr = '';
  try { propsStr = p.properties ? JSON.stringify(p.properties, null, 2) : ''; } catch (_) { propsStr = ''; }

  var monsterTypes = ['passive', 'aggressive', 'neutral'];
  var behaviours = ['stationary', 'roaming', 'territorial'];

  var html = '<form id="monster-form">'
    + '<div class="form-group"><label for="mf-name-en">Name (EN) *</label>'
    + '<input type="text" id="mf-name-en" value="' + escapeHtml(p.name_en || '') + '" required></div>'
    + '<div class="form-group"><label for="mf-name-ko">Name (KO) *</label>'
    + '<input type="text" id="mf-name-ko" value="' + escapeHtml(p.name_ko || '') + '" required></div>'
    + '<div class="form-group"><label for="mf-desc-en">Description (EN)</label>'
    + '<textarea id="mf-desc-en" rows="2">' + escapeHtml(p.description_en || '') + '</textarea></div>'
    + '<div class="form-group"><label for="mf-desc-ko">Description (KO)</label>'
    + '<textarea id="mf-desc-ko" rows="2">' + escapeHtml(p.description_ko || '') + '</textarea></div>'
    + '<div class="form-group"><label for="mf-type">Monster Type</label>'
    + '<select id="mf-type">';
  for (var i = 0; i < monsterTypes.length; i++) {
    var sel = (p.monster_type === monsterTypes[i]) ? ' selected' : '';
    html += '<option value="' + monsterTypes[i] + '"' + sel + '>' + monsterTypes[i] + '</option>';
  }
  html += '</select></div>'
    + '<div class="form-group"><label for="mf-behaviour">Behaviour</label>'
    + '<select id="mf-behaviour">';
  for (var j = 0; j < behaviours.length; j++) {
    var sel2 = (p.behavior === behaviours[j]) ? ' selected' : '';
    html += '<option value="' + behaviours[j] + '"' + sel2 + '>' + behaviours[j] + '</option>';
  }
  html += '</select></div>'
    + '<div class="form-group"><label for="mf-stats">Stats (JSON)</label>'
    + '<textarea id="mf-stats" rows="3">' + escapeHtml(statsStr) + '</textarea></div>'
    + '<div class="form-group"><label for="mf-drop-items">Drop Items (JSON)</label>'
    + '<textarea id="mf-drop-items" rows="3">' + escapeHtml(dropStr) + '</textarea></div>'
    + '<div class="form-group"><label for="mf-respawn">Respawn Time</label>'
    + '<input type="number" id="mf-respawn" value="' + escapeHtml(p.respawn_time != null ? p.respawn_time : '') + '"></div>'
    + '<div class="form-group"><label for="mf-aggro">Aggro Range</label>'
    + '<input type="number" id="mf-aggro" value="' + escapeHtml(p.aggro_range != null ? p.aggro_range : '') + '"></div>'
    + '<div class="form-group"><label for="mf-roaming">Roaming Range</label>'
    + '<input type="number" id="mf-roaming" value="' + escapeHtml(p.roaming_range != null ? p.roaming_range : '') + '"></div>'
    + '<div class="form-group"><label for="mf-properties">Properties (JSON)</label>'
    + '<textarea id="mf-properties" rows="3">' + escapeHtml(propsStr) + '</textarea></div>'
    + '<div class="form-group"><label for="mf-x">X</label>'
    + '<input type="number" id="mf-x" value="' + escapeHtml(p.x != null ? p.x : '') + '"></div>'
    + '<div class="form-group"><label for="mf-y">Y</label>'
    + '<input type="number" id="mf-y" value="' + escapeHtml(p.y != null ? p.y : '') + '"></div>'
    + '<div class="form-group"><label for="mf-faction">Faction ID</label>'
    + '<input type="text" id="mf-faction" value="' + escapeHtml(p.faction_id || '') + '"></div>'
    + '</form>';

  return html;
}

/** 몬스터 폼에서 데이터 수집 */
function collectMonsterFormData() {
  var nameEn = document.getElementById('mf-name-en').value.trim();
  var nameKo = document.getElementById('mf-name-ko').value.trim();

  if (!nameEn || !nameKo) {
    notify.error('Name (EN) and Name (KO) are required.');
    return null;
  }

  var body = { name_en: nameEn, name_ko: nameKo };

  var descEn = document.getElementById('mf-desc-en').value.trim();
  var descKo = document.getElementById('mf-desc-ko').value.trim();
  if (descEn) body.description_en = descEn;
  if (descKo) body.description_ko = descKo;

  body.monster_type = document.getElementById('mf-type').value;
  body.behavior = document.getElementById('mf-behaviour').value;

  // JSON 필드 파싱
  var statsRaw = document.getElementById('mf-stats').value.trim();
  if (statsRaw) {
    try { body.stats = JSON.parse(statsRaw); } catch (_) {
      notify.error('Stats field contains invalid JSON.');
      return null;
    }
  }

  var dropRaw = document.getElementById('mf-drop-items').value.trim();
  if (dropRaw) {
    try { body.drop_items = JSON.parse(dropRaw); } catch (_) {
      notify.error('Drop Items field contains invalid JSON.');
      return null;
    }
  }

  var propsRaw = document.getElementById('mf-properties').value.trim();
  if (propsRaw) {
    try { body.properties = JSON.parse(propsRaw); } catch (_) {
      notify.error('Properties field contains invalid JSON.');
      return null;
    }
  }

  var respawn = document.getElementById('mf-respawn').value.trim();
  if (respawn !== '') body.respawn_time = parseInt(respawn, 10);

  var aggro = document.getElementById('mf-aggro').value.trim();
  if (aggro !== '') body.aggro_range = parseInt(aggro, 10);

  var roaming = document.getElementById('mf-roaming').value.trim();
  if (roaming !== '') body.roaming_range = parseInt(roaming, 10);

  var xVal = document.getElementById('mf-x').value.trim();
  var yVal = document.getElementById('mf-y').value.trim();
  if (xVal !== '') body.x = parseInt(xVal, 10);
  if (yVal !== '') body.y = parseInt(yVal, 10);

  var faction = document.getElementById('mf-faction').value.trim();
  if (faction) body.faction_id = faction;

  return body;
}

/** 몬스터 생성 모달 표시 */
function showCreateMonsterModal() {
  var bodyHtml = buildMonsterFormHtml(null);
  var footerHtml = '<button class="btn btn-secondary" id="monster-form-cancel">Cancel</button>'
    + ' <button class="btn btn-primary" id="monster-form-submit">Create</button>';

  modal.open('Create Monster', bodyHtml, footerHtml);

  document.getElementById('monster-form-cancel').addEventListener('click', modal.close);
  document.getElementById('monster-form-submit').addEventListener('click', async function () {
    var body = collectMonsterFormData();
    if (!body) return;
    try {
      await api.post('/monsters', body);
      modal.close();
      notify.success('Monster created successfully.');
      renderMonsters();
    } catch (err) {
      notify.error('Failed to create monster: ' + err.message);
    }
  });
}

/** 몬스터 수정 모달 표시 */
async function showEditMonsterModal(monsterId) {
  try {
    var monster = await api.get('/monsters/' + monsterId);
    var m = monster.data || monster;

    var bodyHtml = buildMonsterFormHtml(m);
    var footerHtml = '<button class="btn btn-secondary" id="monster-form-cancel">Cancel</button>'
      + ' <button class="btn btn-primary" id="monster-form-submit">Save</button>';

    modal.open('Edit Monster: ' + (m.name_en || ''), bodyHtml, footerHtml);

    document.getElementById('monster-form-cancel').addEventListener('click', modal.close);
    document.getElementById('monster-form-submit').addEventListener('click', async function () {
      var body = collectMonsterFormData();
      if (!body) return;
      try {
        await api.put('/monsters/' + monsterId, body);
        modal.close();
        notify.success('Monster updated successfully.');
        renderMonsters();
      } catch (err) {
        notify.error('Failed to update monster: ' + err.message);
      }
    });
  } catch (err) {
    notify.error('Failed to load monster: ' + err.message);
  }
}

/* ================================================================
 * 게임 오브젝트 관리 UI
 * ================================================================ */

// 게임 오브젝트 페이지네이션 상태
let _objectsPage = 1;
const _objectsLimit = 20;

/** 게임 오브젝트 섹션 렌더링 */
async function renderObjects() {
  const container = document.getElementById('section-objects');
  container.innerHTML = '<p class="text-muted">Loading objects...</p>';

  try {
    const result = await api.get('/objects?page=' + _objectsPage + '&limit=' + _objectsLimit);
    const objects = result.data || [];
    const pagination = result.pagination || {};

    let html = '<div class="section-header">'
      + '<h2>Game Objects</h2>'
      + '<button class="btn btn-primary" id="btn-create-object">Create Object</button>'
      + '</div>';

    // 게임 오브젝트 목록 테이블
    html += '<div class="table-container"><table class="data-table">';
    html += '<thead><tr>'
      + '<th>Name (EN)</th>'
      + '<th>Name (KO)</th>'
      + '<th>Category</th>'
      + '<th>Location</th>'
      + '<th>Slot</th>'
      + '<th>Actions</th>'
      + '</tr></thead>';
    html += '<tbody>';

    if (objects.length === 0) {
      html += '<tr><td colspan="6" class="text-muted text-center">No objects found.</td></tr>';
    } else {
      for (const o of objects) {
        html += '<tr>'
          + '<td>' + escapeHtml(o.name_en || '') + '</td>'
          + '<td>' + escapeHtml(o.name_ko || '') + '</td>'
          + '<td>' + escapeHtml(o.category || '-') + '</td>'
          + '<td>' + escapeHtml(o.location_type || '-') + '</td>'
          + '<td>' + escapeHtml(o.equipment_slot || '-') + '</td>'
          + '<td class="actions-cell">'
          + '<button class="btn btn-sm btn-secondary btn-edit-object" data-id="' + escapeHtml(o.id) + '">Edit</button> '
          + '<button class="btn btn-sm btn-danger btn-delete-object" data-id="' + escapeHtml(o.id) + '" data-name="' + escapeHtml(o.name_en || '') + '">Delete</button>'
          + '</td>'
          + '</tr>';
      }
    }

    html += '</tbody></table></div>';

    // 페이지네이션 컨트롤
    html += buildObjectsPagination(pagination);

    container.innerHTML = html;
    bindObjectsEvents();
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Failed to load objects: ' + escapeHtml(err.message) + '</p>';
  }
}

/** 게임 오브젝트 페이지네이션 HTML */
function buildObjectsPagination(pagination) {
  const page = pagination.page || 1;
  const totalPages = pagination.totalPages || 1;

  let html = '<div class="pagination">';
  html += '<button class="btn btn-sm btn-secondary" id="objects-prev"'
    + (page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
  html += '<span class="pagination-info">Page ' + page + ' / ' + totalPages + '</span>';
  html += '<button class="btn btn-sm btn-secondary" id="objects-next"'
    + (page >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
  html += '</div>';
  return html;
}

/** 게임 오브젝트 섹션 이벤트 바인딩 */
function bindObjectsEvents() {
  var createBtn = document.getElementById('btn-create-object');
  if (createBtn) {
    createBtn.addEventListener('click', showCreateObjectModal);
  }

  document.querySelectorAll('.btn-edit-object').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showEditObjectModal(btn.getAttribute('data-id'));
    });
  });

  document.querySelectorAll('.btn-delete-object').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id');
      var name = btn.getAttribute('data-name');
      confirm.open('Are you sure you want to delete object "' + name + '"?', async function () {
        try {
          await api.del('/objects/' + id);
          notify.success('Object deleted successfully.');
          renderObjects();
        } catch (err) {
          notify.error('Failed to delete object: ' + err.message);
        }
      });
    });
  });

  var prevBtn = document.getElementById('objects-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (_objectsPage > 1) {
        _objectsPage--;
        renderObjects();
      }
    });
  }

  var nextBtn = document.getElementById('objects-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      _objectsPage++;
      renderObjects();
    });
  }
}

/** 게임 오브젝트 폼 HTML */
function buildObjectFormHtml(o) {
  var p = o || {};

  var propsStr = '';
  try { propsStr = p.properties ? JSON.stringify(p.properties, null, 2) : ''; } catch (_) { propsStr = ''; }

  var categories = ['weapon', 'armor', 'consumable', 'misc'];
  var slots = ['', 'HEAD', 'BODY', 'WEAPON', 'SHIELD', 'LEGS', 'FEET', 'HANDS', 'RING', 'AMULET'];

  var html = '<form id="object-form">'
    + '<div class="form-group"><label for="of-name-en">Name (EN) *</label>'
    + '<input type="text" id="of-name-en" value="' + escapeHtml(p.name_en || '') + '" required></div>'
    + '<div class="form-group"><label for="of-name-ko">Name (KO) *</label>'
    + '<input type="text" id="of-name-ko" value="' + escapeHtml(p.name_ko || '') + '" required></div>'
    + '<div class="form-group"><label for="of-desc-en">Description (EN)</label>'
    + '<textarea id="of-desc-en" rows="2">' + escapeHtml(p.description_en || '') + '</textarea></div>'
    + '<div class="form-group"><label for="of-desc-ko">Description (KO)</label>'
    + '<textarea id="of-desc-ko" rows="2">' + escapeHtml(p.description_ko || '') + '</textarea></div>'
    + '<div class="form-group"><label for="of-location-type">Location Type *</label>'
    + '<input type="text" id="of-location-type" value="' + escapeHtml(p.location_type || '') + '" required></div>'
    + '<div class="form-group"><label for="of-location-id">Location ID</label>'
    + '<input type="text" id="of-location-id" value="' + escapeHtml(p.location_id || '') + '"></div>'
    + '<div class="form-group"><label for="of-properties">Properties (JSON)</label>'
    + '<textarea id="of-properties" rows="3">' + escapeHtml(propsStr) + '</textarea></div>'
    + '<div class="form-group"><label for="of-weight">Weight</label>'
    + '<input type="number" id="of-weight" step="0.1" value="' + escapeHtml(p.weight != null ? p.weight : '') + '"></div>'
    + '<div class="form-group"><label for="of-max-stack">Max Stack</label>'
    + '<input type="number" id="of-max-stack" value="' + escapeHtml(p.max_stack != null ? p.max_stack : '') + '"></div>'
    + '<div class="form-group"><label for="of-category">Category</label>'
    + '<select id="of-category">';
  for (var i = 0; i < categories.length; i++) {
    var sel = (p.category === categories[i]) ? ' selected' : '';
    html += '<option value="' + categories[i] + '"' + sel + '>' + categories[i] + '</option>';
  }
  html += '</select></div>'
    + '<div class="form-group"><label for="of-slot">Equipment Slot</label>'
    + '<select id="of-slot">';
  for (var j = 0; j < slots.length; j++) {
    var sel2 = (p.equipment_slot === slots[j]) ? ' selected' : '';
    var label = slots[j] || '(none)';
    html += '<option value="' + slots[j] + '"' + sel2 + '>' + label + '</option>';
  }
  html += '</select></div>'
    + '<div class="form-group"><label><input type="checkbox" id="of-equipped"'
    + (p.is_equipped ? ' checked' : '') + '> Is Equipped</label></div>'
    + '</form>';

  return html;
}

/** 게임 오브젝트 폼에서 데이터 수집 */
function collectObjectFormData() {
  var nameEn = document.getElementById('of-name-en').value.trim();
  var nameKo = document.getElementById('of-name-ko').value.trim();
  var locationType = document.getElementById('of-location-type').value.trim();

  if (!nameEn || !nameKo || !locationType) {
    notify.error('Name (EN), Name (KO), and Location Type are required.');
    return null;
  }

  var body = {
    name_en: nameEn,
    name_ko: nameKo,
    location_type: locationType,
  };

  var descEn = document.getElementById('of-desc-en').value.trim();
  var descKo = document.getElementById('of-desc-ko').value.trim();
  if (descEn) body.description_en = descEn;
  if (descKo) body.description_ko = descKo;

  var locationId = document.getElementById('of-location-id').value.trim();
  if (locationId) body.location_id = locationId;

  var propsRaw = document.getElementById('of-properties').value.trim();
  if (propsRaw) {
    try { body.properties = JSON.parse(propsRaw); } catch (_) {
      notify.error('Properties field contains invalid JSON.');
      return null;
    }
  }

  var weight = document.getElementById('of-weight').value.trim();
  if (weight !== '') body.weight = parseFloat(weight);

  var maxStack = document.getElementById('of-max-stack').value.trim();
  if (maxStack !== '') body.max_stack = parseInt(maxStack, 10);

  body.category = document.getElementById('of-category').value;

  var slot = document.getElementById('of-slot').value;
  if (slot) body.equipment_slot = slot;

  body.is_equipped = document.getElementById('of-equipped').checked;

  return body;
}

/** 게임 오브젝트 생성 모달 표시 */
function showCreateObjectModal() {
  var bodyHtml = buildObjectFormHtml(null);
  var footerHtml = '<button class="btn btn-secondary" id="object-form-cancel">Cancel</button>'
    + ' <button class="btn btn-primary" id="object-form-submit">Create</button>';

  modal.open('Create Game Object', bodyHtml, footerHtml);

  document.getElementById('object-form-cancel').addEventListener('click', modal.close);
  document.getElementById('object-form-submit').addEventListener('click', async function () {
    var body = collectObjectFormData();
    if (!body) return;
    try {
      await api.post('/objects', body);
      modal.close();
      notify.success('Object created successfully.');
      renderObjects();
    } catch (err) {
      notify.error('Failed to create object: ' + err.message);
    }
  });
}

/** 게임 오브젝트 수정 모달 표시 */
async function showEditObjectModal(objectId) {
  try {
    var obj = await api.get('/objects/' + objectId);
    var o = obj.data || obj;

    var bodyHtml = buildObjectFormHtml(o);
    var footerHtml = '<button class="btn btn-secondary" id="object-form-cancel">Cancel</button>'
      + ' <button class="btn btn-primary" id="object-form-submit">Save</button>';

    modal.open('Edit Object: ' + (o.name_en || ''), bodyHtml, footerHtml);

    document.getElementById('object-form-cancel').addEventListener('click', modal.close);
    document.getElementById('object-form-submit').addEventListener('click', async function () {
      var body = collectObjectFormData();
      if (!body) return;
      try {
        await api.put('/objects/' + objectId, body);
        modal.close();
        notify.success('Object updated successfully.');
        renderObjects();
      } catch (err) {
        notify.error('Failed to update object: ' + err.message);
      }
    });
  } catch (err) {
    notify.error('Failed to load object: ' + err.message);
  }
}


/* ================================================================
 * 초기화
 * ================================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // 모달/확인 대화상자 이벤트 바인딩
  document.getElementById('modal-close').addEventListener('click', modal.close);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.close();
  });
  confirm.bindEvents();

  // 로그인 폼 이벤트
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // 로그아웃 버튼 이벤트
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // 해시 변경 이벤트
  window.addEventListener('hashchange', navigate);

  // 세션 확인 후 라우팅 시작
  const authenticated = await checkSession();
  if (authenticated) {
    showApp();
    // 기본 해시 설정
    if (!window.location.hash) {
      window.location.hash = '#dashboard';
    }
    navigate();
  } else {
    showLogin();
  }
});
