(function () {
  "use strict";

  const data = window.SXGO;
  const insight = window.SXGOInsight;
  if (!data || !insight) return;

  const records = data.records;
  const sourceById = new Map(data.sources.map(function (source) { return [source.id, source]; }));
  const statusMeta = data.statusMeta;
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  const elements = Object.fromEntries([
    "statCompanies", "statCategories", "statSources", "statSupport", "spotlightGrid",
    "passportSelect", "passportResult", "passportDetail", "freshnessPanel",
    "traceInput", "traceRun", "traceHint", "traceResult", "brandOptions",
    "compareA", "compareB", "swapCompare", "compareResult", "downloadData", "downloadDataBottom",
    "searchInput", "categoryFilter", "statusFilter", "quickFilters", "sortSelect", "cardGrid",
    "resultCount", "emptyState", "resetFilters", "loadMore", "sourceGrid",
    "openList", "closeList", "supportDrawer", "drawerBackdrop", "drawerItems", "drawerEmpty",
    "copyList", "exportList", "listCount", "detailDialog", "closeDialog", "dialogContent",
    "toast", "githubLink", "topGithubLink", "issueLink"
  ].map(function (id) { return [id, document.getElementById(id)]; }));

  const state = {
    query: "",
    category: "all",
    status: "support",
    sort: "evidence",
    visible: 24,
    saved: loadSaved(),
    passportId: ""
  };
  let toastTimer;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function safeUrl(value) { return /^https:\/\//i.test(value || "") ? value : ""; }
  function recordFor(id) { return records.find(function (record) { return record.id === id; }); }

  function loadSaved() {
    try {
      const stored = JSON.parse(localStorage.getItem("sxgo-support-list") || "[]");
      return new Set(Array.isArray(stored) ? stored.filter(function (id) { return records.some(function (record) { return record.id === id; }); }) : []);
    } catch (error) { return new Set(); }
  }

  function saveSaved() {
    try { localStorage.setItem("sxgo-support-list", JSON.stringify(Array.from(state.saved))); }
    catch (error) { showToast("浏览器阻止了本地保存"); }
  }

  function statusLabel(record) { return statusMeta[record.status].label; }

  function setupStats() {
    elements.statCompanies.textContent = records.length;
    elements.statCategories.textContent = new Set(records.map(function (record) { return record.category; })).size;
    elements.statSources.textContent = data.sources.length;
    elements.statSupport.textContent = records.filter(function (record) { return ["verified", "reported", "candidate"].includes(record.status); }).length;
  }

  function sortedRecords() {
    return records.slice().sort(function (a, b) {
      return insight.statusRank[b.status] - insight.statusRank[a.status] || insight.audit(b).total - insight.audit(a).total || collator.compare(a.name, b.name);
    });
  }

  function setupSelectors() {
    const options = sortedRecords().map(function (record) { return '<option value="' + escapeHtml(record.id) + '">' + escapeHtml(record.name + "｜" + record.category + "｜" + statusMeta[record.status].short) + "</option>"; }).join("");
    elements.passportSelect.innerHTML = options;
    elements.compareA.innerHTML = options;
    elements.compareB.innerHTML = options;
    elements.brandOptions.innerHTML = records.slice().sort(function (a, b) { return collator.compare(a.name, b.name); }).map(function (record) { return '<option value="' + escapeHtml(record.name) + '">' + escapeHtml(record.products) + "</option>"; }).join("");

    const midea = records.find(function (record) { return record.name === "美的"; }) || records[0];
    const gree = records.find(function (record) { return record.name === "格力"; }) || records[1];
    elements.passportSelect.value = midea.id;
    elements.compareA.value = midea.id;
    elements.compareB.value = gree.id;
    state.passportId = midea.id;
  }

  function setupCategories() {
    const counts = new Map();
    records.forEach(function (record) { counts.set(record.category, (counts.get(record.category) || 0) + 1); });
    Array.from(counts.keys()).sort(collator.compare).forEach(function (category) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category + "（" + counts.get(category) + "）";
      elements.categoryFilter.appendChild(option);
    });
    const popular = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1] || collator.compare(a[0], b[0]); }).slice(0, 8).map(function (entry) { return entry[0]; });
    elements.quickFilters.innerHTML = ["all"].concat(popular).map(function (category) {
      return '<button type="button" data-category="' + escapeHtml(category) + '" class="' + (category === "all" ? "active" : "") + '">' + escapeHtml(category === "all" ? "全部" : category) + "</button>";
    }).join("");
  }

  function renderSpotlights() {
    const selected = sortedRecords().filter(function (record) { return record.status === "verified"; }).slice(0, 3);
    elements.spotlightGrid.innerHTML = selected.map(function (record) {
      const audit = insight.audit(record);
      return '<article class="spotlight-card"><span class="spotlight-code" aria-hidden="true">' + escapeHtml(insight.monogram(record)) + '</span><span class="status-tag ' + record.status + '">' + escapeHtml(statusLabel(record)) + '</span><h3>' + escapeHtml(record.name) + '</h3><p class="spotlight-company">' + escapeHtml(record.company) + '</p><p class="spotlight-note">' + escapeHtml(record.scope) + '</p><button type="button" data-detail="' + escapeHtml(record.id) + '">证据完整度 ' + audit.total + " / 100　›</button></article>";
    }).join("");
  }

  function renderPassport(id) {
    const record = recordFor(id) || records[0];
    const audit = insight.audit(record);
    state.passportId = record.id;
    elements.passportSelect.value = record.id;
    elements.passportResult.innerHTML = '<div class="passport-head"><div class="passport-name"><small>' + escapeHtml(record.category + " · " + statusLabel(record)) + '</small><strong>' + escapeHtml(record.name) + '</strong></div><div class="passport-score"><strong>' + audit.total + '</strong><span>/ 100</span><small>证据完整度</small></div></div>' +
      '<div class="score-bars">' + audit.dimensions.map(function (dimension) { return '<div class="score-row"><span>' + escapeHtml(dimension.label) + '</span><b><i style="width:' + Math.round(dimension.value / dimension.max * 100) + '%"></i></b><strong>' + dimension.value + " / " + dimension.max + "</strong></div>"; }).join("") + '</div>' +
      '<div class="passport-verdict"><span>i</span><div><strong>' + escapeHtml(audit.verdict.title) + '</strong><p>' + escapeHtml(audit.verdict.text + " 新鲜度计分来源：" + (audit.freshnessSource ? audit.freshnessSource.date : "缺少日期") + "。") + "</p></div></div>";
  }

  function renderFreshness() {
    const stats = insight.stats();
    const pending = records.filter(function (record) { return record.status === "pending"; }).length;
    elements.freshnessPanel.innerHTML = '<div><strong>' + stats.fresh + '</strong><span>一年内有更新来源</span></div><div><strong>' + stats.aging + '</strong><span>1–3 年来源</span></div><div><strong>' + stats.stale + '</strong><span>超过 3 年，建议复核</span></div><div><strong>' + pending + '</strong><span>作息仍待核验</span></div>';
  }

  function renderAlternatives(record, context) {
    const alternatives = insight.alternatives(record, 3);
    if (!alternatives.length) return '<p class="trace-empty">当前分类还没有可优先了解的替代项。</p>';
    return '<div class="alternative-list">' + alternatives.map(function (item) {
      return '<button type="button" data-' + context + '="' + escapeHtml(item.record.id) + '"><strong>' + escapeHtml(item.record.name) + '</strong><span>' + escapeHtml(statusLabel(item.record) + " · 完整度 " + item.audit.total) + "</span></button>";
    }).join("") + "</div>";
  }

  function renderTrace(record) {
    if (!record) {
      elements.traceResult.innerHTML = '<div class="trace-empty"><p>没有匹配记录。试试品牌全名，或到企业目录搜索。</p></div>';
      return;
    }
    const audit = insight.audit(record);
    const firstProduct = record.products.split(/[；、，,]/)[0];
    elements.traceInput.value = record.name;
    elements.traceResult.innerHTML = '<div class="trace-title"><div><h3>' + escapeHtml(record.name) + '</h3><p>' + escapeHtml(record.category + " · " + statusLabel(record)) + '</p></div><span class="status-tag ' + record.status + '">' + escapeHtml(audit.verdict.title) + '</span></div>' +
      '<div class="trace-chain"><div class="trace-node"><small>产品 / 服务</small><strong>' + escapeHtml(firstProduct) + '</strong></div><span class="trace-arrow">›</span><div class="trace-node"><small>品牌</small><strong>' + escapeHtml(record.name) + '</strong></div><span class="trace-arrow">›</span><div class="trace-node"><small>经营主体</small><strong>' + escapeHtml(record.company) + '</strong></div><span class="trace-arrow">›</span><div class="trace-node"><small>作息证据</small><strong>' + escapeHtml(statusLabel(record) + " · " + audit.sources.length + " 个来源") + '</strong></div></div>' +
      '<div class="alternatives"><strong>同类替代建议</strong>' + renderAlternatives(record, "trace") + "</div>";
  }

  function compareRow(label, a, b, className) {
    return '<div class="compare-cell label">' + escapeHtml(label) + '</div><div class="compare-cell compare-value ' + (className || "") + '">' + escapeHtml(a) + '</div><div class="compare-cell compare-value ' + (className || "") + '">' + escapeHtml(b) + "</div>";
  }

  function renderCompare() {
    const left = recordFor(elements.compareA.value);
    const right = recordFor(elements.compareB.value);
    if (!left || !right) return;
    const leftAudit = insight.audit(left);
    const rightAudit = insight.audit(right);
    elements.compareResult.innerHTML = '<div class="compare-table"><div class="compare-cell label head">对比项目</div><div class="compare-cell head"><strong>' + escapeHtml(left.name) + '</strong><span>' + escapeHtml(left.company) + '</span></div><div class="compare-cell head"><strong>' + escapeHtml(right.name) + '</strong><span>' + escapeHtml(right.company) + '</span></div>' +
      compareRow("证据完整度", leftAudit.total + " / 100", rightAudit.total + " / 100", "compare-score") +
      compareRow("证据等级", statusLabel(left), statusLabel(right)) +
      compareRow("计分来源", leftAudit.freshnessSource ? leftAudit.freshnessSource.date : "缺少日期", rightAudit.freshnessSource ? rightAudit.freshnessSource.date : "缺少日期") +
      compareRow("来源数量", leftAudit.sources.length + " 个", rightAudit.sources.length + " 个") +
      compareRow("行业", left.category, right.category) +
      compareRow("代表产品", left.products, right.products) +
      compareRow("范围提醒", left.scope, right.scope) + "</div>";
  }

  function filteredRecords() {
    const query = insight.normalize(state.query);
    const result = records.filter(function (record) {
      const categoryMatch = state.category === "all" || record.category === state.category;
      let statusMatch = state.status === "all" || record.status === state.status;
      if (state.status === "support") statusMatch = ["verified", "reported", "candidate"].includes(record.status);
      const haystack = insight.normalize([record.name, record.company, record.category, record.products, record.scope, record.note].join(" "));
      return categoryMatch && statusMatch && (!query || haystack.includes(query));
    });
    result.sort(function (a, b) {
      if (state.sort === "score") return insight.audit(b).total - insight.audit(a).total || collator.compare(a.name, b.name);
      if (state.sort === "category") return collator.compare(a.category, b.category) || collator.compare(a.name, b.name);
      if (state.sort === "name") return collator.compare(a.name, b.name);
      return insight.statusRank[b.status] - insight.statusRank[a.status] || insight.audit(b).total - insight.audit(a).total || collator.compare(a.name, b.name);
    });
    return result;
  }

  function supportLabel(record, saved) {
    if (record.status === "pending") return "作息待核验";
    if (record.status === "caution") return "查看风险";
    if (saved) return "✓ 已加入";
    return record.status === "candidate" ? "加入待核清单" : "加入认购清单";
  }

  function cardMarkup(record) {
    const audit = insight.audit(record);
    const saved = state.saved.has(record.id);
    const disabled = ["pending", "caution"].includes(record.status);
    return '<article class="company-card"><div class="product-visual ' + record.status + '"><span class="status-tag ' + record.status + '">' + escapeHtml(statusLabel(record)) + '</span><span class="score-chip"><strong>' + audit.total + '</strong> / 100</span><span class="product-monogram" aria-hidden="true">' + escapeHtml(insight.monogram(record)) + '</span></div><div class="card-body"><p class="card-category">' + escapeHtml(record.category) + '</p><h3 class="card-title">' + escapeHtml(record.name) + '</h3><p class="card-company">' + escapeHtml(record.company) + '</p><p class="card-products">' + escapeHtml(record.products) + '</p><div class="card-actions"><button class="detail-button" type="button" data-detail="' + escapeHtml(record.id) + '">看证据</button><button class="support-button' + (saved ? " saved" : "") + '" type="button" data-save="' + escapeHtml(record.id) + '"' + (disabled ? " disabled" : "") + ">" + escapeHtml(supportLabel(record, saved)) + "</button></div></div></article>";
  }

  function renderCards(resetVisible) {
    if (resetVisible) state.visible = 24;
    const result = filteredRecords();
    elements.resultCount.textContent = result.length;
    elements.cardGrid.innerHTML = result.slice(0, state.visible).map(cardMarkup).join("");
    elements.emptyState.hidden = result.length !== 0;
    elements.cardGrid.hidden = result.length === 0;
    elements.loadMore.hidden = result.length <= state.visible;
    if (!elements.loadMore.hidden) elements.loadMore.textContent = "继续加载（剩余 " + (result.length - state.visible) + "）";
  }

  function setCategory(category) {
    state.category = category;
    elements.categoryFilter.value = category;
    elements.quickFilters.querySelectorAll("button").forEach(function (button) { button.classList.toggle("active", button.dataset.category === category); });
    renderCards(true);
  }

  function sourceCards() {
    elements.sourceGrid.innerHTML = data.sources.map(function (source) {
      return '<article class="source-card"><span>' + escapeHtml(source.type + " · " + source.date) + '</span><h3>' + escapeHtml(source.title) + '</h3><p>' + escapeHtml(source.note) + '</p><a href="' + escapeHtml(source.url) + '" target="_blank" rel="noreferrer">查看原始资料 ›</a></article>';
    }).join("");
  }

  function sourceLinks(record) {
    return record.sources.map(function (id) {
      const source = sourceById.get(id);
      return source ? '<a href="' + escapeHtml(source.url) + '" target="_blank" rel="noreferrer"><span>' + escapeHtml(source.type + "｜" + source.title) + "</span><b>↗</b></a>" : "";
    }).join("");
  }

  function updateBrandUrl(record) {
    const url = new URL(window.location.href);
    url.searchParams.set("brand", record.name);
    history.replaceState(null, "", url);
  }

  function clearBrandUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("brand")) return;
    url.searchParams.delete("brand");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function openDetail(id, updateUrl) {
    const record = recordFor(id);
    if (!record) return;
    const audit = insight.audit(record);
    const official = safeUrl(record.official);
    const channelUrl = official || "https://www.bing.com/search?q=" + encodeURIComponent(record.name + " 官方网站 官方旗舰店");
    const canSave = !["pending", "caution"].includes(record.status);
    elements.dialogContent.innerHTML = '<div class="dialog-body"><span class="status-tag ' + record.status + '">' + escapeHtml(statusLabel(record)) + '</span><h2>' + escapeHtml(record.name) + '</h2><p class="dialog-company">' + escapeHtml(record.company + " · " + record.category) + '</p><div class="dialog-products"><span>代表产品 / 服务</span><strong>' + escapeHtml(record.products) + '</strong></div><div class="detail-block passport-inline"><strong>' + audit.total + '</strong><div><h3>证据完整度 / 100</h3><p>' + escapeHtml(audit.verdict.title + " · " + audit.freshness + " · " + audit.sources.length + " 个来源") + '</p></div></div><div class="detail-block"><h3>适用范围与核验提醒</h3><p>' + escapeHtml(record.scope) + '</p></div>' +
      (record.note ? '<div class="detail-block"><h3>资料摘要</h3><p>' + escapeHtml(record.note) + '</p></div>' : "") +
      '<div class="detail-block"><h3>本条引用来源</h3><div class="source-links">' + sourceLinks(record) + '</div></div><div class="dialog-alternatives"><strong>同类替代建议</strong>' + renderAlternatives(record, "detail") + '</div><div class="dialog-actions"><a href="' + escapeHtml(channelUrl) + '" target="_blank" rel="noreferrer">' + (official ? "访问官方网站" : "查找官方渠道") + '</a>' +
      (canSave ? '<button type="button" data-dialog-save="' + escapeHtml(record.id) + '">' + escapeHtml(state.saved.has(record.id) ? "从清单移除" : "加入认购清单") + '</button>' : '<a href="' + escapeHtml(data.issueUrl) + '" target="_blank" rel="noreferrer">补充核验证据</a>') + '</div><div class="detail-block"><p><button class="text-link" type="button" data-copy-brand="' + escapeHtml(record.id) + '">复制本条永久链接</button>　·　<a href="' + escapeHtml(data.issueUrl) + '" target="_blank" rel="noreferrer">提交更正</a></p></div></div>';
    if (updateUrl !== false) updateBrandUrl(record);
    elements.detailDialog.showModal();
  }

  function closeDetail() { elements.detailDialog.close(); clearBrandUrl(); }

  function toggleSaved(id) {
    const record = recordFor(id);
    if (!record || ["pending", "caution"].includes(record.status)) return;
    if (state.saved.has(id)) { state.saved.delete(id); showToast("已从清单移除「" + record.name + "」"); }
    else { state.saved.add(id); showToast("已加入「" + record.name + "」，购买前请复核"); }
    saveSaved(); renderCards(false); renderDrawer();
  }

  function renderDrawer() {
    const saved = Array.from(state.saved).map(recordFor).filter(Boolean);
    elements.listCount.textContent = saved.length;
    elements.listCount.setAttribute("aria-label", saved.length + " 项");
    elements.drawerEmpty.hidden = saved.length > 0;
    elements.drawerItems.hidden = saved.length === 0;
    elements.drawerItems.innerHTML = saved.map(function (record) { return '<div class="drawer-item"><div><strong>' + escapeHtml(record.name) + '</strong><span>' + escapeHtml(statusLabel(record) + " · " + record.products) + '</span></div><button type="button" data-remove="' + escapeHtml(record.id) + '">移除</button></div>'; }).join("");
    elements.copyList.disabled = saved.length === 0;
    elements.exportList.disabled = saved.length === 0;
  }

  function openDrawer() { renderDrawer(); elements.drawerBackdrop.hidden = false; elements.supportDrawer.classList.add("open"); elements.supportDrawer.setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden"; elements.closeList.focus(); }
  function closeDrawer() { elements.supportDrawer.classList.remove("open"); elements.supportDrawer.setAttribute("aria-hidden", "true"); elements.drawerBackdrop.hidden = true; document.body.style.overflow = ""; }

  function listText() {
    const selected = Array.from(state.saved).map(recordFor).filter(Boolean);
    return "我的双休购复核清单\n\n" + selected.map(function (record, index) { return (index + 1) + ". " + record.name + "｜" + record.products + "｜" + statusLabel(record) + "｜证据完整度 " + insight.audit(record).total; }).join("\n") + "\n\n" + window.location.origin + window.location.pathname;
  }

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    const textarea = document.createElement("textarea"); textarea.value = value; textarea.style.position = "fixed"; textarea.style.opacity = "0"; document.body.appendChild(textarea); textarea.select();
    const copied = document.execCommand("copy"); textarea.remove(); return copied ? Promise.resolve() : Promise.reject(new Error("copy failed"));
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type: type }));
    const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = [["名称", "主体", "行业", "代表产品", "证据等级", "完整度", "适用范围"]];
    Array.from(state.saved).map(recordFor).filter(Boolean).forEach(function (record) { rows.push([record.name, record.company, record.category, record.products, statusLabel(record), insight.audit(record).total, record.scope]); });
    const csv = "\ufeff" + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    download("双休购复核清单-" + data.researchedAt + ".csv", csv, "text/csv;charset=utf-8"); showToast("CSV 已导出");
  }

  function exportData() {
    const payload = { project: "双休购公开资料导航", researchedAt: data.researchedAt, methodology: { scoreMeaning: "公开证据完整度，不代表企业好坏", dimensions: { evidence: 40, freshness: 20, scope: 20, traceability: 20 } }, sources: data.sources, records: records.map(function (record) { return Object.assign({}, record, { evidencePassport: insight.audit(record) }); }) };
    download("shuangxiugou-open-data-" + data.researchedAt + ".json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8"); showToast("开放数据已下载");
  }

  function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(function () { elements.toast.classList.remove("show"); }, 2400); }

  function resetFilters() { state.query = ""; state.status = "support"; state.sort = "evidence"; elements.searchInput.value = ""; elements.statusFilter.value = "support"; elements.sortSelect.value = "evidence"; setCategory("all"); }

  elements.passportSelect.addEventListener("change", function (event) { renderPassport(event.target.value); });
  elements.passportDetail.addEventListener("click", function () { openDetail(state.passportId); });
  elements.traceRun.addEventListener("click", function () { renderTrace(insight.find(elements.traceInput.value)); });
  elements.traceInput.addEventListener("keydown", function (event) { if (event.key === "Enter") renderTrace(insight.find(elements.traceInput.value)); });
  elements.traceResult.addEventListener("click", function (event) { const button = event.target.closest("[data-trace]"); if (button) renderTrace(recordFor(button.dataset.trace)); });
  elements.compareA.addEventListener("change", renderCompare);
  elements.compareB.addEventListener("change", renderCompare);
  elements.swapCompare.addEventListener("click", function () { const value = elements.compareA.value; elements.compareA.value = elements.compareB.value; elements.compareB.value = value; renderCompare(); });
  elements.searchInput.addEventListener("input", function (event) { state.query = event.target.value; renderCards(true); });
  elements.categoryFilter.addEventListener("change", function (event) { setCategory(event.target.value); });
  elements.statusFilter.addEventListener("change", function (event) { state.status = event.target.value; renderCards(true); });
  elements.sortSelect.addEventListener("change", function (event) { state.sort = event.target.value; renderCards(true); });
  elements.quickFilters.addEventListener("click", function (event) { const button = event.target.closest("[data-category]"); if (button) setCategory(button.dataset.category); });
  elements.cardGrid.addEventListener("click", function (event) { const detail = event.target.closest("[data-detail]"); const save = event.target.closest("[data-save]"); if (detail) openDetail(detail.dataset.detail); if (save) toggleSaved(save.dataset.save); });
  elements.spotlightGrid.addEventListener("click", function (event) { const detail = event.target.closest("[data-detail]"); if (detail) openDetail(detail.dataset.detail); });
  elements.loadMore.addEventListener("click", function () { state.visible += 24; renderCards(false); });
  elements.resetFilters.addEventListener("click", resetFilters);
  elements.downloadData.addEventListener("click", exportData); elements.downloadDataBottom.addEventListener("click", exportData);
  elements.openList.addEventListener("click", openDrawer); elements.closeList.addEventListener("click", closeDrawer); elements.drawerBackdrop.addEventListener("click", closeDrawer);
  elements.drawerItems.addEventListener("click", function (event) { const button = event.target.closest("[data-remove]"); if (button) toggleSaved(button.dataset.remove); });
  elements.copyList.addEventListener("click", function () { copyText(listText()).then(function () { showToast("清单已复制"); }).catch(function () { showToast("复制失败，请导出 CSV"); }); });
  elements.exportList.addEventListener("click", exportCsv);
  elements.closeDialog.addEventListener("click", closeDetail);
  elements.detailDialog.addEventListener("cancel", function (event) { event.preventDefault(); closeDetail(); });
  elements.detailDialog.addEventListener("click", function (event) {
    if (event.target === elements.detailDialog) closeDetail();
    const save = event.target.closest("[data-dialog-save]"); if (save) { toggleSaved(save.dataset.dialogSave); closeDetail(); }
    const alternative = event.target.closest("[data-detail]"); if (alternative) { elements.detailDialog.close(); openDetail(alternative.dataset.detail); }
    const copy = event.target.closest("[data-copy-brand]"); if (copy) { copyText(window.location.href).then(function () { showToast("永久链接已复制"); }); }
  });
  document.addEventListener("keydown", function (event) { if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { event.preventDefault(); elements.searchInput.focus(); } if (event.key === "Escape" && elements.supportDrawer.classList.contains("open")) closeDrawer(); });

  elements.githubLink.href = data.repository; elements.topGithubLink.href = data.repository; elements.issueLink.href = data.issueUrl;
  setupStats(); setupSelectors(); setupCategories(); renderSpotlights(); renderPassport(state.passportId); renderFreshness(); renderTrace(insight.find("东方树叶")); renderCompare(); sourceCards(); renderCards(true); renderDrawer();
  const initialBrand = new URL(window.location.href).searchParams.get("brand");
  if (initialBrand) { const initialRecord = insight.find(initialBrand); if (initialRecord) openDetail(initialRecord.id, false); }
})();
