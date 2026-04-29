# Tool Result DTO

`/api/chat` 面向 Web、Android 和 iOS 返回同一套结构化结果。自然语言 `reply` 只用于阅读；客户端交互应优先消费 `toolResults` 和 `actions`。

## Chat Response

```json
{
  "reply": "已为你查到结果。",
  "toolResults": [
    {
      "name": "get_school_calendar_image",
      "args": {
        "year": 2026,
        "semester": "autumn",
        "lang": "zh"
      },
      "result": {
        "success": true,
        "status": "ok",
        "data": {},
        "meta": {},
        "error": null,
        "actions": []
      }
    }
  ],
  "actions": []
}
```

## Tool Envelope

每个 tool result 都必须包含：

- `success`: boolean，工具是否成功完成。
- `status`: string，稳定机器状态，例如 `ok`、`awaiting_confirmation`、`library_not_found`、`unsupported_or_pending`。
- `data`: object/array/null，领域数据。
- `meta`: object，分页、截断、统计、查询参数等辅助信息。
- `error`: string/null，失败时给客户端和模型看的错误摘要。
- `actions`: array，需要客户端渲染的交互动作。

## Actions

`actions` 是客户端交互的唯一长期协议。历史 marker 字段会暂时保留兼容 Web，但新客户端不应解析正文里的 `[PAY_QR:...]` 等文本。

### payment_qr

```json
{
  "type": "payment_qr",
  "label": "支付二维码",
  "url": "alipayqr://..."
}
```

客户端应渲染二维码或调起系统支付跳转。

### open_url

```json
{
  "type": "open_url",
  "label": "打开页面",
  "url": "https://..."
}
```

客户端应使用内置浏览器或系统浏览器打开。

### sports_captcha

```json
{
  "type": "sports_captcha",
  "label": "体育验证码辅助面板",
  "panel": "current"
}
```

客户端应打开体育 Selenium 当前页面的验证码辅助面板。

## Pending Action Flow

预约、充值、取消、改密、设备登录/登出等真实动作必须走确认流程：

1. 用户提出动作，Agent 调用 `prepare_*` 或充值准备工具。
2. 工具返回 `status=awaiting_confirmation`、`summary`、`risk`、`confirmation_token`。
3. 客户端展示确认 UI，用户明确确认后再发送确认消息。
4. 后端消费 pending action，返回执行结果和 `actions`。

客户端不能直接调用执行类 tool，也不能根据自然语言回复猜测动作是否已完成。
