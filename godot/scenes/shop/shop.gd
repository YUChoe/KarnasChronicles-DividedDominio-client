class_name ShopScreen
extends VBoxContainer

## 상점 화면.
##
## 구매는 `template_id` 로, 판매는 Entity_UUID 로 지정한다. 상점 재고가
## `item_prices` 테이블의 템플릿 단위 값이라 실물 아이템이 아니기 때문이다.
##
## 서버가 상점 verb 세 종(`shop_open`, `shop_buy`, `shop_sell`)을 등록하지 않아
## 이 화면은 아직 실제 서버에서 열리지 않는다. 계약대로 만들어 두고 서버가
## 구현하면 그대로 동작한다. 자세한 사유는 서버 저장소
## `docs/protocol/consistency.md` 에 있다.

signal action_requested(verb: String, target_id: String, params: Dictionary)
signal closed()

@onready var _title: Label = %ShopTitle
@onready var _gold: Label = %ShopGold
@onready var _close: Button = %ShopClose
@onready var _stock_title: Label = %StockTitle
@onready var _stock: VBoxContainer = %StockRows
@onready var _stock_empty: Label = %StockEmpty
@onready var _mine_title: Label = %MineTitle
@onready var _mine: VBoxContainer = %MineRows
@onready var _mine_empty: Label = %MineEmpty
@onready var _notice: Label = %ShopNotice

var _state: GameStateStore = null
var _translator: TranslatorService = null
## 마지막 구매 시도 가격. 부족액 안내에 쓴다
var _last_buy_price := 0


func _ready() -> void:
	_close.pressed.connect(func() -> void: closed.emit())


func bind(state: GameStateStore, translator: TranslatorService) -> void:
	_state = state
	_translator = translator

	_state.shop_changed.connect(_refresh)
	_state.inventory_changed.connect(_refresh)
	_state.player_changed.connect(_refresh)
	_translator.locale_changed.connect(_on_locale_changed)

	apply_texts()


func apply_texts() -> void:
	if _translator == null:
		return
	_title.text = _translator.t("ui.shop.title")
	_close.text = _translator.t("ui.shop.close")
	_stock_title.text = _translator.t("ui.shop.stock_list")
	_stock_empty.text = _translator.t("ui.shop.empty")
	_mine_title.text = _translator.t("ui.shop.my_items")
	_mine_empty.text = _translator.t("ui.shop.nothing_to_sell")
	_refresh()


## 서버가 골드 부족으로 거절했다. 부족액을 안내한다.
func on_insufficient_funds() -> void:
	if _translator == null:
		return
	var short := _last_buy_price - _current_gold()
	# 부족액을 셀 수 없으면 일반 안내를 보인다. 서버가 다른 이유로 거절했거나
	# 값이 어긋난 경우다
	_notice.text = (_translator.t("ui.shop.shortfall", {"short": short})
		if short > 0 else _translator.t("ui.rejection.INSUFFICIENT_FUNDS"))


func clear_notice() -> void:
	_notice.text = ""


func _current_gold() -> int:
	return Protocol.as_int(
		_state.inventory.get("gold", _state.player.get("gold", 0)))


func _refresh() -> void:
	if _state == null or _translator == null:
		return

	_gold.text = _translator.t("ui.inventory.gold", {"gold": _current_gold()})
	_refresh_stock()
	_refresh_mine()


func _refresh_stock() -> void:
	for child: Node in _stock.get_children():
		child.queue_free()

	var items := Protocol.as_array(_state.shop.get("items"))
	_stock_empty.visible = items.is_empty()

	for value: Variant in items:
		var entry: Dictionary = Protocol.as_dict(value)
		_stock.add_child(_stock_row(entry))


func _stock_row(entry: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var name := Label.new()
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.text = _translator.pick(entry.get("name"))
	name.tooltip_text = _translator.pick(entry.get("description"))
	row.add_child(name)

	var buy_price := Protocol.as_int(entry.get("buy_price"))
	var sell_price := Protocol.as_int(entry.get("sell_price"))

	var prices := Label.new()
	prices.text = _translator.t("ui.shop.prices",
		{"buy": buy_price, "sell": sell_price})
	row.add_child(prices)

	var stock := Label.new()
	stock.text = (_translator.t("ui.shop.unlimited")
		if entry.get("stock") == null
		else _translator.t("ui.shop.stock",
			{"stock": Protocol.as_int(entry.get("stock"))}))
	row.add_child(stock)

	# 가격이 0 이면 그 방향 거래가 불가하므로 버튼을 숨긴다
	if buy_price > 0:
		var button := Button.new()
		button.text = _translator.t("ui.shop.buy", {"price": buy_price})
		button.pressed.connect(_on_buy_pressed.bind(
			Protocol.as_string(entry.get("template_id")), buy_price))
		row.add_child(button)

	return row


## 상점이 사는 물건만 보인다. 매도가가 0 이면 그 방향 거래가 불가하다.
func _refresh_mine() -> void:
	for child: Node in _mine.get_children():
		child.queue_free()

	var prices := _sell_prices()
	var shown := 0

	for entry: Dictionary in Items.group(
			Protocol.as_array(_state.inventory.get("items"))):
		var item: Dictionary = Protocol.as_dict(entry.get("item"))
		var template_id := Protocol.as_string(item.get("template_id"))
		var price := Protocol.as_int(prices.get(template_id))
		if price <= 0:
			continue
		shown += 1
		_mine.add_child(_mine_row(item, Protocol.as_int(entry.get("count"), 1), price))

	_mine_empty.visible = shown == 0


func _mine_row(item: Dictionary, count: int, price: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var name := Label.new()
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name.text = ("%s ×%d" % [_translator.pick(item.get("name")), count]
		if count > 1 else _translator.pick(item.get("name")))
	row.add_child(name)

	var button := Button.new()
	button.text = _translator.t("ui.shop.sell", {"price": price})
	# 판매는 실물 아이템이므로 uuid 로 지정한다
	button.pressed.connect(_on_sell_pressed.bind(
		Protocol.as_string(item.get("id")), item))
	row.add_child(button)

	return row


func _sell_prices() -> Dictionary:
	var prices: Dictionary = {}
	for value: Variant in Protocol.as_array(_state.shop.get("items")):
		var entry: Dictionary = Protocol.as_dict(value)
		var template_id := Protocol.as_string(entry.get("template_id"))
		if not template_id.is_empty():
			prices[template_id] = Protocol.as_int(entry.get("sell_price"))
	return prices


func _on_buy_pressed(template_id: String, price: int) -> void:
	if template_id.is_empty():
		return
	_last_buy_price = price
	clear_notice()
	# 구매는 템플릿 단위다. target 이 아니라 params 로 보낸다
	action_requested.emit("shop_buy", "",
		{"template_id": template_id, "quantity": 1})


func _on_sell_pressed(item_id: String, item: Dictionary) -> void:
	if item_id.is_empty():
		return
	clear_notice()
	var params: Dictionary = {}
	if Items.supports_quantity(item):
		params["quantity"] = 1
	action_requested.emit("shop_sell", item_id, params)


func _on_locale_changed(_locale: String) -> void:
	apply_texts()
