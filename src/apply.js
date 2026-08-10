// 过滤逻辑：根据 flags / rules / settings 对卡片应用隐藏或高亮。
(function () {
  "use strict";

  const Apply = {
    matchesRule(card, rules) {
      if (!rules) return false;
      const up = card.up || "";
      const mid = card.mid || "";
      const title = card.title || "";
      const tid = card.tid || "";
      for (const u of rules.ups || []) {
        if (u.startsWith("mid:")) {
          if (mid && mid === u.slice(4)) return true;
        } else if (up && up.includes(u)) {
          return true;
        }
      }
      for (const t of rules.tids || []) {
        if ((tid && tid === t) || (title && title.includes(t))) return true;
      }
      for (const k of rules.keywords || []) {
        if (title && title.includes(k)) return true;
      }
      return false;
    },

    classify(card, data) {
      const s = data.settings || {};
      const f = data.flags && card.bv ? data.flags[card.bv] : null;
      if (f && f.status === "dislike" && s.hideDisliked) return "mask-dislike";
      if (this.matchesRule(card, data.rules)) return "hide-rule";
      if (s.hideAds && card.isAd) return "mask-ad";
      if (s.hidePromoted && card.isPromoted) return "mask-promoted";
      if (f && f.status === "like") return s.highlightLiked ? "like" : "like-nohighlight";
      return "show";
    },

    apply(card, data) {
      const action = this.classify(card, data);
      const el = card.el;
      el.classList.remove("bf-hidden", "bf-hidden-rule", "bf-hidden-ad", "bf-hidden-promoted", "bf-masked", "bf-liked");
      delete el.dataset.bfReason;
      switch (action) {
        case "mask-dislike":
        case "mask-ad":
        case "mask-promoted":
          el.classList.add("bf-masked");
          el.dataset.bfReason = action.slice(5); // dislike / ad / promoted
          break;
        case "hide-rule":
          el.classList.add("bf-hidden", "bf-hidden-rule");
          el.dataset.bfReason = "rule";
          break;
        case "like":
          el.classList.add("bf-liked");
          break;
      }
      const likeBtn = el.querySelector(".bf-like");
      const disBtn = el.querySelector(".bf-dis");
      const f = data.flags && card.bv ? data.flags[card.bv] : null;
      if (likeBtn) likeBtn.classList.toggle("act-like", !!(f && f.status === "like"));
      if (disBtn) disBtn.classList.toggle("act-dis", !!(f && f.status === "dislike"));
      return action;
    }
  };

  window.BFApply = Apply;
})();
