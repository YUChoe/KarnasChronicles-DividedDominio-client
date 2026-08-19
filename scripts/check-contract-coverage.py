#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""계약 문서의 메시지 타입을 클라이언트가 모두 다루는지 확인한다.

프로토콜 계약은 서버 저장소 `docs/protocol/` 에 있고 클라이언트는
`godot/scripts/net/protocol.gd` 에 상수로 옮겨 둔다. 둘이 어긋나면 계약에 있는
메시지를 클라이언트가 조용히 무시한다. 계약에 없는 `type` 은 무시하고 경고만
남기는 규칙 때문에 실행 중에도 드러나지 않는다.

서버 저장소의 `scripts/check_protocol_consistency.py` 가 계약과 서버 구현을
대조하므로, 이 스크립트는 계약과 클라이언트를 대조해 남은 한 변을 덮는다.

사용법:
    python scripts/check-contract-coverage.py
    SERVER_REPO=/path/to/server python scripts/check-contract-coverage.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

CLIENT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SERVER = CLIENT_ROOT.parent / "Echoes-of-the-Fallen-Age"

# 어드민 요청 타입은 절 제목에 나온다
ADMIN_HEADING = re.compile(
    r"### ((?:admin|service|account)_[a-z_]+"
    r"(?: / (?:admin|service|account)_[a-z_]+)*)"
)
TABLE_ROW = re.compile(r"\|\s*`([a-z_]+)`\s*\|")
JSON_BLOCK = re.compile(r"```json\n(.*?)```", re.S)
TYPE_FIELD = re.compile(r'"type":\s*"([a-z_]+)"')
GD_CONST = re.compile(r'^const ([A-Z_]+) := "([a-z_]+)"$', re.M)


def table_before_first_section(text: str) -> set[str]:
    """문서 앞머리의 타입 표만 읽는다.

    verb 표가 같은 모양이라 문서 전체를 훑으면 verb 가 섞인다.
    """
    head = text.split("\n## ", 1)[0]
    return {m.group(1) for line in head.splitlines()
            if (m := TABLE_ROW.match(line))}


def contract_types(docs: Path) -> tuple[set[str], set[str], set[str]]:
    server = table_before_first_section(
        (docs / "server-to-client.md").read_text(encoding="utf-8"))
    client = table_before_first_section(
        (docs / "client-to-server.md").read_text(encoding="utf-8"))

    admin_text = (docs / "admin.md").read_text(encoding="utf-8")
    admin: set[str] = set()
    for block in JSON_BLOCK.findall(admin_text):
        admin |= set(TYPE_FIELD.findall(block))
    for line in admin_text.splitlines():
        if m := ADMIN_HEADING.match(line):
            admin |= {part.strip() for part in m.group(1).split(" / ")}

    return server, client, admin


def client_types(protocol: Path) -> tuple[set[str], set[str]]:
    text = protocol.read_text(encoding="utf-8")
    consts = dict(GD_CONST.findall(text))

    def group(name: str) -> set[str]:
        match = re.search(name + r": Array\[String\] = \[(.*?)\]", text, re.S)
        if not match:
            return set()
        return {consts[token] for token in re.findall(r"\b([A-Z_]+)\b", match.group(1))
                if token in consts}

    inbound = group("SERVER_TYPES") | group("ADMIN_SERVER_TYPES")
    requests = (
        "ADMIN_LOGIN", "SERVICE_LOGIN", "ACCOUNT_CREATE", "ADMIN_LIST",
        "ADMIN_GET", "ADMIN_CREATE", "ADMIN_UPDATE", "ADMIN_DELETE",
        "ADMIN_STATS", "ADMIN_MAP", "ADMIN_ACTION",
    )
    outbound = group("CLIENT_TYPES") | {
        consts[name] for name in requests if name in consts}
    return inbound, outbound


EMOTE_TUPLE = re.compile(r"EMOTE_IDS = \((.*?)\)", re.S)
GD_ARRAY = re.compile(r"const IDS: Array\[String\] = \[(.*?)\]", re.S)
QUOTED = re.compile(r'"([a-z_]+)"')


def emote_ids(server_repo: Path) -> tuple[list[str], list[str]]:
    """서버와 클라이언트의 감정 표현·빠른 대화 목록을 읽는다.

    서버가 `emote_id` 를 목록으로 제한하므로 둘이 어긋나면 클라이언트가 보낸
    항목이 `INVALID_PARAMS` 로 거절된다. 화면에는 버튼이 있는데 눌러도 아무 일이
    없다.
    """
    server_text = (
        server_repo / "src" / "mud_engine" / "commands" / "actions" / "social.py"
    ).read_text(encoding="utf-8")
    client_text = (
        CLIENT_ROOT / "godot" / "scripts" / "rules" / "emotes.gd"
    ).read_text(encoding="utf-8")

    server_block = EMOTE_TUPLE.search(server_text)
    client_block = GD_ARRAY.search(client_text)

    server_ids = QUOTED.findall(server_block.group(1)) if server_block else []
    client_ids = QUOTED.findall(client_block.group(1)) if client_block else []
    return server_ids, client_ids


def main() -> int:
    server_repo = Path(os.environ.get("SERVER_REPO", DEFAULT_SERVER))
    docs = server_repo / "docs" / "protocol"
    if not docs.is_dir():
        print(f"계약 문서를 찾을 수 없습니다: {docs}", file=sys.stderr)
        print("SERVER_REPO 환경 변수로 서버 저장소 경로를 지정하세요.",
              file=sys.stderr)
        return 2

    server, client, admin = contract_types(docs)
    inbound, outbound = client_types(
        CLIENT_ROOT / "godot" / "scripts" / "net" / "protocol.gd")

    print("계약: 서버 메시지 %d종, 클라이언트 메시지 %d종, 어드민 타입 %d종"
          % (len(server), len(client), len(admin)))
    print("클라이언트: 수신 %d종, 송신 %d종\n" % (len(inbound), len(outbound)))

    failures = 0
    checks = (
        ("서버 메시지 수신 처리", server, inbound),
        ("클라이언트 메시지 송신 상수", client, outbound),
        ("어드민 타입", admin, inbound | outbound),
    )
    for title, expected, actual in checks:
        missing = sorted(expected - actual)
        status = "OK  " if not missing else "FAIL"
        print("%s %s: 누락 %d종" % (status, title, len(missing)))
        for name in missing:
            print("       -", name)
        failures += len(missing)

    server_emotes, client_emotes = emote_ids(server_repo)
    same = server_emotes == client_emotes
    print("%s 감정 표현·빠른 대화: 서버 %d종, 클라이언트 %d종"
          % ("OK  " if same else "FAIL", len(server_emotes), len(client_emotes)))
    if not same:
        failures += 1
        for name in sorted(set(server_emotes) ^ set(client_emotes)):
            print("       -", name)
        if set(server_emotes) == set(client_emotes):
            print("       - 순서가 다릅니다")

    print()
    print("전체 통과" if failures == 0 else "누락 %d종" % failures)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
