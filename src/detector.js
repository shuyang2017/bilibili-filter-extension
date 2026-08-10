// 卡片识别：从 B站不同页面结构中抽取视频信息。
// 输出统一对象 { el, bv, title, up, mid, tid, isAd, isPromoted }
(function () {
  "use strict";

  function extractBV(href) {
    if (!href) return null;
    let m = href.match(/\/video\/(BV[0-9A-Za-z]+)/i);
    if (m) return m[1];
    m = href.match(/[?&]bvid=(BV[0-9A-Za-z]+)/i);
    if (m) return m[1];
    return null;
  }

  // 精确匹配独立标签文本（降低标题误伤），否则回退到整卡文本包含
  function hasBadge(el, label) {
    const exact = Array.from(el.querySelectorAll("*")).some(
      (n) => n.children.length === 0 && (n.textContent || "").trim() === label
    );
    if (exact) return true;
    return (el.textContent || "").includes(label);
  }

  // 创作推广的可靠标记：缩略图右下角的"火箭"图标（基于真实 B站 DOM 确认）
  // 真实结构：.bili-video-card__stats 内、且不在 .bili-video-card__stats--left 里的 svg，
  // 其 path d 以 "M16.9122" 开头（火箭形状）。普通视频 stats 里只有 stats--left 的播放/弹幕图标，不会误判。
  function hasRocketIcon(el) {
    const stats = el.querySelector(".bili-video-card__stats");
    if (!stats) return false;
    const svgs = Array.from(stats.querySelectorAll("svg"));
    return svgs.some((s) => {
      if (s.closest(".bili-video-card__stats--left")) return false; // 排除播放量/弹幕图标
      const cls = s.getAttribute("class") || "";
      if (/rocket|promote|promo|badge|ad-/i.test(cls)) return true; // class 关键词命中
      const path = s.querySelector("path");
      const d = (path && path.getAttribute("d")) || "";
      if (d.indexOf("M16.9122") === 0) return true; // 火箭 path 指纹
      return false;
    });
  }

  function tidFromContext() {
    try {
      const u = new URL(location.href);
      const t = u.searchParams.get("tid");
      if (t) return t;
      const m = u.pathname.match(/\/v\/(?:[^/]+\/)?(\d+)/);
      if (m) return m[1];
    } catch (e) {}
    return "";
  }

  const pageTid = tidFromContext();

  function fromVideoCard(el) {
    const link = el.querySelector('a[href*="/video/"]');
    const bv = extractBV(link && link.href);
    const titleEl =
      el.querySelector(".bili-video-card__info--tit") ||
      el.querySelector(".bili-video-card__info--right .title");
    const title = (
      (titleEl && (titleEl.textContent || titleEl.getAttribute("title"))) ||
      (link && link.getAttribute("title")) ||
      ""
    ).trim() || "未知标题";
    const ownerEl =
      el.querySelector(".bili-video-card__info--owner") ||
      el.querySelector(".up-name");
    const up = ownerEl ? ownerEl.textContent.trim() : "";
    let mid = "";
    const ownerLink = el.querySelector('a[href*="/space/"]');
    if (ownerLink) {
      const mm = (ownerLink.href || "").match(/\/space\/(\d+)/);
      if (mm) mid = mm[1];
    }
    return { el, bv, title, up, mid, tid: pageTid, isAd: hasBadge(el, "广告"), isPromoted: hasBadge(el, "创作推广") || hasRocketIcon(el) };
  }

  function fromDynVideo(el) {
    const card = el.closest(".bili-dyn-card") || el;
    const link = el.querySelector('a[href*="/video/"]');
    const bv = extractBV(link && link.href);
    const titleEl =
      el.querySelector(".bili-dyn-card-video__title") ||
      el.querySelector(".bili-dyn-card-video__info");
    const title = (
      (titleEl && titleEl.textContent) ||
      (link && link.getAttribute("title")) ||
      ""
    ).trim() || "动态视频";
    const nameEl =
      (card && card.querySelector(".bili-dyn-card__name")) ||
      el.querySelector(".bili-dyn-card-video__info");
    const up = nameEl ? nameEl.textContent.trim() : "";
    let mid = "";
    const sp = card && card.querySelector('a[href*="/space/"]');
    if (sp) {
      const mm = (sp.href || "").match(/\/space\/(\d+)/);
      if (mm) mid = mm[1];
    }
    return { el: card, bv, title, up, mid, tid: "", isAd: hasBadge(card, "广告"), isPromoted: hasBadge(card, "创作推广") || hasRocketIcon(card) };
  }

  const Detect = {
    // 实时重新判定广告 / 创作推广（不靠首次扫描的快照，避免 B站延迟渲染标签导致漏判）
    badges(el) {
      return {
        isAd: hasBadge(el, "广告"),
        isPromoted: hasBadge(el, "创作推广") || hasRocketIcon(el)
      };
    },

    // 找出尚未标记的"新"卡片
    scan() {
      const cards = [];
      document.querySelectorAll(".bili-video-card").forEach((el) => {
        if (el.dataset.bfTracked) return;
        cards.push(fromVideoCard(el));
      });
      document.querySelectorAll(".bili-dyn-card-video").forEach((el) => {
        const card = el.closest(".bili-dyn-card") || el;
        if (card.dataset.bfTracked) return;
        cards.push(fromDynVideo(el));
      });
      return cards;
    },

    // 返回所有已标记卡片（供重新应用过滤）；广告/创作推广每次实时重判
    all() {
      const out = [];
      document.querySelectorAll(".bf-tracked").forEach((el) => {
        const b = this.badges(el);
        out.push({
          el: el,
          bv: el.dataset.bv || null,
          title: el.dataset.bfTitle || "",
          up: el.dataset.bfUp || "",
          mid: el.dataset.bfMid || "",
          tid: el.dataset.bfTid || "",
          isAd: b.isAd,
          isPromoted: b.isPromoted
        });
      });
      return out;
    }
  };

  window.BFDetect = Detect;
})();
