/**
 * EXAMPRO — APP.JS  (Quiz Engine)
 * Drives the quiz.html professional SaaS UI
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
  results:   [],   // { correct: bool } per question
};

/* ═══════════════════════════════════════════════
   DOM  (lazy-resolved after DOMContentLoaded)
═══════════════════════════════════════════════ */
let D = {};

document.addEventListener('DOMContentLoaded', async () => {
  D = {
    loadingScreen:   document.getElementById('loadingScreen'),
    errorScreen:     document.getElementById('errorScreen'),
    errorTitle:      document.getElementById('errorTitle'),
    errorMsg:        document.getElementById('errorMsg'),
    quizScreen:      document.getElementById('quizScreen'),
    resultsScreen:   document.getElementById('resultsScreen'),

    // Topbar
    quizTitle:       document.getElementById('quizTitle'),
    progressFill:    document.getElementById('progressFill'),
    progressBar:     document.getElementById('progressBar'),
    timerDisplay:    document.getElementById('timerDisplay'),
    timerText:       document.getElementById('timerText'),

    // Left panel
    navGrid:         document.getElementById('questionNavGrid'),
    liveScoreCard:   document.getElementById('liveScoreCard'),
    sidePanelScore:  document.getElementById('sidePanelScore'),
    sidePanelTotal:  document.getElementById('sidePanelTotal'),
    sideCorrect:     document.getElementById('sideCorrect'),
    sideWrong:       document.getElementById('sideWrong'),
    sideRemaining:   document.getElementById('sideRemaining'),

    // Right panel
    infoTitle:       document.getElementById('infoTitle'),
    infoEtab:        document.getElementById('infoEtab'),
    infoSpec:        document.getElementById('infoSpec'),
    infoYear:        document.getElementById('infoYear'),
    infoEchelle:     document.getElementById('infoEchelle'),
    progressCard:    document.getElementById('progressCard'),
    progressPct:     document.getElementById('progressPct'),
    sideProgressFill:document.getElementById('sideProgressFill'),

    // Question
    qIndex:          document.getElementById('qIndex'),
    qTotal:          document.getElementById('qTotal'),
    qTypeBadge:      document.getElementById('qTypeBadge'),
    qTypeLabel:      document.getElementById('qTypeLabel'),
    questionTag:     document.getElementById('questionTag'),
    questionText:    document.getElementById('questionText'),
    optionsList:     document.getElementById('optionsList'),
    explanationBox:  document.getElementById('explanationBox'),
    explanationText: document.getElementById('explanationText'),

    // Buttons
    btnSubmit:       document.getElementById('btnSubmit'),
    btnNext:         document.getElementById('btnNext'),
    backBtn:         document.getElementById('backBtn'),

    // Results
    resultsGrade:    document.getElementById('resultsGrade'),
    resultsTitle:    document.getElementById('resultsTitle'),
    resultsSub:      document.getElementById('resultsSub'),
    scorePercent:    document.getElementById('scorePercent'),
    scoreRingFill:   document.getElementById('scoreRingFill'),
    statCorrect:     document.getElementById('statCorrect'),
    statWrong:       document.getElementById('statWrong'),
    statTotal:       document.getElementById('statTotal'),
    btnRetry:        document.getElementById('btnRetry'),
    btnHome:         document.getElementById('btnHome'),
  };

  // Load exam from localStorage
  let exam;
  try { exam = JSON.parse(localStorage.getItem('selectedExam')); }
  catch(e) { exam = null; }

  if (!exam?.file) {
    showError('Aucun examen sélectionné', 'Retournez à l\'accueil et choisissez un examen.');
    return;
  }

  Q.exam = exam;
  populateExamInfo(exam);
  D.quizTitle.textContent = exam.title;

  // Timer
  if (!exam.duration) {
    D.timerDisplay.style.display = 'none';
  }

  // Events
  D.btnSubmit.addEventListener('click', handleSubmit);
  D.btnNext.addEventListener('click', handleNext);
  D.btnRetry.addEventListener('click', () => startQuiz());
  D.btnHome.addEventListener('click', () => window.location.href = 'index.html');
  D.backBtn.addEventListener('click', () => window.location.href = 'index.html');

  // Load
  showScreen('loading');
  try {
    const qs = await loadExamFile(exam.file);
    if (!qs?.length) throw new Error('Aucune question trouvée dans ce fichier.');
    Q.questions = qs;
    startQuiz();
  } catch(err) {
    showError('Impossible de charger l\'examen', err.message);
  }
});

/* ═══════════════════════════════════════════════
   EXAM INFO PANEL
═══════════════════════════════════════════════ */
function populateExamInfo(exam) {
  D.infoTitle.textContent   = exam.title;
  D.infoEtab.textContent    = exam.etab;
  D.infoSpec.textContent    = exam.spec;
  D.infoYear.textContent    = exam.year;
  D.infoEchelle.textContent = exam.echelle;
}

/* ═══════════════════════════════════════════════
   EXCEL LOADER
═══════════════════════════════════════════════ */
async function loadExamFile(filename) {
  let ab;
  try {
    const r = await fetch(`exams/${filename}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} — ${filename}`);
    ab = await r.arrayBuffer();
  } catch(e) {
    throw new Error(`Fichier introuvable : "${filename}". Vérifiez qu'il est dans /exams/ et que vous utilisez un serveur local (Live Server).`);
  }

  if (typeof XLSX === 'undefined') throw new Error('Bibliothèque XLSX manquante.');
  const wb    = XLSX.read(ab, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return parseQuestions(rows);
}

/* ═══════════════════════════════════════════════
   PARSER
═══════════════════════════════════════════════ */
function parseQuestions(rows) {
  const n = s => String(s).toLowerCase().replace(/[\s_\-]/g, '');
  return rows.map((row, idx) => {
    const qKey = Object.keys(row).find(k => n(k).includes('question'));
    const text = qKey ? String(row[qKey]).trim() : '';
    if (!text) return null;

    const options = [];
    for (let i = 1; i <= 6; i++) {
      const k = Object.keys(row).find(k => {
        const nk = n(k);
        return nk === ('answeroption' + i) || nk === ('option' + i) || nk === ('reponse' + i) || nk === ('choix' + i);
      });
      if (k && String(row[k]).trim()) options.push(String(row[k]).trim());
    }

    const cKey = Object.keys(row).find(k => {
      const nk = n(k);
      return nk.includes('correctanswer') || nk.includes('bonnesreponses') || nk.includes('reponsescorrectes');
    });
    const correctRaw = cKey ? String(row[cKey]).trim() : '';
    const correctIndices = correctRaw
      .split(/[;,\s]+/)
      .map(s => parseInt(s.trim(), 10) - 1)
      .filter(n => !isNaN(n) && n >= 0 && n < options.length);

    const eKey = Object.keys(row).find(k => {
      const nk = n(k);
      return nk.includes('explanation') || nk.includes('explication') || nk.includes('justification');
    });
    const explanation = eKey ? String(row[eKey]).trim() : '';

    return { id: idx + 1, text, options, correctIndices, explanation, isMultiple: correctIndices.length > 1 };
  }).filter(Boolean);
}

/* ═══════════════════════════════════════════════
   QUIZ FLOW
═══════════════════════════════════════════════ */
function startQuiz() {
  Q.current  = 0;
  Q.selected = [];
  Q.answered = false;
  Q.score    = 0;
  Q.wrong    = 0;
  Q.results  = [];

  if (Q.exam?.duration) {
    Q.timeLeft = Q.exam.duration * 60;
    startTimer();
  }

  buildNavGrid();
  D.liveScoreCard.style.display = 'block';
  D.progressCard.style.display  = 'block';
  D.sidePanelTotal.textContent  = Q.questions.length;
  updateSidePanel();

  showScreen('quiz');
  renderQuestion();
}

/* ── BUILD NAV GRID ──────────────────────────── */
function buildNavGrid() {
  D.navGrid.innerHTML = '';
  Q.questions.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'q-nav-dot';
    dot.textContent = i + 1;
    dot.setAttribute('aria-label', `Question ${i + 1}`);
    dot.dataset.idx = i;
    dot.addEventListener('click', () => {
      if (!Q.answered && Q.current !== i) {
        // navigate only if current is answered or not yet started
        if (Q.results[Q.current] !== undefined || Q.current === i) {
          Q.current = i;
          Q.selected = [];
          Q.answered = false;
          renderQuestion();
          updateNavGrid();
        }
      }
    });
    D.navGrid.appendChild(dot);
  });
  updateNavGrid();
}

function updateNavGrid() {
  D.navGrid.querySelectorAll('.q-nav-dot').forEach((dot, i) => {
    dot.className = 'q-nav-dot';
    if (i === Q.current) dot.classList.add('current');
    else if (Q.results[i] === true)  dot.classList.add('correct');
    else if (Q.results[i] === false) dot.classList.add('wrong');
  });
}

/* ── SIDE PANEL ──────────────────────────────── */
function updateSidePanel() {
  const answered  = Q.results.length;
  const remaining = Q.questions.length - answered;
  const pct = Q.questions.length ? Math.round((answered / Q.questions.length) * 100) : 0;

  D.sidePanelScore.textContent = Q.score;
  D.sideCorrect.textContent    = Q.score;
  D.sideWrong.textContent      = Q.wrong;
  D.sideRemaining.textContent  = remaining;
  D.progressPct.textContent    = pct + '%';
  D.sideProgressFill.style.width = pct + '%';

  // Main progress bar
  const qPct = Math.round((Q.current / Q.questions.length) * 100);
  D.progressFill.style.width = qPct + '%';
  D.progressBar.setAttribute('aria-valuenow', qPct);
}

/* ── RENDER QUESTION ─────────────────────────── */
function renderQuestion() {
  const q   = Q.questions[Q.current];
  const idx = Q.current;
  const tot = Q.questions.length;
  const pad = n => String(n).padStart(2, '0');

  D.qIndex.textContent    = idx + 1;
  D.qTotal.textContent    = tot;
  D.questionTag.textContent = `Q${pad(idx + 1)}`;
  D.questionText.textContent = q.text;

  // Type badge
  const multi = q.isMultiple;
  D.qTypeBadge.className = `q-type-badge ${multi ? 'multiple' : 'single'}`;
  D.qTypeLabel.textContent = multi ? 'Plusieurs réponses' : 'Réponse unique';

  // Options
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
        <span class="option-marker-lbl">${LABELS[i]}</span>
        <svg class="option-marker-icon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <span class="option-text">${opt}</span>
    `;
    li.addEventListener('click', () => toggleOption(i));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOption(i); }
    });
    D.optionsList.appendChild(li);
  });

  // Reset UI
  Q.selected = [];
  Q.answered = false;
  D.explanationBox.style.display = 'none';
  D.btnSubmit.disabled = true;
  D.btnSubmit.style.display = 'inline-flex';
  D.btnNext.style.display   = 'none';

  // Scroll to top
  const main = document.getElementById('quizScreen');
  if (main) main.scrollTop = 0;
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
    li.setAttribute('aria-selected', on);
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

  const isCorrect = sel.length === correct.length && correct.every(i => sel.includes(i));
  if (isCorrect) Q.score++; else Q.wrong++;
  Q.results[Q.current] = isCorrect;

  // Color options
  D.optionsList.querySelectorAll('.option-item').forEach(li => {
    const i = parseInt(li.dataset.idx);
    li.classList.add('disabled');
    li.removeAttribute('tabindex');
    li.classList.remove('selected');

    if (correct.includes(i) && sel.includes(i)) {
      li.classList.add('correct');
    } else if (correct.includes(i)) {
      // Correct but not selected — show as missed
      li.classList.add('correct');
      li.style.opacity = '0.7';
    } else if (sel.includes(i)) {
      li.classList.add('wrong');
    }
  });

  // Explanation
  if (q.explanation) {
    D.explanationText.textContent = q.explanation;
    D.explanationBox.style.display = 'block';
  }

  // Update nav + side panel
  updateNavGrid();
  updateSidePanel();

  // Buttons
  const isLast = Q.current === Q.questions.length - 1;
  D.btnSubmit.style.display = 'none';
  D.btnNext.style.display   = 'inline-flex';

  if (isLast) {
    D.btnNext.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      Voir les résultats
    `;
    D.btnNext.className = 'btn btn-brand';
  } else {
    D.btnNext.innerHTML = `Suivant <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
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
    Q.selected = [];
    Q.answered = false;
    renderQuestion();
    updateNavGrid();
    updateSidePanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ═══════════════════════════════════════════════
   RESULTS
═══════════════════════════════════════════════ */
function showResults() {
  const total = Q.questions.length;
  const pct   = Math.round((Q.score / total) * 100);

  // Ring (circumference of r=60 → 2π×60 ≈ 376.99)
  const C = 376;
  D.scoreRingFill.style.strokeDashoffset = C - (C * pct / 100);

  let ringColor, gradeClass, gradeLabel, title, sub;

  if (pct >= 80) {
    ringColor = '#1a7a4a'; gradeClass = 'excellent';
    gradeLabel = '🏆 Excellent'; title = 'Bravo, vous maîtrisez ce sujet !';
    sub = `Vous avez obtenu ${Q.score} bonnes réponses sur ${total}. Un résultat remarquable.`;
  } else if (pct >= 65) {
    ringColor = '#1d6a4a'; gradeClass = 'good';
    gradeLabel = '🎯 Bon travail'; title = 'Très bonne performance !';
    sub = `${Q.score} / ${total} — Continuez à vous entraîner pour atteindre l'excellence.`;
  } else if (pct >= 45) {
    ringColor = '#b07d1a'; gradeClass = 'average';
    gradeLabel = '📘 Moyen'; title = 'Des progrès à faire.';
    sub = `${Q.score} / ${total} — Révisez les points faibles et recommencez.`;
  } else {
    ringColor = '#c0392b'; gradeClass = 'poor';
    gradeLabel = '💪 Insuffisant'; title = 'Restez motivé !';
    sub = `${Q.score} / ${total} — La pratique régulière est la clé de la réussite.`;
  }

  D.scoreRingFill.style.stroke = ringColor;
  D.resultsGrade.className  = `results-grade ${gradeClass}`;
  D.resultsGrade.textContent = gradeLabel;
  D.resultsTitle.textContent = title;
  D.resultsSub.textContent   = sub;
  D.scorePercent.textContent = pct + '%';
  D.statCorrect.textContent  = Q.score;
  D.statWrong.textContent    = Q.wrong;
  D.statTotal.textContent    = total;

  showScreen('results');
}

/* ═══════════════════════════════════════════════
   TIMER
═══════════════════════════════════════════════ */
function startTimer() {
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
  clearInterval(Q.timer);
  Q.timer = null;
}

function renderTimer() {
  const t  = Q.timeLeft;
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  D.timerText.textContent = `${mm}:${ss}`;
  D.timerDisplay.classList.remove('warn', 'danger');
  if      (t <= 60)  D.timerDisplay.classList.add('danger');
  else if (t <= 300) D.timerDisplay.classList.add('warn');
}

/* ═══════════════════════════════════════════════
   SCREEN MANAGER
═══════════════════════════════════════════════ */
function showScreen(name) {
  [D.loadingScreen, D.errorScreen, D.quizScreen, D.resultsScreen].forEach(el => {
    if (el) el.style.display = 'none';
  });
  if (name === 'loading') D.loadingScreen.style.display = 'flex';
  if (name === 'error')   D.errorScreen.style.display   = 'flex';
  if (name === 'quiz')    D.quizScreen.style.display    = 'flex';
  if (name === 'results') D.resultsScreen.style.display = 'flex';
}

function showError(title, msg) {
  D.errorTitle.textContent = title;
  D.errorMsg.textContent   = msg || '';
  showScreen('error');
}
