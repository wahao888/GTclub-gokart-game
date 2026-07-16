# Formula Kart

F1 風格 Q 版 WebGL／Three.js 賽車遊戲。包含三條賽道、9 台賽車、三種 AI、動態天氣、漂移與加速、車庫商城、44 項成就，以及最多 10 人的 WebSocket 多人房間。

## 啟動

```bash
npm install
npm run dev
```

- 遊戲：http://localhost:5188
- WebSocket／健康檢查：http://localhost:8080/healthz

正式環境的多人連線失敗時會顯示重試，不會自動切換成 Mock Mode。Mock 僅供明確選擇的離線練習使用。

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

## 正式部署

- 網址：`https://gtclub.tw/formula-kart/`
- Nginx 直接提供 `apps/web/dist`，並將 `/formula-kart/ws` 與 `/formula-kart/healthz` 轉送至 `127.0.0.1:8080`。
- PM2 程序：`formula-kart-server`，記憶體上限 128 MB。
- 發布採 `/var/www/formula-kart/releases/<版本>` 與 `current` symlink，不在 EC2 上執行 npm 安裝或建置。

```bash
npm run deploy
WS_URL=wss://gtclub.tw/formula-kart/ws ORIGIN=https://gtclub.tw DURATION_MS=900000 npm run test:load
```

部署設定與 CloudWatch 告警腳本位於 `deploy/`。
