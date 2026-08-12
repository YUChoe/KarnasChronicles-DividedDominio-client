extends Node

## 번역 계층. autoload 이름은 `Translator` 다.
##
## 서버는 문장을 만들지 않고 `message_key` 와 `params` 만 보낸다. 키를 문장으로
## 바꾸는 것은 클라이언트 책임이며 리소스는 `res://resources/translations/` 의
## 11개 JSON 파일이다. 구조는 키 → locale → 문장이다.
##
## Godot 내장 번역(`tr()`, `.po`)을 쓰지 않는다. 서버가 보내는 `params` 값이
## 언어별 dict 인 경우가 있어 커스텀 계층이 필요하고, 그렇다면 서버 리소스를
## 그대로 재사용하는 편이 이관 비용이 낮다.
##
## 로딩과 `t(key, params)` 치환은 Task 2.2 에서 구현한다. 이 단계는 autoload
## 등록만 성립시킨다.
