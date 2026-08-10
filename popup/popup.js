// 弹出面板逻辑：统计、规则管理、设置、导入导出、清空。
(function () {
  "use strict";
  const Store = window.BFStore;
  const kindMap = { ups: "lstUp", tids: "lstTid", keywords: "lstKw" };
  let data = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  }

  function render() {
    data = Store.data;
    const f = data.flags || {};
    const r = data.rules || { ups: [], tids: [], keywords: [] };
    let like = 0, dis = 0;
    Object.keys(f).forEach((k) => {
      if (f[k].status === "like") like++;
      else if (f[k].status === "dislike") dis++;
    });
    document.getElementById("mLike").textContent = like;
    document.getElementById("mDis").textContent = dis;
    document.getElementById("mRule").textContent = r.ups.length + r.tids.length + r.keywords.length;

    ["ups", "tids", "keywords"].forEach((k) => {
      const box = document.getElementById(kindMap[k]);
      box.innerHTML = "";
      r[k].forEach((v) => {
        const c = document.createElement("span");
        c.className = "pp-chip";
        c.innerHTML = escapeHtml(v) + ' <b data-k="' + k + '">×</b>';
        box.appendChild(c);
      });
    });

    const s = data.settings || {};
    document.getElementById("s_hideAds").checked = !!s.hideAds;
    document.getElementById("s_hidePromoted").checked = !!s.hidePromoted;
    document.getElementById("s_highlightLiked").checked = !!s.highlightLiked;
    document.getElementById("s_hideDisliked").checked = !!s.hideDisliked;
    document.getElementById("s_showHiddenBar").checked = !!s.showHiddenBar;
  }

  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest("[data-add]");
    if (addBtn) {
      const kind = addBtn.dataset.add;
      const input = document.getElementById("in" + (kind === "ups" ? "Up" : kind === "tids" ? "Tid" : "Kw"));
      const v = input.value.trim();
      if (v) { Store.addRule(kind, v); input.value = ""; }
      return;
    }
    const x = e.target.closest("b[data-k]");
    if (x) {
      const kind = x.dataset.k;
      const val = x.parentNode.textContent.replace("×", "").trim();
      Store.removeRule(kind, val);
    }
  });

  ["hideAds", "hidePromoted", "highlightLiked", "hideDisliked", "showHiddenBar"].forEach((id) => {
    document.getElementById("s_" + id).addEventListener("change", (e) => {
      const patch = {};
      patch[id] = e.target.checked;
      Store.setSettings(patch);
    });
  });

  document.getElementById("btnExport").addEventListener("click", async () => {
    const d = await Store.exportData();
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bili-filter-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  function sanitizeName(s) {
    return String(s || "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40).trim() || "视频";
  }

  document.getElementById("btnExportText").addEventListener("click", async () => {
    const status = document.getElementById("exportStatus");
    await Store.load();
    const data = Store.data;
    const liked = Object.keys(data.flags || {}).filter((k) => data.flags[k].status === "like");
    if (!liked.length) { status.textContent = "暂无「感兴趣」视频。"; return; }
    status.textContent = "开始导出 " + liked.length + " 个视频…";
    let done = 0, fail = 0;
    for (const bvid of liked) {
      try {
        const meta = await chrome.runtime.sendMessage({ type: "getVideoText", bvid });
        if (!meta || meta.error) throw new Error((meta && meta.error) || "空响应");
        const text = (meta.text || "").trim();
        const clipped = Array.from(text).slice(0, 300).join("");
        const d = meta.pubdate ? new Date(meta.pubdate * 1000) : new Date();
        const ds = isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
        const fname = sanitizeName(meta.title || bvid) + "_" + sanitizeName(meta.up || "未知UP") + "_" + ds + ".txt";
        const blob = new Blob([clipped], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const dlId = await chrome.downloads.download({ url, filename: fname, saveAs: false, conflictAction: "overwrite" });
        URL.revokeObjectURL(url);
        if (dlId != null) await Store.recordExport(bvid, dlId);
        done++;
      } catch (e) {
        fail++;
      }
      await new Promise((r) => setTimeout(r, 300));
      status.textContent = "进度 " + (done + fail) + "/" + liked.length + (fail ? "（失败 " + fail + "）" : "");
    }
    status.textContent = "完成：成功 " + done + "，失败 " + fail + "。文件已存到「下载」目录。";
  });

  document.getElementById("btnImport").addEventListener("click", () => document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { Store.importData(JSON.parse(reader.result)); }
      catch (err) { alert("导入失败：" + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("btnClear").addEventListener("click", async () => {
    if (confirm("确定清空全部标记与规则？此操作不可撤销（已导出的 txt 也会一并删除）。")) {
      const d = await Store.load();
      const exports = (d.exports || {});
      Object.keys(exports).forEach((bv) => {
        try { chrome.downloads.removeFile(exports[bv]); } catch (e) {}
      });
      Store.clearAll();
    }
  });

  Store.onChange(() => render());
  (async () => { await Store.load(); render(); })();
})();
