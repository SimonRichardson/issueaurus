(() => {
  const DATA = window.ISSUES_DATA;
  if (!DATA) {
    document.body.innerHTML =
      '<p class="error">data/data.js is missing — run: python3 scripts/fetch_issues.py</p>';
    return;
  }

  const ISSUES = DATA.issues;
  const STORAGE_KEY = "issueaurus-filters";

  const els = {
    search: document.getElementById("search"),
    kind: document.getElementById("kind"),
    area: document.getElementById("area"),
    version: document.getElementById("version"),
    versionField: document.getElementById("version-field"),
    versionMenu: document.getElementById("version-menu"),
    triage: document.getElementById("triage"),
    staleness: document.getElementById("staleness"),
    stalenessField: document.getElementById("staleness-field"),
    stalenessMenu: document.getElementById("staleness-menu"),
    sort: document.getElementById("sort"),
    dups: document.getElementById("dups"),
    reset: document.getElementById("reset"),
    count: document.getElementById("count"),
    tbody: document.getElementById("tbody"),
    pairs: document.getElementById("view-duplicates"),
    pairsCount: document.getElementById("pairs-count"),
    pairsList: document.getElementById("pairs-list"),
    tabIssues: document.getElementById("tab-issues"),
    tabDups: document.getElementById("tab-duplicates"),
    tabIssuesCount: document.getElementById("tab-issues-count"),
    tabDupsCount: document.getElementById("tab-dups-count"),
    tabAssessment: document.getElementById("tab-assessment"),
    tabAssessmentCount: document.getElementById("tab-assessment-count"),
    assessSearch: document.getElementById("assess-search"),
    assessVerdict: document.getElementById("assess-verdict"),
    assessReset: document.getElementById("assess-reset"),
    assessCount: document.getElementById("assess-count"),
    assessTbody: document.getElementById("assess-tbody"),
    assessMeta: document.getElementById("assessment-meta"),
    assessCheckout: document.getElementById("assess-checkout"),
    snapshot: document.getElementById("snapshot"),
    repoLink: document.getElementById("repo-link"),
    total: document.getElementById("total"),
  };

  const SORTS = {
    "number-desc": (a, b) => b.number - a.number,
    "number-asc": (a, b) => a.number - b.number,
    "created-asc": (a, b) => a.created.localeCompare(b.created) || a.number - b.number,
    "created-desc": (a, b) => b.created.localeCompare(a.created) || a.number - a.number,
    "updated-desc": (a, b) => b.updated.localeCompare(a.updated) || a.number - b.number,
    "comments-desc": (a, b) => b.comments - a.comments || b.number - a.number,
  };

  const SORT_LABELS = [
    ["number-desc", "newest issue"],
    ["number-asc", "oldest issue"],
    ["created-asc", "oldest created"],
    ["created-desc", "newest created"],
    ["updated-desc", "recently updated"],
    ["comments-desc", "most comments"],
  ];

  const TRIAGE_OPTIONS = [
    ["triaged", "triaged"],
    ["untriaged", "needs-triage"],
  ];

  const STALENESS_ORDER = ["fresh", "in-progress", "unassigned-stale", "assigned-stale"];
  const STALENESS_LABELS = {
    "fresh": "fresh",
    "in-progress": "in progress",
    "unassigned-stale": "stale · unassigned",
    "assigned-stale": "stale · assigned",
  };
  const STALENESS_DOT = {
    "fresh": "green",
    "in-progress": "green",
    "unassigned-stale": "red",
    "assigned-stale": "yellow",
  };

  const state = { q: "", kind: "", area: "", versions: [], triage: "", staleness: [],
                  sort: "number-desc", dupsOnly: false, assessQ: "", assessVerdict: "" };
  let activeTab = "issues";

  function parseHash() {
    const raw = (location.hash || "").replace(/^#/, "");
    const [tab, query] = raw.split("?");
    return { tab: tab || "issues", params: new URLSearchParams(query || "") };
  }

  function encodeState() {
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.kind) params.set("kind", state.kind);
    if (state.area) params.set("area", state.area);
    if (state.versions.length) params.set("branch", state.versions.join(","));
    if (state.triage) params.set("triage", state.triage);
    if (state.staleness.length) params.set("stale", state.staleness.join(","));
    if (state.sort && state.sort !== "number-desc") params.set("sort", state.sort);
    if (state.dupsOnly) params.set("dups", "1");
    return params.toString();
  }

  function applyUrlState(params) {
    if (![...params.keys()].length) return;
    state.q = params.get("q") || "";
    state.kind = params.get("kind") || "";
    state.area = params.get("area") || "";
    const branch = params.get("branch");
    state.versions = branch ? branch.split(",") : [];
    const stale = params.get("stale");
    state.staleness = stale ? stale.split(",") : [];
    state.triage = params.get("triage") || "";
    const sort = params.get("sort");
    state.sort = SORTS[sort] ? sort : "number-desc";
    state.dupsOnly = params.get("dups") === "1";
  }

  function updateUrl() {
    const query = encodeState();
    history.replaceState(null, "", `#${activeTab}${query ? "?" + query : ""}`);
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (saved.version) saved.versions = [saved.version];  // migrate old single-select
      delete saved.version;
      if (!Array.isArray(saved.versions)) saved.versions = [];
      if (typeof saved.staleness === "string") {  // migrate old single-select
        saved.staleness = saved.staleness ? [saved.staleness] : [];
      }
      if (!Array.isArray(saved.staleness)) saved.staleness = [];
      Object.assign(state, saved);
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function tally(fn) {
    const counts = new Map();
    for (const issue of ISSUES) {
      for (const value of fn(issue)) {
        if (value !== undefined && value !== "") counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    return counts;
  }

  function fillSelect(sel, placeholder, entries) {
    sel.innerHTML = "";
    if (placeholder !== null) {
      const all = document.createElement("option");
      all.value = "";
      all.textContent = placeholder;
      sel.appendChild(all);
    }
    for (const [value, label] of entries) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      sel.appendChild(opt);
    }
  }

  function versionSort(a, b) {
    const score = v => v === "main" ? 999 : parseFloat(v) * 10 + (v.includes("/") ? 1 : 0);
    return score(a) - score(b);
  }

  const MULTI_SELECTS = [];

  function syncMulti(inst) {
    inst.trigger.textContent = inst.summarize(state[inst.stateKey]);
    for (const item of inst.menu.children) {
      const input = item.children[0];
      if (input) input.checked = state[inst.stateKey].includes(input.value);
    }
  }

  function multiOpen(inst, open) {
    inst.menu.hidden = !open;
    inst.trigger.setAttribute("aria-expanded", String(open));
  }

  function makeMultiSelect(cfg) {
    cfg.menu.innerHTML = "";
    for (const item of cfg.items) {
      const label = document.createElement("label");
      label.className = "multi-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.value;
      input.addEventListener("change", () => {
        const chosen = new Set(state[cfg.stateKey]);
        input.checked ? chosen.add(item.value) : chosen.delete(item.value);
        state[cfg.stateKey] = cfg.items.map(i => i.value).filter(v => chosen.has(v));
        syncMulti(cfg);
        render();
        saveState();
      });
      label.appendChild(input);
      const text = document.createElement("span");
      text.textContent = item.label;
      label.appendChild(text);
      cfg.menu.appendChild(label);
    }
    MULTI_SELECTS.push(cfg);
    syncMulti(cfg);
  }

  function wireMultiSelects() {
    for (const inst of MULTI_SELECTS) {
      inst.trigger.addEventListener("click", () => {
        const willOpen = inst.menu.hidden;
        for (const other of MULTI_SELECTS) if (other !== inst) multiOpen(other, false);
        multiOpen(inst, willOpen);
      });
      inst.menu.addEventListener("keydown", e => {
        if (e.key === "Escape") { multiOpen(inst, false); inst.trigger.focus(); }
      });
    }
    document.addEventListener("click", e => {
      for (const inst of MULTI_SELECTS) {
        if (!inst.field.contains(e.target)) multiOpen(inst, false);
      }
    });
  }

  function buildControls() {
    const kinds = tally(i => (i.kind && i.kind !== "-" ? [i.kind] : []));
    fillSelect(els.kind, "all kinds",
      [...kinds.keys()].sort().map(k => [k, `${k} (${kinds.get(k)})`]));

    const areas = tally(i => [i.area]);
    const areaOrder = [...areas.keys()].sort((a, b) =>
      areas.get(b) - areas.get(a) || a.localeCompare(b));
    fillSelect(els.area, "all areas",
      areaOrder.map(a => [a, `${a} (${areas.get(a)})`]));

    const versions = tally(i => i.versions);
    makeMultiSelect({
      field: els.versionField,
      trigger: els.version,
      menu: els.versionMenu,
      stateKey: "versions",
      items: [...versions.keys()].sort(versionSort)
        .map(v => ({ value: v, label: `${v} (${versions.get(v)})` })),
      summarize: vals => {
        if (!vals.length) return "all branches";
        const label = vals.slice().sort(versionSort).join(", ");
        return label.length > 18 ? `${vals.length} branches` : label;
      },
    });

    fillSelect(els.triage, "all", TRIAGE_OPTIONS);

    const staleness = tally(i => [i.staleness]);
    makeMultiSelect({
      field: els.stalenessField,
      trigger: els.staleness,
      menu: els.stalenessMenu,
      stateKey: "staleness",
      items: STALENESS_ORDER.filter(v => staleness.has(v))
        .map(v => ({ value: v, label: `${STALENESS_LABELS[v]} (${staleness.get(v)})` })),
      summarize: vals => !vals.length ? "all states"
        : vals.length === 1 ? STALENESS_LABELS[vals[0]]
        : `${vals.length} selected`,
    });
    fillSelect(els.sort, null, SORT_LABELS);
  }

  function matches(issue) {
    if (state.kind && issue.kind !== state.kind) return false;
    if (state.area && issue.area !== state.area) return false;
    if (state.versions.length && !issue.versions.some(v => state.versions.includes(v))) return false;
    if (state.triage === "triaged" && !issue.triaged) return false;
    if (state.triage === "untriaged" && issue.triaged) return false;
    if (state.staleness.length && !state.staleness.includes(issue.staleness)) return false;
    if (state.dupsOnly && !(issue.duplicates && issue.duplicates.length)) return false;
    if (state.q) {
      const hay = (issue.title + "\n" + issue.body + "\n" + issue.labels.join(" ")).toLowerCase();
      const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every(t => hay.includes(t))) return false;
    }
    return true;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function linkify(text) {
    const gh = `https://github.com/${DATA.repo}`;
    return esc(text).replace(
      /(PR\s+#(\d+))|(pr\/(\d+))|(\b[0-9a-f]{7,40}\b)|((?<!&)#(\d+))/g,
      (m, prRef, prNum, prBranch, prBranchNum, sha, issueRef, issueNum) => {
        if (prRef) return `<a href="${gh}/pull/${prNum}" target="_blank" rel="noopener">PR #${prNum}</a>`;
        if (prBranch) return `<a href="${gh}/pull/${prBranchNum}" target="_blank" rel="noopener">pr/${prBranchNum}</a>`;
        if (sha) return `<a href="${gh}/commit/${sha}" target="_blank" rel="noopener">${sha}</a>`;
        return `<a href="${gh}/issues/${issueNum}" target="_blank" rel="noopener">#${issueNum}</a>`;
      });
  }

  function kindBadge(issue) {
    return issue.kind && issue.kind !== "-"
      ? `<span class="badge kind-${esc(issue.kind)}">${esc(issue.kind)}</span>` : "";
  }

  function versionBadges(issue) {
    return (issue.versions || []).map(v => `<span class="badge ver">${esc(v)}</span>`).join(" ");
  }

  function labelChips(issue) {
    return (issue.labels || [])
      .filter(l => l !== "triaged" && l !== "needs-triage" && !l.startsWith("kind/"))
      .map(l => `<span class="chip">${esc(l)}</span>`).join(" ");
  }

  function pairSide(issue, href) {
    return `<div class="pair-side">
      <div class="pair-head">
        <a href="${esc(href)}" target="_blank" rel="noopener">#${issue.number}</a>
        <span class="pair-title">${esc(issue.title)}</span>
      </div>
      <div class="pair-meta">
        ${kindBadge(issue)}
        <span class="pair-area">${esc(issue.area)}</span>
        ${versionBadges(issue)}
      </div>
      <div class="pair-labels">${labelChips(issue)}</div>
    </div>`;
  }

  function render() {
    const rows = ISSUES.filter(matches).sort(SORTS[state.sort] || SORTS["number-desc"]);
    els.count.textContent = `Showing ${rows.length} of ${ISSUES.length} issues`;
    if (!rows.length) {
      els.tbody.innerHTML =
        '<tr><td colspan="12" class="empty">No issues match the current filters.</td></tr>';
      saveState();
      updateUrl();
      return;
    }
    const html = rows.map(r => {
      const kind = kindBadge(r);
      const versions = versionBadges(r);
      const labels = labelChips(r);
      const dups = (r.duplicates || []).map(d => {
        const curated = d.source === "curated";
        const conf = curated ? 5 : (d.confidence || 1);
        const tip = `${d.title} — confidence ${conf}/5` +
          (curated ? " (curated)" : ` (similarity ${d.score})`);
        return `<a class="dup-chip conf-${conf}${curated ? " curated" : ""}" ` +
          `href="https://github.com/${DATA.repo}/issues/${d.number}" ` +
          `target="_blank" rel="noopener" title="${esc(tip)}">${conf}/5 #${d.number}</a>`;
      }).join(" ");
      const dot = r.triaged ? "triaged" : "untriaged";
      const tri = `<span class="dot ${dot}"></span>${r.triaged ? "triaged" : "needs-triage"}`;
      const stale = r.staleness
        ? `<span class="dot ${STALENESS_DOT[r.staleness] || "green"}" ` +
          `title="${r.assignees.length ? "assigned to " + esc(r.assignees.join(", ")) : "unassigned"} · ${r.days_idle} days idle"></span>` +
          `<span class="stale-text stale-${esc(r.staleness)}">${esc(STALENESS_LABELS[r.staleness] || r.staleness)}</span> ` +
          `<span class="idle">${r.days_idle}d</span>`
        : "";
      const excerpt = esc(r.body.slice(0, 200).replace(/\s+/g, " "));
      return `<tr>
        <td class="num"><a href="${esc(r.url)}" target="_blank" rel="noopener">${r.number}</a></td>
        <td class="title"><a href="${esc(r.url)}" target="_blank" rel="noopener" title="${excerpt}">${esc(r.title)}</a></td>
        <td>${kind}</td>
        <td class="area">${esc(r.area)}</td>
        <td>${versions}</td>
        <td class="labels">${labels}</td>
        <td class="dups">${dups}</td>
        <td>${tri}</td>
        <td class="staleness">${stale}</td>
        <td class="date">${esc(r.created)}</td>
        <td class="date">${esc(r.updated)}</td>
        <td class="num">${r.comments || ""}</td>
      </tr>`;
    }).join("");
    els.tbody.innerHTML = html;
    saveState();
    updateUrl();
  }

  function renderPairs() {
    const byNumber = new Map(ISSUES.map(i => [i.number, i]));
    const seen = new Set();
    const pairs = [];
    for (const issue of ISSUES) {
      for (const d of (issue.duplicates || [])) {
        const key = Math.min(issue.number, d.number) + ":" + Math.max(issue.number, d.number);
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a: issue, b: d });
      }
    }
    pairs.sort((x, y) => {
      const cx = x.b.source === "curated" ? 0 : 1, cy = y.b.source === "curated" ? 0 : 1;
      if (cx !== cy) return cx - cy;
      const confx = x.b.confidence || 1, confy = y.b.confidence || 1;
      if (confx !== confy) return confy - confx;
      return (y.b.score || 0) - (x.b.score || 0) || x.a.number - y.a.number;
    });
    els.tabDupsCount.textContent = pairs.length;
    els.pairsCount.textContent = `(${pairs.length})`;
    els.pairsList.innerHTML = pairs.length ? pairs.map(p => {
      const curated = p.b.source === "curated";
      const conf = curated ? 5 : (p.b.confidence || 1);
      const tip = curated ? "confirmed duplicate (curated)" : `title similarity ${p.b.score}`;
      const bFull = byNumber.get(p.b.number) || p.b;
      return `<div class="pair">
        ${pairSide(p.a, p.a.url)}
        <div class="pair-mid">
          <span class="pair-score conf-${conf}" title="${esc(tip)}">${conf}/5</span>
          ${curated ? '<span class="pair-src">curated</span>' : ""}
        </div>
        ${pairSide(bFull, `https://github.com/${DATA.repo}/issues/${p.b.number}`)}
      </div>`;
    }).join("") : '<p class="pairs-empty">No duplicate pairs found in this dataset.</p>';
  }

  const VERDICT_ORDER = { "likely-resolved": 0, "likely-not-resolved": 1, "unclear": 2 };
  const VERDICT_LABELS = {
    "likely-resolved": "likely resolved",
    "likely-not-resolved": "likely not resolved",
    "unclear": "unclear",
  };

  function renderAssessment() {
    const assessed = ISSUES.filter(i => i.resolution);
    els.tabAssessmentCount.textContent = assessed.length;
    const first = assessed[0];
    if (first) {
      const r = first.resolution;
      els.assessMeta.textContent = `(${assessed.length} · ${r.assessed_at})`;
      els.assessCheckout.innerHTML =
        `<a href="https://github.com/${DATA.repo}/commit/${esc(r.checkout)}" ` +
        `target="_blank" rel="noopener">${esc(r.checkout)}</a>`;
    } else {
      els.assessMeta.textContent = "";
    }
    const verdicts = new Map();
    for (const i of assessed) verdicts.set(i.resolution.verdict, (verdicts.get(i.resolution.verdict) || 0) + 1);
    fillSelect(els.assessVerdict, "all verdicts",
      Object.keys(VERDICT_ORDER).sort((a, b) => VERDICT_ORDER[a] - VERDICT_ORDER[b])
        .map(v => [v, `${VERDICT_LABELS[v]} (${verdicts.get(v) || 0})`]));

    const q = state.assessQ.toLowerCase();
    const rows = assessed.filter(i => {
      if (state.assessVerdict && i.resolution.verdict !== state.assessVerdict) return false;
      if (q) {
        const hay = (i.title + "\n" + i.resolution.evidence + "\n" + i.area).toLowerCase();
        if (!q.split(/\s+/).filter(Boolean).every(t => hay.includes(t))) return false;
      }
      return true;
    }).sort((a, b) => {
      const va = VERDICT_ORDER[a.resolution.verdict] ?? 9;
      const vb = VERDICT_ORDER[b.resolution.verdict] ?? 9;
      if (va !== vb) return va - vb;
      return b.number - a.number;
    });

    els.assessCount.textContent = `Showing ${rows.length} of ${assessed.length} assessed issues`;
    els.assessTbody.innerHTML = rows.length ? rows.map(r => {
      const v = r.resolution.verdict;
      const versions = versionBadges(r);
      return `<tr>
        <td class="num"><a href="${esc(r.url)}" target="_blank" rel="noopener">${r.number}</a></td>
        <td class="title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></td>
        <td>${versions}</td>
        <td class="area">${esc(r.area)}</td>
        <td><span class="verdict verdict-${v}">${esc(VERDICT_LABELS[v] || v)}</span></td>
        <td class="evidence">${linkify(r.resolution.evidence)}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="6" class="empty">No assessed issues match.</td></tr>';
  }

  const TABS = {
    issues: { button: "tab-issues", panel: "view-issues" },
    duplicates: { button: "tab-duplicates", panel: "view-duplicates" },
    assessment: { button: "tab-assessment", panel: "view-assessment" },
  };

  function setTab(name) {
    activeTab = name;
    for (const [key, ref] of Object.entries(TABS)) {
      const button = document.getElementById(ref.button);
      const panel = document.getElementById(ref.panel);
      const active = key === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      panel.hidden = !active;
    }
    updateUrl();
  }

  function syncControls() {
    els.search.value = state.q;
    els.kind.value = state.kind;
    els.area.value = state.area;
    els.triage.value = state.triage;
    els.sort.value = state.sort;
    els.dups.checked = !!state.dupsOnly;
    els.assessSearch.value = state.assessQ;
    els.assessVerdict.value = state.assessVerdict;
    for (const inst of MULTI_SELECTS) syncMulti(inst);
  }

  let debounce = null;
  els.search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = els.search.value.trim(); render(); }, 120);
  });
  for (const sel of [els.kind, els.area, els.triage]) {
    sel.addEventListener("change", () => {
      state[sel.id] = sel.value;
      render();
    });
  }
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });
  els.dups.addEventListener("change", () => { state.dupsOnly = els.dups.checked; render(); });
  els.reset.addEventListener("click", () => {
    Object.assign(state, { q: "", kind: "", area: "", versions: [], triage: "", staleness: [], sort: "number-desc", dupsOnly: false });
    syncControls();
    for (const inst of MULTI_SELECTS) multiOpen(inst, false);
    render();
  });

  els.repoLink.href = `https://github.com/${DATA.repo}`;
  els.repoLink.textContent = DATA.repo;
  els.snapshot.textContent = `snapshot ${DATA.generated_at} · state: ${DATA.state}`;
  els.total.textContent = DATA.count;
  els.tabIssuesCount.textContent = DATA.count;
  document.title = `issueaurus — ${DATA.repo}`;

  els.tabIssues.addEventListener("click", () => setTab("issues"));
  els.tabDups.addEventListener("click", () => setTab("duplicates"));
  els.tabAssessment.addEventListener("click", () => setTab("assessment"));
  window.addEventListener("hashchange", () => {
    const { tab, params } = parseHash();
    applyUrlState(params);
    setTab(tab);
    syncControls();
    render();
  });

  let assessDebounce = null;
  els.assessSearch.addEventListener("input", () => {
    clearTimeout(assessDebounce);
    assessDebounce = setTimeout(() => {
      state.assessQ = els.assessSearch.value.trim();
      renderAssessment();
      saveState();
    }, 120);
  });
  els.assessVerdict.addEventListener("change", () => {
    state.assessVerdict = els.assessVerdict.value;
    renderAssessment();
    saveState();
  });
  els.assessReset.addEventListener("click", () => {
    state.assessQ = "";
    state.assessVerdict = "";
    syncControls();
    renderAssessment();
    saveState();
  });

  const initial = parseHash();
  activeTab = initial.tab;
  restoreState();
  applyUrlState(initial.params);
  buildControls();
  wireMultiSelects();
  syncControls();
  render();
  renderPairs();
  renderAssessment();
  setTab(initial.tab);
})();