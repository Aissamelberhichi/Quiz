/**
 * EXAMPRO — APP.JS  (Quiz Engine v2.1)
 * Drives the quiz.html professional SaaS UI
 * Fixed: timer leak on retry, nav dot logic, side panel count,
 *        scroll behavior, screen display values.
 */
'use strict';

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
const Q = {
  exam:      null,
  questions: [],
  current:   0,
  selected:  [],
  answered:  false,
  score:     0,
  wrong:     0,
  timer:     null,
  timeLeft:  0,
  results:   {},   // keyed by index: { correct: bool }
};

/* ═══════════════════════════════════════════════
   DOM  (lazy-resolved after DOMContentLoaded)
═══════════════════════════════════════════════ */
let D = {};

document.addEventListener('DOMContentLoaded', async () => {
  D = {
    loadingScreen:    document.getElementById('loadingScreen'),
    errorScreen:      document.getElementById('errorScreen'),
    errorTitle:       document.getElementById('errorTitle'),
    errorMsg:         document.getElementById('errorMsg'),
    quizScreen:       document.getElementById('quizScreen'),
    resultsScreen:    document.getElementById('resultsScreen'),

    // Topbar
    quizTitle:        document.getElementById('quizTitle'),
    progressFill:     document.getElementById('progressFill'),
    progressBar:      document.getElementById('progressBar'),
    timerDisplay:     document.getElementById('timerDisplay'),
    timerText:        document.getElementById('timerText'),

    // Left panel
    navGrid:          document.getElementById('questionNavGrid'),
    liveScoreCard:    document.getElementById('liveScoreCard'),
    sidePanelScore:   document.getElementById('sidePanelScore'),
    sidePanelTotal:   document.getElementById('sidePanelTotal'),
    sideCorrect:      document.getElementById('sideCorrect'),
    sideWrong:        document.getElementById('sideWrong'),
    sideRemaining:    document.getElementById('sideRemaining'),

    // Right panel
    infoTitle:        document.getElementById('infoTitle'),
    infoEtab:         document.getElementById('infoEtab'),
    infoSpec:         document.getElementById('infoSpec'),
    infoYear:         document.getElementById('infoYear'),
    infoEchelle:      document.getElementById('infoEchelle'),
    progressCard:     document.getElementById('progressCard'),
    progressPct:      document.getElementById('progressPct'),
    sideProgressFill: document.getElementById('sideProgressFill'),

    // Question
    qIndex:           document.getElementById('qIndex'),
    qTotal:           document.getElementById('qTotal'),
    qTypeBadge:       document.getElementById('qTypeBadge'),
    qTypeLabel:       document.getElementById('qTypeLabel'),
    questionTag:      document.getElementById('questionTag'),
    questionText:     document.getElementById('questionText'),
    optionsList:      document.getElementById('optionsList'),
    explanationBox:   document.getElementById('explanationBox'),
    explanationText:  document.getElementById('explanationText'),

    // Buttons
    btnSubmit:        document.getElementById('btnSubmit'),
    btnNext:          document.getElementById('btnNext'),
    backBtn:          document.getElementById('backBtn'),

    // Results
    resultsGrade:     document.getElementById('resultsGrade'),
    resultsTitle:     document.getElementById('resultsTitle'),
    resultsSub:       document.getElementById('resultsSub'),
    scorePercent:     document.getElementById('scorePercent'),
    scoreRingFill:    document.getElementById('scoreRingFill'),
    statCorrect:      document.getElementById('statCorrect'),
    statWrong:        document.getElementById('statWrong'),
    statTotal:        document.getElementById('statTotal'),
    btnRetry:         document.getElementById('btnRetry'),
    btnHome:          document.getElementById('btnHome'),
  };

  // Retrieve selected exam from localStorage
  let exam;
  try { exam = JSON.parse(localStorage.getItem('selectedExam')); }
  catch (e) { exam = null; }

  if (!exam?.file) {
    showError('Aucun examen sélectionné', "Retournez à l'accueil et choisissez un examen.");
    return;
  }

  Q.exam = exam;
  populateExamInfo(exam);
  D.quizTitle.textContent = exam.title;

  // Hide timer if no duration configured
  if (!exam.duration) D.timerDisplay.style.display = 'none';

  // Wire buttons once — they survive screen transitions
  D.btnSubmit.addEventListener('click', handleSubmit);
  D.btnNext.addEventListener('click', handleNext);
  D.btnRetry.addEventListener('click', retryQuiz);
  D.btnHome.addEventListener('click', () => { window.location.href = 'index.html'; });
  D.backBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

  // Load Excel file
  showScreen('loading');
  try {
    const qs = await loadExamFile(exam.file);
    if (!qs?.length) throw new Error('Aucune question trouvée dans ce fichier.');
    Q.questions = qs;
    startQuiz();
  } catch (err) {
    showError('Impossible de charger l\'examen', err.message);
  }
});

/* ═══════════════════════════════════════════════
   EXAM INFO PANEL
═══════════════════════════════════════════════ */
function populateExamInfo(exam) {
  if (D.infoTitle)   D.infoTitle.textContent   = exam.title;
  if (D.infoEtab)    D.infoEtab.textContent    = exam.etab;
  if (D.infoSpec)    D.infoSpec.textContent     = exam.spec;
  if (D.infoYear)    D.infoYear.textContent     = exam.year;
  if (D.infoEchelle) D.infoEchelle.textContent  = exam.echelle;
}

/* ═══════════════════════════════════════════════
   EXCEL LOADER
═══════════════════════════════════════════════ */
async function loadExamFile(filename) {
  let ab;
  try {
    const r = await fetch(`exams/${encodeURIComponent(filename)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    ab = await r.arrayBuffer();
  } catch (e) {
    throw new Error(
      `Fichier introuvable : "${filename}". ` +
      `Assurez-vous qu'il est dans le dossier /exams/ et que le site est servi via HTTP (pas file://).`
    );
  }

  if (typeof XLSX === 'undefined') throw new Error('Bibliothèque XLSX introuvable.');

  const wb    = XLSX.read(ab, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return parseQuestions(rows);
}

/* ═══════════════════════════════════════════════
   PARSER  — flexible column name matching
═══════════════════════════════════════════════ */
function parseQuestions(rows) {
  const norm = s => String(s).toLowerCase().replace(/[\s_\-]/g, '');

  return rows.map((row, idx) => {
    const keys = Object.keys(row);

    // Question text
    const qKey = keys.find(k => norm(k).includes('question'));
    const text  = qKey ? String(row[qKey]).trim() : '';
    if (!text) return null;

    // Options (up to 6)
    const options = [];
    for (let i = 1; i <= 6; i++) {
      const k = keys.find(k => {
        const nk = norm(k);
        return (
          nk === 'answeroption' + i ||
          nk === 'option'       + i ||
          nk === 'reponse'      + i ||
          nk === 'choix'        + i ||
          nk === 'proposition'  + i
        );
      });
      if (k && String(row[k]).trim()) options.push(String(row[k]).trim());
    }
    if (options.length === 0) return null;

    // Correct answer indices (1-based in sheet → 0-based internally)
    const cKey = keys.find(k => {
      const nk = norm(k);
      return (
        nk.includes('correctanswer') ||
        nk.includes('bonnesreponses') ||
        nk.includes('reponsescorrectes') ||
        nk.includes('answercorrect') ||
        nk === 'correct' ||
        nk === 'reponse'
      );
    });
    const correctRaw     = cKey ? String(row[cKey]).trim() : '';
    const correctIndices = correctRaw
      .split(/[;,\s]+/)
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(n => !isNaN(n) && n >= 0 && n < options.length);

    // Explanation
    const eKey = keys.find(k => {
      const nk = norm(k);
      return (
        nk.includes('explanation') ||
        nk.includes('explication') ||
        nk.includes('justification') ||
        nk.includes('overallexplanation')
      );
    });
    const explanation = eKey ? String(row[eKey]).trim() : '';

    return {
      id: idx + 1,
      text,
      options,
      correctIndices,
      explanation,
      isMultiple: correctIndices.length > 1,
    };
  }).filter(Boolean);
}

/* ═══════════════════════════════════════════════
   QUIZ FLOW
═══════════════════════════════════════════════ */
function retryQuiz() {
  stopTimer();   // ← BUG FIX: always stop any running timer before restart
  startQuiz();
}

function startQuiz() {
  Q.current  = 0;
  Q.selected = [];
  Q.answered = false;
  Q.score    = 0;
  Q.wrong    = 0;
  Q.results  = {};   // plain object — no sparse-array length issues

  // Reset timer display
  if (Q.exam?.duration) {
    Q.timeLeft = Q.exam.duration * 60;
    startTimer();
  }

  buildNavGrid();

  // Show side panels
  if (D.liveScoreCard) D.liveScoreCard.style.display = 'block';
  if (D.progressCard)  D.progressCard.style.display  = 'block';
  if (D.sidePanelTotal) D.sidePanelTotal.textContent = Q.questions.length;

  updateSidePanel();
  showScreen('quiz');
  renderQuestion();
}

/* ── QUESTION NAVIGATOR GRID ─────────────────── */
function buildNavGrid() {
  if (!D.navGrid) return;
  D.navGrid.innerHTML = '';
  Q.questions.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'q-nav-dot';
    dot.textContent = i + 1;
    dot.setAttribute('aria-label', `Question ${i + 1}`);
    dot.dataset.idx = i;

    dot.addEventListener('click', () => {
      // Allow free navigation to any already-answered question,
      // or to any question when the current one is answered.
      const targetAnswered = Q.results[i] !== undefined;
      const currentAnswered = Q.results[Q.current] !== undefined;

      if (i === Q.current) return; // already here
      if (!currentAnswered && !targetAnswered) return; // can't skip unanswered
      if (targetAnswered || currentAnswered) {
        Q.current  = i;
        Q.selected = [];
        Q.answered = Q.results[i] !== undefined;
        renderQuestion();
        // Re-show answer state if already answered
        if (Q.answered) restoreAnsweredState(i);
        updateNavGrid();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    D.navGrid.appendChild(dot);
  });
  updateNavGrid();
}

function updateNavGrid() {
  if (!D.navGrid) return;
  D.navGrid.querySelectorAll('.q-nav-dot').forEach((dot, i) => {
    dot.className = 'q-nav-dot';
    if (i === Q.current)           dot.classList.add('current');
    else if (Q.results[i] === true)  dot.classList.add('correct');
    else if (Q.results[i] === false) dot.classList.add('wrong');
  });
}

/* Restore the visual state when navigating back to an answered question */
function restoreAnsweredState(idx) {
  const q       = Q.questions[idx];
  const correct = q.correctIndices;

  // We don't store which options were selected, so show correct/wrong based on result
  D.optionsList.querySelectorAll('.option-item').forEach(li => {
    const i = parseInt(li.dataset.idx);
    li.classList.add('disabled');
    li.removeAttribute('tabindex');
    if (correct.includes(i)) {
      li.classList.add('correct');
    }
  });

  if (Q.results[idx] === false) {
    // Show it was wrong — highlight first option as wrong if none selected
    const firstWrong = D.optionsList.querySelector('.option-item:not(.correct)');
    if (firstWrong) firstWrong.classList.add('wrong');
  }

  if (q.explanation) {
    D.explanationText.textContent = q.explanation;
    D.explanationBox.style.display = 'block';
  }

  D.btnSubmit.style.display = 'none';
  D.btnNext.style.display   = 'inline-flex';

  const isLast = idx === Q.questions.length - 1;
  D.btnNext.innerHTML = isLast
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Voir les résultats`
    : `Suivant <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:14px;height:14px"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
  D.btnNext.className = isLast ? 'btn btn-brand' : 'btn btn-primary';
}

/* ── SIDE PANEL ──────────────────────────────── */
function updateSidePanel() {
  const answeredCount = Object.keys(Q.results).length; // BUG FIX: use object keys, not array .length
  const total         = Q.questions.length;
  const remaining     = total - answeredCount;
  const pct           = total ? Math.round((answeredCount / total) * 100) : 0;
  const qPct          = total ? Math.round(((Q.current + 1) / total) * 100) : 0;

  if (D.sidePanelScore)   D.sidePanelScore.textContent    = Q.score;
  if (D.sideCorrect)      D.sideCorrect.textContent       = Q.score;
  if (D.sideWrong)        D.sideWrong.textContent         = Q.wrong;
  if (D.sideRemaining)    D.sideRemaining.textContent     = remaining;
  if (D.progressPct)      D.progressPct.textContent       = pct + '%';
  if (D.sideProgressFill) D.sideProgressFill.style.width = pct + '%';

  // Topbar progress bar reflects position through exam
  if (D.progressFill) D.progressFill.style.width = qPct + '%';
  if (D.progressBar)  D.progressBar.setAttribute('aria-valuenow', qPct);
}

/* ── RENDER QUESTION ─────────────────────────── */
function renderQuestion() {
  const q   = Q.questions[Q.current];
  const idx = Q.current;
  const tot = Q.questions.length;
  const pad = n => String(n).padStart(2, '0');

  if (D.qIndex)       D.qIndex.textContent       = idx + 1;
  if (D.qTotal)       D.qTotal.textContent       = tot;
  if (D.questionTag)  D.questionTag.textContent  = `Q${pad(idx + 1)}`;
  if (D.questionText) D.questionText.textContent = q.text;

  // Type badge
  if (D.qTypeBadge) D.qTypeBadge.className = `q-type-badge ${q.isMultiple ? 'multiple' : 'single'}`;
  if (D.qTypeLabel) D.qTypeLabel.textContent = q.isMultiple ? 'Plusieurs réponses' : 'Réponse unique';

  // Build option items
  D.optionsList.innerHTML = '';
  const LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
  q.options.forEach((opt, i) => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.tabIndex = 0;
    li.dataset.idx = i;
    li.innerHTML = `
      <div class="option-marker">
        <span class="option-marker-lbl">${LABELS[i] || i + 1}</span>
        <svg class="option-marker-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <span class="option-text">${escapeHtml(opt)}</span>
    `;
    li.addEventListener('click',   () => toggleOption(i));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOption(i); }
    });
    D.optionsList.appendChild(li);
  });

  // Reset UI for fresh question
  Q.selected = [];
  Q.answered = false;
  D.explanationBox.style.display = 'none';
  D.btnSubmit.disabled           = true;
  D.btnSubmit.style.display      = 'inline-flex';
  D.btnNext.style.display        = 'none';

  // Scroll top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── TOGGLE OPTION ───────────────────────────── */
function toggleOption(i) {
  if (Q.answered) return;
  const q   = Q.questions[Q.current];
  const sel = Q.selected;

  if (q.isMultiple) {
    const pos = sel.indexOf(i);
    pos === -1 ? sel.push(i) : sel.splice(pos, 1);
  } else {
    Q.selected = sel[0] === i ? [] : [i];
  }

  D.optionsList.querySelectorAll('.option-item').forEach(li => {
    const idx = parseInt(li.dataset.idx);
    const on  = Q.selected.includes(idx);
    li.classList.toggle('selected', on);
    li.setAttribute('aria-selected', String(on));
  });

  D.btnSubmit.disabled = Q.selected.length === 0;
}

/* ── SUBMIT ──────────────────────────────────── */
function handleSubmit() {
  if (Q.answered) return;
  Q.answered = true;

  const q       = Q.questions[Q.current];
  const correct = q.correctIndices;
  const sel     = Q.selected;

  const isCorrect =
    sel.length === correct.length &&
    correct.every(i => sel.includes(i));

  if (isCorrect) Q.score++; else Q.wrong++;
  Q.results[Q.current] = isCorrect;

  // Color all options
  D.optionsList.querySelectorAll('.option-item').forEach(li => {
    const i = parseInt(li.dataset.idx);
    li.classList.add('disabled');
    li.removeAttribute('tabindex');
    li.classList.remove('selected');

    if (correct.includes(i)) {
      li.classList.add('correct');
      if (!sel.includes(i)) li.style.opacity = '0.75'; // missed correct answer
    } else if (sel.includes(i)) {
      li.classList.add('wrong');
    }
  });

  // Show explanation
  if (q.explanation) {
    D.explanationText.textContent = q.explanation;
    D.explanationBox.style.display = 'block';
  }

  updateNavGrid();
  updateSidePanel();

  // Swap buttons
  const isLast = Q.current === Q.questions.length - 1;
  D.btnSubmit.style.display = 'none';
  D.btnNext.style.display   = 'inline-flex';

  if (isLast) {
    D.btnNext.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           style="width:14px;height:14px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      Voir les résultats`;
    D.btnNext.className = 'btn btn-brand';
  } else {
    D.btnNext.innerHTML = `Suivant
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
           style="width:14px;height:14px"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    D.btnNext.className = 'btn btn-primary';
  }
}

/* ── NEXT ────────────────────────────────────── */
function handleNext() {
  if (Q.current === Q.questions.length - 1) {
    stopTimer();
    showResults();
  } else {
    Q.current++;
    renderQuestion();
    updateNavGrid();
    updateSidePanel();
  }
}

/* ═══════════════════════════════════════════════
   RESULTS
═══════════════════════════════════════════════ */
function showResults() {
  const total = Q.questions.length;
  const pct   = total > 0 ? Math.round((Q.score / total) * 100) : 0;

  // Animate score ring — circumference = 2π × r(60) ≈ 376.99
  const C = 377;
  // Use requestAnimationFrame so the transition plays after display:flex is set
  showScreen('results');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      D.scoreRingFill.style.strokeDashoffset = C - (C * pct / 100);
    });
  });

  let ringColor, gradeClass, gradeLabel, title, sub;

  if (pct >= 80) {
    ringColor = '#1a7a4a'; gradeClass = 'excellent';
    gradeLabel = '🏆 Excellent';
    title = 'Bravo, vous maîtrisez ce sujet !';
    sub   = `Vous avez obtenu ${Q.score} bonnes réponses sur ${total}. Un résultat remarquable.`;
  } else if (pct >= 65) {
    ringColor = '#1d6a4a'; gradeClass = 'good';
    gradeLabel = '🎯 Bon travail';
    title = 'Très bonne performance !';
    sub   = `${Q.score} / ${total} — Continuez à vous entraîner pour atteindre l'excellence.`;
  } else if (pct >= 45) {
    ringColor = '#b07d1a'; gradeClass = 'average';
    gradeLabel = '📘 Passable';
    title = 'Des progrès à faire.';
    sub   = `${Q.score} / ${total} — Révisez les points faibles et recommencez.`;
  } else {
    ringColor = '#c0392b'; gradeClass = 'poor';
    gradeLabel = '💪 Insuffisant';
    title = 'Restez motivé !';
    sub   = `${Q.score} / ${total} — La pratique régulière est la clé de la réussite.`;
  }

  D.scoreRingFill.style.stroke    = ringColor;
  D.resultsGrade.className        = `results-grade ${gradeClass}`;
  D.resultsGrade.textContent      = gradeLabel;
  D.resultsTitle.textContent      = title;
  D.resultsSub.textContent        = sub;
  D.scorePercent.textContent      = pct + '%';
  D.statCorrect.textContent       = Q.score;
  D.statWrong.textContent         = Q.wrong;
  D.statTotal.textContent         = total;
}

/* ═══════════════════════════════════════════════
   TIMER
═══════════════════════════════════════════════ */
function startTimer() {
  stopTimer(); // defensive: clear any existing interval first
  renderTimer();
  Q.timer = setInterval(() => {
    Q.timeLeft--;
    renderTimer();
    if (Q.timeLeft <= 0) {
      stopTimer();
      if (!Q.answered) handleSubmit();
      setTimeout(showResults, 1500);
    }
  }, 1000);
}

function stopTimer() {
  if (Q.timer) {
    clearInterval(Q.timer);
    Q.timer = null;
  }
}

function renderTimer() {
  const t  = Math.max(0, Q.timeLeft);
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  if (D.timerText) D.timerText.textContent = `${mm}:${ss}`;
  if (D.timerDisplay) {
    D.timerDisplay.classList.remove('warn', 'danger');
    if      (t <= 60)  D.timerDisplay.classList.add('danger');
    else if (t <= 300) D.timerDisplay.classList.add('warn');
  }
}

/* ═══════════════════════════════════════════════
   SCREEN MANAGER
═══════════════════════════════════════════════ */
function showScreen(name) {
  // Use display:none for all, then show the right one
  const screens = {
    loading: [D.loadingScreen, 'flex'],
    error:   [D.errorScreen,   'flex'],
    quiz:    [D.quizScreen,    'block'],
    results: [D.resultsScreen, 'flex'],
  };

  Object.values(screens).forEach(([el]) => { if (el) el.style.display = 'none'; });

  const [el, displayVal] = screens[name] || [];
  if (el) el.style.display = displayVal;
}

function showError(title, msg) {
  if (D.errorTitle) D.errorTitle.textContent = title;
  if (D.errorMsg)   D.errorMsg.textContent   = msg || '';
  showScreen('error');
}

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
