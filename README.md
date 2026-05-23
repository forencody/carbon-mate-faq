# 供應商碳盤查問卷 FAQ

> 多語系線上 FAQ,協助元慶國際貿易之供應商順利填答《供應商碳盤查現況調查問卷 v4.0》。

🌐 **線上版本**:[https://cody-ccs.github.io/supplier-faq/](https://cody-ccs.github.io/supplier-faq/)
*(實際網址依 GitHub 帳號與 repo 名而定,首次部署後再更新此連結)*

---

## 支援語系

| 語系 | 檔案 |
|---|---|
| 🇹🇼 繁體中文 | [`locales/faq-zh-TW.md`](locales/faq-zh-TW.md) |
| 🇨🇳 简体中文 | [`locales/faq-zh-CN.md`](locales/faq-zh-CN.md) |
| 🇺🇸 English | [`locales/faq-en.md`](locales/faq-en.md) |
| 🇻🇳 Tiếng Việt | [`locales/faq-vi.md`](locales/faq-vi.md) |

四個語系共 **44 題**,涵蓋從未執行碳盤查到已有 ISO 14064-1/14067/SBTi 認證的各類供應商情境。

---

## 本機預覽

```bash
# 任選其一啟動本地 HTTP server
python3 -m http.server 8000
# 或
npx serve .
```

打開 `http://localhost:8000` 即可。

> 注意:直接 `open index.html` 用 file:// 開啟會失敗,因為瀏覽器會阻擋 fetch local 檔案。

---

## 技術棧

- 純 HTML + Vanilla JS + CSS,無 build step
- CDN 依賴:marked.js(Markdown 解析)、DOMPurify(XSS 防護)、Fuse.js(搜尋)
- 部署平台:GitHub Pages

---

## 內容更新

直接編輯 `locales/` 下對應語系的 `.md` 檔即可,推到 main 分支後 GitHub Pages 會自動更新。

**新增題目時請同步四個語系**,維持題號(Q1 ~ Q44)在跨語系間一致。

---

## 開發指南

詳見 [`CLAUDE.md`](CLAUDE.md) — 給 Claude Code 的完整專案指令檔。

---

## 關於

- **顧問與維運**:成創永續 ([C.C.Sustain ESG](https://cc-sustain.com/))
- **問卷發起方**:元慶國際貿易有限公司 (ANYKING INTERNATIONAL TRADING CO., LTD.)
- **問卷版本**:v4.0(2026/05/17)

---

## License

本 FAQ 內容由成創永續編寫,專為元慶國際貿易供應商使用。內容引用需註明出處。
