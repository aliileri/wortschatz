import { openDB, get, put, getAll, clear } from "./data/db.js";
import { loadSettings, saveSettings } from "./data/settings.js";
import { importWords } from "./data/importWords.js";
import * as planner from "./data/planner.js";
import * as stats from "./data/stats.js";
import { compare as answerCompare } from "./logic/answerEval.js";
import { today as todayStr } from "./data/clock.js";
import { getItemContext, dashboardContext, beginNewSet } from "./studyFlow.js";
import { exportBackup, importBackup } from "./data/backup.js";

const root = document.getElementById("app");
const navEl = document.getElementById("app-nav");

let currentItem = null; // the study item currently on screen (for answer handlers)
let pendingAlmost = null; // {card, question} while the "almost correct" confirm is shown
const QUELLE_LABELS = { kursbuch: "Kursbuch" };
const NIVEAU_VALUES = ["A1", "A2", "B1", "B2"];
const WORTART_VALUES = [
  "Nomen", "Verb", "Adjektiv", "Adverb", "Partikel", "Präposition",
  "Konnektor", "Wendung", "Redemittel", "Redewendung",
];
const STATUS_LABELS = { new: "Yeni", known: "Biliniyor", learning: "Öğreniliyor", mastered: "Öğrenildi" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDMY(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatDM(dateStr) {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
}

// ---------- bootstrap ----------

async function wipeAndReseed(data) {
  for (const store of ["words", "userWords", "reviewCards", "reviewLogs", "dailyPlans"]) {
    await clear(store);
  }
  await importWords(data);
  await put("meta", { key: "dataset", version: data.version });

  // sources_enabled is a filter over `quelle` values, which are dataset-specific.
  // A stale list from a previous dataset would silently filter out every new
  // word (no triage candidates ever offered) - always resync it to what's
  // actually in the pool we just imported.
  const quellenInData = [...new Set((data.woerter || []).map((w) => w.quelle).filter(Boolean))];
  if (quellenInData.length) {
    await saveSettings({ sources_enabled: quellenInData });
  }
}

async function bootstrap() {
  // Ask the browser not to auto-evict our IndexedDB under storage pressure.
  // Best-effort: granted silently on installed / home-screen apps.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  await openDB();
  const data = await fetch("data/words.json", { cache: "no-store" }).then((r) => r.json());
  const meta = await get("meta", "dataset");

  if (!meta) {
    // First run - seed the whole pool.
    root.innerHTML = `<div class="spinner">Kelime verisi yükleniyor…</div>`;
    await wipeAndReseed(data);
  } else if (meta.version !== data.version) {
    // Bundled list changed. Merge the updates in (new words, corrected fields,
    // added translations) WITHOUT touching the user's progress.
    root.innerHTML = `<div class="spinner">Kelime verisi güncelleniyor…</div>`;
    await importWords(data);
    await put("meta", { key: "dataset", version: data.version });
  }

  window.addEventListener("hashchange", render);
  wireGlobalHandlers();
  render();
}

// ---------- router ----------

async function render() {
  const hash = (location.hash || "#/dashboard").replace(/^#\/?/, "");
  const route = hash.split("/")[0] || "dashboard";
  updateNav(route);
  try {
    if (route === "dashboard") return renderDashboard();
    if (route === "study" || route === "study/review") return renderStudy();
    if (route === "words") return renderWordList();
    if (route === "stats") return renderStats();
    if (route === "settings") return renderSettings();
    return renderDashboard();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="card"><p>Bir hata oluştu.</p><p class="muted">${esc(String(err && err.message || err))}</p></div>`;
  }
}

function updateNav(route) {
  if (!navEl) return;
  navEl.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === route);
  });
}

// ---------- dashboard ----------

async function renderDashboard() {
  const ctx = await dashboardContext(todayStr());
  const banners = [];
  if (ctx.backlogBlocked) {
    banners.push(`<div class="banner banner--warning">Birikmiş tekrar var, yeni kelime duraklatıldı. Önce ${ctx.backlogCount} kartı temizle.</div>`);
  }

  const reviewOnlyBtn = ctx.pendingReviews > 0
    ? `<a class="btn btn--secondary" href="#/study/review" type="button">Sadece Tekrar</a>`
    : "";
  const action = ctx.hasAnythingToDo
    ? `<button class="btn btn--primary" data-action="start-study" type="button">Çalışmaya başla</button>`
    : `<p class="muted">Öğrenilecek yeni bir şey kalmadı. 🎉</p>`;

  const maxBox = Math.max(...Object.values(ctx.boxDist), 1);
  const boxBars = [1, 2, 3, 4, 5, 6].map((b) => {
    const count = ctx.boxDist[b] || 0;
    const pct = Math.round((100 * count) / maxBox);
    return `<div class="box-row">
      <span class="box-row__label">Kutu ${b}</span>
      <span class="box-row__bar"><span class="box-row__fill" style="width:${pct}%;"></span></span>
      <span class="box-row__count">${count}</span>
    </div>`;
  }).join("");

  const masteredList = ctx.masteredWords.length
    ? `<ul class="mastered-list">${ctx.masteredWords.map((w) => `<li>${esc(w.anzeige)} <span class="muted">— ${esc(w.tr)}</span></li>`).join("")}</ul>`
    : `<p class="muted">Henüz yok. Bir kelime her iki yönde de kutu 6'yı geçince buraya gelir.</p>`;

  root.innerHTML = `
    ${banners.join("")}
    <div class="btn-row">${action}${reviewOnlyBtn}</div>

    <div class="stat-row">
      <div class="stat-tile"><span class="stat-tile__value">${ctx.pendingReviews}</span><span class="stat-tile__label">Bekleyen tekrar</span></div>
      <div class="stat-tile"><span class="stat-tile__value">${ctx.boxTotal}</span><span class="stat-tile__label">Öğrenilen kart</span></div>
      <div class="stat-tile"><span class="stat-tile__value">${ctx.masteredWords.length}</span><span class="stat-tile__label">Tam öğrenilen</span></div>
    </div>

    <h2 class="section-title">Kutulardaki kelimeler</h2>
    <div class="card">${boxBars}</div>

    <h2 class="section-title">Tam öğrenilen kelimeler (${ctx.masteredWords.length})</h2>
    <div class="card">${masteredList}</div>
  `;
}

// ---------- study ----------

async function renderStudy() {
  pendingAlmost = null;
  const mode = (location.hash || "").includes("/study/review") ? "review" : "daily";
  const item = await getItemContext(todayStr(), mode);
  currentItem = item;
  root.innerHTML = studyChromeHtml(item) + itemBodyHtml(item);
}

function studyChromeHtml(item) {
  let html = "";
  const s = item.sessionStats;
  if (s && s.shownTotal) {
    html += `<div class="session-stats">
      <span class="session-stats__chip session-stats__chip--new">Yeni <strong>${s.newTotal}</strong> (bilen ${s.newKnown} · bilmeyen ${s.newUnknown})</span>
      <span class="session-stats__chip session-stats__chip--review">Tekrar <strong>${s.reviewTotal}</strong> (bilen ${s.reviewKnown} · bilmeyen ${s.reviewUnknown})</span>
    </div>`;
  }
  if (item.progressTotal) {
    const pct = Math.round((100 * item.progressDone) / item.progressTotal);
    html += `<div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%;"></div></div>
    <p class="muted" style="text-align:center;margin-top:-8px;">${item.progressDone} / ${item.progressTotal}</p>`;
  }
  if (item.wordStats) {
    const ws = item.wordStats;
    const first = ws.firstShownAt ? `· İlk gösterim: ${formatDMY(ws.firstShownAt)}` : "· İlk kez gösteriliyor";
    html += `<p class="muted" style="text-align:center;margin-bottom:8px;">Gösterim: ${ws.shownCount} · Doğru: ${ws.correctCount} ${first}</p>`;
  }
  return html;
}

function itemBodyHtml(item) {
  if (item.kind === "done") {
    const message = item.reviewOnly
      ? "Tekrar tamamlandı! 🎉"
      : item.canStartNewSet
        ? "Bu set tamamlandı! 🎉"
        : "Öğrenilecek yeni bir şey kalmadı. 🎉";
    return `<div class="card study-card">
      <p>${message}</p>
      <div class="btn-row">
        ${item.reviewOnly ? `<button class="btn btn--primary" data-action="start-study" type="button">Yeni set çalış</button>` : ""}
        ${!item.reviewOnly && item.canStartNewSet ? `<button class="btn btn--primary" data-action="start-new-set">Yeni set başlat</button>` : ""}
        <a class="btn btn--secondary" href="#/dashboard">Panele dön</a>
      </div>
    </div>`;
  }
  if (item.kind === "triage") return triageItemHtml(item);
  if (item.kind === "recheck") return recheckItemHtml(item);
  if (item.kind === "review") {
    if (item.question.type === "meaning") return reviewMeaningHtml(item);
    if (item.question.type === "cloze") return reviewClozeHtml(item);
    return reviewProductionHtml(item);
  }
  return "";
}

function triageItemHtml(item) {
  const w = item.word;
  return `<div class="card study-card">
    <div class="study-card__meta">
      <span class="tag">${esc(w.thema)}</span><span class="tag">${esc(w.niveau)}</span><span class="tag">${esc(QUELLE_LABELS[w.quelle] || w.quelle)}</span>
    </div>
    <div class="study-card__front">${esc(w.anzeige)}</div>
    <details>
      <summary class="btn btn--secondary" data-shortcut="space">Anlamı göster</summary>
      <div class="study-card__meaning">${esc(w.tr)}</div>
      ${w.beispiel ? `<div class="study-card__example">${esc(w.beispiel)}</div>` : ""}
      ${w.beispiel_tr ? `<div class="study-card__example-tr">${esc(w.beispiel_tr)}</div>` : ""}
      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn--primary" data-action="triage" data-choice="known" data-word-id="${esc(w.id)}" data-shortcut="1">Biliyordum</button>
        <button class="btn" data-action="triage" data-choice="unknown" data-word-id="${esc(w.id)}" data-shortcut="2">Bilmiyordum</button>
      </div>
    </details>
  </div>`;
}

function recheckItemHtml(item) {
  const w = item.word;
  return `<div class="card study-card">
    <div class="study-card__meta"><span class="tag">Aylık kontrol</span></div>
    <div class="study-card__front">${esc(w.anzeige)}</div>
    <details>
      <summary class="btn btn--secondary" data-shortcut="space">Anlamı göster</summary>
      <div class="study-card__meaning">${esc(w.tr)}</div>
      <div class="btn-row btn-row--inline" style="margin-top:16px;">
        <button class="btn btn--primary" data-action="recheck" data-choice="knew" data-word-id="${esc(w.id)}" data-shortcut="1">Bildim</button>
        <button class="btn" data-action="recheck" data-choice="did_not_know" data-word-id="${esc(w.id)}" data-shortcut="2">Bilemedim</button>
      </div>
    </details>
  </div>`;
}

function directionLabel(direction) {
  return direction === "de_tr" ? "DE → TR" : "TR → DE";
}

function reviewMeaningHtml(item) {
  const { card, question, word } = item;
  const meaning = card.direction === "de_tr" ? question.answerKey.tr : question.answerKey.anzeige;
  return `<div class="card study-card">
    <div class="study-card__meta"><span class="tag">Kutu ${card.box}</span><span class="tag">${directionLabel(card.direction)}</span></div>
    <div class="study-card__front">${esc(question.prompt)}</div>
    <details>
      <summary class="btn btn--secondary" data-shortcut="space">Anlamı göster</summary>
      <div class="study-card__meaning">${esc(meaning)}</div>
      ${word.beispiel ? `<div class="study-card__example">${esc(word.beispiel)}</div>` : ""}
      ${word.beispiel_tr ? `<div class="study-card__example-tr">${esc(word.beispiel_tr)}</div>` : ""}
      <div class="btn-row btn-row--inline" style="margin-top:16px;">
        <button class="btn btn--primary" data-action="review-meaning" data-choice="knew" data-shortcut="1">Bildim</button>
        <button class="btn" data-action="review-meaning" data-choice="did_not_know" data-shortcut="2">Bilemedim</button>
      </div>
    </details>
  </div>`;
}

function reviewProductionHtml(item) {
  const { card, question } = item;
  return `<div class="card study-card">
    <div class="study-card__meta"><span class="tag">Kutu ${card.box}</span><span class="tag">${directionLabel(card.direction)}</span></div>
    <div class="study-card__front">${esc(question.prompt)}</div>
    <form class="btn-row" style="width:100%;margin-top:16px;" data-action="review-answer">
      <input type="text" name="answer_wort" placeholder="${question.expectsArtikel ? "der/die/das kelime" : "Cevabın"}" autocomplete="off" autofocus>
      ${question.expectsPlural ? `<input type="text" name="answer_plural" placeholder="Çoğul (örn. -en)" autocomplete="off">` : ""}
      ${question.expectsRektion ? `<input type="text" name="answer_rektion" placeholder="Ek (örn. über + A)" autocomplete="off">` : ""}
      <button class="btn btn--primary" type="submit">Gönder</button>
    </form>
  </div>`;
}

function reviewClozeHtml(item) {
  const { card, question } = item;
  return `<div class="card study-card">
    <div class="study-card__meta"><span class="tag">Kutu ${card.box}</span><span class="tag">Boşluk doldurma</span></div>
    <div class="study-card__front" style="font-size:1.2rem;">${esc(question.clozeSentence)}</div>
    <form class="btn-row" style="width:100%;margin-top:16px;" data-action="review-answer">
      <input type="text" name="answer_wort" placeholder="Boşluğa gelecek kelime" autocomplete="off" autofocus>
      <button class="btn btn--primary" type="submit">Gönder</button>
    </form>
  </div>`;
}

function almostConfirmHtml(question) {
  return `<div class="card study-card">
    <p>Neredeyse doğru!</p>
    <p class="muted">Doğru cevap: <strong>${esc(question.answerKey.wort)}</strong></p>
    <div class="btn-row btn-row--inline">
      <button class="btn btn--primary" data-action="confirm-almost" data-choice="correct" data-shortcut="1">Doğru saydım</button>
      <button class="btn" data-action="confirm-almost" data-choice="wrong" data-shortcut="2">Yanlış saydım</button>
    </div>
  </div>`;
}

async function handleReviewAnswerSubmit(form) {
  const { card, question } = currentItem;
  const fd = new FormData(form);

  let expectedWort = question.answerKey.wort;
  if (question.expectsArtikel && question.answerKey.artikel) {
    expectedWort = `${question.answerKey.artikel} ${expectedWort}`;
  }
  const verdicts = [answerCompare(expectedWort, fd.get("answer_wort") || "")];
  if (question.expectsPlural) verdicts.push(answerCompare(question.answerKey.plural, fd.get("answer_plural") || ""));
  if (question.expectsRektion) verdicts.push(answerCompare(question.answerKey.rektion, fd.get("answer_rektion") || ""));

  let overall = "correct";
  if (verdicts.includes("wrong")) overall = "wrong";
  else if (verdicts.includes("almost")) overall = "almost";

  if (overall === "almost") {
    pendingAlmost = { card, question };
    root.innerHTML = almostConfirmHtml(question);
    return;
  }
  await planner.submitReviewAnswer(card, overall === "correct", question.type, todayStr(), currentItem.setId);
  return renderStudy();
}

// ---------- word list ----------

async function renderWordList() {
  const words = await getAll("words");
  const themen = [...new Set(words.map((w) => w.thema))].filter(Boolean).sort();

  root.innerHTML = `
    <h1 class="section-title">Kelime Listesi</h1>
    <form id="word-filter-form" class="filter-form">
      <input type="text" name="q" placeholder="Ara (Almanca / Türkçe)">
      <select name="thema"><option value="">Tema (hepsi)</option>${themen.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
      <select name="quelle"><option value="">Kaynak (hepsi)</option>${Object.entries(QUELLE_LABELS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
      <select name="niveau"><option value="">Seviye (hepsi)</option>${NIVEAU_VALUES.map((v) => `<option value="${v}">${v}</option>`).join("")}</select>
      <select name="wortart"><option value="">Tür (hepsi)</option>${WORTART_VALUES.map((v) => `<option value="${v}">${v}</option>`).join("")}</select>
      <select name="status"><option value="">Durum (hepsi)</option>${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
    </form>
    <div id="word-table"></div>
  `;
  const form = document.getElementById("word-filter-form");
  form.addEventListener("input", updateWordTable);
  form.addEventListener("change", updateWordTable);
  await updateWordTable();
}

async function updateWordTable() {
  const form = document.getElementById("word-filter-form");
  const fd = new FormData(form);
  const q = (fd.get("q") || "").trim().toLowerCase();
  const themaFilter = fd.get("thema") || "";
  const quelleFilter = fd.get("quelle") || "";
  const niveauFilter = fd.get("niveau") || "";
  const wortartFilter = fd.get("wortart") || "";
  const statusFilter = fd.get("status") || "";

  const words = await getAll("words");
  const userWords = await getAll("userWords");
  const cards = await getAll("reviewCards");
  const uwById = new Map(userWords.map((u) => [u.wordId, u]));
  const cardsByWord = new Map();
  for (const c of cards) {
    if (!cardsByWord.has(c.wordId)) cardsByWord.set(c.wordId, []);
    cardsByWord.get(c.wordId).push(c);
  }

  let rows = words.map((w) => ({ word: w, userWord: uwById.get(w.id), cards: cardsByWord.get(w.id) || [] }));

  if (q) rows = rows.filter((r) => r.word.wort.toLowerCase().includes(q) || r.word.tr.toLowerCase().includes(q));
  if (themaFilter) rows = rows.filter((r) => r.word.thema === themaFilter);
  if (quelleFilter) rows = rows.filter((r) => r.word.quelle === quelleFilter);
  if (niveauFilter) rows = rows.filter((r) => r.word.niveau === niveauFilter);
  if (wortartFilter) rows = rows.filter((r) => r.word.wortart === wortartFilter);
  if (statusFilter) rows = rows.filter((r) => r.userWord && r.userWord.status === statusFilter);

  rows.sort((a, b) => (a.word.thema || "").localeCompare(b.word.thema || "") || (a.word.source_id || 0) - (b.word.source_id || 0));
  rows = rows.slice(0, 200);

  const tableEl = document.getElementById("word-table");
  tableEl.innerHTML = `<div style="overflow-x:auto;"><table>
    <thead><tr><th>Kelime</th><th>Türkçe</th><th>Durum</th><th>Kutu (DE→TR / TR→DE)</th><th></th></tr></thead>
    <tbody>${rows.length ? rows.map(rowHtml).join("") : `<tr><td colspan="5" class="muted">Sonuç bulunamadı.</td></tr>`}</tbody>
  </table></div>`;
}

function rowHtml({ word, userWord, cards }) {
  const status = userWord ? userWord.status : "new";
  const boxes = cards.length
    ? cards.map((c) => `${directionLabel(c.direction)}: ${c.box}`).join(", ")
    : `<span class="muted">—</span>`;
  return `<tr id="row-${esc(word.id)}">
    <td>${esc(word.anzeige)}</td>
    <td>${esc(word.tr)}</td>
    <td><span class="badge badge--${status}">${esc(STATUS_LABELS[status] || status)}</span></td>
    <td>${boxes}</td>
    <td>
      <select data-action="override-status" data-word-id="${esc(word.id)}">
        ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === status ? "selected" : ""}>${esc(l)}</option>`).join("")}
      </select>
    </td>
  </tr>`;
}

async function handleStatusOverride(select) {
  const wordId = select.dataset.wordId;
  const newStatus = select.value;
  const uw = await get("userWords", wordId);
  if (!uw) return;
  uw.status = newStatus;
  await put("userWords", uw);
}

// ---------- statistics ----------

function barRow(label, count, max) {
  const pct = max ? Math.round((100 * count) / max) : 0;
  return `<div class="bar-row"><span class="bar-row__label">${esc(label)}</span><div class="bar-row__track"><div class="bar-row__fill" style="width:${pct}%;"></div></div><span class="bar-row__value">${count}</span></div>`;
}

async function renderStats() {
  const statusDist = await stats.statusDistribution();
  const boxDist = await stats.boxDistribution();
  const maxBox = Math.max(...Object.values(boxDist), 1);
  const maxStatus = Math.max(...Object.values(statusDist), 1);
  const daily = await stats.dailyAnswerCounts(30, todayStr());
  const forecast = await stats.reviewForecast(14, todayStr());
  const maxForecast = Math.max(...forecast.map((r) => r.dueCount), 1);

  root.innerHTML = `
    <h1 class="section-title">İstatistik</h1>
    <h2 class="section-title">Durum dağılımı</h2>
    <div class="card">${Object.entries(STATUS_LABELS).map(([k, l]) => barRow(l, statusDist[k] || 0, maxStatus)).join("")}</div>
    <h2 class="section-title">Kutu dağılımı</h2>
    <div class="card">${[1, 2, 3, 4, 5, 6].map((b) => barRow(`Kutu ${b}`, boxDist[b] || 0, maxBox)).join("")}</div>
    <h2 class="section-title">Son 30 gün</h2>
    <div class="card" style="overflow-x:auto;"><table>
      <thead><tr><th>Tarih</th><th>Cevap</th><th>Doğru</th><th>Doğruluk</th></tr></thead>
      <tbody>${daily.map((r) => `<tr><td>${formatDM(r.date)}</td><td>${r.total}</td><td>${r.correct}</td><td>${r.accuracy != null ? `%${r.accuracy}` : "—"}</td></tr>`).join("")}</tbody>
    </table></div>
    <h2 class="section-title">Önümüzdeki 14 gün — tekrar tahmini</h2>
    <div class="card">
      ${forecast.map((r) => barRow(formatDM(r.date), r.dueCount, maxForecast)).join("")}
      <p class="muted">Not: Kutu 1'deki kartlar aynı seans içinde tekrarlandığı için bu tahmine dahil değildir.</p>
    </div>
  `;
}

// ---------- settings ----------

async function renderSettings() {
  const s = await loadSettings();
  root.innerHTML = `
    <h1 class="section-title">Ayarlar</h1>
    <form id="settings-form" class="card">
      <div class="btn-row">
        <div class="field"><label>Set başına yeni kelime</label><input type="text" inputmode="numeric" name="daily_new_words" value="${s.daily_new_words}"></div>
        <div class="field"><label>Triyaj tavanı</label><input type="text" inputmode="numeric" name="triage_cap" value="${s.triage_cap}"></div>
        <div class="field"><label>Tekrar tavanı</label><input type="text" inputmode="numeric" name="review_cap" value="${s.review_cap}"></div>
        <div class="field"><label>Yığın eşiği</label><input type="text" inputmode="numeric" name="backlog_threshold" value="${s.backlog_threshold}"></div>
        <div class="field"><label>Aylık bilinen-kelime kontrolü</label><input type="text" inputmode="numeric" name="known_recheck_per_month" value="${s.known_recheck_per_month}"></div>
        <div class="field">
          <label>Kaynaklar</label>
          ${Object.entries(QUELLE_LABELS).map(([v, l]) => `
            <div class="checkbox-row">
              <input type="checkbox" id="source_${v}" name="sources_enabled" value="${v}" ${s.sources_enabled.includes(v) ? "checked" : ""}>
              <label for="source_${v}" style="margin:0;">${esc(l)}</label>
            </div>`).join("")}
        </div>
        <button class="btn btn--primary" type="submit">Kaydet</button>
        <p id="settings-message" class="muted"></p>
      </div>
    </form>

    <h2 class="section-title">Veri</h2>
    <div class="card">
      <p class="muted">Uygulamayla birlikte gelen kelime listesini yeniden okur (mevcut ilerlemeni bozmaz).</p>
      <button class="btn" id="reimport-btn" type="button">JSON'u yeniden içe aktar</button>
      <p id="reimport-message" class="muted"></p>
    </div>

    <h2 class="section-title">Yedekleme</h2>
    <div class="card">
      <p class="muted">
        Tüm ilerlemen sadece bu telefonda tutuluyor — sunucu yok. Telefon değişikliği,
        sıfırlama veya Safari'nin veriyi temizlemesi ihtimaline karşı düzenli aralıklarla
        <strong>Dışa Aktar</strong> ile bir yedek indirip Dosyalar/iCloud'a kaydetmen önerilir.
      </p>
      <div class="btn-row btn-row--inline">
        <button class="btn" id="export-btn" type="button">Dışa Aktar</button>
        <label class="btn" style="text-align:center;">
          İçe Aktar
          <input type="file" id="import-file-input" accept="application/json" style="display:none;">
        </label>
      </div>
      <p id="backup-message" class="muted"></p>
    </div>

    <h2 class="section-title">Tehlikeli bölge</h2>
    <div class="card">
      <p class="muted">Tüm kelime durumların, kutuların ve geçmişin silinir; her kelime "Yeni" durumuna döner. Geri alınamaz.</p>
      <button class="btn" id="reset-progress-btn" type="button" style="border-color:var(--color-danger);color:var(--color-danger);">Tüm ilerlemeyi sıfırla</button>
      <p id="reset-message" class="muted"></p>
    </div>
  `;
}

async function handleSettingsSubmit(form) {
  const fd = new FormData(form);
  const sourcesEnabled = fd.getAll("sources_enabled");
  await saveSettings({
    daily_new_words: parseInt(fd.get("daily_new_words"), 10) || 10,
    triage_cap: parseInt(fd.get("triage_cap"), 10) || 40,
    review_cap: parseInt(fd.get("review_cap"), 10) || 60,
    backlog_threshold: parseInt(fd.get("backlog_threshold"), 10) || 100,
    known_recheck_per_month: parseInt(fd.get("known_recheck_per_month"), 10) || 10,
    sources_enabled: sourcesEnabled.length ? sourcesEnabled : Object.keys(QUELLE_LABELS),
  });
  const msg = document.getElementById("settings-message");
  if (msg) msg.textContent = "Ayarlar kaydedildi.";
}

async function handleReimport() {
  const msg = document.getElementById("reimport-message");
  msg.textContent = "İçe aktarılıyor…";
  try {
    const res = await fetch("data/words.json", { cache: "no-store" });
    const data = await res.json();
    const result = await importWords(data);
    msg.textContent = `Eklenen: ${result.added}, Güncellenen: ${result.updated}, Değişmeyen: ${result.unchanged}`;
  } catch (err) {
    msg.textContent = `İçe aktarma başarısız: ${err.message}`;
  }
}

async function handleResetProgress() {
  const msg = document.getElementById("reset-message");
  if (!confirm("Tüm ilerlemeyi silmek istediğine emin misin? Bu geri alınamaz.")) return;
  msg.textContent = "Sıfırlanıyor…";
  try {
    const data = await fetch("data/words.json", { cache: "no-store" }).then((r) => r.json());
    await wipeAndReseed(data);
    msg.textContent = "İlerleme sıfırlandı.";
  } catch (err) {
    msg.textContent = `Sıfırlama başarısız: ${err.message}`;
  }
}

async function handleExport() {
  const msg = document.getElementById("backup-message");
  try {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `wortschatz-yedek-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    msg.textContent = "Yedek indirildi.";
  } catch (err) {
    msg.textContent = `Yedekleme başarısız: ${err.message}`;
  }
}

async function handleImportFile(file) {
  const msg = document.getElementById("backup-message");
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await importBackup(payload);
    msg.textContent = "Yedek geri yüklendi.";
  } catch (err) {
    msg.textContent = `Geri yükleme başarısız: ${err.message}`;
  }
}

// ---------- global event delegation ----------

function wireGlobalHandlers() {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "triage") {
      e.preventDefault();
      const uw = await get("userWords", btn.dataset.wordId);
      await planner.applyTriage(uw, btn.dataset.choice, todayStr(), currentItem.setId);
      return renderStudy();
    }
    if (action === "recheck") {
      e.preventDefault();
      const uw = await get("userWords", btn.dataset.wordId);
      await planner.applyRecheckAnswer(uw, btn.dataset.choice === "knew", todayStr());
      return renderStudy();
    }
    if (action === "review-meaning") {
      e.preventDefault();
      const correct = btn.dataset.choice === "knew";
      await planner.submitReviewAnswer(currentItem.card, correct, "meaning", todayStr(), currentItem.setId);
      return renderStudy();
    }
    if (action === "confirm-almost") {
      e.preventDefault();
      const { card, question } = pendingAlmost;
      await planner.submitReviewAnswer(card, btn.dataset.choice === "correct", question.type, todayStr(), currentItem.setId);
      pendingAlmost = null;
      return renderStudy();
    }
    if (action === "start-new-set") {
      e.preventDefault();
      await beginNewSet();
      return renderStudy();
    }
    if (action === "start-study") {
      e.preventDefault();
      location.hash = "#/study";
      return;
    }
    if (btn.id === "reimport-btn") return handleReimport();
    if (btn.id === "reset-progress-btn") return handleResetProgress();
    if (btn.id === "export-btn") return handleExport();
  });

  root.addEventListener("submit", async (e) => {
    if (e.target.dataset && e.target.dataset.action === "review-answer") {
      e.preventDefault();
      return handleReviewAnswerSubmit(e.target);
    }
    if (e.target.id === "settings-form") {
      e.preventDefault();
      return handleSettingsSubmit(e.target);
    }
  });

  root.addEventListener("change", async (e) => {
    if (e.target.dataset && e.target.dataset.action === "override-status") {
      return handleStatusOverride(e.target);
    }
    if (e.target.id === "import-file-input" && e.target.files[0]) {
      return handleImportFile(e.target.files[0]);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;
    const key = event.key === " " ? "space" : event.key;
    const target = root.querySelector(`[data-shortcut="${key}"]`);
    if (target) {
      event.preventDefault();
      target.click();
    }
  });
}

bootstrap();
