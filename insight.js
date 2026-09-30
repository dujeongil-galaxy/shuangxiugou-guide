(function () {
  "use strict";

  const data = window.SXGO;
  if (!data) return;

  const sourceById = new Map(data.sources.map(function (source) { return [source.id, source]; }));
  const statusWeight = { verified: 40, reported: 31, candidate: 20, caution: 10, pending: 6 };
  const statusRank = { verified: 5, reported: 4, candidate: 3, caution: 2, pending: 1 };
  const asOf = new Date(data.researchedAt + "T00:00:00+08:00");

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[\s·•/\\_,，。；;:：()（）\-—]+/g, "");
  }

  function recordSources(record) {
    return record.sources.map(function (id) { return sourceById.get(id); }).filter(Boolean);
  }

  function newestSource(record) {
    return recordSources(record).slice().sort(function (a, b) { return b.date.localeCompare(a.date); })[0] || null;
  }

  function sourceQuality(source) {
    if (!source) return 0;
    if (["企业回应", "公开通知", "官方确认", "政府口径"].includes(source.type)) return 3;
    if (["媒体专题", "话题报道"].includes(source.type)) return 2;
    return 1;
  }

  function freshnessSource(record) {
    return recordSources(record).slice().sort(function (a, b) {
      return sourceQuality(b) - sourceQuality(a) || b.date.localeCompare(a.date);
    })[0] || null;
  }

  function ageInDays(record) {
    const source = freshnessSource(record);
    if (!source || !source.date) return Infinity;
    return Math.max(0, Math.floor((asOf - new Date(source.date + "T00:00:00+08:00")) / 86400000));
  }

  function freshnessScore(days) {
    if (!Number.isFinite(days)) return 2;
    if (days <= 180) return 20;
    if (days <= 365) return 17;
    if (days <= 730) return 13;
    if (days <= 1095) return 9;
    return 5;
  }

  function scopeScore(record) {
    const scope = record.scope || "";
    const terms = ["总部", "工厂", "门店", "销售", "产研", "生产", "岗位", "部门", "团队", "分公司", "供应商", "排班", "项目", "客服", "法人"];
    const hits = terms.filter(function (term) { return scope.includes(term); }).length;
    const specificity = Math.min(10, hits * 2);
    const detail = scope.length >= 38 ? 6 : scope.length >= 22 ? 4 : scope.length >= 12 ? 2 : 0;
    const boundary = /不代表|不可混同|不同|需.*核对|只覆盖|另计|差异/.test(scope) ? 4 : 0;
    return Math.min(20, 2 + specificity + detail + boundary);
  }

  function traceabilityScore(record) {
    const count = recordSources(record).length;
    if (count >= 3) return 20;
    if (count === 2) return 15;
    if (count === 1) return 10;
    return 0;
  }

  function freshnessLabel(days) {
    if (!Number.isFinite(days)) return "缺少日期";
    if (days <= 180) return "半年内更新";
    if (days <= 365) return "一年内更新";
    if (days <= 730) return "1–2 年";
    if (days <= 1095) return "2–3 年";
    return "超过 3 年";
  }

  function verdict(total, record) {
    if (record.status === "caution") return { title: "存在相反线索", text: "先查看风险说明，再按具体法人、城市和岗位复核。" };
    if (record.status === "pending") return { title: "产品关系已建档，作息待补证", text: "这条记录不会进入默认认购结果，也不能直接加入清单。" };
    if (total >= 80) return { title: "证据较完整", text: "仍需确认你关心的城市、部门和岗位是否在材料覆盖范围内。" };
    if (total >= 60) return { title: "可继续核对", text: "已有可追溯材料，但范围或时效还有明显缺口。" };
    return { title: "公开线索有限", text: "适合作为调查起点，不宜直接据此作购买结论。" };
  }

  function audit(record) {
    const days = ageInDays(record);
    const dimensions = [
      { key: "evidence", label: "证据等级", value: statusWeight[record.status] || 0, max: 40 },
      { key: "freshness", label: "资料新鲜度", value: freshnessScore(days), max: 20 },
      { key: "scope", label: "范围清晰度", value: scopeScore(record), max: 20 },
      { key: "traceability", label: "来源可追溯", value: traceabilityScore(record), max: 20 }
    ];
    const total = dimensions.reduce(function (sum, dimension) { return sum + dimension.value; }, 0);
    return {
      total: total,
      dimensions: dimensions,
      freshness: freshnessLabel(days),
      newest: newestSource(record),
      freshnessSource: freshnessSource(record),
      sources: recordSources(record),
      verdict: verdict(total, record)
    };
  }

  function find(query) {
    const needle = normalize(query);
    if (!needle) return null;
    const exact = data.records.find(function (record) { return normalize(record.name) === needle; });
    if (exact) return exact;
    return data.records.find(function (record) {
      return normalize([record.name, record.company, record.products].join(" ")).includes(needle);
    }) || null;
  }

  function alternatives(record, limit) {
    return data.records.filter(function (candidate) {
      return candidate.id !== record.id && candidate.category === record.category && ["verified", "reported", "candidate"].includes(candidate.status);
    }).map(function (candidate) {
      return { record: candidate, audit: audit(candidate) };
    }).sort(function (a, b) {
      return statusRank[b.record.status] - statusRank[a.record.status] || b.audit.total - a.audit.total || a.record.name.localeCompare(b.record.name, "zh-CN");
    }).slice(0, limit || 3);
  }

  function monogram(record) {
    const letters = record.name.replace(/[^\u3400-\u9fffA-Za-z0-9]/g, "");
    return letters.slice(0, 2).toUpperCase() || "休";
  }

  function stats() {
    const result = { fresh: 0, aging: 0, stale: 0, missing: 0 };
    data.records.forEach(function (record) {
      const days = ageInDays(record);
      if (!Number.isFinite(days)) result.missing += 1;
      else if (days <= 365) result.fresh += 1;
      else if (days <= 1095) result.aging += 1;
      else result.stale += 1;
    });
    return result;
  }

  window.SXGOInsight = {
    audit: audit,
    alternatives: alternatives,
    find: find,
    monogram: monogram,
    normalize: normalize,
    recordSources: recordSources,
    stats: stats,
    statusRank: statusRank
  };
})();
