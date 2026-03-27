(function () {
  var bodyEl = document.getElementById("changelog-body");
  var metaEl = document.getElementById("changelog-meta");
  var section = document.querySelector(".changelog");
  if (!bodyEl || !section) return;

  var cfgCache = null;
  var SKIP_RELEASE_RENDER = {};

  // Show a spinner immediately while we fetch release notes from GitHub.
  bodyEl.innerHTML =
    '<p class="changelog__loading">' +
    '<span class="loading-spinner" aria-hidden="true" style="margin-right:10px; vertical-align:middle;"></span>' +
    (location.pathname.indexOf("/en/") !== -1 ? "Loading…" : "Загрузка…") +
    "</p>";

  function dataBase() {
    return location.pathname.indexOf("/en/") !== -1 ? "../" : "";
  }

  function isEn() {
    return location.pathname.indexOf("/en/") !== -1;
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(isEn() ? "en-US" : "ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  function formatTextWithBold(t) {
    var out = "";
    var re = /\*\*([\s\S]+?)\*\*/g;
    var last = 0;
    var m;
    while ((m = re.exec(t)) !== null) {
      out += esc(t.slice(last, m.index));
      out += "<strong>" + esc(m[1]) + "</strong>";
      last = re.lastIndex;
    }
    out += esc(t.slice(last));
    return out;
  }

  function parseInline(raw) {
    var out = "";
    var i = 0;
    while (i < raw.length) {
      if (raw.charAt(i) !== "`") {
        var next = raw.indexOf("`", i);
        if (next === -1) {
          out += formatTextWithBold(raw.slice(i));
          break;
        }
        out += formatTextWithBold(raw.slice(i, next));
        i = next;
        continue;
      }
      var close = raw.indexOf("`", i + 1);
      if (close === -1) {
        out += formatTextWithBold(raw.slice(i));
        break;
      }
      out += "<code>" + esc(raw.slice(i + 1, close)) + "</code>";
      i = close + 1;
    }
    return out;
  }

  function mergeListContinuations(md) {
    var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (!t) {
        out.push(line);
        continue;
      }
      if (/^[-*]\s+/.test(t) || /^#{1,6}\s/.test(t) || /^---+$|^\*\*\*+$/.test(t)) {
        out.push(line);
        continue;
      }
      if (out.length === 0) {
        out.push(line);
        continue;
      }
      var prev = out[out.length - 1];
      var prevT = prev.trim();
      if (/^[-*]\s+/.test(prevT)) {
        out[out.length - 1] = prev + " " + t;
        continue;
      }
      out.push(line);
    }
    return out.join("\n");
  }

  function renderMarkdown(md) {
    var lines = mergeListContinuations(md).split("\n");
    var parts = [];
    var inUl = false;

    function closeUl() {
      if (inUl) {
        parts.push("</ul>");
        inUl = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) {
        closeUl();
        continue;
      }
      if (/^---+$|^\*\*\*+$/.test(trimmed)) {
        closeUl();
        parts.push('<hr class="changelog__hr" />');
        continue;
      }
      var hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        closeUl();
        var hashes = hMatch[1].length;
        var level = Math.min(5, Math.max(3, hashes + 2));
        var tag = "h" + level;
        parts.push("<" + tag + ">" + parseInline(hMatch[2]) + "</" + tag + ">");
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inUl) {
          parts.push('<ul class="changelog__list">');
          inUl = true;
        }
        parts.push("<li>" + parseInline(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      closeUl();
      parts.push("<p>" + parseInline(trimmed) + "</p>");
    }
    closeUl();
    return parts.join("");
  }

  function findMdLangBlock(text, lang) {
    var re = new RegExp("^\\s*#{1,6}\\s+" + lang + "\\b\\s*(?:\\r?\\n|$)", "im");
    var m = re.exec(text);
    if (!m) return null;
    return { afterHeader: m.index + m[0].length, headerPos: m.index };
  }

  function extractLocaleSection(md) {
    var text = String(md || "");
    var e = findMdLangBlock(text, "ENG");
    var r = findMdLangBlock(text, "RU");
    if (e && r) {
      if (e.headerPos < r.headerPos) {
        var engMd = text.slice(e.afterHeader, r.headerPos).trim();
        var ruMd = text.slice(r.afterHeader).trim();
        return (isEn() ? engMd : ruMd) || text.trim();
      }
      var ruMd2 = text.slice(r.afterHeader, e.headerPos).trim();
      var engMd2 = text.slice(e.afterHeader).trim();
      return (isEn() ? engMd2 : ruMd2) || text.trim();
    }

    var engMarker = /\*\*\s*ENG\s*\*\*/;
    var ruMarker = /\*\*\s*RU\s*\*\*/;
    var em = engMarker.exec(text);
    var rm = ruMarker.exec(text);
    if (!em || !rm) return text.trim();
    if (em.index < rm.index) {
      var engBody = text.slice(em.index + em[0].length, rm.index).trim();
      var ruBody = text.slice(rm.index + rm[0].length).trim();
      return (isEn() ? engBody : ruBody) || text.trim();
    }
    var ruBodyB = text.slice(rm.index + rm[0].length, em.index).trim();
    var engBodyB = text.slice(em.index + em[0].length).trim();
    return (isEn() ? engBodyB : ruBodyB) || text.trim();
  }

  function extractLocaleSectionForLang(md, lang) {
    var text = String(md || "");
    if (!lang) return text.trim();
    var e = findMdLangBlock(text, "ENG");
    var r = findMdLangBlock(text, "RU");

    // Header-based blocks: "## ENG" / "## RU"
    if (e && r) {
      if (lang === "ENG") {
        return (e.headerPos < r.headerPos ? text.slice(e.afterHeader, r.headerPos) : text.slice(e.afterHeader)).trim();
      }
      if (lang === "RU") {
        return (r.headerPos < e.headerPos ? text.slice(r.afterHeader, e.headerPos) : text.slice(r.afterHeader)).trim();
      }
    }
    if (lang === "ENG" && e) return text.slice(e.afterHeader).trim();
    if (lang === "RU" && r) return text.slice(r.afterHeader).trim();

    // Marker-based blocks: "**ENG**" / "**RU**"
    var engMarker = /\*\*\s*ENG\s*\*\*/;
    var ruMarker = /\*\*\s*RU\s*\*\*/;
    var em = engMarker.exec(text);
    var rm = ruMarker.exec(text);
    if (em && rm) {
      if (em.index < rm.index) {
        return lang === "ENG"
          ? text.slice(em.index + em[0].length, rm.index).trim()
          : text.slice(rm.index + rm[0].length).trim();
      }
      return lang === "ENG"
        ? text.slice(em.index + em[0].length).trim()
        : text.slice(rm.index + rm[0].length, em.index).trim();
    }

    return text.trim();
  }

  function hideSection() {
    section.hidden = true;
  }

  function showError(msg) {
    bodyEl.innerHTML = '<p class="changelog__fallback">' + esc(msg) + "</p>";
    if (metaEl) metaEl.textContent = "";
  }

  function githubReleaseHeaders() {
    return { Accept: "application/vnd.github+json" };
  }

  function changelogApiRepo(cfg) {
    var o = cfg.changelogOwner;
    var r = cfg.changelogRepo;
    if (o != null && String(o).trim() !== "" && r != null && String(r).trim() !== "") {
      return { owner: String(o).trim(), repo: String(r).trim() };
    }
    o = cfg.downloadOwner;
    r = cfg.downloadRepo;
    if (o != null && String(o).trim() !== "" && r != null && String(r).trim() !== "") {
      return { owner: String(o).trim(), repo: String(r).trim() };
    }
    return { owner: cfg.owner, repo: cfg.repo };
  }

  function fetchRelease(cfg) {
    var pair = changelogApiRepo(cfg);
    var base =
      "https://api.github.com/repos/" +
      encodeURIComponent(pair.owner) +
      "/" +
      encodeURIComponent(pair.repo) +
      "/releases";
    return fetch(base + "/latest", {
      headers: githubReleaseHeaders(),
      cache: "no-store",
    }).then(function (r) {
      if (r.status === 403) throw new Error("rate");
      if (r.ok) return r.json();
      if (r.status === 404) {
        return fetch(base + "?per_page=1", {
          headers: githubReleaseHeaders(),
          cache: "no-store",
        }).then(function (r2) {
          if (r2.status === 403) throw new Error("rate");
          if (!r2.ok) throw new Error("release");
          return r2.json().then(function (arr) {
            if (!Array.isArray(arr) || arr.length === 0) return null;
            return arr[0];
          });
        });
      }
      throw new Error("release");
    });
  }

  function cacheKeyForPair(pair) {
    if (!pair || !pair.owner || !pair.repo) return "";
    return "wikiChangelogReleaseV1:" + String(pair.owner) + "/" + String(pair.repo);
  }

  function loadCachedRelease(pair) {
    var key = cacheKeyForPair(pair);
    if (!key) return null;
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.release) return null;
      var ttlMs = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - obj.ts > ttlMs) return null;
      return obj.release;
    } catch (e) {
      return null;
    }
  }

  function saveCachedRelease(pair, release) {
    var key = cacheKeyForPair(pair);
    if (!key || !release) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), release: release }));
    } catch (e) {}
  }

  function showNoReleasesYet() {
    showError(
      isEn()
        ? "This repository has no releases yet. When you publish a release, its notes will appear here."
        : "В этом репозитории пока нет релизов. После публикации релиза описание появится здесь."
    );
    var fallback =
      (cfgCache && cfgCache.releasesPageUrl) ||
      section.getAttribute("data-releases-fallback");
    if (metaEl && fallback) {
      var a =
        '<a href="' +
        esc(fallback) +
        '" rel="noopener noreferrer">' +
        esc(isEn() ? "Releases" : "Релизы") +
        "</a>";
      metaEl.innerHTML = isEn() ? "See " + a + "." : "Смотрите " + a + ".";
    }
  }

  fetch(dataBase() + "data/github-release.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("cfg");
      return r.json();
    })
    .then(function (cfg) {
      cfgCache = cfg;
      if (cfg.changelogEnabled === false) {
        hideSection();
        return SKIP_RELEASE_RENDER;
      }
      if (cfg.useGithubApi === false) {
        showError(
          isEn()
            ? "Changelog is only available when loading from GitHub Releases."
            : "Список изменений доступен только при загрузке с GitHub Releases."
        );
        return SKIP_RELEASE_RENDER;
      }
      var pair = changelogApiRepo(cfg);
      var cached = loadCachedRelease(pair);
      if (cached) return cached;
      return fetchRelease(cfg).then(function (release) {
        saveCachedRelease(pair, release);
        return release;
      });
    })
    .then(function (release) {
      if (release === SKIP_RELEASE_RENDER) return;
      if (release === null || release === undefined) {
        showNoReleasesYet();
        return;
      }
      var published = fmtDate(release.published_at);
      var pageUrl = release.html_url || "";
      var tag = release.tag_name || "";

      if (metaEl) {
        var bits = [];
        if (tag) bits.push(tag);
        if (published) bits.push(published);
        var metaText = bits.join(" · ");
        if (pageUrl) {
          var linkLabel = isEn() ? "Open on GitHub" : "Открыть на GitHub";
          metaEl.innerHTML =
            esc(metaText) +
            (metaText ? " · " : "") +
            '<a href="' +
            esc(pageUrl) +
            '" rel="noopener noreferrer">' +
            esc(linkLabel) +
            "</a>";
        } else {
          metaEl.textContent = metaText;
        }
      }

      var rawBody = release.body || "";

      // On Downloads page we want the full changelog (both RU and EN parts).
      var showAll = section.getAttribute("data-changelog-show-all") === "true";
      var slice;
      var sliceIsHtml = false;
      if (showAll) {
        var sliceRu = extractLocaleSectionForLang(rawBody, "RU");
        var sliceEn = extractLocaleSectionForLang(rawBody, "ENG");

        var ruHtml = sliceRu && sliceRu.trim() ? renderMarkdown(sliceRu) : "";
        var enHtml = sliceEn && sliceEn.trim() ? renderMarkdown(sliceEn) : "";

        // Render as two separate blocks: RU then EN.
        slice = "";
        if (ruHtml) slice += '<h3 class="changelog__ru-title">RU</h3>' + ruHtml;
        if (enHtml) slice += '<h3 class="changelog__en-title">EN</h3>' + enHtml;

        if (!slice.trim()) slice = String(rawBody).trim();
        sliceIsHtml = true;
      } else {
        slice = extractLocaleSection(rawBody);
        slice = slice
          .replace(
            new RegExp("^\\s*#{1,6}\\s+" + (isEn() ? "ENG" : "RU") + "\\b\\s*(?:\\r?\\n|$)"),
            ""
          )
          .trim();
      }
      if (!slice.trim()) {
        showError(
          isEn()
            ? "No release notes for this version."
            : "Для этой версии нет описания в релизе."
        );
        return;
      }
      bodyEl.innerHTML = sliceIsHtml ? slice : renderMarkdown(slice);
    })
    .catch(function () {
      if (section.hidden) return;
      showError(
        isEn()
          ? "Could not load the changelog. See releases on GitHub."
          : "Не удалось загрузить список изменений. Смотрите релизы на GitHub."
      );
      var fallback =
        (cfgCache && cfgCache.releasesPageUrl) ||
        section.getAttribute("data-releases-fallback");
      if (metaEl && fallback) {
        var a =
          '<a href="' +
          esc(fallback) +
          '" rel="noopener noreferrer">' +
          esc(isEn() ? "Releases" : "Релизы") +
          "</a>";
        metaEl.innerHTML = isEn() ? "See " + a + "." : "Смотрите " + a + ".";
      }
    });
})();
