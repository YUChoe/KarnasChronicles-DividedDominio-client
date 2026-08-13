# 클라이언트 빌드 배포 위치

nginx 가 이 디렉터리를 `/downloads/` 로 서빙한다. Godot 클라이언트 빌드를
여기에 두고 `src/server/public/app.js` 의 `DOWNLOADS` 에 항목을 넣는다.

```js
var DOWNLOADS = [
  { href: '/downloads/karnas-windows.zip',
    label: { en: 'Windows (64-bit)', ko: '윈도우 (64비트)' } }
];
```

`DOWNLOADS` 가 비어 있으면 랜딩의 다운로드 절은 준비 중 문구를 보여 준다.
