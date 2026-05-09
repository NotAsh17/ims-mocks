/* ============================================================
   CAT SIMCAT Test Engine
   Reads `testData` and `totalTestTime` from the host page.
   ============================================================ */
(function () {
  'use strict';

  // ── Status constants ──────────────────────────────────────────
  const S = {
    NOT_VISITED: 'not-visited',
    VISITED:     'visited',
    ANSWERED:    'answered',
    MARKED:      'marked',
  };

  // ── State ─────────────────────────────────────────────────────
  let state = mkState();

  function mkState() {
    return {
      currentSection:       null,
      currentQIndex:        0,
      answers:              {},   // qId → [string indices]
      qStatus:              {},   // qId → S.*
      qTimeStart:           {},   // qId → timestamp
      qTimeSpent:           {},   // qId → seconds
      sectionTimings:       {},   // sectionName → totalSeconds
      sectionTimeLeft:      {},   // sectionName → remainingSeconds
      sectionSubmitted:     {},   // sectionName → bool
      testSubmitted:        false,
      solutionMode:         false,
      solutionFilter:       'all',
      solutionQList:        [],   // [[sec,idx,qId], ...]
      solutionQPointer:     0,
      totalTimeLeft:        totalTestTime,
      globalTimerInterval:  null,
      sectionTimerInterval: null,
    };
  }

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    state = mkState();
    document.body.innerHTML = buildAppHTML();

    // Init per-section state
    for (const sec of sections()) {
      state.sectionSubmitted[sec] = false;
      state.sectionTimeLeft[sec]  = 0;
    }
    // Init question statuses
    for (const qId of allQIds()) {
      state.qStatus[qId] = S.NOT_VISITED;
    }

    attachListeners();
    // Start modal is already visible
  }

  // ── Sections / qIds helpers ───────────────────────────────────
  function sections()  { return Object.keys(testData.sections); }
  function allQIds()   { return sections().flatMap(s => testData.sections[s]); }
  function sectionOf(qId) {
    for (const [s, ids] of Object.entries(testData.sections))
      if (ids.includes(+qId) || ids.includes(qId)) return s;
    return null;
  }

  // ── HTML Builders ─────────────────────────────────────────────
  function buildAppHTML() {
    const secs = sections();
    const defaultMin = Math.floor(totalTestTime / 60 / secs.length);

    return `
${buildStartModal(secs, defaultMin)}
${buildSubmitModal()}

<header class="test-header">
  <div class="header-left">
    <button class="icon-btn" id="btn-menu" aria-label="Open palette">
      <i class="fas fa-bars"></i>
    </button>
    <span class="test-name">${testData.name}</span>
  </div>
  <div class="header-center">
    <div class="section-timer-wrap">
      <span class="st-label">Section</span>
      <span class="section-timer" id="section-timer">--:--</span>
    </div>
    <div class="timer-track"><div class="timer-fill" id="timer-fill"></div></div>
  </div>
  <div class="header-right">
    <div class="global-timer" id="global-timer">${fmtGlobal(totalTestTime)}</div>
  </div>
</header>

<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span>Palette</span>
      <button class="icon-btn" id="btn-close-sidebar"><i class="fas fa-times"></i></button>
    </div>
    <div class="section-tabs" id="section-tabs">
      ${secs.map((s, i) => `
        <button class="section-tab ${i === 0 ? 'active' : ''}" data-section="${esc(s)}">
          ${abbr(s)}
        </button>`).join('')}
    </div>
    <div class="palette-panels" id="palette-panels">
      ${secs.map((s, i) => `
        <div class="palette-panel ${i === 0 ? 'active' : ''}" data-section="${esc(s)}" id="panel-${sid(s)}">
          ${testData.sections[s].map((qId, idx) => `
            <button class="q-btn not-visited" data-section="${esc(s)}" data-index="${idx}" data-qid="${qId}">
              ${idx + 1}
            </button>`).join('')}
        </div>`).join('')}
    </div>
    <div class="palette-legend">
      <div class="legend-row">
        <div class="legend-item"><span class="legend-dot answered"></span>Answered</div>
        <div class="legend-item"><span class="legend-dot marked"></span>Marked</div>
      </div>
      <div class="legend-row">
        <div class="legend-item"><span class="legend-dot visited"></span>Visited</div>
        <div class="legend-item"><span class="legend-dot not-visited"></span>Not Visited</div>
      </div>
    </div>
    <div class="sidebar-footer">
      <button class="btn btn-danger w-full" id="btn-submit-section" disabled>
        <i class="fas fa-paper-plane"></i> Submit Section
      </button>
    </div>
  </aside>

  <main class="main-content">
    <div class="section-bar">
      <span id="section-name-display">—</span>
      <span class="q-counter" id="q-counter"></span>
    </div>
    <div class="question-area" id="question-area">
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Configure timing and start the test</p>
      </div>
    </div>
    <div class="nav-bar" id="nav-bar">
      <button class="btn btn-ghost" id="btn-prev" disabled>
        <i class="fas fa-arrow-left"></i> Previous
      </button>
      <button class="btn btn-review" id="btn-mark-review">
        <i class="fas fa-bookmark"></i> Mark for Review
      </button>
      <button class="btn btn-primary" id="btn-next">
        Next <i class="fas fa-arrow-right"></i>
      </button>
    </div>
  </main>
</div>

<div class="results-overlay hidden" id="results-overlay"></div>
<div class="sidebar-overlay" id="sidebar-overlay"></div>
<div class="toast-container" id="toast-container"></div>`;
  }

  function buildStartModal(secs, defaultMin) {
    return `
<div class="modal-overlay active" id="start-modal">
  <div class="modal">
    <div class="modal-header">
      <h2>${testData.name}</h2>
      <p class="modal-subtitle">Set time per section (total: ${Math.floor(totalTestTime/60)} min)</p>
    </div>
    <div class="modal-body">
      <div class="timing-grid">
        ${secs.map(s => `
          <div class="timing-row">
            <label class="timing-label">${s}</label>
            <div class="timing-input-wrap">
              <input type="number" class="timing-input" id="time-${sid(s)}"
                value="${defaultMin}" min="1" max="120">
              <span class="timing-unit">min</span>
            </div>
          </div>`).join('')}
      </div>
      <p class="timing-total">Default split: ${defaultMin} min each</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-quick-start">
        <i class="fas fa-bolt"></i> Quick Start
      </button>
      <button class="btn btn-primary" id="btn-start-test">
        <i class="fas fa-play"></i> Start Test
      </button>
    </div>
  </div>
</div>`;
  }

  function buildSubmitModal() {
    return `
<div class="modal-overlay hidden" id="submit-modal">
  <div class="modal modal-sm">
    <div class="modal-header">
      <h3 id="submit-modal-title">Submit Section?</h3>
    </div>
    <div class="modal-body">
      <p style="font-size:0.85rem;color:var(--text-muted)">
        Answers cannot be changed after submission.
      </p>
      <div class="submit-stats" id="submit-stats"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="btn-submit-cancel">Cancel</button>
      <button class="btn btn-danger" id="btn-submit-confirm">Submit</button>
    </div>
  </div>
</div>`;
  }

  // ── Attach listeners ──────────────────────────────────────────
  function attachListeners() {
    // Start modal
    $('btn-quick-start').addEventListener('click', () => {
      const m = Math.floor(totalTestTime / 60 / sections().length);
      sections().forEach(s => { const i = $(`time-${sid(s)}`); if (i) i.value = m; });
    });
    $('btn-start-test').addEventListener('click', handleStartTest);

    // Sidebar toggle
    $('btn-menu').addEventListener('click', openSidebar);
    $('btn-close-sidebar').addEventListener('click', closeSidebar);
    $('sidebar-overlay').addEventListener('click', closeSidebar);

    // Section tabs
    $$('.section-tab').forEach(t =>
      t.addEventListener('click', () => switchPalettePanel(t.dataset.section))
    );

    // Palette q-btn clicks (delegated)
    $('palette-panels').addEventListener('click', e => {
      const btn = e.target.closest('.q-btn');
      if (!btn) return;
      navigateToQ(btn.dataset.section, +btn.dataset.index);
      closeSidebar();
    });

    // Navigation
    $('btn-prev').addEventListener('click', () => navigate(-1));
    $('btn-next').addEventListener('click', () => navigate(1));
    $('btn-mark-review').addEventListener('click', handleMarkForReview);

    // Submit section
    $('btn-submit-section').addEventListener('click', () =>
      showSubmitModal(state.currentSection)
    );
    $('btn-submit-cancel').addEventListener('click', hideSubmitModal);
    $('btn-submit-confirm').addEventListener('click', confirmSubmit);

    // Options (delegated)
    $('question-area').addEventListener('click', e => {
      if (state.testSubmitted || state.solutionMode) return;
      if (state.sectionSubmitted[state.currentSection]) return;
      const opt = e.target.closest('.option-btn');
      if (opt) handleOptionClick(opt.dataset.qid, opt.dataset.idx);
    });

    // TITA input (delegated)
    $('question-area').addEventListener('input', e => {
      if (state.testSubmitted || state.sectionSubmitted[state.currentSection]) return;
      const inp = e.target.closest('.input-answer');
      if (inp) handleInputChange(inp.dataset.qid, inp.value.trim());
    });
  }

  // ── Start test ────────────────────────────────────────────────
  function handleStartTest() {
    const secs = sections();
    let total = 0;
    const timings = {};

    for (const s of secs) {
      const inp = $(`time-${sid(s)}`);
      const m = parseInt(inp?.value) || 0;
      if (m <= 0) { toast(`Enter valid time for ${s}`, 'error'); inp?.focus(); return; }
      timings[s] = m * 60;
      total += m;
    }
    if (total > totalTestTime / 60) {
      toast(`Total (${total} min) exceeds limit (${Math.floor(totalTestTime/60)} min)`, 'error');
      return;
    }

    secs.forEach(s => {
      state.sectionTimings[s]  = timings[s];
      state.sectionTimeLeft[s] = timings[s];
    });

    hide('start-modal');
    show('start-modal'); // keep overlay hidden
    $('start-modal').classList.remove('active');
    $('start-modal').classList.add('hidden');

    state.currentSection = secs[0];
    state.currentQIndex  = 0;

    startGlobalTimer();
    startSectionTimer(state.currentSection);
    updateSectionBar();
    showQuestion(state.currentSection, 0);
    setActiveSectionTab(state.currentSection);
    switchPalettePanel(state.currentSection);
  }

  // ── Timers ────────────────────────────────────────────────────
  function startGlobalTimer() {
    const start = Date.now();
    state.globalTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      state.totalTimeLeft = Math.max(0, totalTestTime - elapsed);
      renderGlobalTimer();
      if (state.totalTimeLeft === 0) { clearInterval(state.globalTimerInterval); submitTest(); }
    }, 1000);
    renderGlobalTimer();
  }

  function startSectionTimer(sec) {
    if (state.sectionTimerInterval) clearInterval(state.sectionTimerInterval);
    const start     = Date.now();
    const allocated = state.sectionTimings[sec];

    state.sectionTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      state.sectionTimeLeft[sec] = Math.max(0, allocated - elapsed);
      renderSectionTimer(sec);
      if (state.sectionTimeLeft[sec] === 0) {
        clearInterval(state.sectionTimerInterval);
        toast(`Time up for ${sec}! Auto-submitting…`, 'warning');
        submitSection(sec);
      }
    }, 1000);
    renderSectionTimer(sec);
  }

  function renderGlobalTimer() {
    const el = $('global-timer');
    if (!el) return;
    el.textContent = fmtGlobal(state.totalTimeLeft);
    el.classList.toggle('danger', state.totalTimeLeft < 300);
  }

  function renderSectionTimer(sec) {
    const left      = state.sectionTimeLeft[sec] ?? 0;
    const allocated = state.sectionTimings[sec]  ?? 1;
    const m = Math.floor(left / 60), s2 = left % 60;
    const timerEl = $('section-timer'), fillEl = $('timer-fill');

    if (timerEl) {
      timerEl.textContent = `${pad(m)}:${pad(s2)}`;
      timerEl.classList.toggle('danger', left < 60);
    }
    if (fillEl) {
      const pct = ((allocated - left) / allocated) * 100;
      fillEl.style.width = `${pct}%`;
      fillEl.className = 'timer-fill' + (pct > 80 ? ' danger' : pct > 60 ? ' warning' : '');
    }
  }

  // ── Show question ─────────────────────────────────────────────
  function showQuestion(sec, idx) {
    commitTime();

    const qId = testData.sections[sec][idx];
    state.qTimeStart[qId] = Date.now();

    if (state.qStatus[qId] === S.NOT_VISITED)
      state.qStatus[qId] = S.VISITED;

    state.currentSection = sec;
    state.currentQIndex  = idx;

    const q     = testData.questions[qId];
    const total = testData.sections[sec].length;

    $('question-area').innerHTML = renderQuestion(q, qId, sec, idx, total);
    $('q-counter').textContent   = `Q ${idx + 1} / ${total}`;
    updateSectionBar();
    updatePaletteBtn(qId);
    setActivePaletteBtn(sec, idx);
    updateNavBar(sec, idx);
    updateMarkReviewBtn(qId);
    updateSubmitSectionBtn(sec);
  }

  // ── Render question HTML ──────────────────────────────────────
  function renderQuestion(q, qId, sec, idx, total) {
    const submitted  = state.sectionSubmitted[sec] || state.testSubmitted;
    const inSolution = state.solutionMode;
    const userAns    = state.answers[qId] || [];
    const labels     = ['A','B','C','D','E','F'];

    // --- Options / TITA ---
    let bodyHTML = '';

    if (q.is_input_type) {
      const val  = userAns[0] || '';
      const corr = q.correct_response[0][0];
      let cls = '';
      if (inSolution) cls = val === corr ? 'inp-correct' : val ? 'inp-wrong' : '';

      bodyHTML = `
        <div class="input-section">
          ${q.input_instructions ? `<p class="input-hint">${q.input_instructions}</p>` : ''}
          <input type="number" class="input-answer ${cls}"
            data-qid="${qId}" value="${escAttr(val)}"
            ${submitted ? 'disabled' : ''}
            placeholder="Type your answer">
          ${inSolution ? `
            <div class="correct-answer-tag">
              <i class="fas fa-check-circle"></i>
              Correct: <strong>${corr}</strong>
            </div>` : ''}
        </div>`;
    } else {
      const opts = q.options.map((opt, i) => {
        const isSelected = userAns.includes(i.toString());
        const isCorrect  = q.correct_response[0].includes((i + 1).toString());
        let cls = 'option-btn';
        if (inSolution) {
          if      (isSelected && isCorrect)  cls += ' opt-correct';
          else if (isSelected && !isCorrect) cls += ' opt-wrong';
          else if (!isSelected && isCorrect) cls += ' opt-correct-missed';
        } else if (isSelected) {
          cls += ' opt-selected';
        }
        return `
          <button class="${cls}" data-qid="${qId}" data-idx="${i}"
            ${submitted ? 'disabled' : ''}>
            <span class="opt-label">${labels[i] || i + 1}</span>
            <span class="opt-text">${opt}</span>
            ${inSolution && isSelected && isCorrect  ? '<span class="opt-tick"><i class="fas fa-check"></i></span>' : ''}
            ${inSolution && isSelected && !isCorrect ? '<span class="opt-cross"><i class="fas fa-times"></i></span>' : ''}
          </button>`;
      }).join('');
      bodyHTML = `<div class="options-list">${opts}</div>`;
    }

    // --- Time spent (solution mode) ---
    let timeHTML = '';
    if (inSolution && state.qTimeSpent[qId]) {
      const t = state.qTimeSpent[qId];
      const tooLong = t > 180;
      timeHTML = `
        <div class="time-spent-badge ${tooLong ? 'time-long' : ''}">
          <i class="fas fa-clock"></i>
          ${pad(Math.floor(t/60))}m ${pad(t%60)}s spent
          ${tooLong ? '<span class="time-flag">⚠ Over-time</span>' : ''}
        </div>`;
    }

    // --- Solution (solution mode) ---
    let solutionHTML = '';
    if (inSolution) {
      const correctText = q.is_input_type
        ? q.correct_response[0][0]
        : q.correct_response[0].map(n => q.options[+n - 1]).filter(Boolean).join('; ');

      solutionHTML = `
        <div class="solution-block">
          <div class="solution-header">
            <i class="fas fa-lightbulb"></i> Solution
          </div>
          <div class="solution-body">
            ${q.solution || '<em style="color:var(--text-muted)">No solution provided.</em>'}
          </div>
          <div class="correct-answer-summary">
            <strong>Correct Answer:</strong> ${correctText}
          </div>
        </div>`;
    }

    // --- Status badge (solution mode) ---
    let statusBadge = '';
    if (inSolution) {
      const has = userAns.length > 0;
      const ok  = has && isCorrect(qId);
      const badge = has
        ? (ok ? {cls:'badge-correct', icon:'fa-check-circle',   txt:'Correct'}
              : {cls:'badge-wrong',   icon:'fa-times-circle',   txt:'Wrong'})
        : {cls:'badge-skip', icon:'fa-minus-circle', txt:'Not Attempted'};
      statusBadge = `
        <span class="q-status-badge ${badge.cls}">
          <i class="fas ${badge.icon}"></i> ${badge.txt}
        </span>`;
    }

    return `
      <div class="question-card">
        <div class="q-card-header">
          <div class="q-card-meta">
            <span class="q-num-badge">Q ${idx + 1}</span>
            <span class="q-marks-badge">
              <i class="fas fa-star"></i> ${q.marks} marks
              ${q.negative_marks > 0 ? `<span class="neg">−${q.negative_marks}</span>` : ''}
            </span>
            ${statusBadge}
          </div>
        </div>
        ${q.instructions ? `<div class="q-instructions">${q.instructions}</div>` : ''}
        <div class="q-body">${q.question_text}</div>
        ${bodyHTML}
        ${timeHTML}
        ${solutionHTML}
      </div>`;
  }

  // ── Option / input handlers ───────────────────────────────────
  function handleOptionClick(qId, idx) {
    const q = testData.questions[qId];
    idx = idx.toString();

    if (q.is_multi_select) {
      const curr = [...(state.answers[qId] || [])];
      const pos  = curr.indexOf(idx);
      pos === -1 ? curr.push(idx) : curr.splice(pos, 1);
      state.answers[qId] = curr.length ? curr : undefined;
    } else {
      const curr = state.answers[qId] || [];
      state.answers[qId] = (curr.length === 1 && curr[0] === idx)
        ? undefined : [idx];
    }

    const hasAns = !!(state.answers[qId]?.length);
    state.qStatus[qId] = hasAns ? S.ANSWERED : S.VISITED;
    if (state.qStatus[qId] === S.ANSWERED && state.answers[qId] === undefined)
      state.qStatus[qId] = S.VISITED;

    // Keep marked state if user selects/deselects while marked
    // (mark+answer is common strategy)
    updatePaletteBtn(qId);

    // Re-render just options in-place
    $$('.option-btn').forEach(btn => {
      if (btn.dataset.qid != qId) return;
      const i = btn.dataset.idx.toString();
      btn.classList.toggle('opt-selected', !!(state.answers[qId]?.includes(i)));
      btn.querySelector('.opt-label').style.background =
        state.answers[qId]?.includes(i) ? 'var(--primary)' : '';
      btn.querySelector('.opt-label').style.color =
        state.answers[qId]?.includes(i) ? '#fff' : '';
      btn.querySelector('.opt-label').style.borderColor =
        state.answers[qId]?.includes(i) ? 'var(--primary)' : '';
    });

    updateSubmitSectionBtn(state.currentSection);
  }

  function handleInputChange(qId, val) {
    if (val) {
      state.answers[qId] = [val];
      state.qStatus[qId] = S.ANSWERED;
    } else {
      delete state.answers[qId];
      state.qStatus[qId] = S.VISITED;
    }
    updatePaletteBtn(qId);
    updateSubmitSectionBtn(state.currentSection);
  }

  // ── Mark for review ───────────────────────────────────────────
  function handleMarkForReview() {
    const qId = currentQId();
    if (state.qStatus[qId] === S.MARKED) {
      const hasAns = !!(state.answers[qId]?.length);
      state.qStatus[qId] = hasAns ? S.ANSWERED : S.VISITED;
      toast('Removed from review', 'info');
    } else {
      state.qStatus[qId] = S.MARKED;
      toast('Marked for review', 'success');
    }
    updatePaletteBtn(qId);
    updateMarkReviewBtn(qId);
  }

  // ── Navigation ────────────────────────────────────────────────
  function navigate(dir) {
    const secs   = sections();
    const qIds   = testData.sections[state.currentSection];
    const newIdx = state.currentQIndex + dir;

    if (newIdx >= 0 && newIdx < qIds.length) {
      commitTime();
      showQuestion(state.currentSection, newIdx);
      scrollTop();
      return;
    }

    const secIdx = secs.indexOf(state.currentSection);

    if (dir > 0) {
      if (!state.sectionSubmitted[state.currentSection]) {
        showSubmitModal(state.currentSection);
        return;
      }
      if (secIdx < secs.length - 1) {
        const next = secs[secIdx + 1];
        if (!state.sectionSubmitted[next]) {
          commitTime();
          switchSection(next);
        }
      }
    } else {
      if (secIdx > 0) {
        toast('That section is already submitted', 'warning');
      }
    }
  }

  function navigateToQ(sec, idx) {
    if (sec !== state.currentSection &&
        !state.sectionSubmitted[state.currentSection] &&
        !state.testSubmitted) {
      toast(`Submit ${abbr(state.currentSection)} before switching`, 'warning');
      return;
    }
    if (state.sectionSubmitted[sec]) {
      toast(`${abbr(sec)} is already submitted`, 'warning');
      return;
    }
    commitTime();
    if (sec !== state.currentSection) { switchSection(sec, idx); return; }
    showQuestion(sec, idx);
    scrollTop();
  }

  function switchSection(sec, idx = 0) {
    if (state.sectionTimerInterval) clearInterval(state.sectionTimerInterval);
    state.currentSection = sec;
    state.currentQIndex  = idx;
    startSectionTimer(sec);
    showQuestion(sec, idx);
    setActiveSectionTab(sec);
    switchPalettePanel(sec);
    updateSectionBar();
  }

  // ── Submit ────────────────────────────────────────────────────
  function showSubmitModal(sec) {
    const qIds    = testData.sections[sec];
    const ans     = qIds.filter(id => state.answers[id]?.length).length;
    const marked  = qIds.filter(id => state.qStatus[id] === S.MARKED).length;
    const skipped = qIds.length - ans;

    $('submit-modal-title').textContent = `Submit ${abbr(sec)}?`;
    $('submit-stats').innerHTML = `
      <div class="submit-stat"><span>${qIds.length}</span><label>Total</label></div>
      <div class="submit-stat answered"><span>${ans}</span><label>Answered</label></div>
      <div class="submit-stat marked"><span>${marked}</span><label>Marked</label></div>
      <div class="submit-stat skipped"><span>${skipped}</span><label>Skipped</label></div>`;

    $('submit-modal').classList.remove('hidden');
    $('submit-modal').classList.add('active');
  }

  function hideSubmitModal() {
    $('submit-modal').classList.add('hidden');
    $('submit-modal').classList.remove('active');
  }

  function confirmSubmit() { hideSubmitModal(); submitSection(state.currentSection); }

  function submitSection(sec) {
    if (state.sectionSubmitted[sec]) return;
    if (state.sectionTimerInterval) clearInterval(state.sectionTimerInterval);
    commitTime();

    state.sectionSubmitted[sec] = true;
    testData.sections[sec].forEach(id => updatePaletteBtn(id));
    setActiveSectionTab(sec);

    $('btn-submit-section').disabled = true;
    $('btn-submit-section').innerHTML = '<i class="fas fa-check"></i> Submitted';

    const next = sections().find(s => !state.sectionSubmitted[s]);
    if (!next) { submitTest(); return; }

    toast(`${abbr(sec)} submitted! Moving to ${abbr(next)}`, 'success');
    switchSection(next);
  }

  function submitTest() {
    if (state.testSubmitted) return;
    clearInterval(state.globalTimerInterval);
    clearInterval(state.sectionTimerInterval);
    commitTime();
    state.testSubmitted = true;
    saveResult();
    showResults();
  }

  // ── Results ───────────────────────────────────────────────────
  function calcResults() {
    let totalQ = 0, totalMx = 0, obtained = 0,
        correct = 0, wrong = 0, attempted = 0;
    const bySection = {};

    for (const sec of sections()) {
      const ids = testData.sections[sec];
      let sQ = ids.length, sCor = 0, sWrong = 0, sAtt = 0, sMx = 0, sObt = 0, sTime = 0;

      ids.forEach(qId => {
        const q = testData.questions[qId];
        sMx   += q.marks;
        sTime += state.qTimeSpent[qId] || 0;
        const ans = state.answers[qId];
        if (ans?.length) {
          sAtt++;
          if (isCorrect(qId)) { sCor++;  sObt += q.marks; }
          else                { sWrong++; sObt -= q.negative_marks; }
        }
      });

      bySection[sec] = {
        total: sQ, correct: sCor, wrong: sWrong,
        attempted: sAtt, maxMarks: sMx, obtained: sObt,
        timeSpent: sTime,
        accuracy: sAtt > 0 ? Math.round((sCor / sAtt) * 100) : 0,
      };
      totalQ += sQ; totalMx += sMx; obtained += sObt;
      correct += sCor; wrong += sWrong; attempted += sAtt;
    }

    return {
      totalQ, totalMx, obtained, correct, wrong, attempted, bySection,
      accuracy:   attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
      percentile: estimatePercentile(obtained, totalMx),
    };
  }

  function estimatePercentile(score, max) {
    const norm = (score / max) * 228;
    const bands = [
      [175,'99.9+'], [160,'99.7'], [148,'99.5'], [135,'99'],
      [120,'98'],    [105,'95'],   [88,'90'],     [72,'85'],
      [58,'80'],     [44,'75'],    [30,'70'],      [0,'< 70'],
    ];
    for (const [th, pct] of bands) if (norm >= th) return pct;
    return '< 70';
  }

  function showResults() {
    const r    = calcResults();
    const secs = sections();

    const sectionCards = secs.map(sec => {
      const sr = r.bySection[sec];
      const tm = Math.floor(sr.timeSpent / 60), ts = sr.timeSpent % 60;
      return `
        <div class="result-section-card">
          <div class="rsc-header">${sec}</div>
          <div class="rsc-stats">
            <div class="rsc-stat">
              <span class="rsc-val ${sr.obtained>=0?'positive':'negative'}">${sr.obtained.toFixed(1)}</span>
              <span class="rsc-label">Score</span>
            </div>
            <div class="rsc-stat">
              <span class="rsc-val">${sr.attempted}/${sr.total}</span>
              <span class="rsc-label">Attempted</span>
            </div>
            <div class="rsc-stat">
              <span class="rsc-val correct-val">${sr.correct}</span>
              <span class="rsc-label">Correct</span>
            </div>
            <div class="rsc-stat">
              <span class="rsc-val wrong-val">${sr.wrong}</span>
              <span class="rsc-label">Wrong</span>
            </div>
            <div class="rsc-stat">
              <span class="rsc-val">${sr.accuracy}%</span>
              <span class="rsc-label">Accuracy</span>
            </div>
            <div class="rsc-stat">
              <span class="rsc-val">${pad(tm)}m&nbsp;${pad(ts)}s</span>
              <span class="rsc-label">Time</span>
            </div>
          </div>
        </div>`;
    }).join('');

    const ring = buildRing(r.obtained, r.totalMx);

    $('results-overlay').innerHTML = `
      <div class="results-page">
        <div class="results-header">
          <a href="index.html" class="btn btn-ghost btn-sm">
            <i class="fas fa-home"></i> Home
          </a>
          <h1>${testData.name} — Results</h1>
          <div></div>
        </div>

        <div class="results-hero">
          ${ring}
          <div class="results-hero-right">
            <div class="percentile-badge">
              <div class="pct-label">Estimated Percentile</div>
              <div class="pct-value">${r.percentile}</div>
            </div>
            <div class="results-summary-stats">
              <div class="rs-stat">
                <span class="rs-val">${r.attempted}/${r.totalQ}</span>
                <span class="rs-label">Attempted</span>
              </div>
              <div class="rs-stat">
                <span class="rs-val correct-val">${r.correct}</span>
                <span class="rs-label">Correct</span>
              </div>
              <div class="rs-stat">
                <span class="rs-val wrong-val">${r.wrong}</span>
                <span class="rs-label">Wrong</span>
              </div>
              <div class="rs-stat">
                <span class="rs-val">${r.accuracy}%</span>
                <span class="rs-label">Accuracy</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section-cards-grid">${sectionCards}</div>

        <div class="results-actions">
          <button class="btn btn-ghost" onclick="_enterSolution('all')">
            <i class="fas fa-book-open"></i> All Solutions
          </button>
          <button class="btn btn-warning" onclick="_enterSolution('wrong')">
            <i class="fas fa-times-circle"></i> Review Wrong (${countFilter('wrong')})
          </button>
          <button class="btn btn-ghost" onclick="_enterSolution('unattempted')">
            <i class="fas fa-minus-circle"></i> Skipped (${countFilter('unattempted')})
          </button>
          <button class="btn btn-primary" onclick="_retake()">
            <i class="fas fa-redo"></i> Retake Test
          </button>
        </div>
      </div>`;

    $('results-overlay').classList.remove('hidden');
  }

  function buildRing(obtained, max) {
    const pct    = Math.max(0, Math.min(100, (obtained / max) * 100));
    const r      = 54, circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    const color  = pct >= 60 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

    return `
      <div class="score-ring-wrap">
        <svg class="score-ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="${r}" class="ring-track"/>
          <circle cx="60" cy="60" r="${r}" class="ring-fill"
            style="stroke:${color};stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${offset.toFixed(1)}"/>
        </svg>
        <div class="score-ring-text">
          <div class="score-main">${Math.max(0, obtained).toFixed(1)}</div>
          <div class="score-total">/ ${max}</div>
        </div>
      </div>`;
  }

  // ── Solution mode ─────────────────────────────────────────────
  function enterSolutionMode(filter) {
    state.solutionMode   = true;
    state.solutionFilter = filter;

    // Build filtered list
    state.solutionQList = [];
    for (const sec of sections()) {
      testData.sections[sec].forEach((qId, idx) => {
        const ans  = state.answers[qId];
        const has  = ans?.length > 0;
        const ok   = has && isCorrect(qId);
        const inc  = filter === 'all'
          || (filter === 'wrong'       && has  && !ok)
          || (filter === 'unattempted' && !has)
          || (filter === 'correct'     && has  &&  ok);
        if (inc) state.solutionQList.push([sec, idx, qId]);
      });
    }

    if (!state.solutionQList.length) {
      toast('No questions match this filter', 'info');
      return;
    }

    state.solutionQPointer = 0;
    $('results-overlay').classList.add('hidden');

    // Swap nav bar to solution mode
    $('nav-bar').innerHTML = `
      <button class="btn btn-ghost" id="btn-sol-prev">
        <i class="fas fa-arrow-left"></i> Prev
      </button>
      <div class="sol-filter-btns">
        <button class="btn btn-sm ${filter==='all'?'active':''}"
          onclick="_enterSolution('all')">All (${countFilter('all')})</button>
        <button class="btn btn-sm btn-wrong ${filter==='wrong'?'active':''}"
          onclick="_enterSolution('wrong')">Wrong (${countFilter('wrong')})</button>
        <button class="btn btn-sm ${filter==='unattempted'?'active':''}"
          onclick="_enterSolution('unattempted')">Skipped (${countFilter('unattempted')})</button>
      </div>
      <button class="btn btn-ghost" id="btn-sol-next">Next <i class="fas fa-arrow-right"></i></button>
      <button class="btn btn-primary btn-sm" onclick="_showResults()">Results</button>`;

    $('btn-sol-prev').addEventListener('click', () => solNav(-1));
    $('btn-sol-next').addEventListener('click', () => solNav(1));

    // Enable all palette buttons in solution mode
    $$('.q-btn').forEach(b => b.classList.remove('disabled'));
    $('btn-submit-section').style.display = 'none';
    $('btn-mark-review').style.display    = 'none';

    showSolQuestion(0);
  }

  function showSolQuestion(ptr) {
    if (ptr < 0 || ptr >= state.solutionQList.length) return;
    state.solutionQPointer = ptr;
    const [sec, idx, qId] = state.solutionQList[ptr];
    state.currentSection   = sec;
    state.currentQIndex    = idx;

    const total = state.solutionQList.length;
    $('question-area').innerHTML = renderQuestion(
      testData.questions[qId], qId, sec, idx, total
    );
    $('q-counter').textContent = `${ptr + 1} / ${total}`;
    $('section-name-display').textContent = sec;

    setActivePaletteBtn(sec, idx);
    setActiveSectionTab(sec);
    switchPalettePanel(sec);

    const prevEl = $('btn-sol-prev'), nextEl = $('btn-sol-next');
    if (prevEl) prevEl.disabled = ptr === 0;
    if (nextEl) nextEl.disabled = ptr === total - 1;
    scrollTop();
  }

  function solNav(dir) { showSolQuestion(state.solutionQPointer + dir); }

  function countFilter(filter) {
    let n = 0;
    for (const sec of sections()) {
      testData.sections[sec].forEach(qId => {
        const ans = state.answers[qId];
        const has = ans?.length > 0;
        if (filter === 'all')         n++;
        if (filter === 'wrong'        && has  && !isCorrect(qId)) n++;
        if (filter === 'unattempted'  && !has)                    n++;
        if (filter === 'correct'      && has  &&  isCorrect(qId)) n++;
      });
    }
    return n;
  }

  // ── Retake ────────────────────────────────────────────────────
  function retakeTest() { boot(); }

  // ── localStorage ──────────────────────────────────────────────
  function saveResult() {
    try {
      const r   = calcResults();
      const key = `simcat_result_${testData.name}`;
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      arr.unshift({
        date: new Date().toISOString(),
        score: r.obtained, maxScore: r.totalMx,
        correct: r.correct, wrong: r.wrong,
        attempted: r.attempted, total: r.totalQ,
        percentile: r.percentile,
      });
      localStorage.setItem(key, JSON.stringify(arr.slice(0, 5)));
    } catch (_) {}
  }

  // ── UI updaters ───────────────────────────────────────────────
  function updatePaletteBtn(qId) {
    const btn = document.querySelector(`.q-btn[data-qid="${qId}"]`);
    if (!btn) return;
    btn.className = 'q-btn';
    const sec = sectionOf(qId);
    if (state.sectionSubmitted[sec] || state.testSubmitted) {
      const ans = state.answers[qId];
      btn.classList.add(
        !ans?.length ? 'pal-unattempted'
        : isCorrect(qId) ? 'pal-correct' : 'pal-wrong'
      );
    } else {
      btn.classList.add(state.qStatus[qId] || S.NOT_VISITED);
    }
    // Re-apply active ring
    if (state.currentSection === sec &&
        testData.sections[sec]?.indexOf(+qId ?? qId) === state.currentQIndex)
      btn.classList.add('pal-active');
  }

  function setActivePaletteBtn(sec, idx) {
    $$('.q-btn').forEach(b => b.classList.remove('pal-active'));
    const btn = document.querySelector(
      `.q-btn[data-section="${esc(sec)}"][data-index="${idx}"]`
    );
    btn?.classList.add('pal-active');
  }

  function setActiveSectionTab(sec) {
    $$('.section-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.section === sec);
      t.classList.toggle('submitted', !!state.sectionSubmitted[t.dataset.section]);
    });
  }

  function switchPalettePanel(sec) {
    $$('.palette-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.section === sec)
    );
    $$('.section-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.section === sec)
    );
  }

  function updateSectionBar() {
    const el = $('section-name-display');
    if (el) el.textContent = state.currentSection || '—';
  }

  function updateNavBar(sec, idx) {
    const secs  = sections();
    const qIds  = testData.sections[sec];
    const isLastQ   = idx === qIds.length - 1;
    const isFirstQ  = idx === 0;
    const isLastSec = secs.indexOf(sec) === secs.length - 1;

    const prevBtn = $('btn-prev'), nextBtn = $('btn-next');
    if (!prevBtn || !nextBtn) return;

    prevBtn.disabled = isFirstQ && secs.indexOf(sec) === 0;

    if (isLastQ && isLastSec && state.sectionSubmitted[sec]) {
      nextBtn.innerHTML = '<i class="fas fa-flag-checkered"></i> Finish';
    } else if (isLastQ && !state.sectionSubmitted[sec]) {
      nextBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Section';
    } else {
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
    }
  }

  function updateMarkReviewBtn(qId) {
    const btn = $('btn-mark-review');
    if (!btn) return;
    const marked = state.qStatus[qId] === S.MARKED;
    btn.classList.toggle('active', marked);
    btn.innerHTML = marked
      ? '<i class="fas fa-bookmark"></i> Unmark'
      : '<i class="fas fa-bookmark"></i> Mark for Review';
  }

  function updateSubmitSectionBtn(sec) {
    const btn = $('btn-submit-section');
    if (!btn) return;
    if (state.sectionSubmitted[sec]) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-check"></i> Submitted';
      return;
    }
    const qIds  = testData.sections[sec];
    const hasAny = qIds.some(id => state.answers[id]?.length);
    btn.disabled = !hasAny;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Section';
  }

  // ── Correctness check ─────────────────────────────────────────
  function isCorrect(qId) {
    const q   = testData.questions[qId];
    const ans = state.answers[qId];
    if (!ans?.length) return false;
    if (q.is_input_type) return ans[0] === q.correct_response[0][0];
    const user    = ans.map(i => parseInt(i) + 1).sort((a,b)=>a-b);
    const correct = q.correct_response[0].map(i => parseInt(i)).sort((a,b)=>a-b);
    return JSON.stringify(user) === JSON.stringify(correct);
  }

  // ── Helpers ───────────────────────────────────────────────────
  function commitTime() {
    if (!state.currentSection) return;
    const qId = currentQId();
    if (state.qTimeStart[qId]) {
      const spent = Math.floor((Date.now() - state.qTimeStart[qId]) / 1000);
      state.qTimeSpent[qId] = (state.qTimeSpent[qId] || 0) + spent;
      delete state.qTimeStart[qId];
    }
  }

  function currentQId() {
    return testData.sections[state.currentSection]?.[state.currentQIndex];
  }

  function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebar-overlay').classList.add('active');
  }
  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('active');
  }

  function abbr(s) {
    if (s.includes('Verbal'))     return 'VARC';
    if (s.includes('Data'))       return 'DILR';
    if (s.includes('Quant'))      return 'QA';
    return s.slice(0, 4).toUpperCase();
  }
  function sid(s)     { return s.replace(/[^a-zA-Z0-9]/g, '_'); }
  function esc(s)     { return s.replace(/"/g, '&quot;'); }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function pad(n)     { return String(n).padStart(2, '0'); }
  function scrollTop(){ window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function fmtGlobal(t) {
    return `${pad(Math.floor(t/3600))}:${pad(Math.floor((t%3600)/60))}:${pad(t%60)}`;
  }

  function $(id)      { return document.getElementById(id); }
  function $$(sel)    { return document.querySelectorAll(sel); }

  // ── Toast ─────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const icons = { success:'fa-check-circle', error:'fa-exclamation-circle',
                    warning:'fa-exclamation-triangle', info:'fa-info-circle' };
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    container.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 300);
    }, 2800);
  }

  // ── Global hooks (for onclick in generated HTML) ───────────────
  window._enterSolution = enterSolutionMode;
  window._showResults   = showResults;
  window._retake        = retakeTest;

  // ── Init ──────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
