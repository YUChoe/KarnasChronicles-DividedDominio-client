extends Node

## 클라이언트 상태 저장소. autoload 이름은 `GameState` 다.
##
## 서버 메시지는 디스패처를 거쳐 이곳에만 반영되고 화면은 신호를 관찰해 갱신한다.
## 화면이 상태를 폴링하지 않으며 화면끼리 상태를 주고받지 않는다.
##
## 필드(player, room, entities, nearby_rooms, inventory, equipped, combat,
## dialogue, shop, chat_log, event_log, connection_status)와 변경 신호는
## Task 1.7 에서 채운다. 이 단계는 autoload 등록만 성립시킨다.
