# Formula Kart

F1 風格 Q 版 WebGL／Three.js 賽車遊戲。包含兩條賽道、9 台賽車、三種 AI、動態天氣、漂移與加速、車庫商城、44 項成就，以及 WebSocket 多人房間與 Mock fallback。

## 啟動

```bash
npm install
npm run dev
```

- 遊戲：http://localhost:5188
- WebSocket／健康檢查：http://localhost:8080/healthz

也可以只啟動網頁；多人連線會在 4 秒後自動切換 Mock Mode。

## 控制

- `W`／`↑`：加速
- `S`／`↓`：煞車、低速倒車
- `A`／`D`：轉向
- `Space`：漂移並累積加速能量
- `E`：使用加速
- `Esc`／`P`：暫停

## 驗證

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

目前為桌機鍵盤版本，存檔位於瀏覽器 localStorage。
