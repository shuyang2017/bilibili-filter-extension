// 后台 Service Worker：只读拉取「感兴趣」视频的字幕/台词（不写任何反馈，不进推荐算法）。
(function () {
  "use strict";

  const HEADERS = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Referer: "https://www.bilibili.com/"
  };

  async function fetchText(url) {
    const res = await fetch(url, { headers: HEADERS, credentials: "omit" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  }

  function pickSubtitle(list) {
    if (!list || !list.length) return null;
    const ai = list.find((s) => (s.lan || "").indexOf("ai") === 0);
    const zh = list.find(
      (s) =>
        s.lan === "zh-CN" ||
        s.lan === "zh" ||
        s.lan_doc === "中文（简体）" ||
        s.lan_doc === "中文"
    );
    return ai || zh || list[0];
  }

  async function getTranscript(subtitleUrl) {
    if (!subtitleUrl) return "";
    const url = subtitleUrl.startsWith("//") ? "https:" + subtitleUrl : subtitleUrl;
    const txt = await fetchText(url);
    const json = JSON.parse(txt);
    const body = json.body || [];
    return body
      .map((b) => (b.content || "").trim())
      .filter((c) => c.length)
      .join("\n");
  }

  // 主路径：view 接口
  async function fromViewApi(bvid) {
    const txt = await fetchText(
      "https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid)
    );
    const json = JSON.parse(txt);
    if (json.code !== 0 || !json.data) throw new Error("view api code " + json.code);
    const d = json.data;
    const list = (d.subtitle && d.subtitle.list) || [];
    const sub = pickSubtitle(list);
    const text = (sub && (await getTranscript(sub.subtitle_url))) || d.desc || "";
    return {
      title: d.title || bvid,
      up: (d.owner && d.owner.name) || "",
      pubdate: d.pubdate || 0,
      text: text,
      source: sub ? "subtitle" : "desc"
    };
  }

  // 回退路径：抓视频页 HTML，解析 __INITIAL_STATE__.videoData
  async function fromHtml(bvid) {
    const html = await fetchText("https://www.bilibili.com/video/" + encodeURIComponent(bvid));
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*\(function/);
    if (!m) throw new Error("INITIAL_STATE not found");
    const state = JSON.parse(m[1]);
    const v = state.videoData || {};
    const list = (v.subtitle && v.subtitle.list) || [];
    const sub = pickSubtitle(list);
    const text = (sub && (await getTranscript(sub.subtitle_url))) || v.desc || "";
    return {
      title: v.title || bvid,
      up: (v.owner && v.owner.name) || "",
      pubdate: v.pubdate || 0,
      text: text,
      source: sub ? "subtitle" : "desc"
    };
  }

  async function getVideoText(bvid) {
    try {
      return await fromViewApi(bvid);
    } catch (e) {
      // 接口被拦（如 wbi）时回退页面解析
      return await fromHtml(bvid);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "getVideoText") {
      getVideoText(msg.bvid)
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ error: String(e && e.message ? e.message : e) }));
      return true; // 异步响应
    }
  });
})();
