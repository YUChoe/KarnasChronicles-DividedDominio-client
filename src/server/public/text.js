/*
 * 랜딩 사이트 문구. 영어와 한국어를 함께 담는다.
 *
 * 로직과 나누어 두는 것은 게임 클라이언트와 같은 방식이다. 문구를 고치는 일과
 * 동작을 고치는 일이 서로 섞이지 않는다.
 *
 * 영어는 영국 철자를 쓴다.
 */

'use strict';

window.LANDING_TEXT = {
  'meta.description': {
    en: 'A text-based multiplayer world of fallen kingdoms and divided rule.',
    ko: '무너진 왕국과 갈라진 지배권을 다루는 텍스트 기반 멀티플레이 세계.'
  },
  'brand': {
    en: 'The Chronicles of Karnas',
    ko: '카르나스 연대기'
  },
  'hero.title': {
    en: 'The Chronicles of Karnas: Divided Dominion',
    ko: '카르나스 연대기: 분할된 지배권'
  },
  'hero.tagline': {
    en: 'The old realm has fallen. What remains is divided, and it is contested.',
    ko: '옛 왕국은 무너졌습니다. 남은 것은 갈라졌고, 아직 다투는 중입니다.'
  },
  'hero.lede': {
    en:
      'A text-based multiplayer world. Explore ruined settlements, speak with ' +
      'those who stayed, trade for what you need, and choose whom to stand beside.',
    ko:
      '텍스트 기반 멀티플레이 세계입니다. 폐허가 된 정착지를 돌아보고, 남은 ' +
      '사람들과 이야기하고, 필요한 물건을 거래하고, 누구 편에 설지 고릅니다.'
  },
  'hero.register': { en: 'Create an account', ko: '계정 만들기' },
  'hero.download': { en: 'Download the client', ko: '클라이언트 받기' },

  'about.title': { en: 'The world', ko: '세계' },
  'about.explore.title': { en: 'Explore', ko: '탐험' },
  'about.explore.body': {
    en:
      'A coordinate world of towns, roads, wilderness and ruins. Each room ' +
      'describes what is there and where you may go next.',
    ko:
      '마을과 길, 야지와 폐허가 좌표로 이어진 세계입니다. 방마다 무엇이 있고 ' +
      '어디로 갈 수 있는지 알려 줍니다.'
  },
  'about.talk.title': { en: 'Talk and trade', ko: '대화와 거래' },
  'about.talk.body': {
    en:
      'Those who remain have their own accounts of what happened. Some will ' +
      'sell you what they can spare; some will ask something in return.',
    ko:
      '남은 사람들은 무슨 일이 있었는지 저마다 다르게 말합니다. 여분을 팔기도 ' +
      '하고, 대가를 요구하기도 합니다.'
  },
  'about.fight.title': { en: 'Stand your ground', ko: '전투' },
  'about.fight.body': {
    en:
      'Combat is turn-based and honest about its numbers. Factions remember ' +
      'whom you sided with.',
    ko:
      '전투는 턴 방식이고 수치를 숨기지 않습니다. 종족과 세력은 당신이 누구 ' +
      '편에 섰는지 기억합니다.'
  },
  'about.language': {
    en:
      'The game is playable in English and Korean. Your choice of language ' +
      'changes every description, name and line of dialogue.',
    ko:
      '게임은 영어와 한국어로 할 수 있습니다. 선택한 언어에 따라 설명과 이름, ' +
      '대사가 모두 바뀝니다.'
  },

  'shots.title': { en: 'Screenshots', ko: '화면' },
  'shots.town': {
    en: 'The town square, with the people who kept it.',
    ko: '마을 광장과 그곳을 지킨 사람들.'
  },
  'shots.town.alt': {
    en: 'The game client showing a town square and the people in it',
    ko: '마을 광장과 그 안의 인물을 보여 주는 게임 화면'
  },
  'shots.dialogue': {
    en: 'A conversation, and what it costs.',
    ko: '대화, 그리고 그 대가.'
  },
  'shots.dialogue.alt': {
    en: 'A dialogue with an NPC and a list of replies',
    ko: 'NPC 와의 대화와 선택지 목록'
  },
  'shots.combat': {
    en: 'A fight you may not win.',
    ko: '이기지 못할 수도 있는 싸움.'
  },
  'shots.combat.alt': {
    en: 'A turn-based fight showing health and the turn order',
    ko: '체력과 턴 순서를 보여 주는 턴 방식 전투'
  },
  'shots.pending': {
    en: 'Screenshots are being prepared.',
    ko: '화면 이미지를 준비하고 있습니다.'
  },

  'download.title': { en: 'Download', ko: '다운로드' },
  'download.body': {
    en:
      'The client is a standalone application. No installation is required ' +
      'beyond unpacking the archive.',
    ko: '클라이언트는 단독 실행 파일입니다. 압축을 풀면 바로 실행됩니다.'
  },
  'download.pending': {
    en:
      'Builds are being prepared. Create your account now and it will be waiting.',
    ko: '빌드를 준비하고 있습니다. 계정을 먼저 만들어 두셔도 됩니다.'
  },

  'register.title': { en: 'Create an account', ko: '계정 만들기' },
  'register.body': {
    en: 'One account is all you need. You may change your display name in the game.',
    ko: '계정 하나면 됩니다. 표시 이름은 게임 안에서 바꿀 수 있습니다.'
  },
  'register.username': { en: 'Username', ko: '사용자명' },
  'register.username.hint': {
    en: '3 to 20 characters. Letters, digits and underscores only.',
    ko: '3~20자. 영문, 숫자, 밑줄만 씁니다.'
  },
  'register.password': { en: 'Password', ko: '비밀번호' },
  'register.password.hint': {
    en: 'At least 8 characters.',
    ko: '8자 이상.'
  },
  'register.confirm': { en: 'Confirm password', ko: '비밀번호 확인' },
  'register.email': { en: 'Email (optional)', ko: '이메일 (선택)' },
  'register.email.hint': {
    en: 'Used only to recover your account. Leave it empty if you prefer.',
    ko: '계정 복구에만 씁니다. 비워 두셔도 됩니다.'
  },
  'register.locale': { en: 'Preferred language', ko: '선호 언어' },
  'register.submit': { en: 'Create account', ko: '계정 만들기' },
  'register.sending': { en: 'Creating your account…', ko: '계정을 만들고 있습니다…' },
  'register.done': {
    en: 'Your account is ready. Sign in with it from the game client.',
    ko: '계정이 준비됐습니다. 게임 클라이언트에서 이 계정으로 접속하세요.'
  },

  'error.username.required': { en: 'Enter a username.', ko: '사용자명을 입력하세요.' },
  'error.username.length': {
    en: 'The username must be 3 to 20 characters.',
    ko: '사용자명은 3~20자여야 합니다.'
  },
  'error.username.charset': {
    en: 'Use letters, digits and underscores only.',
    ko: '영문, 숫자, 밑줄만 쓸 수 있습니다.'
  },
  'error.password.required': { en: 'Enter a password.', ko: '비밀번호를 입력하세요.' },
  'error.password.length': {
    en: 'The password must be at least 8 characters.',
    ko: '비밀번호는 8자 이상이어야 합니다.'
  },
  'error.password.bytes': {
    en: 'The password is too long. Keep it under 72 bytes.',
    ko: '비밀번호가 너무 깁니다. 72바이트 이하로 줄이세요.'
  },
  'error.passwordConfirm.mismatch': {
    en: 'The two passwords do not match.',
    ko: '두 비밀번호가 서로 다릅니다.'
  },
  'error.email.format': {
    en: 'Check the email address.',
    ko: '이메일 주소를 확인하세요.'
  },
  'error.email.length': {
    en: 'The email address is too long.',
    ko: '이메일 주소가 너무 깁니다.'
  },
  'error.taken': {
    en: 'That username is taken. Choose another.',
    ko: '이미 쓰이는 사용자명입니다. 다른 이름을 고르세요.'
  },
  'error.validation': {
    en: 'The server rejected these details. Check each field.',
    ko: '서버가 입력을 거절했습니다. 각 항목을 확인하세요.'
  },
  'error.rate': {
    en: 'Too many attempts. Try again later.',
    ko: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.'
  },
  'error.disabled': {
    en: 'Registration is closed on this server.',
    ko: '이 서버는 회원가입을 받지 않습니다.'
  },
  'error.upstream': {
    en: 'The game server could not be reached. Try again shortly.',
    ko: '게임 서버에 닿지 못했습니다. 잠시 후 다시 시도하세요.'
  },

  'footer.note': {
    en: 'A text-based world, played in your own words.',
    ko: '읽고 쓰는 세계.'
  }
};
