# CLAUDE.md

> Claude Code 進入本專案時必讀。包含專案目標、技術約束、品牌規範、開發工作流、未來整合策略。
> 修改本檔請以 PR 形式更新,維持為「活的專案記憶」。

---

## 專案定位(v3)

### 名稱
**Carbon Mate Supply Chain FAQ Module(MVP)**
(Carbon Mate 供應鏈 FAQ 模組 - 最小可行版本)

### 一句話描述
讓 Carbon Mate 的客戶為發給供應商的問卷建立並維護多語系 FAQ。
MVP 階段以**元慶國際貿易**為首發客戶,以**獨立工具**形式上線;**長期將整合進 Carbon Mate 主平台**。

### 戰略雙軌定位(必讀)

本專案在「**短期 MVP 上線**」與「**長期 Carbon Mate 整合**」之間取得平衡:

| 層面 | 短期(讓元慶有東西用) | 長期(整合進 Carbon Mate) |
|---|---|---|
| 部署方式 | GitHub Pages 獨立部署 | 整合進 Carbon Mate 主平台 |
| 認證 | Firebase Auth Email/Password | Carbon Mate SSO |
| 資料庫 | Firebase Realtime Database | 屆時對齊 Carbon Mate(可能 SQL、可能 Firestore) |
| 維運者 | **成創**(Cody as super_admin) | Carbon Mate 平台團隊 |
| 客戶端操作者 | 元慶 FAQ 管理人(tenant_admin) | 同上,但用 Carbon Mate 帳號登入 |

> **設計原則:不為了未來整合過度設計,但每個技術決策都要為未來整合留路。**

### 三類使用者

| 角色 | 身份 | 權限 | 介面 |
|---|---|---|---|
| **訪客** | 收到問卷的供應商 | 唯讀 FAQ、多語系切換、搜尋 | 公開頁面 |
| **客戶管理員(tenant_admin)** | 元慶 FAQ 負責人 | 對自己 tenant 的 FAQ 增刪改 | 登入後的編輯介面 |
| **超級管理員(super_admin)** | 成創內部(Cody) | 管理所有 tenant、新增/停用客戶 | 後台管理介面 |

---

## 未來整合策略(關鍵章節,優先閱讀)

### 三階段路線圖

#### Phase A:獨立 MVP(現在 ~ 元慶上線後 3 個月)
- 獨立 GitHub Pages 部署、Firebase 為後端、成創維運
- **目標**:讓元慶可用、收集反饋、驗證 FAQ 模式的價值

#### Phase B:雙寫過渡(整合啟動後 1-3 個月)
- Carbon Mate 主平台確定後端架構後,寫 **資料同步腳本**
- 訪客頁仍從 Firebase 讀(不中斷服務)
- 管理頁開始接 Carbon Mate API(雙寫:Firebase + Carbon Mate DB)
- **目標**:資料逐步搬遷,新內容兩邊都有

#### Phase C:完全整合
- 訪客頁改從 Carbon Mate API 讀
- 管理介面整合進 Carbon Mate 後台
- Firebase 退役,獨立網域導向 Carbon Mate
- **目標**:單一真相來源、單一登入、單一品牌

### 遷移友善設計原則(寫程式碼時的硬性規定)

這些原則是為了讓 Phase B 的搬遷不要變成惡夢。Claude Code 寫程式碼時必須遵守:

#### 1. 資料結構扁平化
```javascript
// ❌ 避免(Firebase 深層巢狀,SQL 難轉)
tenants/anyking/faqs/q1/translations/zh-TW/answer

// ✅ 推薦(扁平,易轉 SQL)
faqs/{tenantId}_{faqId}_{locale} = { question, answer, ... }
```

實務上採折衷:**保留兩層巢狀**(`tenants/<id>/faqs/<qid>`),不再更深。翻譯也用扁平結構:

```javascript
// 推薦的最終結構
tenants/anyking/faqs/q1/
  ├── id, order, section, createdAt, updatedAt
  ├── translations: {
  │     "zh-TW": { question, answer },
  │     "zh-CN": { question, answer },
  │     "en":    { question, answer },
  │     "vi":    { question, answer }
  │   }
```

未來轉 SQL 對應:
```sql
-- faqs table
CREATE TABLE faqs (
  tenant_id VARCHAR, faq_id VARCHAR, locale VARCHAR,
  question TEXT, answer TEXT, section VARCHAR, "order" INT,
  PRIMARY KEY (tenant_id, faq_id, locale)
);
```

#### 2. 避免 Firebase 專屬功能
- ❌ **不要用 Firebase 即時監聽**(`.on('value')` 持續訂閱)
  - 為什麼:這是 Firebase 獨有,SQL 後端做不到等效行為
  - 替代:用 `.once('value')` 一次性讀取 + 手動 refresh button + visibility change 觸發重讀
- ❌ **不要依賴 Firebase 的自動 sync conflict resolution**
- ❌ **不要把業務邏輯寫進 Firebase Security Rules**——只做 auth/role 檢查
- ✅ **可以用** Firebase Auth 的 UID,因為 UID 是字串,搬遷時可作為 external_auth_id 保留

#### 3. Auth Layer 抽象化
**絕對不要把 Firebase Auth 的 API 直接散落在 UI 程式碼中**。所有認證操作必須透過 `authProvider` 中介層:

```javascript
// ❌ 在 UI 程式碼裡直接呼叫
firebase.auth().signInWithEmailAndPassword(email, pwd);

// ✅ 透過抽象層
authProvider.login(email, pwd);
authProvider.logout();
authProvider.getCurrentUser();
authProvider.onAuthStateChanged(callback);
authProvider.resetPassword(email);
```

`authProvider` 是一個物件,MVP 階段內部用 Firebase Auth,Phase C 整合時換成 Carbon Mate SSO 即可——**UI 程式碼一行都不用動**。

範例骨架(Claude Code 實作時參考):

```javascript
// admin.html 內
const authProvider = {
  // === Phase A: Firebase 實作(目前)===
  async login(email, pwd) {
    const cred = await firebase.auth().signInWithEmailAndPassword(email, pwd);
    return this._normalizeUser(cred.user);
  },
  async logout() {
    return firebase.auth().signOut();
  },
  async getCurrentUser() {
    const user = firebase.auth().currentUser;
    if (!user) return null;
    const profile = await _db.ref(`users/${user.uid}`).once('value');
    return { ...this._normalizeUser(user), ...profile.val() };
  },
  onAuthStateChanged(callback) {
    return firebase.auth().onAuthStateChanged(user => {
      callback(user ? this._normalizeUser(user) : null);
    });
  },
  async resetPassword(email) {
    return firebase.auth().sendPasswordResetEmail(email);
  },
  _normalizeUser(fbUser) {
    return { uid: fbUser.uid, email: fbUser.email };
  }
  // === Phase C: Carbon Mate SSO 替換時,只動這個物件,UI 不變 ===
};
```

#### 4. Data Layer 抽象化(同理)
所有資料庫操作透過 `dataProvider`,不要在 UI 中直接 `firebase.database().ref(...)`:

```javascript
const dataProvider = {
  // FAQ CRUD
  async getFaqs(tenantId) { /* Firebase 實作 */ },
  async getFaq(tenantId, faqId) { /* ... */ },
  async createFaq(tenantId, faq) { /* ... */ },
  async updateFaq(tenantId, faqId, faq) { /* ... */ },
  async deleteFaq(tenantId, faqId) { /* ... */ },

  // Sections
  async getSections(tenantId) { /* ... */ },

  // Tenants
  async getTenant(tenantId) { /* ... */ },
  async listTenants() { /* ... */ },  // super_admin only

  // Users
  async getUserProfile(uid) { /* ... */ }
};
```

未來換 Carbon Mate API 只需重寫此物件,UI 不變。

#### 5. 不要綁死「Firebase」字樣在 UI 訊息
- ❌ 「Firebase 連線失敗,請重試」
- ✅ 「無法連線到後端伺服器,請重試」

### Phase B/C 整合檢查清單(預先列出,提醒未來的自己)

當 Carbon Mate 主平台架構確定時,本專案需要:

- [ ] 確認 Carbon Mate DB 型別(SQL / Firestore / 其他)
- [ ] 確認 Carbon Mate Auth 機制(SSO / OAuth / JWT)
- [ ] 確認 Carbon Mate 的 tenant ID 體系是否與本專案一致(可能需要 mapping)
- [ ] 撰寫資料遷移腳本(Firebase → Carbon Mate DB)
- [ ] 撰寫 `authProvider` 與 `dataProvider` 的 Carbon Mate 實作
- [ ] 規劃網域搬遷(`<github-account>.github.io` → `carbon-mate.cc-sustain.com/faq`)
- [ ] 通知元慶管理人:登入方式改變、URL 改變
- [ ] Firebase 專案退役流程(備份所有資料、降級為唯讀模式 → 完全停用)

---

## 技術架構

### 技術棧

| 層級 | MVP 選擇 | Phase C 預期 |
|---|---|---|
| **前端** | 純 HTML + Vanilla JS + CSS | 屆時整合進 Carbon Mate 前端框架(可能 React/Vue) |
| **資料庫** | Firebase Realtime Database | 屆時對齊 Carbon Mate |
| **認證** | Firebase Authentication(Email/Password) | Carbon Mate SSO |
| **托管** | GitHub Pages | Carbon Mate 主平台 |
| **CDN 依賴** | Firebase SDK compat 版、marked.js、DOMPurify、Fuse.js | 屆時隨 Carbon Mate 技術棧調整 |

### 嚴禁清單
- ❌ React / Vue / Astro / Next.js 等任何前端框架(MVP 階段)
- ❌ Node.js build chain
- ❌ 把密碼或敏感資料寫死在前端
- ❌ 在 UI 程式碼直接呼叫 Firebase API(必須透過 authProvider / dataProvider)
- ❌ Firebase 即時監聽(`.on('value')`),改用 `.once()` + 手動 refresh

### 檔案結構
```
專案根目錄/
├── index.html              ← 公開 FAQ 頁面(訪客)
├── admin.html              ← 管理員登入 + 編輯介面
├── CLAUDE.md               ← 本文件
├── README.md
├── locales/                ← Seed data,首次部署用
│   ├── faq-zh-TW.md
│   ├── faq-zh-CN.md
│   ├── faq-en.md
│   └── faq-vi.md
├── i18n-config.json
└── assets/
    └── (logo、吉祥物等)
```

> **資料來源優先序**:
> 1. 第一次造訪/Firebase 無資料 → 讀 `locales/*.md`(seed)
> 2. 一旦有管理員寫入,**Firebase 是唯一資料源**
> 3. `locales/*.md` 保留作為 fallback 與重置模板

---

## 資料模型(Firebase Realtime Database)

### MVP 結構(刻意不加 surveys 層,但保留升級路徑)

```
firebase-root/
├── tenants/
│   ├── anyking/
│   │   ├── meta/
│   │   │   ├── name: "元慶國際貿易"
│   │   │   ├── nameEn: "ANYKING INTERNATIONAL TRADING"
│   │   │   ├── surveyVersion: "v4.0"        ← 暫時放在 tenant 層,未來移到 survey 層
│   │   │   ├── surveyDate: "2026-05-17"
│   │   │   └── createdAt: <timestamp>
│   │   ├── faqs/
│   │   │   ├── q1/
│   │   │   │   ├── id: "q1"
│   │   │   │   ├── order: 1
│   │   │   │   ├── section: "general"
│   │   │   │   ├── translations: {
│   │   │   │   │     "zh-TW": { question, answer },
│   │   │   │   │     "zh-CN": { question, answer },
│   │   │   │   │     "en":    { question, answer },
│   │   │   │   │     "vi":    { question, answer }
│   │   │   │   │   }
│   │   │   │   ├── createdAt, updatedAt
│   │   │   ├── q2/, q3/, ...
│   │   ├── sections/
│   │   │   ├── general/  { id, order, translations }
│   │   │   ├── basic-info/, product-list/, ...
│   │   └── settings/
│   │       ├── defaultLocale: "zh-TW"
│   │       └── enabledLocales: ["zh-TW", "zh-CN", "en", "vi"]
│
└── users/
    ├── <uid-1>/  { email, role, tenantId, displayName }
    └── <uid-2>/  { email: "cody@...", role: "super_admin", tenantId: null }
```

### 未來「多問卷」升級路徑(現在不做,但結構預留)

當元慶(或其他客戶)第二份問卷上線時,結構升級為:

```
tenants/anyking/
  ├── surveys/                       ← 新增中間層
  │   ├── v4-2026/                  ← 第一份問卷
  │   │   ├── meta: { version, releaseDate, status: "active" }
  │   │   ├── faqs/                  ← 原本在 tenant 層的 faqs 移到這裡
  │   │   ├── sections/
  │   │   └── settings/
  │   └── v5-2027/                  ← 第二份問卷
```

**升級時的遷移方式**:寫一支 script 把 `tenants/anyking/faqs/*` 搬到 `tenants/anyking/surveys/v4-2026/faqs/*`,訪客 URL 從 `?tenant=anyking` 改為 `?tenant=anyking&survey=v4-2026`(若沒帶 survey,預設取 `status: "active"` 的那份)。

> **MVP 階段,所有資料直接放在 tenant 層即可,不要預先加 surveys/v4-2026/ 包裝。** 過度設計會讓 MVP 拖慢、Code 變複雜。

### Tenant ID 命名規範
- 全小寫英數字 + dash(`anyking`、`acme-corp`)
- 不可變更
- 第一個 tenant 是 `anyking`

---

## 認證與權限模型

### Firebase Auth 設定(MVP)
- 方式:Email/Password
- 不開放自由註冊,super_admin 在 Firebase Console 手動建立
- 忘記密碼:用 Firebase 內建 password reset email

### 角色與權限規則

| 操作 | 訪客 | tenant_admin | super_admin |
|---|---|---|---|
| 讀 FAQ | ✅ | ✅ | ✅ |
| 編輯自己 tenant 的 FAQ | ❌ | ✅ | ✅ |
| 編輯其他 tenant 的 FAQ | ❌ | ❌ | ✅ |
| 新增/停用 tenant | ❌ | ❌ | ✅ |
| 管理使用者帳號 | ❌ | ❌ | ✅(在 Firebase Console 手動) |

### Firebase Realtime Database 安全性規則

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

> **絕對不能用 `{ ".read": true, ".write": true }` dev mode 上線**。

### Tenant 路由方式

訪客頁:`https://<repo>.github.io/?tenant=anyking`
管理頁:`https://<repo>.github.io/admin.html`(登入後依 `users/<uid>/tenantId` 載入對應 FAQ)

---

## 功能規格

### 訪客端(index.html)

1. **多語系切換**(繁中/簡中/英/越)
2. **章節導覽**(從 Firebase sections 讀取)
3. **搜尋**(Fuse.js,範圍是當前 tenant 的 FAQ)
4. **深層連結**(`#q1`、`#section-general`)
5. **手動 refresh**——頁面右上角有「重新整理」按鈕,顯示「最後更新:HH:MM」
   - **不用即時監聽**(遵守遷移友善原則第 2 條)
   - 進入頁面時 `.once()` 載入一次
   - visibility change 為 visible 時觸發重讀
6. **回到頂端**
7. **無管理入口暴露**——訪客頁完全看不到登入連結

### 管理端(admin.html)

#### 登入畫面
- Email + Password 表單
- 「忘記密碼」連結
- 友善錯誤訊息(`auth/wrong-password` → 「密碼錯誤」)
- 透過 `authProvider.login()`,不直接呼叫 Firebase

#### FAQ 列表頁
- 顯示當前 tenant 所有 FAQ(按 order 排序)
- 欄位:Q 編號、章節、繁中題目、最後更新時間、**語系完整度標記**
- 操作:新增、編輯、刪除、拖曳排序

#### FAQ 編輯表單
- 章節下拉、order 數字、編號(Q 自動帶入,不能改)
- Tab 切換四個語系
- 每語系兩欄:題目(input)、回答(textarea,Markdown,有預覽切換)
- 儲存:`dataProvider.updateFaq()` → 顯示「已儲存」toast
- 取消:若有未儲存變更,跳確認

#### Super Admin 專屬
- Tenant 列表頁(選擇要管理哪個 tenant)
- 新增 tenant(輸入 ID、名稱、問卷版本)
- **新增管理員帳號的流程**:介面提示「請至 Firebase Console 建立帳號,複製 UID,輸入下方表單」(MVP 不做完整自動化,避免綁死 Firebase Admin SDK)

### 明確不做(範圍管控)

- ❌ 自助註冊
- ❌ 社群登入(Google/Facebook)
- ❌ 線上問卷填答
- ❌ FAQ 版本歷史回滾
- ❌ 多重審核工作流
- ❌ FAQ 評論/回饋
- ❌ 訪客追蹤
- ❌ 多問卷支援(預留架構,MVP 不實作)

---

## 品牌規範(套用 ccsustain-brand skill)

### 視覺主軸:Carbon Mate(成創子品牌)

### 色彩
```css
:root {
  --ccs-blue:   #3165A7;   /* 品牌藍,主要 UI、訪客頁 header */
  --ccs-teal:   #1A9A83;   /* 青綠,管理介面強調 */
  --ccs-orange: #F3982D;   /* 橙黃,CTA、新增按鈕 */
  --ccs-navy:   #1F3C6E;
  --ccs-gray:   #58595B;
  --ccs-white:  #FFFFFF;

  --ccs-gray-50:  #F7F8F9;
  --ccs-gray-100: #ECEDEF;
  --ccs-gray-200: #DADCE0;
  --ccs-gray-400: #A8ACB1;
  --ccs-gray-600: #6B6E73;
  --ccs-gray-900: #1A1B1D;

  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-danger:  #EF4444;
}
```

### Logo
- 訪客頁 header:Carbon Mate 橫式 Logo + 客戶名稱(「Carbon Mate × 元慶國際貿易」)
- 管理頁 header:Carbon Mate 橫式 Logo + 登入者 email + 登出按鈕
- 吉祥物:訪客頁可用 Carbon 醬 + Bonca 醬;管理頁不放
- Logo 素材:`/Users/cody/Documents/Claude/Projects/成創製作物素材包/CarbonMate_LOGO橫式/`

### 字體
- 繁中/簡中:Noto Sans TC / Noto Sans SC
- 英文:Noto Sans
- 越文:Noto Sans Vietnamese
- 管理介面 Markdown 編輯區:monospace(`'JetBrains Mono', 'Fira Code', monospace`)

### 語氣
- 訪客頁:成創「夥伴」語氣,溫暖專業
- 管理頁:簡潔操作導向(Notion / Linear 風格)

---

## 開發工作流

### 本地預覽
```bash
python3 -m http.server 8000
```
- 訪客頁:`http://localhost:8000/?tenant=anyking`
- 管理頁:`http://localhost:8000/admin.html`

### Firebase 初始設定(只做一次)

1. 建立 Firebase 專案(建議 `carbon-mate-faq-mvp`)
2. 建立 Realtime Database,位置選新加坡 `asia-southeast1`
3. 啟用 Authentication → Email/Password
4. 在 Firebase Console 建立 super_admin 帳號(Cody 的 email)
5. Realtime Database 建立對應 `users/<uid>/` 節點,role 設 `super_admin`
6. 部署上述安全性規則(**不要用 dev mode**)
7. 取得 Firebase Config,貼進 `index.html` 與 `admin.html`

### Seed Data 初始化

super_admin 第一次登入後,管理介面有「**從 locales/ 匯入 seed**」按鈕,執行一次性 import:
- 讀取 `locales/*.md`
- 解析 frontmatter + Q 標題正則
- 寫入 `tenants/anyking/faqs/` 與 `tenants/anyking/sections/`

### 部署(套用 github-pages-deploy skill)

```bash
git add -A
git commit -m "Deploy: <說明>"
git push origin main
```

**Firebase 授權步驟必做**:
1. Firebase Console → Authentication → Settings → Authorized domains → 加入 `<帳號>.github.io`
2. Google Cloud Console → Browser Key → 加入 `<帳號>.github.io/*`

### Commit 訊息規範
- `Content: 更新 Q24 越文`
- `Feature: 加上題目摺疊`
- `Fix: 修正錨點丟失`
- `Schema: 調整資料模型`
- `Security: 更新 Firebase 規則`
- `Migration-prep: <說明>`(為未來整合做的準備工作)
- `Deploy: <說明>`

---

## 跨裝置開發(套用 cross-device-handoff skill)
- 觸發詞:「我要交接了」、「同步上次進度」、「桌機接手」
- 產出:`.claude/SESSION_NOTES.md`
- git 管 code,SESSION_NOTES 一起 commit

---

## 開發階段規劃(MVP)

### Phase 1:訪客頁(1-2 天)
- [ ] index.html 基礎結構
- [ ] 從 locales/*.md 載入呈現
- [ ] 多語系切換、章節導覽、搜尋、深層連結
- [ ] 套用 Carbon Mate × 元慶品牌

### Phase 2:Firebase 串接(2-3 天)
- [ ] Firebase 專案建立
- [ ] 部署安全性規則
- [ ] 撰寫 `authProvider`、`dataProvider` 抽象層
- [ ] 訪客頁改從 Firebase 讀(經由 dataProvider)
- [ ] 寫 seed import 函式

### Phase 3:管理頁(2-3 天)
- [ ] admin.html 登入畫面
- [ ] FAQ 列表(讀)
- [ ] FAQ 新增/編輯/刪除(寫)
- [ ] 多語系編輯 + Markdown 預覽

### Phase 4:Super Admin 介面(視時程)
- [ ] tenant 列表/切換
- [ ] 拖曳排序

### Phase 5:正式發給元慶
- [ ] 完整端到端測試
- [ ] tenant_admin 操作手冊
- [ ] 部署到正式網址
- [ ] 元慶帳號開通與交付

---

## 常見任務指引

### 任務:「幫元慶 FAQ 管理人開帳號」
1. Firebase Console → Authentication → Users → Add user
2. 輸入 email + 初始密碼,複製 UID
3. Realtime Database → `users/<UID>/` 寫入:
   ```json
   {
     "email": "wang@anyking.com.tw",
     "role": "tenant_admin",
     "tenantId": "anyking",
     "displayName": "王經理"
   }
   ```
4. 通知對方 → 開啟 `/admin.html` 登入 → 立刻改密碼

### 任務:「我要把這個頁面拿給元慶看了」
1. 確認 Firebase 安全性規則正確部署
2. 確認 admin.html 沒在訪客頁出現連結
3. 四個語系完整跑一遍
4. 部署 GitHub Pages,訪客連結帶 `?tenant=anyking`
5. 管理員帳號(email + 初始密碼)私下交給元慶,提醒立刻改密碼

### 任務:「未來元慶要做第二份問卷」
- **不要直接覆蓋現有 FAQ**——舊問卷的供應商可能還在填寫
- 觸發「多問卷升級」工作:
  1. 加 surveys 層(見「未來『多問卷』升級路徑」)
  2. 寫遷移 script
  3. 訪客 URL 從 `?tenant=anyking` 改為 `?tenant=anyking&survey=v4-2026`(舊 URL 自動 redirect 到當前 active 問卷)
  4. 管理介面加上「切換問卷」下拉

### 任務:「Carbon Mate 整合開始了」
**這是 Phase B/C 工作**,翻到本文件最上面的「未來整合策略」章節 → 「Phase B/C 整合檢查清單」逐項執行。

### 任務:「元慶要追加一題 FAQ」
1. tenant_admin 登入 admin.html
2. 點「新增 FAQ」→ 輸入章節、order
3. 四個語系 tab 各填題目與回答
4. 儲存 → 訪客頁手動 refresh 即可看到

> **MVP 階段成創代管時**,Cody 用 super_admin 登入直接幫元慶代填即可;待 Phase 5 才把帳號交給元慶。

---

## 已知限制與技術債

- **Firebase 全文搜尋限制**:依賴前端 Fuse.js,FAQ 量超過 200 題會慢。屆時可考慮 Algolia 或改用 Carbon Mate 後端搜尋。
- **Firebase 免費額度**:100 同時連線、1GB 儲存、10GB/月流量。元慶單客戶綽綽有餘,Carbon Mate 整合時自然遷移走。
- **Markdown 編輯體驗**:原生 textarea + 預覽切換。若元慶 FAQ 管理人反映困難,v2 引入 EasyMDE / SimpleMDE。
- **越南文 Fuse.js 聲調搜尋**不完美,v2 加 normalize。
- **手動 refresh vs 即時同步**:為了遷移友善,放棄 Firebase 即時監聽。元慶反饋若強烈想要即時同步,Phase A 階段可加上 polling(每 30 秒檢查一次),屆時 dataProvider 加 `subscribe()` 方法即可。

---

## 與其他成創/Carbon Mate 專案的關係

- **隸屬於**:Carbon Mate(`https://carbon-mate.cc-sustain.com/`)未來的「供應鏈管理 > FAQ」模組
- **獨立於**:Carbon Mate 主平台的盤查、報告功能
- **共用品牌**:成創 CI(ccsustain-brand skill)
- **整合方向**:Phase C 完成後,本專案的 `index.html` + `admin.html` 退役,功能整合進 Carbon Mate 主後台

---

## 維護者聯絡

- **專案負責人**:Cody (陳峙霖) — 成創永續 創辦人 / 技術長
- **MVP 維運者**:成創內部(super_admin)
- **首發客戶**:元慶國際貿易(tenant_admin,純內容操作)
- **回報問題**:GitHub Issues / 直接告知 Cody

---

*本檔最後更新:2026-05-22*
*v3 變更重點:加入「未來整合策略」、「遷移友善設計原則」、Auth/Data Layer 抽象化要求、多問卷升級路徑預留*
