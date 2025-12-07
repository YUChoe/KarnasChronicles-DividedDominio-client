# Node.js/TypeScript 개발 환경 규칙

## 환경 변수
- `NODE_ENV`: 실행 환경 (development, production, test)
- `PORT`: 서비스 포트 (예: `3000`)
- `NODE_VERSION`: Node.js 20.x LTS 사용 권장
- `TYPESCRIPT_VERSION`: TypeScript 5.x 사용

## 기본 원칙
- **ESLint/Prettier 준수**: 일관된 코드 스타일 유지
- **camelCase 네이밍**: 변수와 함수는 camelCase, 클래스는 PascalCase
- **node_modules 관리**: package.json과 package-lock.json 또는 pnpm-lock.yaml 사용
- **gitbash 사용**: Windows에서도 bash 명령어만 사용
- **타입 안정성**: TypeScript strict 모드 사용

## 패키지 관리자
- **npm**: 기본 패키지 관리자
- **pnpm**: 디스크 공간 절약 및 빠른 설치 (권장)
- **yarn**: 대안 패키지 관리자
- 프로젝트당 하나의 패키지 관리자만 사용

## 핵심 개발 원칙
- **비동기 프로그래밍**: async/await 패턴 사용, Promise 체이닝 최소화
- **구조화된 로깅**: winston, pino 등 로깅 라이브러리 사용
- **다국어 지원**: i18next 등을 사용한 국제화 지원
- **의존성 주입**: 테스트 가능한 코드 작성
- **이벤트 기반 아키텍처**: EventEmitter 또는 이벤트 버스 패턴 활용

## 코드 품질 기준
- TypeScript strict 모드 활성화
- ESLint 규칙 준수
- 단위 테스트 작성 (Vitest, Jest)
- 충분한 로깅으로 디버깅 지원
- **타입 검사 필수**: 빌드 전 `tsc --noEmit` 또는 `tsc` 실행

## 프로젝트 구조
```
project/
├── src/
│   ├── client/          # 클라이언트 코드
│   ├── server/          # 서버 코드
│   ├── shared/          # 공유 코드
│   └── types/           # 타입 정의
├── tests/               # 테스트 파일
├── dist/                # 빌드 출력
├── package.json
├── tsconfig.json
└── .eslintrc.js
```

## 빌드 및 실행
```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 빌드
npm run build

# 프로덕션 실행
npm start

# 테스트
npm test

# 타입 검사
npm run type-check
```

## 금지사항
- PowerShell, CMD 사용 금지 (bash 사용)
- 전역 패키지 설치 최소화
- Windows 네이티브 명령어 사용 금지
- any 타입 남용 금지
- 타입 에러 무시하고 실행 금지
- console.log 프로덕션 코드에 남기지 않기

## TypeScript 설정 예시
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```
