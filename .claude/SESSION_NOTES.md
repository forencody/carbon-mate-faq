# Session Notes

> 跨裝置交接用工作日誌。最新的放最上面。
> 由 cross-device-handoff skill 自動維護。

---

## [2026-05-23 19:14] device: macbook(推斷,Mac OS Darwin)

**目標**:在一個 session 內把 Carbon Mate × 元慶 FAQ MVP 從零做到正式上線交付。

**已完成**:
- Phase 1:訪客頁(index.html)— 四語系切換、章節導覽、Fuse.js 搜尋、深層連結、品牌色、`dataProvider` 抽象層
- Phase 2:Firebase 串接 — Realtime Database 在 asia-southeast1,Email/Password Auth,正式版 Security Rules,`seedFromLocales` 把 .md 灌進 Firebase
- Phase 3:管理頁(admin.html)
  - M-A:抽 `app.js` 共用層、登入畫面、角色路由(super_admin / tenant_admin / tenant_user)
  - M-B:FAQ 列表(統計、章節 filter、搜尋、語系完整度小圓點、44 題表格)
  - M-C:完整 CRUD modal(章節下拉、四語系 tab、Markdown 預覽、未存變更警告、Toast 通知、使用者管理說明頁)
- Phase 5:正式上線
  - GitHub repo + Pages 部署:`https://github.com/forencody/carbon-mate-faq` → `https://forencody.github.io/carbon-mate-faq/`
  - `.nojekyll` 修掉 Pages 把 `.md` 編成 `.html` 的問題
  - Firebase Authorized Domains 加 `forencody.github.io`
  - Google Cloud Browser Key 鎖四個白名單域名
  - 為元慶 tenant_admin 建帳號:董昱霖(`danny.tung@anyking.com.tw`)
  - `MANUAL.md` + `MANUAL.docx`(python-docx 自製 generator 在 `scripts/generate_manual_docx.py`)
  - `delivery-email.draft.md`(本機草稿,git 已忽略)
  - **`git tag v1.0.0` 已 push 到 GitHub Releases**

**待續 / 卡點**:
- 無技術卡點。剩下使用者手動動作:
  1. 把 `delivery-email.draft.md` 內容貼到 Gmail,附加 `MANUAL.docx`,寄給董昱霖
  2. 等元慶開始用 → 觀察一週內回饋
- **未來 session 的三種可能進入點**:
  1. **元慶回饋小調整**:介面、文案、新增 FAQ、調整章節等
  2. **Phase B 整合 Carbon Mate**:當 Carbon Mate 主平台後端架構確定時啟動,寫雙寫腳本、`dataProvider` 內部換實作
  3. **沒事回來看看**:讀這份 SESSION_NOTES + `git log` 即可重建脈絡

**決策 / 取捨**:
- **跳過 Phase 4(super_admin 介面強化)**:listTenants 動態化、拖曳排序、跨 tenant 複製 FAQ 都不在這版。元慶只有單一 tenant、Cody 用 Firebase Console 就能管,先省這幾天工。等第二個 client 上線再做。
- **「客戶使用者」走方案 C + 加 `tenant_user` 角色**:tenant_admin 不能自助新增同 tenant 使用者(需聯絡成創代為 Firebase Console 操作),但 `tenant_user` 角色已寫入 Security Rules 與 `authProvider.canEditTenant()`,將來不用改程式碼就能加同事。理由是 Carbon Mate LGPL 接管後 MVP 寫的使用者管理 UI 一定丟掉,「沒寫」=「沒得丟」最無縫。
- **不用 Firebase 即時監聽**:訪客頁用 `.once()` + 手動 refresh 按鈕 + visibility change 自動重讀(60 秒節流),避免 Phase C 整合 SQL 後端時做不到等效行為。
- **Firebase Web Config 公開 OK**:GitHub 寄過一次「Secrets detected」警告信,實際保護來自 Security Rules + Authorized Domains + Browser Key 域名限制三道鎖,key 公開不影響安全。
- **`MANUAL.docx` 用 python-docx 從 `.md` 重生而非手動維護**:雙版本同步靠 `scripts/generate_manual_docx.py` 一鍵跑,docx 在 git 會有 binary churn 但內容對得上。
- **`FAQ工具MANUAL.docx`(36KB,Cody Word 開過存的版本)保留為本機 untracked**:user 明確說「兩個都留」(C 選項),我沒動。

**未 commit 改動**:
- `FAQ工具MANUAL.docx` — 36KB 的 Word 副本,untracked。要嘛加到 `.gitignore` 要嘛 commit 進去,Cody 可下次 session 處理。

**踩過的雷(避免下次再踩)**:
- 純粹用 `<element hidden>` 屬性,如果 class 後面有 `.x { display: flex }` 等規則會被 specificity 蓋掉。修法是加全域 `[hidden] { display: none !important; }`。在 admin.html 已加,寫新管理介面時若用 `hidden` 屬性記得帶這條 reset。
- GitHub Pages 預設用 Jekyll 處理 .md 檔變 .html,訪客頁 fetch `.md` 會 404。加 `.nojekyll` 空檔解決。
- Firebase Console 編輯字串欄位很容易夾尾隨空白,`role === 'tenant_admin'` 比對失敗。在 `authProvider.getCurrentUser()` 加了統一 trim 防呆。

---
