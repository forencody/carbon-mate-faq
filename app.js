/**
 * app.js — Carbon Mate FAQ MVP 共用層
 *
 * 提供:
 *   - Firebase 初始化
 *   - authProvider 抽象層(Phase C 整合 Carbon Mate SSO 時只需替換本物件)
 *   - dataProvider 抽象層(Phase B/C 整合 Carbon Mate API 時只需替換本物件)
 *   - Markdown FAQ 解析工具(parseFaqMd 等)
 *   - 共用 helper(escapeHtml)
 *
 * 對外:window.CCS = { authProvider, dataProvider, TENANT, escapeHtml, helpers }
 *
 * 載入順序:Firebase SDK(app/auth/database compat 版)→ app.js → 各頁面 inline script
 */

(function () {
  'use strict';

  // ============================================================
  // 設定:租戶常數(目前單一 tenant;未來 listTenants 時改為 Firebase 讀取)
  // ============================================================
  const TENANT = {
    id: 'anyking',
    name: {
      'zh-TW': '元慶國際貿易',
      'zh-CN': '元庆国际贸易',
      'en':    'ANYKING INTERNATIONAL TRADING',
      'vi':    'ANYKING INTERNATIONAL TRADING'
    }
  };

  // ============================================================
  // Firebase 初始化
  // ============================================================
  const firebaseConfig = {
    apiKey: "AIzaSyAxwx0LkRY0eAeNNSaySEkGdqvBuXWVPr8",
    authDomain: "carbon-mate-faq-mvp.firebaseapp.com",
    databaseURL: "https://carbon-mate-faq-mvp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "carbon-mate-faq-mvp",
    storageBucket: "carbon-mate-faq-mvp.firebasestorage.app",
    messagingSenderId: "478581263378",
    appId: "1:478581263378:web:58d80a59f0d16f05f7dccb"
  };
  firebase.initializeApp(firebaseConfig);
  const _auth = firebase.auth();
  const _db = firebase.database();

  // ============================================================
  // authProvider — 抽象層
  // Phase C 整合 Carbon Mate SSO 時,只需替換此物件,UI 程式碼一行不動
  // ============================================================
  const authProvider = {
    async login(email, pwd) {
      const cred = await _auth.signInWithEmailAndPassword(email, pwd);
      return this._normalizeUser(cred.user);
    },
    async logout() {
      return _auth.signOut();
    },
    // 回傳 { uid, email, role, tenantId, displayName } — null 表未登入
    async getCurrentUser() {
      const user = _auth.currentUser;
      if (!user) return null;
      try {
        const snap = await _db.ref(`users/${user.uid}`).once('value');
        return { ...this._normalizeUser(user), ...(snap.val() || {}) };
      } catch (e) {
        console.warn('[authProvider] 讀取使用者 profile 失敗', e);
        return this._normalizeUser(user);
      }
    },
    onAuthStateChanged(callback) {
      return _auth.onAuthStateChanged((user) => {
        callback(user ? this._normalizeUser(user) : null);
      });
    },
    async resetPassword(email) {
      return _auth.sendPasswordResetEmail(email);
    },
    _normalizeUser(fbUser) {
      return { uid: fbUser.uid, email: fbUser.email };
    },
    // 角色判斷工具
    canEditTenant(user, tenantId) {
      if (!user) return false;
      if (user.role === 'super_admin') return true;
      if ((user.role === 'tenant_admin' || user.role === 'tenant_user') &&
          user.tenantId === tenantId) return true;
      return false;
    },
    canManageUsers(user) {
      // 只有 super_admin 與 tenant_admin 看得到使用者管理連結;
      // MVP 階段點進去只是說明頁(不做實際新增),tenant_user 隱藏
      if (!user) return false;
      return user.role === 'super_admin' || user.role === 'tenant_admin';
    }
  };

  // ============================================================
  // dataProvider — 抽象層
  // 策略:先試 Firebase,faqs 空或失敗時 fallback 到 locales/*.md
  // 使用 .once('value') 一次性讀取(不用 .on('value') — 遷移友善原則)
  // ============================================================
  const dataProvider = {
    _i18nConfig: null,
    _source: null, // 'firebase' | 'locales'

    async getI18nConfig() {
      if (this._i18nConfig) return this._i18nConfig;
      const res = await fetch('i18n-config.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Failed to load i18n-config.json');
      this._i18nConfig = await res.json();
      return this._i18nConfig;
    },

    async getTenant(tenantId) {
      try {
        const snap = await _db.ref(`tenants/${tenantId}/meta`).once('value');
        const meta = snap.val();
        if (meta) {
          return { id: tenantId, name: TENANT.name, meta };
        }
      } catch (e) {
        console.warn('[dataProvider] getTenant 從 Firebase 失敗', e);
      }
      return { id: tenantId, name: TENANT.name, meta: null };
    },

    async getContent(tenantId) {
      try {
        const fromFB = await this._getContentFromFirebase(tenantId);
        if (fromFB) {
          this._source = 'firebase';
          return fromFB;
        }
      } catch (e) {
        console.warn('[dataProvider] 從 Firebase 讀取失敗,fallback 到 locales/*.md', e);
      }
      this._source = 'locales';
      return this._getContentFromLocales();
    },

    async _getContentFromFirebase(tenantId) {
      const [faqsSnap, sectionsSnap] = await Promise.all([
        _db.ref(`tenants/${tenantId}/faqs`).once('value'),
        _db.ref(`tenants/${tenantId}/sections`).once('value')
      ]);
      const faqsRaw = faqsSnap.val();
      if (!faqsRaw || Object.keys(faqsRaw).length === 0) return null;

      const sectionsRaw = sectionsSnap.val() || {};
      const sections = Object.values(sectionsRaw)
        .map((s) => ({
          id: s.id,
          order: s.order || 0,
          translations: s.translations || {}
        }))
        .sort((a, b) => a.order - b.order);

      const faqs = Object.values(faqsRaw)
        .map((f) => ({
          id: f.id,
          number: f.number || (f.id ? f.id.toUpperCase() : ''),
          order: f.order || 0,
          section: f.section,
          translations: f.translations || {}
        }))
        .sort((a, b) => {
          if (a.section !== b.section) {
            return sections.findIndex((s) => s.id === a.section) -
                   sections.findIndex((s) => s.id === b.section);
          }
          return a.order - b.order;
        });

      return { sections, faqs, metaByLocale: {} };
    },

    async _getContentFromLocales() {
      const cfg = await this.getI18nConfig();
      const fetches = cfg.locales.map(async (loc) => {
        const res = await fetch(`locales/${loc.file}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load ${loc.file}`);
        const text = await res.text();
        return { locale: loc.code, parsed: parseFaqMd(text) };
      });
      const parsedLocales = await Promise.all(fetches);
      return mergeLocales(parsedLocales);
    },

    // 一次性把 locales/*.md 寫入 Firebase
    async seedFromLocales(tenantId) {
      if (!tenantId) throw new Error('tenantId required');
      const fromLocales = await this._getContentFromLocales();
      const updates = {};
      const now = firebase.database.ServerValue.TIMESTAMP;

      fromLocales.sections.forEach((sec) => {
        updates[`tenants/${tenantId}/sections/${sec.id}`] = {
          id: sec.id,
          order: sec.order,
          translations: sec.translations
        };
      });
      fromLocales.faqs.forEach((faq) => {
        updates[`tenants/${tenantId}/faqs/${faq.id}`] = {
          id: faq.id,
          number: faq.number,
          order: faq.order,
          section: faq.section,
          translations: faq.translations,
          createdAt: now,
          updatedAt: now
        };
      });

      await _db.ref().update(updates);
      return {
        sectionsSeeded: fromLocales.sections.length,
        faqsSeeded: fromLocales.faqs.length
      };
    }

    // Phase 3 Milestone B/C 將加入:
    //   createFaq(tenantId, faq)
    //   updateFaq(tenantId, faqId, partial)
    //   deleteFaq(tenantId, faqId)
    //   listTenants() — super_admin only
  };

  // ============================================================
  // Markdown FAQ 解析(seedFromLocales 與 fallback 用)
  // 結構:frontmatter (YAML) + body
  // body: ## section {#anchor} → ### Qn. text {#qn} → 答案內文
  // ============================================================
  function parseFaqMd(text) {
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fmMatch) throw new Error('Frontmatter not found');
    const meta = parseSimpleFrontmatter(fmMatch[1]);
    const body = fmMatch[2];

    const sections = [];
    const blocks = body.split(/^## /m).slice(1);
    let sectionOrder = 0;
    blocks.forEach((block) => {
      const lineEnd = block.indexOf('\n');
      const headLine = (lineEnd === -1 ? block : block.slice(0, lineEnd)).trim();
      const head = headLine.match(/^(.+?)\s*\{#([\w-]+)\}\s*$/);
      if (!head) return;
      const fullTitle = head[1].trim();
      const sectionId = head[2];
      const [titleMain, titleSub] = splitOnceByColon(fullTitle);
      const sectionBody = lineEnd === -1 ? '' : block.slice(lineEnd + 1);

      sectionOrder += 1;
      const faqs = [];
      const qBlocks = sectionBody.split(/^### /m).slice(1);
      let qOrder = 0;
      qBlocks.forEach((qBlock) => {
        const qLineEnd = qBlock.indexOf('\n');
        const qHeadLine = (qLineEnd === -1 ? qBlock : qBlock.slice(0, qLineEnd)).trim();
        const qHead = qHeadLine.match(/^(Q\d+)\.\s*(.+?)\s*\{#(q\d+)\}\s*$/);
        if (!qHead) return;
        const qNum = qHead[1];
        const qText = qHead[2].trim();
        const qAnchor = qHead[3];
        let answer = qLineEnd === -1 ? '' : qBlock.slice(qLineEnd + 1);
        answer = answer.replace(/\n---\s*\n?/g, '\n').trim();
        qOrder += 1;
        faqs.push({
          id: qAnchor,
          number: qNum,
          order: qOrder,
          section: sectionId,
          question: qText,
          answer: answer
        });
      });

      sections.push({
        id: sectionId,
        order: sectionOrder,
        name: titleMain,
        label: titleSub || '',
        faqs: faqs
      });
    });

    return { meta, sections };
  }

  function parseSimpleFrontmatter(yaml) {
    const meta = {};
    yaml.split(/\r?\n/).forEach((line) => {
      if (!line || /^\s/.test(line)) return;
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (m && m[2] !== '') meta[m[1]] = m[2].trim();
    });
    return meta;
  }

  function splitOnceByColon(s) {
    const m = s.match(/^([^:]+)[::]\s*(.+)$/);
    return m ? [m[1].trim(), m[2].trim()] : [s, ''];
  }

  function mergeLocales(parsedLocales) {
    const sectionsById = new Map();
    const faqsById = new Map();
    const metaByLocale = {};

    parsedLocales.forEach(({ locale, parsed }) => {
      metaByLocale[locale] = parsed.meta;
      parsed.sections.forEach((sec) => {
        if (!sectionsById.has(sec.id)) {
          sectionsById.set(sec.id, {
            id: sec.id, order: sec.order, translations: {}
          });
        }
        sectionsById.get(sec.id).translations[locale] = { name: sec.name, label: sec.label };

        sec.faqs.forEach((q) => {
          if (!faqsById.has(q.id)) {
            faqsById.set(q.id, {
              id: q.id,
              number: q.number,
              order: q.order,
              section: q.section,
              translations: {}
            });
          }
          faqsById.get(q.id).translations[locale] = {
            question: q.question, answer: q.answer
          };
        });
      });
    });

    const sections = Array.from(sectionsById.values()).sort((a, b) => a.order - b.order);
    const faqs = Array.from(faqsById.values()).sort((a, b) => {
      if (a.section !== b.section) {
        return sections.findIndex(s => s.id === a.section) -
               sections.findIndex(s => s.id === b.section);
      }
      return a.order - b.order;
    });
    return { sections, faqs, metaByLocale };
  }

  // ============================================================
  // UI 共用 helper
  // ============================================================
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ============================================================
  // 對外暴露
  // ============================================================
  window.CCS = {
    authProvider,
    dataProvider,
    TENANT,
    escapeHtml,
    // 暴露 parser 給未來測試 / debug 用,UI 不直接呼叫
    parsers: { parseFaqMd, parseSimpleFrontmatter, splitOnceByColon, mergeLocales }
  };
})();
