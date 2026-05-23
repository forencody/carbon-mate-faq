# DEVELOPMENT.md — Claude Code 開發操作劇本

> 本文件是「**你進入 Claude Code 後該怎麼操作**」的逐步劇本。
> CLAUDE.md 是給 Claude Code 看的專案說明書;本文件是給你看的指揮手冊。
> 每個 Phase 都附「直接複製貼上的指令」,你不用想,照著做即可。

---

## 開始之前(只做一次)

### 1. 準備本地工作目錄

```bash
# 在你想放專案的位置(例如 ~/Projects/)
cd ~/Projects
mkdir carbon-mate-faq
cd carbon-mate-faq

# 初始化 git
git init
git branch -M main
```

### 2. 把現有資產搬進來

從 Claude 對話 outputs 下載的這些檔案,放進專案根目錄:

```
carbon-mate-faq/
├── CLAUDE.md                    ← 必放(Claude Code 進來就會讀)
├── README.md
├── i18n-config.json
└── locales/
    ├── faq-zh-TW.md
    ├── faq-zh-CN.md
    ├── faq-en.md
    └── faq-vi.md
```

```bash
# 建立 locales 資料夾並把四個 md 移進去
mkdir locales
mv faq-*.md locales/
```

### 3. 啟動 Claude Code

```bash
cd ~/Projects/carbon-mate-faq
claude
```

進去之後,**第一句話固定講這個**:

> 讀 CLAUDE.md,跟我確認你理解的專案目標、技術約束、與當前進度。先不要寫任何程式碼。

讓 Claude Code 先報告它理解的內容,**你檢查它有沒有抓到重點**(特別是:遷移友善原則、authProvider/dataProvider 抽象層、不要用 Firebase 即時監聽)。如果它漏了關鍵,直接糾正。

---

## Phase 1:訪客頁(index.html)

**目標**:做出一個能跑的訪客頁,從 `locales/*.md` 載入內容呈現 FAQ。先不接 Firebase。

### Step 1.1 給 Claude Code 的開工指令

複製貼上:

> 我們從 Phase 1 開始。請建立 index.html,需求如下:
>
> 1. 純 HTML + Vanilla JS + CSS,所有 CSS / JS 內嵌在同一檔
> 2. 從 `locales/faq-{locale}.md` 透過 fetch 載入內容,用 marked.js 解析
> 3. 解析時要從 frontmatter 抓 sections 清單做左側導覽
> 4. 解析 Q1 ~ Q44 變成可摺疊的卡片
> 5. 多語系切換器(繁中/簡中/英/越),切換時保留錨點
> 6. 頂部搜尋框,用 Fuse.js fuzzy 搜尋題目與答案
> 7. 章節導覽 sticky 在左側(桌機),手機收進漢堡選單
> 8. 套用成創品牌色(讀 CLAUDE.md 的 CSS variables 段)
> 9. 訪客頁 header 顯示「Carbon Mate × 元慶國際貿易」
> 10. 右上角放「回到頂端」按鈕,捲過一個視窗高度後才出現
>
> 注意:這個 Phase 不接 Firebase,**資料源就是 .md 檔**。但程式碼結構要為 Phase 2 接 Firebase 預留(把載入邏輯包成 `dataProvider.getFaqs()` 這種抽象介面,目前實作是 fetch .md,未來會換成 Firebase)。
>
> 完成後告訴我怎麼本地預覽。

### Step 1.2 檢驗 Claude Code 產出的方式

讓它跑 `python3 -m http.server 8000` 或 `npx serve .`,你打開 `http://localhost:8000` 檢查:

- [ ] 四個語系切換正常,Q1 內容對應
- [ ] 點任一題後 URL 出現 `#q3`、`#q24`,可以直接複製給別人
- [ ] 搜尋「SBTi」、「Scope 3」、「再生能源」三個關鍵字都有結果
- [ ] 章節導覽點擊跳轉正確
- [ ] 手機尺寸(瀏覽器開 devtools 用 iPhone 14 模擬)介面不亂

### Step 1.3 如果有問題

直接跟 Claude Code 說:

> 我打開後發現 [問題描述]。請修正。

不要客氣,具體描述。例如:

> 在 iPhone 14 寬度下,章節導覽沒有收進漢堡選單,而是擠成兩欄。請修正。

### Step 1.4 Phase 1 完成的 commit

```bash
git add .
git commit -m "Feature: Phase 1 完成訪客頁,從 locales/ 載入 FAQ 內容"
```

---

## Phase 2:Firebase 串接

**目標**:設定 Firebase 專案、寫好 authProvider/dataProvider 抽象層、訪客頁改為從 Firebase 讀取(.md 變成 seed-only)。

### Step 2.1 你先做的事(Claude Code 做不到的步驟)

#### A. 建立 Firebase 專案

1. 開 https://console.firebase.google.com
2. 「**新增專案**」→ 名稱 `carbon-mate-faq-mvp`(或你喜歡的名字)
3. 關閉 Google Analytics(內部工具不需要)
4. 等建立完成

#### B. 建立 Realtime Database

1. 左側 → **資料庫和儲存空間** → **Realtime Database** → **建立資料庫**
2. 位置選 **新加坡 (asia-southeast1)**(台越供應商最近)
3. 安全性規則 → 暫時選「**以測試模式啟動**」(等下會改正式版)

#### C. 啟用 Authentication

1. 左側 → **建構** → **Authentication** → **開始使用**
2. **Sign-in method** 標籤 → 啟用「**電子郵件/密碼**」(不要勾 Email Link)

#### D. 建立你自己的 super_admin 帳號

1. Authentication → **Users** 標籤 → **新增使用者**
2. Email:`cody@cc-sustain.com`(或你常用的)
3. 設一個強密碼,記下來
4. **複製這個 user 的 UID**(很重要,等下要用)

#### E. 在 Realtime Database 設定 super_admin 角色

1. Realtime Database → **資料** 標籤
2. 點根節點旁的 `+`,建立以下結構:

```
users/
  <剛複製的 UID>/
    email: "cody@cc-sustain.com"
    role: "super_admin"
    tenantId: null
    displayName: "Cody"
```

3. 同樣建立 anyking tenant 的基本結構:

```
tenants/
  anyking/
    meta/
      name: "元慶國際貿易"
      nameEn: "ANYKING INTERNATIONAL TRADING"
      surveyVersion: "v4.0"
      surveyDate: "2026-05-17"
```

#### F. 拿到 Firebase Config

1. 左上齒輪 → **專案設定** → **一般** 標籤
2. 往下捲到「您的應用程式」→ 點 `</>` 圖示(Web 應用程式)
3. 輸入應用程式暱稱(隨便取),**不勾**「設定 Firebase Hosting」
4. 註冊 → 複製整段 `firebaseConfig` 物件
5. **把這段 config 貼在記事本暫存**,等下要交給 Claude Code

### Step 2.2 給 Claude Code 的指令

複製貼上(把 firebaseConfig 換成你剛拿到的):

> 我已經建好 Firebase 專案,Realtime Database 在新加坡,Authentication 啟用了 Email/Password。super_admin 帳號(我的 email)已建立,UID 是 `<貼你的 UID>`,在 `users/<UID>/` 已設定 role: super_admin。Tenant `anyking` 已建立 meta。
>
> Firebase Config 如下:
>
> ```javascript
> const firebaseConfig = {
>   apiKey: "...",
>   authDomain: "...",
>   databaseURL: "...",
>   projectId: "...",
>   storageBucket: "...",
>   messagingSenderId: "...",
>   appId: "..."
> };
> ```
>
> 請執行 Phase 2:
>
> 1. 在 `index.html` 加上 Firebase SDK(compat 版,從 CDN 載入)
> 2. 寫 `authProvider` 物件(雖然訪客頁不用 auth,但結構先建好)
> 3. 寫 `dataProvider` 物件,實作 `getFaqs(tenantId)`、`getSections(tenantId)`、`getTenant(tenantId)`,內部用 Firebase `.once('value')` 讀取(**不要用 .on('value')**——遷移友善原則)
> 4. 訪客頁右上角加「重新整理」按鈕,顯示「最後更新:HH:MM」
> 5. 加「visibility change → 重讀」邏輯
> 6. 如果 Firebase 該 tenant 的 faqs 是空的,fallback 去讀 `locales/*.md`(維持訪客可用)
> 7. 寫一個 `seedFromLocales()` 函式(僅 super_admin 看得到的按鈕,讀 .md 解析後寫進 Firebase),先放在 admin.html(Phase 3 才完整做),目前只要寫好邏輯放著
>
> 完成後告訴我:
> - 如何測試從 Firebase 讀取
> - 如何測試 fallback 到 .md

### Step 2.3 部署正式版 Firebase 安全性規則

當 Claude Code 完成程式碼,在你測試前**先把規則改成正式版**:

1. Firebase Console → Realtime Database → **規則** 標籤
2. 把整段規則貼成:

```json
{
  "rules": {
    "tenants": {
      "$tenantId": {
        ".read": true,
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'super_admin' || (root.child('users').child(auth.uid).child('role').val() === 'tenant_admin' && root.child('users').child(auth.uid).child('tenantId').val() === $tenantId))"
      }
    },
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'super_admin'"
      }
    }
  }
}
```

3. 點「發布」

### Step 2.4 驗證

- [ ] 開訪客頁,看到的內容是從 .md fallback(因為 Firebase 還沒有 FAQ 資料)
- [ ] 跑 seedFromLocales(暫時在 console 手動執行 `await dataProvider.seedFromLocales('anyking')`)
- [ ] 重新整理,內容改從 Firebase 讀取
- [ ] 去 Firebase Console 手動改其中一題的回答 → 訪客頁按重新整理 → 看到變更

### Step 2.5 Commit

```bash
git add .
git commit -m "Feature: Phase 2 接入 Firebase,訪客頁透過 dataProvider 抽象層讀取"
```

---

## Phase 3:管理頁(admin.html)

**目標**:管理員登入 → 看到自己 tenant 的 FAQ → 可增刪改。

### Step 3.1 給 Claude Code 的指令

複製貼上:

> 我們進 Phase 3,做 admin.html。需求:
>
> 1. 純 HTML 一檔,**不要**用任何前端框架
> 2. 透過 `authProvider`(在 index.html 已建立的抽象層)登入。請把抽象層獨立成 `app.js` 共用檔(這樣 admin.html 與 index.html 都能 import)
> 3. **登入畫面**:Email + Password 表單、忘記密碼連結、友善錯誤訊息
> 4. **登入後**:
>    - 若 role 是 `tenant_admin`:導向該 tenant 的 FAQ 列表
>    - 若 role 是 `super_admin`:導向 tenant 選擇頁(顯示 anyking,可未來加其他)
> 5. **FAQ 列表頁**:
>    - 表格顯示:Q 編號、章節、繁中題目、最後更新時間、語系完整度(四個小圓點)
>    - 按 order 排序
>    - 操作按鈕:編輯、刪除(刪除要二次確認)、新增
> 6. **FAQ 編輯表單**:
>    - 上方:章節下拉、order 數字
>    - 四個語系 tab(繁中/簡中/英/越)
>    - 每個 tab 兩欄:題目 input、回答 textarea(monospace 字體,支援 Markdown)
>    - 回答區有「預覽」切換按鈕,點了後 textarea 換成 marked.js 渲染結果
>    - 儲存 / 取消按鈕
>    - 儲存成功後 toast 顯示「已儲存,訪客頁將於下次重新整理顯示」
>    - 有未儲存變更時離開要 confirm
> 7. **頁面 header**:Carbon Mate Logo + 登入者 email + 登出按鈕
> 8. **重要**:所有資料操作必須透過 `dataProvider`(新增 `createFaq`、`updateFaq`、`deleteFaq` 方法),不要在 admin.html 直接呼叫 Firebase
> 9. 套用 Carbon Mate 品牌色,語氣參考 Notion / Linear 那種俐落感
>
> 完成後告訴我怎麼測試。

### Step 3.2 驗證流程

1. 開 `http://localhost:8000/admin.html`
2. 用你的 super_admin 帳號登入
3. 進到 anyking 的 FAQ 列表
4. 試新增一題假題目(例如 Q45)→ 儲存
5. 開訪客頁 → 按重新整理 → 看到 Q45 出現
6. 回 admin → 編輯 Q45 → 刪除 Q45
7. 訪客頁重新整理 → Q45 消失

### Step 3.3 Commit

```bash
git add .
git commit -m "Feature: Phase 3 完成管理頁,支援 FAQ CRUD"
```

---

## Phase 4:Super Admin 介面(視時間,可延後)

**目標**:讓你能管理多個 tenant、拖曳排序 FAQ。

### Step 4.1 給 Claude Code 的指令

> Phase 4。super_admin 介面需求:
>
> 1. **Tenant 列表頁**:顯示所有 tenants,每個顯示名稱、FAQ 數、最後更新時間
> 2. **新增 tenant**:表單填 tenant ID(只能英數+dash)、名稱、英文名、問卷版本、問卷日期
> 3. **進入 tenant**:點任一 tenant 進到該 tenant 的 FAQ 列表(等同 tenant_admin 看到的)
> 4. **FAQ 列表加上拖曳排序**:用 HTML5 drag and drop API(不要引入 sortable.js 等套件),拖完後批次更新 order
> 5. **「從其他 tenant 複製 FAQ」按鈕**:super_admin 在新 tenant 的列表頁可選擇從哪個 tenant 複製,深拷貝所有 FAQ + sections
>
> 注意:這些介面只對 super_admin 顯示,tenant_admin 看不到。

### Step 4.2 Commit

```bash
git add .
git commit -m "Feature: Phase 4 Super admin 介面 + 拖曳排序"
```

---

## Phase 5:正式發給元慶

**目標**:把 MVP 部署到 GitHub Pages,交付元慶。

### Step 5.1 部署到 GitHub Pages

#### A. 建立 GitHub Repo

1. 開 https://github.com → 右上 + → **New repository**
2. 名稱:`carbon-mate-faq`(或 `anyking-supplier-faq`)
3. Visibility:**Public**(免費 Pages 必須公開)
4. 不勾 Add README(你已有)
5. Create repository

#### B. 連結本地 repo 並推送

```bash
git remote add origin https://github.com/<你的帳號>/carbon-mate-faq.git
git push -u origin main
```

#### C. 啟用 GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source:**Deploy from a branch**
3. Branch:`main` / 資料夾:`/ (root)`
4. Save → 等 1-2 分鐘 → 出現網址:`https://<帳號>.github.io/carbon-mate-faq/`

#### D. 設定 Firebase 授權網域

1. Firebase Console → Authentication → **Settings** → **Authorized domains**
2. 加入:`<帳號>.github.io`
3. 儲存

#### E. 設定 Google Cloud Browser Key 域名限制

1. https://console.cloud.google.com → 選對應 Firebase 專案
2. **API 和服務** → **憑證**
3. 找到 **Browser key (auto created by Firebase)**
4. **應用程式限制** → 選「**網站**」→ 加入:
   - `https://<帳號>.github.io/*`
   - `https://<帳號>.github.io/carbon-mate-faq/*`
   - `https://<firebase-project-id>.firebaseapp.com/*`
5. 儲存(5 分鐘生效)

### Step 5.2 給 Claude Code 的部署檢查指令

> 上線前的最終檢查。請幫我:
>
> 1. 確認 index.html 與 admin.html 之間沒有意外連結(訪客頁看不到任何登入入口)
> 2. 確認所有錯誤訊息已用 i18n 處理(不要寫死中文,因為訪客可能是越南供應商)
> 3. 跑一次完整流程測試:四個語系切換、搜尋、新增 FAQ、刪除 FAQ
> 4. 確認 console 沒有錯誤、沒有警告
> 5. 確認手機尺寸(375px)所有功能可用
> 6. 確認列印樣式(`@media print`)合理(供應商可能列印一份)
>
> 都通過後給我最終的 commit message,我推上 GitHub。

### Step 5.3 開元慶管理員帳號

依照 CLAUDE.md 的「常見任務指引 > 任務:幫元慶 FAQ 管理人開帳號」步驟做。

### Step 5.4 交付元慶的 email 模板

```
主旨:元慶供應商碳盤查 FAQ 線上平台已上線

王經理 您好,

成創永續為元慶設計的供應商 FAQ 線上平台已完成,以下是相關資訊:

【供應商訪問連結(可直接放在問卷 email 中)】
https://<帳號>.github.io/carbon-mate-faq/?tenant=anyking

【FAQ 管理後台(僅限您使用)】
https://<帳號>.github.io/carbon-mate-faq/admin.html

【您的帳號】
Email:wang@anyking.com.tw
初始密碼:<隨機產生強密碼>

⚠️ 請首次登入後立即修改密碼。

【操作說明】
請見附件「FAQ 管理員操作手冊.pdf」(若有做的話)。

任何問題請隨時聯繫我。

Cody / 成創永續
```

### Step 5.5 Commit + Tag

```bash
git add .
git commit -m "Release: v1.0.0 MVP 上線交付元慶"
git tag v1.0.0
git push origin main --tags
```

---

## 跨裝置開發

### 從 MacBook 切到 Mac Mini(或反之)

**離開原裝置前**,在 Claude Code 內說:

> 我要交接了,幫我產生 SESSION_NOTES。

它會自動執行你的 `cross-device-handoff` skill,產出 `.claude/SESSION_NOTES.md`,然後提示你 commit + push。

**到新裝置後**,git pull 完進 Claude Code 說:

> 同步上次進度。

它會讀 SESSION_NOTES 重建脈絡。

---

## 常見問題排解

### Q1. Claude Code 一直想用 React/Vue,我怎麼擋?

直接打斷它:

> 停。讀 CLAUDE.md 的「嚴禁清單」。本專案禁用任何前端框架,請用純 HTML + Vanilla JS 重做。

### Q2. Firebase 連線失敗

按順序排查(讓 Claude Code 跟你一起檢查):

> 我打開頁面 console 出現 [貼錯誤訊息]。請按下列順序檢查:
> 1. firebaseConfig 是否正確
> 2. Firebase Authorized domains 是否包含當前網域
> 3. Realtime Database 規則是否正確
> 4. 我登入的 user 在 users/ 節點是否有對應資料

### Q3. 訪客頁看到舊資料,怎麼辦?

按重新整理鈕(右上角)即可。**這是設計上的取捨**(遷移友善),不是 bug。

### Q4. Claude Code 想引入新的 CDN 套件

擋下來:

> 等等。CLAUDE.md 有依賴允許清單(Firebase / marked / DOMPurify / Fuse.js)。為什麼要加 [套件名]?能不能用既有依賴或原生 JS 做到?

### Q5. 我改了 .md 檔但訪客頁沒變

因為一旦 Firebase 有資料,訪客頁從 Firebase 讀,不再讀 .md。要嘛:
- 從 admin.html 改(推薦)
- 或請 Claude Code 寫一個 `reseedFromLocales()` 函式,強制用 .md 蓋掉 Firebase(僅 super_admin 可用,有確認對話框)

---

## 每次開新 Claude Code session 的起手式

複製貼上:

> 讀 CLAUDE.md 跟 .claude/SESSION_NOTES.md(如果有的話),告訴我:
> 1. 你理解的當前 Phase 進度
> 2. 上次 session 結束時的待辦
> 3. 你建議我們今天先做什麼

讓 Claude Code 主動報告現況,你只需要回「好,繼續」或「我想改做 X」。

---

## 紅旗警報(出現這些情況請喊停)

- 🚩 Claude Code 想把 Firebase API Key 寫進 `.env` 或新建設定檔——**沒必要**,前端 Key 本來就會曝光,靠 Authorized domains + Security Rules 保護
- 🚩 Claude Code 想加 npm/yarn 指令——**禁用**,本專案無 build step
- 🚩 Claude Code 想用 Firebase Functions 或 Cloud Functions——**MVP 不需要**,會增加複雜度與成本
- 🚩 Claude Code 想做 OAuth / Google Sign-in——**MVP 不需要**,等 Phase C 整合 Carbon Mate SSO
- 🚩 Claude Code 直接在 UI 寫 `firebase.database().ref(...)`——**違反抽象層原則**,要求重構成 dataProvider

---

## 階段完成的對外溝通模板

### 跟元慶報進度

```
進度更新:供應商 FAQ 線上平台

✅ Phase X 完成:[簡述]
🔄 Phase X+1 進行中:預計 [日期] 完成
📋 後續規劃:[Phase X+2 內容]

如有任何想加入的功能或修改的內容,歡迎隨時提出。

Cody
```

### 跟成創團隊內部溝通

```
[Carbon Mate FAQ MVP] 週進度

本週完成:
- [項目 1]
- [項目 2]

下週計畫:
- [項目 1]
- [項目 2]

需要協助:
- [若無則寫「目前無」]

風險與議題:
- [若無則寫「無」]
```

---

## 最後叮嚀

1. **每個 Phase 完成都要 commit**,不要等到最後一次 commit 一大坨
2. **每次離開 Claude Code 前都讓它產 SESSION_NOTES**,跨裝置才順暢
3. **遇到 Claude Code 想擴大範圍**(加酷炫功能、引入新依賴),請它先讀 CLAUDE.md 的「明確不做」清單
4. **元慶反饋的需求要記在 SESSION_NOTES** 的「Phase B/C 整合檢查清單」對應位置,未來整合時不會遺漏

---

*本檔最後更新:2026-05-22*
*若 CLAUDE.md 有更新,本檔的指令也要對應檢視*
