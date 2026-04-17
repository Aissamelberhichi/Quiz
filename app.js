/**
 * EXAM PLATFORM — APP.JS
 * Quiz engine: load Excel → parse → render questions → score
 */

'use strict';

/* ════════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════ */
const QuizState = {
  exam:         null,   // exam config object
  questions:    [],     // parsed question array
  current:      0,      // current question index
  selected:     [],     // indices of selected options
  answered:     false,  // whether current Q is submitted
  score:        0,      // correct answers count
  timer:        null,   // setInterval ref
  timeLeft:     0,      // seconds remaining
  timerEnabled: false,
};

/* ════════════════════════════════════════════════════════════
   DOM REFS (resolved after DOMContentLoaded)
════════════════════════════════════════════════════════════ */
let DOM = {};

/* ════════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  DOM = {
    quizApp:       document.getElementById('quizApp'),
    loadingScreen: document.getElementById('loadingScreen'),
    errorScreen:   document.getElementById('errorScreen'),
    errorMsg:      document.getElementById('errorMsg'),
    quizScreen:    document.getElementById('quizScreen'),
    resultsScreen: document.getElementById('resultsScreen'),

    // Header
    quizTitle:      document.getElementById('quizTitle'),
    quizSubtitle:   document.getElementById('quizSubtitle'),
    timerDisplay:   document.getElementById('timerDisplay'),
    progressFill:   document.getElementById('progressFill'),

    // Question
    qIndex:         document.getElementById('qIndex'),
    qTotal:         document.getElementById('qTotal'),
    scoreLive:      document.getElementById('scoreLive'),
    questionText:   document.getElementById('questionText'),
    questionHint:   document.getElementById('questionHint'),
    optionsList:    document.getElementById('optionsList'),
    explanationBox: document.getElementById('explanationBox'),
    explanationText:document.getElementById('explanationText'),

    // Buttons
    btnSubmit:      document.getElementById('btnSubmit'),
    btnNext:        document.getElementById('btnNext'),

    // Results
    scorePercent:   document.getElementById('scorePercent'),
    scoreRingFill:  document.getElementById('scoreRingFill'),
    statCorrect:    document.getElementById('statCorrect'),
    statWrong:      document.getElementById('statWrong'),
    statTotal:      document.getElementById('statTotal'),
    btnRetry:       document.getElementById('btnRetry'),
    btnHome:        document.getElementById('btnHome'),
    resultsTitle:   document.getElementById('resultsTitle'),
    resultsSub:     document.getElementById('resultsSub'),
    resultsTrophy:  document.getElementById('resultsTrophy'),
  };

  // Retrieve exam from localStorage
  let exam;
  try {
    exam = JSON.parse(localStorage.getItem('selectedExam'));
  } catch (e) {
    exam = null;
  }

  if (!exam || !exam.file) {
    showError('Aucun examen sélectionné.', 'Retournez à l\'accueil et choisissez un examen.');
    return;
  }

  QuizState.exam = exam;

  // Populate header
  DOM.quizTitle.textContent    = exam.title;
  DOM.quizSubtitle.textContent = `${exam.etab} · ${exam.echelle} · ${exam.year}`;

  // Timer opt-in
  QuizState.timerEnabled = !!exam.duration;
  if (!QuizState.timerEnabled) {
    DOM.timerDisplay.style.display = 'none';
  }

  // Load file
  showLoading();
  try {
    const questions = await loadExamFile(exam.file);
    if (!questions || questions.length === 0) {
      throw new Error('Aucune question trouvée dans ce fichier.');
    }
    QuizState.questions = questions;
    startQuiz();
  } catch (err) {
    showError('Impossible de charger l\'examen', err.message);
  }
});

/* ════════════════════════════════════════════════════════════
   EXCEL LOADER  (SheetJS via CDN)
════════════════════════════════════════════════════════════ */
async function loadExamFile(filename) {
  // Attempt fetch from /exams directory
  const url = `exams/${filename}`;
  let arrayBuffer;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fichier introuvable: ${filename} (HTTP ${response.status})`);
    }
    arrayBuffer = await response.arrayBuffer();
  } catch (fetchErr) {
    throw new Error(`Impossible de récupérer le fichier "${filename}". Vérifiez qu'il existe dans le dossier /exams et que vous utilisez un serveur local (Live Server / http-server).`);
  }

  // Parse with SheetJS
  if (typeof XLSX === 'undefined') {
    throw new Error('La bibliothèque XLSX (SheetJS) est introuvable. Vérifiez votre connexion internet.');
  }

  const workbook  = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];
  const raw       = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return parseQuestions(raw);
}

/* ════════════════════════════════════════════════════════════
   PARSE  — Normalize Excel rows → question objects
   Expected columns (case-insensitive match):
     Question | Answer Option 1..6 | Correct Answers | Overall Explanation
════════════════════════════════════════════════════════════ */
function parseQuestions(rows) {
  // Build a flexible key normalizer
  const norm = str => String(str).toLowerCase().replace(/[\s_\-]/g, '');

  return rows
    .map((row, idx) => {
      // Find question column
      const questionKey = Object.keys(row).find(k => norm(k).includes('question'));
      const text = questionKey ? String(row[questionKey]).trim() : '';
      if (!text) return null;

      // Find option columns (Answer Option 1 … 6)
      const options = [];
      for (let i = 1; i <= 6; i++) {
        const optKey = Object.keys(row).find(k => {
          const n = norm(k);
          return n.includes('answeroption' + i) || n.includes('option' + i) || n.includes('reponse' + i) || n === ('choix' + i);
        });
        if (optKey && String(row[optKey]).trim()) {
          options.push(String(row[optKey]).trim());
        }
      }

      // Find correct answers column
      const correctKey = Object.keys(row).find(k => {
        const n = norm(k);
        return n.includes('correctanswer') || n.includes('bonnesreponses') || n.includes('reponsescorrectes') || n.includes('answercorrect');
      });
      let correctRaw = correctKey ? String(row[correctKey]).trim() : '';

      // Parse "1;3" or "1,3" or "1" → [0, 2] (zero-indexed)
      const correctIndices = correctRaw
        .split(/[;,\s]+/)
        .map(s => parseInt(s.trim(), 10) - 1)
        .filter(n => !isNaN(n) && n >= 0 && n < options.length);

      // Find explanation column
      const explanationKey = Object.keys(row).find(k => {
        const n = norm(k);
        return n.includes('explanation') || n.includes('explication') || n.includes('justification');
      });
      const explanation = explanationKey ? String(row[explanationKey]).trim() : '';

      return {
        id: idx + 1,
        text,
        options,
        correctIndices,
        explanation,
        isMultiple: correctIndices.length > 1,
      };
    })
    .filter(Boolean);
}

/* ════════════════════════════════════════════════════════════
   QUIZ FLOW
════════════════════════════════════════════════════════════ */
function startQuiz() {
  QuizState.current  = 0;
  QuizState.selected = [];
  QuizState.answered = false;
  QuizState.score    = 0;

  if (QuizState.timerEnabled && QuizState.exam.duration) {
    QuizState.timeLeft = QuizState.exam.duration * 60;
    startTimer();
  }

  showScreen('quiz');
  renderQuestion();
  setupButtons();
}

function setupButtons() {
  DOM.btnSubmit.addEventListener('click', handleSubmit);
  DOM.btnNext.addEventListener('click', handleNext);
  DOM.btnRetry.addEventListener('click', () => startQuiz());
  DOM.btnHome.addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('backBtn').addEventListener('click', () => { window.location.href = 'index.html'; });
}

/* ── RENDER QUESTION ──────────────────────────────────────── */
function renderQuestion() {
  const q   = QuizState.questions[QuizState.current];
  const idx = QuizState.current;
  const tot = QuizState.questions.length;

  // Progress
  const pct = Math.round(((idx) / tot) * 100);
  DOM.progressFill.style.width = pct + '%';

  // Counter
  DOM.qIndex.textContent = idx + 1;
  DOM.qTotal.textContent = tot;
  DOM.scoreLive.textContent = `${QuizState.score} / ${idx}`;

  // Question text
  DOM.questionText.textContent = q.text;
  DOM.questionHint.textContent = q.isMultiple
    ? '☑ Plusieurs réponses possibles'
    : '○ Une seule réponse correcte';

  // Options
  DOM.optionsList.innerHTML = '';
  q.options.forEach((opt, i) => {
    const li = document.createElement('li');
    li.className = 'option-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.setAttribute('tabindex', '0');
    li.dataset.index = i;

    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    li.innerHTML = `
      <div class="option-marker">${labels[i]}</div>
      <span class="option-text">${opt}</span>
    `;

    li.addEventListener('click',   () => toggleOption(i));
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOption(i); }
    });
    DOM.optionsList.appendChild(li);
  });

  // Reset state
  QuizState.selected = [];
  QuizState.answered = false;
  DOM.explanationBox.style.display = 'none';
  DOM.btnSubmit.disabled = true;
  DOM.btnSubmit.style.display = 'inline-flex';
  DOM.btnNext.style.display = 'none';
}

/* ── TOGGLE OPTION ─────────────────────────────────────────── */
function toggleOption(index) {
  if (QuizState.answered) return;

  const q = QuizState.questions[QuizState.current];
  const sel = QuizState.selected;

  if (q.isMultiple) {
    const pos = sel.indexOf(index);
    if (pos === -1) sel.push(index);
    else sel.splice(pos, 1);
  } else {
    // Single choice — deselect all others
    QuizState.selected = sel[0] === index ? [] : [index];
  }

  // Update visuals
  document.querySelectorAll('.option-item').forEach(li => {
    const i = parseInt(li.dataset.index);
    const isSelected = QuizState.selected.includes(i);
    li.classList.toggle('selected', isSelected);
    li.setAttribute('aria-selected', isSelected);
  });

  DOM.btnSubmit.disabled = QuizState.selected.length === 0;
}

/* ── SUBMIT ─────────────────────────────────────────────────── */
function handleSubmit() {
  if (QuizState.answered) return;
  QuizState.answered = true;

  const q       = QuizState.questions[QuizState.current];
  const correct = q.correctIndices;
  const selected = QuizState.selected;

  // Compare sets
  const isFullyCorrect =
    selected.length === correct.length &&
    correct.every(i => selected.includes(i));

  if (isFullyCorrect) QuizState.score++;

  // Color options
  document.querySelectorAll('.option-item').forEach(li => {
    const i = parseInt(li.dataset.index);
    li.classList.add('disabled');
    li.removeAttribute('tabindex');

    if (correct.includes(i)) {
      li.classList.add('correct');
      li.classList.remove('selected');
    } else if (selected.includes(i)) {
      li.classList.add('wrong');
      li.classList.remove('selected');
    }
  });

  // Explanation
  if (q.explanation) {
    DOM.explanationText.textContent = q.explanation;
    DOM.explanationBox.style.display = 'block';
  }

  // Live score
  DOM.scoreLive.textContent = `${QuizState.score} / ${QuizState.current + 1}`;

  // Toggle buttons
  DOM.btnSubmit.style.display = 'none';
  DOM.btnNext.style.display   = 'inline-flex';

  const isLast = QuizState.current === QuizState.questions.length - 1;
  DOM.btnNext.textContent = isLast ? '🏁 Voir les résultats →' : 'Question suivante →';
  DOM.btnNext.className   = isLast ? 'btn btn-success' : 'btn btn-primary';
}

/* ── NEXT ───────────────────────────────────────────────────── */
function handleNext() {
  const isLast = QuizState.current === QuizState.questions.length - 1;
  if (isLast) {
    stopTimer();
    showResults();
    return;
  }
  QuizState.current++;
  renderQuestion();

  // Smooth scroll to top of quiz body
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════════════
   RESULTS
════════════════════════════════════════════════════════════ */
function showResults() {
  const total   = QuizState.questions.length;
  const correct = QuizState.score;
  const wrong   = total - correct;
  const pct     = Math.round((correct / total) * 100);

  // Progress ring: circumference = 2π × r = 2π × 65 ≈ 408.4
  const C = 408;
  DOM.scoreRingFill.style.strokeDashoffset = C - (C * pct / 100);
  DOM.scoreRingFill.style.stroke = pct >= 70 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';

  DOM.scorePercent.textContent = pct + '%';
  DOM.statCorrect.textContent  = correct;
  DOM.statWrong.textContent    = wrong;
  DOM.statTotal.textContent    = total;

  // Headline
  if (pct >= 80) {
    DOM.resultsTrophy.textContent = '🏆';
    DOM.resultsTitle.textContent  = 'Excellent !';
    DOM.resultsSub.textContent    = 'Vous maîtrisez ce sujet. Bravo !';
  } else if (pct >= 60) {
    DOM.resultsTrophy.textContent = '🎯';
    DOM.resultsTitle.textContent  = 'Bon travail !';
    DOM.resultsSub.textContent    = 'Continuez à vous entraîner pour progresser.';
  } else if (pct >= 40) {
    DOM.resultsTrophy.textContent = '📚';
    DOM.resultsTitle.textContent  = 'À revoir…';
    DOM.resultsSub.textContent    = 'Révisez les points faibles et réessayez.';
  } else {
    DOM.resultsTrophy.textContent = '💪';
    DOM.resultsTitle.textContent  = 'Ne lâchez pas !';
    DOM.resultsSub.textContent    = 'La pratique régulière est la clé du succès.';
  }

  showScreen('results');
}

/* ════════════════════════════════════════════════════════════
   TIMER
════════════════════════════════════════════════════════════ */
function startTimer() {
  updateTimerDisplay();
  QuizState.timer = setInterval(() => {
    QuizState.timeLeft--;
    updateTimerDisplay();
    if (QuizState.timeLeft <= 0) {
      stopTimer();
      // Auto-submit current if not answered, then go to results
      if (!QuizState.answered) handleSubmit();
      setTimeout(showResults, 1500);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(QuizState.timer);
  QuizState.timer = null;
}

function updateTimerDisplay() {
  const t = QuizState.timeLeft;
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  DOM.timerDisplay.innerHTML = `⏱ ${m}:${s}`;

  DOM.timerDisplay.classList.remove('warning', 'danger');
  if (t <= 60)  DOM.timerDisplay.classList.add('danger');
  else if (t <= 300) DOM.timerDisplay.classList.add('warning');
}

/* ════════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
════════════════════════════════════════════════════════════ */
function showScreen(name) {
  DOM.loadingScreen.style.display = 'none';
  DOM.errorScreen.style.display   = 'none';
  DOM.quizScreen.style.display    = 'none';
  DOM.resultsScreen.style.display = 'none';

  if (name === 'loading') DOM.loadingScreen.style.display = 'flex';
  if (name === 'error')   DOM.errorScreen.style.display   = 'flex';
  if (name === 'quiz')    DOM.quizScreen.style.display    = 'block';
  if (name === 'results') DOM.resultsScreen.style.display = 'block';
}

function showLoading() { showScreen('loading'); }

function showError(title, message) {
  document.getElementById('errorTitle').textContent = title;
  DOM.errorMsg.textContent = message || '';
  showScreen('error');
}
