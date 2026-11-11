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

  const state = { q: "", kind: "", area: "", versions: [], triage: "", sort: "number-desc", dupsOnly: false };

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (saved.version) saved.versions = [saved.version];  // migrate old single-select
      delete saved.version;
      if (!Array.isArray(saved.versions)) saved.versions = [];
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

  function versionTriggerText() {
    if (!state.versions.length) return "all branches";
    const label = state.versions.slice().sort(versionSort).join(", ");
    return label.length > 18 ? `${state.versions.length} branches` : label;
  }

  function syncVersionMenu() {
    els.version.textContent = versionTriggerText();
    for (const item of els.versionMenu.children) {
      const input = item.children[0];
      if (input) input.checked = state.versions.includes(input.value);
    }
  }

  function buildVersionMenu() {
    const versions = tally(i => i.versions);
    els.versionMenu.innerHTML = "";
    for (const v of [...versions.keys()].sort(versionSort)) {
      const label = document.createElement("label");
      label.className = "multi-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;
      input.addEventListener("change", () => {
        const next = new Set(state.versions);
        input.checked ? next.add(v) : next.delete(v);
        state.versions = [...versions.keys()].filter(x => next.has(x)).sort(versionSort);
        syncVersionMenu();
        render();
      });
      label.appendChild(input);
      const text = document.createElement("span");
      text.textContent = `${v} (${versions.get(v)})`;
      label.appendChild(text);
      els.versionMenu.appendChild(label);
    }
    syncVersionMenu();
  }

  function setVersionMenuOpen(open) {
    els.versionMenu.hidden = !open;
    els.version.setAttribute("aria-expanded", String(open));
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

    buildVersionMenu();

    fillSelect(els.triage, "all", TRIAGE_OPTIONS);
    fillSelect(els.sort, null, SORT_LABELS);
  }

  function matches(issue) {
    if (state.kind && issue.kind !== state.kind) return false;
    if (state.area && issue.area !== state.area) return false;
    if (state.versions.length && !issue.versions.some(v => state.versions.includes(v))) return false;
    if (state.triage === "triaged" && !issue.triaged) return false;
    if (state.triage === "untriaged" && issue.triaged) return false;
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
        '<tr><td colspan="11" class="empty">No issues match the current filters.</td></tr>';
      saveState();
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
        <td class="date">${esc(r.created)}</td>
        <td class="date">${esc(r.updated)}</td>
        <td class="num">${r.comments || ""}</td>
      </tr>`;
    }).join("");
    els.tbody.innerHTML = html;
    saveState();
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

  const TABS = {
    issues: { button: "tab-issues", panel: "view-issues" },
    duplicates: { button: "tab-duplicates", panel: "view-duplicates" },
  };

  function currentTab() {
    return location.hash === "#duplicates" ? "duplicates" : "issues";
  }

  function setTab(name) {
    for (const [key, ref] of Object.entries(TABS)) {
      const button = document.getElementById(ref.button);
      const panel = document.getElementById(ref.panel);
      const active = key === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      panel.hidden = !active;
    }
    history.replaceState(null, "", name === "duplicates" ? "#duplicates" : "#issues");
  }

  function syncControls() {
    els.search.value = state.q;
    els.kind.value = state.kind;
    els.area.value = state.area;
    els.triage.value = state.triage;
    els.sort.value = state.sort;
    els.dups.checked = !!state.dupsOnly;
    syncVersionMenu();
  }

  let debounce = null;
  els.search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = els.search.value.trim(); render(); }, 120);
  });
  for (const sel of [els.kind, els.area, els.version, els.triage]) {
    sel.addEventListener("change", () => {
      state[sel.id] = sel.value;
      render();
    });
  }
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; render(); });
  els.dups.addEventListener("change", () => { state.dupsOnly = els.dups.checked; render(); });
  els.reset.addEventListener("click", () => {
    Object.assign(state, { q: "", kind: "", area: "", versions: [], triage: "", sort: "number-desc", dupsOnly: false });
    syncControls();
    setVersionMenuOpen(false);
    render();
  });

  els.version.addEventListener("click", () => {
    setVersionMenuOpen(els.versionMenu.hidden);
  });
  document.addEventListener("click", e => {
    if (!els.versionField.contains(e.target)) setVersionMenuOpen(false);
  });
  els.versionMenu.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      setVersionMenuOpen(false);
      els.version.focus();
    }
  });

  els.repoLink.href = `https://github.com/${DATA.repo}`;
  els.repoLink.textContent = DATA.repo;
  els.snapshot.textContent = `snapshot ${DATA.generated_at} · state: ${DATA.state}`;
  els.total.textContent = DATA.count;
  els.tabIssuesCount.textContent = DATA.count;
  document.title = `issueaurus — ${DATA.repo}`;

  els.tabIssues.addEventListener("click", () => setTab("issues"));
  els.tabDups.addEventListener("click", () => setTab("duplicates"));
  window.addEventListener("hashchange", () => setTab(currentTab()));

  restoreState();
  buildControls();
  syncControls();
  render();
  renderPairs();
  setTab(currentTab());
})();