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
    en: 'A text-based multiplayer world set on Karnas after the Fall, where the '
      + 'knights lost their war and the mages have not opened their gates.',
    ko: '몰락 이후의 카르나스를 배경으로 한 텍스트 기반 멀티플레이 세계. '
      + '기사단은 전쟁에서 졌고 마법사들은 아직 성문을 열지 않았다.'
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
    en: 'The knights lost the war. The mages will not open their gates. '
      + 'What is left of Karnas belongs to whoever can hold it.',
    ko: '기사단은 전쟁에서 졌습니다. 마법사들은 성문을 열지 않습니다. '
      + '남은 카르나스는 지킬 수 있는 자의 것입니다.'
  },
  'hero.lede': {
    en:
      "Two years of war ended in the knights' defeat, and the golden empire " +
      'burned with it. A few years on, the roads are ash and the fields are ' +
      'grey. What survives is held one place at a time — a fortress, a port, ' +
      'a chapel — and the ruins between them still hold things worth the risk.',
    ko:
      '2년의 전쟁은 기사단의 패배로 끝났고, 황금 제국도 그 불길에 함께 ' +
      '무너졌습니다. 몇 해가 지난 지금 길에는 재가 깔리고 밭은 잿빛입니다. ' +
      '남은 것은 한 곳씩 붙들려 있습니다 — 요새 하나, 항구 하나, 예배당 하나. ' +
      '그 사이의 폐허에는 아직 위험을 무릅쓸 만한 것들이 남아 있습니다.'
  },
  'hero.register': { en: 'Create an account', ko: '계정 만들기' },
  'hero.download': { en: 'Get the client', ko: '클라이언트 받기' },

  'about.title': { en: 'Karnas after the Fall', ko: '몰락 이후의 카르나스' },
  'about.explore.title': { en: 'Hold, then venture', ko: '거점과 폐허' },
  'about.explore.body': {
    en:
      'Fort Duskfall keeps its discipline, Greyhaven Port keeps its traffic, ' +
      'and the wasteland between them keeps everything else. You gather what ' +
      'you need in a settlement, then walk out into the ruins.',
    ko:
      '황혼의 요새는 규율을 지키고 잿빛 항구는 뱃길을 지킵니다. 그 사이의 ' +
      '황무지가 나머지 전부를 갖고 있습니다. 거점에서 필요한 것을 갖춘 뒤 ' +
      '폐허로 걸어 나가는 것이 이 세계의 하루입니다.'
  },
  'about.talk.title': { en: 'The ones who stayed', ko: '남은 사람들' },
  'about.talk.body': {
    en:
      'Soldiers who came back, refugees who did not choose to be here, a monk ' +
      'keeping a chapel lit. Each of them tells the war differently. Some ' +
      'will sell you what they can spare; some want something in return.',
    ko:
      '돌아온 병사, 원해서 온 것이 아닌 난민, 예배당의 불을 지키는 수사. ' +
      '저마다 전쟁을 다르게 이야기합니다. 여분을 팔기도 하고 대가를 ' +
      '요구하기도 합니다.'
  },
  'about.fight.title': { en: 'What the war left', ko: '전쟁이 남긴 것' },
  'about.fight.body': {
    en:
      'Combat is turn-based and honest about its numbers, and the factions ' +
      'remember whom you stood beside. One rule is not negotiable: go near ' +
      "the mages' castles and nothing comes back.",
    ko:
      '전투는 턴 방식이고 수치를 숨기지 않습니다. 세력들은 당신이 누구 편에 ' +
      '섰는지 기억합니다. 다만 흥정이 통하지 않는 규칙이 하나 있습니다. ' +
      '마법사의 성 근처로 가면 아무도 돌아오지 못합니다.'
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

  'download.title': { en: 'Get the client', ko: '클라이언트 받기' },
  'download.body': {
    en:
      'Builds are shared on our Discord server. The client is a standalone ' +
      'application — unpack the archive and run it. Come and say hello while ' +
      'you are there.',
    ko:
      '빌드는 디스코드에서 나눕니다. 클라이언트는 단독 실행 파일이라 압축을 ' +
      '풀면 바로 실행됩니다. 오신 김에 인사도 남겨 주세요.'
  },
  'download.discord': {
    en: 'Join the Discord',
    ko: '디스코드 참여하기'
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
