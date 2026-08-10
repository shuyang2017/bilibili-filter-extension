// 本地存储封装：所有数据只存 chrome.storage.local，绝不回传 B站。
(function () {
  "use strict";
  const KEY = "bf_data";
  const DEFAULTS = {
    schemaVersion: 2,
    flags: {},
    rules: { ups: [], tids: [], keywords: [] },
    exports: {},
    settings: {
      highlightLiked: true,
      hideDisliked: true,
      showHiddenBar: true,
      hideAds: true,
      hidePromoted: true
    }
  };

  const Store = {
    data: null,
    listeners: [],

    async load() {
      if (this.data) return this.data;
      const res = await chrome.storage.local.get(KEY);
      let d = res[KEY];
      if (!d || typeof d !== "object") d = {};
      d.flags = d.flags && typeof d.flags === "object" ? d.flags : {};
      d.rules = Object.assign({ ups: [], tids: [], keywords: [] }, d.rules || {});
      d.exports = d.exports && typeof d.exports === "object" ? d.exports : {};
      d.settings = Object.assign({}, DEFAULTS.settings, d.settings || {});
      // 一次性迁移：旧数据（无 schemaVersion 或 <2）升级为「创作推广默认开」
      let migrated = false;
      if (!d.schemaVersion || d.schemaVersion < 2) {
        d.settings.hidePromoted = true;
        d.schemaVersion = 2;
        migrated = true;
      }
      this.data = d;
      if (migrated) await this.persist();
      return d;
    },

    async persist() {
      await chrome.storage.local.set({ [KEY]: this.data });
    },

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach((fn) => { try { fn(this.data); } catch (e) {} }); },

    async setFlag(bv, status, meta) {
      await this.load();
      if (!bv) return this.data;
      if (status) {
        this.data.flags[bv] = Object.assign({ status: status, ts: Date.now() }, meta || {});
      } else {
        delete this.data.flags[bv];
      }
      await this.persist();
      this.emit();
      return this.data;
    },

    async addRule(kind, value) {
      await this.load();
      const arr = this.data.rules[kind];
      const v = (value || "").trim();
      if (v && !arr.includes(v)) arr.push(v);
      await this.persist();
      this.emit();
    },

    async removeRule(kind, value) {
      await this.load();
      this.data.rules[kind] = this.data.rules[kind].filter((x) => x !== value);
      await this.persist();
      this.emit();
    },

    async setSettings(patch) {
      await this.load();
      Object.assign(this.data.settings, patch);
      await this.persist();
      this.emit();
    },

    // 记录某视频导出的 txt 对应的下载 id（用于取消感兴趣时删除文件）
    async recordExport(bv, downloadId) {
      await this.load();
      if (bv && downloadId != null) {
        this.data.exports[bv] = downloadId;
        await this.persist();
      }
    },

    async getExport(bv) {
      await this.load();
      return this.data.exports[bv];
    },

    async clearExport(bv) {
      await this.load();
      if (this.data.exports[bv] != null) {
        delete this.data.exports[bv];
        await this.persist();
      }
    },

    async clearAll() {
      await this.load();
      this.data = JSON.parse(JSON.stringify(DEFAULTS));
      await this.persist();
      this.emit();
    },

    async exportData() {
      await this.load();
      return JSON.parse(JSON.stringify(this.data));
    },

    async importData(obj) {
      if (!obj || typeof obj !== "object") return;
      await this.load();
      if (obj.flags && typeof obj.flags === "object") this.data.flags = obj.flags;
      if (obj.rules) this.data.rules = Object.assign({ ups: [], tids: [], keywords: [] }, obj.rules);
      if (obj.settings) this.data.settings = Object.assign({}, DEFAULTS.settings, obj.settings);
      await this.persist();
      this.emit();
    }
  };

  window.BFStore = Store;
})();
