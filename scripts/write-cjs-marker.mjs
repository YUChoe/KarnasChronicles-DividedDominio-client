/*
 * 빌드 산출물이 CommonJS 임을 Node 에 알린다.
 *
 * `tsconfig.build.json` 이 CommonJS 를 출력하는데 저장소의 `package.json` 은
 * `"type": "module"` 이다. Node 는 파일에서 가장 가까운 `package.json` 으로
 * 모듈 종류를 판정하므로 산출물 옆에 표식을 두면 그 선언이 이긴다.
 *
 * 이전에는 실행 이미지에서 `sed` 로 `"type": "module"` 줄을 지웠다. 그 우회는
 * 이미지 안에서만 통해서, 빌드한 산출물을 그대로 실행하는 배포에서는 같은
 * 오류가 다시 났다.
 */

import { mkdirSync, writeFileSync } from 'fs';

const dir = 'dist/server';

mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/package.json`,
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf-8'
);

process.stdout.write(`${dir}/package.json 에 CommonJS 표식을 넣었다\n`);
