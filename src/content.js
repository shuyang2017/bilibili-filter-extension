// 主控制器：注入按钮、监听 DOM、应用过滤、联动存储变更。
(function () {
  "use strict";
  const Store = window.BFStore;
  const Detect = window.BFDetect;
  const Apply = window.BFApply;

  let data = null;
  let bar = null;
  let reveal = false;

  function injectButtons(card) {
    const el = card.el;
    if (el.dataset.bfTracked) return;
    el.dataset.bfTracked = "1";
    el.dataset.bv = card.bv || "";
    el.dataset.bfTitle = card.title || "";
    el.dataset.bfUp = card.up || "";
    el.dataset.bfMid = card.mid || "";
    el.dataset.bfTid = card.tid || "";
    el.dataset.bfAd = card.isAd ? "1" : "0";
    el.dataset.bfPromoted = card.isPromoted ? "1" : "0";
    el.classList.add("bf-tracked");

    if (!card.bv) return; // 无 BV 号则不注入按钮

    const bar = document.createElement("div");
    bar.className = "bf-actions";
    bar.innerHTML =
      '<button class="bf-btn bf-like" data-bf="like" type="button">感兴趣</button>' +
      '<button class="bf-btn bf-dis" data-bf="dislike" type="button">不感兴趣</button>';

    // 放在视频标题正下方
    let anchor = null;
    if (el.classList.contains("bili-video-card")) {
      anchor =
        el.querySelector(".bili-video-card__info--tit") ||
        el.querySelector(".bili-video-card__info");
    } else if (el.classList.contains("bili-dyn-card")) {
      const dv = el.querySelector(".bili-dyn-card-video");
      anchor =
        (dv && dv.querySelector(".bili-dyn-card-video__title")) || dv || el;
    }
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    } else {
      el.appendChild(bar);
    }
  }

  function pass() {
    if (!data) return;
    Detect.scan().forEach(injectButtons);
    const all = Detect.all();
    let hidden = 0;
    all.forEach((c) => {
      const a = Apply.apply(c, data);
      if (a && (a.indexOf("mask") === 0 || a.indexOf("hide") === 0)) hidden++;
    });
    updateBar(hidden);
  }

  function updateBar(hidden) {
    if (!data || !data.settings.showHiddenBar || hidden === 0) {
      if (bar) { bar.remove(); bar = null; }
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "bf-bar";
      bar.innerHTML =
        '<span class="bf-bar-text"></span>' +
        '<button class="bf-bar-toggle" type="button">临时显示</button>';
      bar.querySelector(".bf-bar-toggle").addEventListener("click", () => {
        reveal = !reveal;
        document.body.classList.toggle("bf-reveal", reveal);
        bar.querySelector(".bf-bar-toggle").textContent = reveal ? "收起" : "临时显示";
      });
      document.body.appendChild(bar);
    }
    bar.querySelector(".bf-bar-text").textContent = "已本地处理 " + hidden + " 条（含蒙版/屏蔽）";
  }

  async function onFlag(bv, action, card) {
    if (!bv) return;
    const cur = data.flags[bv];
    let status;
    if (action === "like") status = cur && cur.status === "like" ? null : "like";
    else status = cur && cur.status === "dislike" ? null : "dislike";
    await Store.setFlag(bv, status, { title: card && card.title, up: card && card.up });

    // 取消「感兴趣」时，删除此前导出的 txt（按 bv -> downloadId 精确命中）
    if (status !== "like") {
      try {
        const dlId = await Store.getExport(bv);
        if (dlId != null) {
          try { await chrome.downloads.removeFile(dlId); } catch (e) {}
          await Store.clearExport(bv);
        }
      } catch (e) {}
    }

    data = await Store.load();
    pass();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bf]");
    if (!btn) return;
    const el = btn.closest(".bf-tracked");
    if (!el) return;
    const card = { bv: el.dataset.bv, title: el.dataset.bfTitle, up: el.dataset.bfUp };
    onFlag(el.dataset.bv, btn.dataset.bf, card);
  });

  // 弹出面板改动存储后，content 侧实时刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.bf_data) {
      chrome.storage.local.get("bf_data").then((r) => {
        data = r.bf_data || data;
        pass();
      });
    }
  });

  // 监听无限滚动 / SPA 路由变化
  const obs = new MutationObserver(() => schedulePass());
  function schedulePass() {
    clearTimeout(window.__bfTimer);
    window.__bfTimer = setTimeout(pass, 300);
  }
  obs.observe(document.documentElement, { childList: true, subtree: true });

  (async function init() {
    data = await Store.load();
    pass();
    setTimeout(pass, 1200); // 兜底：等晚加载内容
    setInterval(pass, 3000); // 周期性刷新（SPA 兜底）
  })();
})();
