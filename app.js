/* ═══════════════════════════════════════════════════════════
   COMMAND CENTER — app.js
   ═══════════════════════════════════════════════════════════ */

/* ─── UTILS ──────────────────────────────────────────────── */
function uid()  { return Math.random().toString(36).slice(2,10); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function msToTime(ms) { const s=Math.floor(ms/1000),m=Math.floor(s/60); return `${m}:${(s%60).toString().padStart(2,'0')}`; }
function wait(ms) { return new Promise(r=>setTimeout(r,ms)); }

const xSVG      = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const handleSVG = `<svg width="9" height="13" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;
const downSVG   = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,4 6,8 10,4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const pencilSVG = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M8 2l2 2-6.5 6.5L1 11l.5-2.5L8 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><line x1="7" y1="3" x2="9" y2="5" stroke="currentColor" stroke-width="1.4"/></svg>`;

/* ─── STATE ──────────────────────────────────────────────── */

const DEFAULT_TASK_TIMER = 25 * 60;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem('cc_tasks') || 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch(e) {}
  return [
    { id:uid(), title:'Plan the week ahead',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Review open pull requests', done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Write release notes',       done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Update project roadmap',    done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
    { id:uid(), title:'Clear email inbox',         done:false, seat:false, orbit:false, timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER },
  ];
}
function saveTasks() { try { localStorage.setItem('cc_tasks', JSON.stringify(tasks)); } catch(e) {} }

let tasks = loadTasks();

const DURATIONS = { work:25*60, short:5*60, long:15*60 };

const pomo = { mode:'work', timeLeft:DURATIONS.work, running:false, sessions:0, interval:null };

let dragSrc = null;
let pendingLaunchTask  = null;  // task waiting for launch decision
let pendingSeatedTask  = null;  // task waiting for time-picker before seating
let taskTimerInterval  = null;

/* ─── NOTEBOOKS ──────────────────────────────────────────── */

const NB_COLORS = ['#6674f5','#f56b6b','#56cf6c','#f5d142','#c45de8','#f58c42','#22ccaa','#76c8f5'];
let notebooks = [];
let activeNotebookId  = null;
let activeNbTabId     = null;

function loadNotebooks() {
  try { notebooks = JSON.parse(localStorage.getItem('nb_notebooks') || '[]'); } catch(e) { notebooks = []; }
  if (notebooks.length === 0) {
    notebooks = [{
      id: uid(), name: 'Personal', color: NB_COLORS[0],
      tabs: [{ id: uid(), name: 'Main', tasks: [], notes: '' }]
    }];
  }
  // Auto-select first notebook
  if (!activeNotebookId || !notebooks.find(n => n.id === activeNotebookId)) {
    activeNotebookId = notebooks[0]?.id || null;
    const nb = notebooks.find(n => n.id === activeNotebookId);
    activeNbTabId = nb?.tabs[0]?.id || null;
  }
}

function saveNotebooks() {
  localStorage.setItem('nb_notebooks', JSON.stringify(notebooks));
}

/* YouTube history */
let ytHistory = [];
function loadYtHistory() {
  try { ytHistory = JSON.parse(localStorage.getItem('yt_history') || '[]'); } catch(e) { ytHistory = []; }
}
function saveYtHistory() {
  localStorage.setItem('yt_history', JSON.stringify(ytHistory));
}

/* ─── MINESWEEPER STATE ──────────────────────────────────── */

const MS_DIFF = {
  easy:   { rows: 9,  cols: 9,  mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard:   { rows: 16, cols: 30, mines: 99 },
};

// B&W gradient: 1 = dim, 8 = bright white
const MS_COLORS = [
  '',
  'rgba(255,255,255,0.40)',
  'rgba(255,255,255,0.52)',
  'rgba(255,255,255,0.68)',
  'rgba(255,255,255,0.58)',
  'rgba(255,255,255,0.76)',
  'rgba(255,255,255,0.84)',
  'rgba(255,255,255,0.92)',
  '#ffffff',
];

let ms = {
  board: [], rows: 9, cols: 9, mines: 10,
  state: 'idle',   // idle | playing | won | lost
  firstClick: true, timer: 0, timerInterval: null,
  flagsPlaced: 0, diff: 'easy',
};

/* ─── DOM ────────────────────────────────────────────────── */

const takeoffZone      = document.getElementById('takeoffZone');
const takeoffEmpty     = document.getElementById('takeoffEmpty');
const rocketDisplay    = document.getElementById('rocketDisplay');
const rocketWrapper    = document.getElementById('rocketWrapper');
const portholeTitle    = document.getElementById('portholeTitle');
const portholeTimerEl  = document.getElementById('portholeTimerEl');
const rocketProgressFill = document.getElementById('rocketProgressFill');
const takeoffSecondary = document.getElementById('takeoffSecondary');
const fuelBtn          = document.getElementById('fuelBtn');
const taskList         = document.getElementById('taskList');
const orbitDropZone    = document.getElementById('orbitDropZone');
const orbitEmpty       = document.getElementById('orbitEmpty');
const orbitListEl      = document.getElementById('orbitList');
const timerDisplay     = document.getElementById('timerDisplay');
const btnStartPause    = document.getElementById('btnStartPause');
const btnReset         = document.getElementById('btnReset');
const sessionDots      = document.getElementById('sessionDots');
const focusWrap        = document.getElementById('pomodoroFocusTask');
const focusName        = document.getElementById('pomodoroFocusName');

/* ─── RENDER ─────────────────────────────────────────────── */

function render() {
  saveTasks();
  renderTakeoff();
  renderLaunchpad();
  renderOrbit();
  renderPomoFocus();
}

/* TAKEOFF ─────────────────────────────────────────────────── */

function getFireLevel(remaining, total) {
  const p = remaining / total;
  if (p > 0.75) return 0;
  if (p > 0.50) return 1;
  if (p > 0.25) return 2;
  if (p > 0.10) return 3;
  return 4;
}

function timerColor(remaining, total) {
  const p = remaining / total;
  if (p > 0.50) return '#e0e0e0';
  if (p > 0.25) return '#ffcc44';
  if (p > 0.10) return '#ff8833';
  return '#ff3311';
}

function renderTakeoff() {
  const seated = tasks.filter(t => t.seat && !t.orbit);

  if (seated.length === 0) {
    takeoffEmpty.style.display = 'flex';
    rocketDisplay.style.display = 'none';
    takeoffZone.classList.remove('has-tasks');
    return;
  }

  takeoffEmpty.style.display = 'none';
  rocketDisplay.style.display = 'block';
  takeoffZone.classList.add('has-tasks');

  const primary = seated[0];
  const fire = getFireLevel(primary.timerLeft, primary.timerTotal);
  rocketWrapper.dataset.fire = fire;

  // Make the rocket itself draggable to the orbit zone
  rocketWrapper.draggable = true;
  rocketWrapper.dataset.id   = primary.id;
  rocketWrapper.dataset.from = 'seat';

  // Porthole text
  if (portholeTitle)   portholeTitle.textContent   = primary.title;
  if (portholeTimerEl) {
    portholeTimerEl.textContent = fmtTime(primary.timerLeft);
    portholeTimerEl.style.color = timerColor(primary.timerLeft, primary.timerTotal);
  }

  // Progress bar
  const pct = Math.max(0, primary.timerLeft / primary.timerTotal * 100);
  rocketProgressFill.style.width = pct + '%';
  const fireColors = ['var(--white)', '#ffe066', '#ffaa33', '#ff7722', '#ff2200'];
  rocketProgressFill.style.background = fireColors[fire];

  // Secondary tasks
  takeoffSecondary.innerHTML = '';
  seated.slice(1).forEach(t => {
    const pill = document.createElement('div');
    pill.className = 'sec-task-pill';
    pill.draggable = true;
    pill.dataset.id = t.id;
    pill.dataset.from = 'seat';
    pill.innerHTML = `<span class="sec-title">${esc(t.title)}</span><span class="sec-timer">${fmtTime(t.timerLeft)}</span><button class="sec-eject" data-id="${t.id}">${xSVG}</button>`;
    pill.querySelector('.sec-eject').addEventListener('click', e => { e.stopPropagation(); ejectTask(t.id); });
    pill.addEventListener('dragstart', onDragStart);
    pill.addEventListener('dragend', onDragEnd);
    takeoffSecondary.appendChild(pill);
  });
}

/* LAUNCHPAD ───────────────────────────────────────────────── */

function renderLaunchpad() {
  taskList.innerHTML = '';
  tasks.filter(t => !t.seat && !t.orbit).forEach(t => {
    const row = document.createElement('div');
    row.className = 'task-row';
    row.draggable = true;
    row.dataset.id = t.id;
    row.dataset.from = 'queue';
    const cbStyle = t.done ? ' style="background:var(--white);border-color:var(--white)"' : '';
    const check   = t.done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    row.innerHTML = `<span class="drag-handle">${handleSVG}</span><div class="task-cb${t.done?' checked':''}"${cbStyle} data-id="${t.id}">${check}</div><input class="task-title${t.done?' done':''}" type="text" value="${esc(t.title)}" data-id="${t.id}" spellcheck="false"/><button class="task-del" data-id="${t.id}">${xSVG}</button>`;
    // Notebook color left-border
    if (t.nbColor) {
      row.classList.add('nb-colored');
      row.style.setProperty('--nb-color', t.nbColor);
    }
    row.querySelector('.task-cb').addEventListener('click', () => toggleDone(t.id));
    const inp = row.querySelector('.task-title');
    inp.addEventListener('change', e => renameTask(t.id, e.target.value));
    inp.addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });
    row.querySelector('.task-del').addEventListener('click', e => { e.stopPropagation(); deleteTask(t.id); });
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragend', onDragEnd);
    taskList.appendChild(row);
  });
}

/* ORBIT ───────────────────────────────────────────────────── */

function renderOrbit() {
  const orbiting = tasks.filter(t => t.orbit);
  orbitListEl.innerHTML = '';
  orbitEmpty.style.display = orbiting.length ? 'none' : 'flex';
  orbiting.forEach(t => {
    const card = document.createElement('div');
    card.className = 'orbit-card';
    card.innerHTML = `<span class="orbit-rocket">🚀</span><span class="orbit-title">${esc(t.title)}</span><button class="orbit-deorbit" data-id="${t.id}" title="Return to Launchpad">${downSVG}</button>`;
    card.querySelector('.orbit-deorbit').addEventListener('click', () => deorbitTask(t.id));
    orbitListEl.appendChild(card);
  });
}

function renderPomoFocus() {
  const active = tasks.filter(t => t.seat && !t.orbit && !t.done);
  if (active.length > 0) { focusWrap.style.display='flex'; focusName.textContent=active[0].title; }
  else focusWrap.style.display = 'none';
}

/* ─── TASK ACTIONS ───────────────────────────────────────── */

function toggleDone(id) { const t=tasks.find(t=>t.id===id); if(t){t.done=!t.done; render();} }
function ejectTask(id)  { const t=tasks.find(t=>t.id===id); if(t){t.seat=false; render();} }
function deorbitTask(id){ const t=tasks.find(t=>t.id===id); if(t){t.orbit=false;t.seat=false; render();} }
function deleteTask(id) { tasks=tasks.filter(t=>t.id!==id); render(); }
function renameTask(id,val){ const t=tasks.find(t=>t.id===id); if(t) t.title=val.trim()||t.title; }
function addTask() {
  const t={id:uid(),title:'New task',done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER};
  tasks.push(t); render();
  requestAnimationFrame(()=>{ const inp=taskList.querySelectorAll('.task-title'); const last=inp[inp.length-1]; if(last){last.focus();last.select();} });
}

/* ─── TASK TIMERS ────────────────────────────────────────── */

function startTaskTimers() {
  if (taskTimerInterval) return;
  taskTimerInterval = setInterval(() => {
    let needsRender = false;
    tasks.forEach(t => {
      if (!t.seat || t.orbit || t.done) return;
      if (pendingLaunchTask && pendingLaunchTask.id === t.id) return; // paused for modal
      if (t.timerLeft > 0) {
        t.timerLeft--;
        needsRender = true;
        if (t.timerLeft === 0) {
          pendingLaunchTask = t;
          showLaunchModal(t);
        }
      }
    });
    if (needsRender) renderTakeoff();
  }, 1000);
}

function showLaunchModal(task) {
  document.getElementById('launchModalTask').textContent = task.title;
  document.getElementById('launchModalOverlay').style.display = 'flex';
}

document.getElementById('btnLaunchConfirm').addEventListener('click', async () => {
  document.getElementById('launchModalOverlay').style.display = 'none';
  if (!pendingLaunchTask) return;
  const t = pendingLaunchTask;
  pendingLaunchTask = null;
  t.seat = false;
  render();
  await playOrbitAnimation(t.title);
  t.orbit = true;
  render();
});

document.getElementById('btnLaunchRefuel').addEventListener('click', () => {
  document.getElementById('launchModalOverlay').style.display = 'none';
  if (pendingLaunchTask) {
    pendingLaunchTask.timerLeft  = 5 * 60;
    pendingLaunchTask.timerTotal = Math.max(pendingLaunchTask.timerTotal, 5*60);
    pendingLaunchTask = null;
  }
  renderTakeoff();
});

/* ─── FUEL BUTTON ────────────────────────────────────────── */

fuelBtn.addEventListener('click', () => {
  const seated = tasks.filter(t => t.seat && !t.orbit);
  if (seated.length === 0) return;
  const primary = seated[0];
  primary.timerLeft  += 5 * 60;
  primary.timerTotal  = primary.timerLeft; // reset progress bar to full
  fuelBtn.classList.add('clicked');
  setTimeout(() => fuelBtn.classList.remove('clicked'), 200);
  renderTakeoff();
  startTaskTimers();
});

// Rocket wrapper drag (treat like a seated task card)
rocketWrapper.addEventListener('dragstart', onDragStart);
rocketWrapper.addEventListener('dragend',   onDragEnd);

/* ─── DRAG & DROP ────────────────────────────────────────── */

function onDragStart(e) {
  dragSrc = { id: e.currentTarget.dataset.id, from: e.currentTarget.dataset.from };
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-target-above,.drag-target-below').forEach(el=>el.classList.remove('drag-target-above','drag-target-below'));
  dragSrc = null;
}

// Takeoff zone
takeoffZone.addEventListener('dragover', e => {
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  takeoffZone.classList.add('drag-over');
});
takeoffZone.addEventListener('dragleave', e => {
  if (!takeoffZone.contains(e.relatedTarget)) takeoffZone.classList.remove('drag-over');
});
takeoffZone.addEventListener('drop', e => {
  e.preventDefault(); takeoffZone.classList.remove('drag-over');
  if (!dragSrc) return;
  const t = tasks.find(t=>t.id===dragSrc.id);
  if (!t || t.orbit) return;
  if (dragSrc.from === 'seat') return; // already seated, ignore drop back
  // Show time picker; swap will happen on confirm
  pendingSeatedTask = t;
  showTimePicker();
});

// Orbit zone (only accepts from seat)
orbitDropZone.addEventListener('dragover', e => {
  if (!dragSrc || dragSrc.from !== 'seat') return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  orbitDropZone.classList.add('drag-over');
});
orbitDropZone.addEventListener('dragleave', e => {
  if (!orbitDropZone.contains(e.relatedTarget)) orbitDropZone.classList.remove('drag-over');
});
orbitDropZone.addEventListener('drop', async e => {
  e.preventDefault(); orbitDropZone.classList.remove('drag-over');
  if (!dragSrc || dragSrc.from !== 'seat') return;
  const t = tasks.find(t=>t.id===dragSrc.id);
  if (!t) return;
  t.seat = false;
  render();
  await playOrbitAnimation(t.title);
  t.orbit = true;
  render();
});

// Launchpad reorder
taskList.addEventListener('dragover', e => {
  e.preventDefault();
  const row = e.target.closest('.task-row');
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
  if (row) {
    const mid = row.getBoundingClientRect().top + row.getBoundingClientRect().height/2;
    row.classList.add(e.clientY < mid ? 'drag-target-above' : 'drag-target-below');
  }
});
taskList.addEventListener('dragleave', e => {
  if (!taskList.contains(e.relatedTarget))
    document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
});
taskList.addEventListener('drop', e => {
  e.preventDefault();
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-target-above','drag-target-below'));
  if (!dragSrc) return;
  const dragged = tasks.find(t=>t.id===dragSrc.id);
  if (!dragged) return;
  dragged.seat = false; dragged.orbit = false;
  const targetRow = e.target.closest('.task-row');
  if (!targetRow || targetRow.dataset.id===dragSrc.id) { render(); return; }
  const insertAfter = e.clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height/2;
  tasks = tasks.filter(t=>t.id!==dragSrc.id);
  const idx = tasks.findIndex(t=>t.id===targetRow.dataset.id);
  tasks.splice(insertAfter ? idx+1 : idx, 0, dragged);
  render();
});

/* ─── ORBIT ANIMATION ────────────────────────────────────── */

function generateStars(field, count=160) {
  field.innerHTML = '';
  for (let i=0; i<count; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random()*2.5+0.5;
    s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;width:${size}px;height:${size}px;--dur:${(Math.random()*2+0.8).toFixed(1)}s;--delay:${(Math.random()*3).toFixed(1)}s;`;
    field.appendChild(s);
  }
}

async function playOrbitAnimation(title) {
  const overlay=document.getElementById('spaceOverlay'),starsField=document.getElementById('starsField'),
    launchCard=document.getElementById('animLaunchCard'),earth=document.getElementById('animEarth'),
    orbitArm=document.getElementById('animOrbitArm'),
    finale=document.getElementById('animFinale');

  launchCard.textContent=title;
  launchCard.className='anim-launch-card'; earth.className='anim-earth';
  orbitArm.className='anim-orbit-arm'; finale.className='anim-finale';
  finale.style.display='none'; generateStars(starsField);

  overlay.style.display='flex';
  await wait(20); overlay.classList.add('active');
  await wait(300); launchCard.classList.add('show');
  await wait(700); launchCard.classList.remove('show'); launchCard.classList.add('launch');
  await wait(600); earth.classList.add('show');
  await wait(500); orbitArm.style.display='block'; orbitArm.classList.add('orbiting');
  await wait(3200); orbitArm.classList.remove('orbiting'); orbitArm.style.display='none'; earth.classList.remove('show');
  await wait(200); finale.style.display='flex'; finale.classList.add('show');
  await wait(1400);
  overlay.classList.remove('active'); overlay.classList.add('fading');
  await wait(450);
  overlay.style.display='none'; overlay.className='space-overlay'; finale.style.display='none';
}

/* ─── TIME PICKER ────────────────────────────────────────── */

function showTimePicker() {
  // Reset to 25 min default
  document.querySelectorAll('.tp-opt').forEach(b => b.classList.toggle('selected', b.dataset.mins === '25'));
  document.getElementById('tpCustom').value = '';
  document.getElementById('timepickOverlay').style.display = 'flex';
}

function confirmSeat(mins) {
  if (!pendingSeatedTask) return;
  const t = pendingSeatedTask;
  pendingSeatedTask = null;
  // Swap: eject any currently seated tasks back to launchpad
  tasks.forEach(tk => { if (tk.seat && !tk.orbit && tk.id !== t.id) tk.seat = false; });
  t.seat = true;
  t.timerLeft  = mins * 60;
  t.timerTotal = mins * 60;
  render();
  startTaskTimers();
}

document.querySelectorAll('.tp-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tp-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('tpCustom').value = '';
  });
});

document.getElementById('tpCustom').addEventListener('input', () => {
  document.querySelectorAll('.tp-opt').forEach(b => b.classList.remove('selected'));
});

document.getElementById('btnTpConfirm').addEventListener('click', () => {
  document.getElementById('timepickOverlay').style.display = 'none';
  const customVal = document.getElementById('tpCustom').value;
  const selOpt = document.querySelector('.tp-opt.selected');
  let mins = customVal ? Math.max(1, parseInt(customVal) || 1) : (selOpt ? parseInt(selOpt.dataset.mins) : 25);
  confirmSeat(mins);
});

document.getElementById('btnTpCancel').addEventListener('click', () => {
  pendingSeatedTask = null;
  document.getElementById('timepickOverlay').style.display = 'none';
});

/* ─── NOTES / NOTEBOOKS ──────────────────────────────────── */

function startInlineRename(nameEl, currentName, onSave) {
  const inp = document.createElement('input');
  inp.className = 'nb-item-name-input';
  inp.value = currentName;
  nameEl.replaceWith(inp);
  inp.focus(); inp.select();
  const commit = () => {
    const val = inp.value.trim() || currentName;
    onSave(val);
  };
  inp.addEventListener('blur', commit, { once: true });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = currentName; inp.blur(); }
  });
}

function renderNotebooks() {
  const list = document.getElementById('nbSidebarList');
  if (!list) return;
  list.innerHTML = '';
  notebooks.forEach(nb => {
    const item = document.createElement('div');
    item.className = 'nb-sidebar-item' + (nb.id === activeNotebookId ? ' active' : '');
    item.innerHTML = `
      <span class="nb-color-dot" style="background:${nb.color}"></span>
      <span class="nb-item-name">${esc(nb.name)}</span>
      <button class="nb-rename-btn" title="Rename">${pencilSVG}</button>
      <button class="nb-del" title="Delete">${xSVG}</button>`;

    item.addEventListener('click', e => {
      if (e.target.closest('.nb-del') || e.target.closest('.nb-rename-btn')) return;
      activeNotebookId = nb.id;
      if (!nb.tabs.find(t => t.id === activeNbTabId)) activeNbTabId = nb.tabs[0]?.id || null;
      renderNotebooks(); renderNbWorkspace();
    });

    // Rename: pencil button or double-click name
    const triggerRename = () => {
      const nameEl = item.querySelector('.nb-item-name');
      if (!nameEl) return;
      startInlineRename(nameEl, nb.name, val => {
        nb.name = val; saveNotebooks(); renderNotebooks();
      });
    };
    item.querySelector('.nb-rename-btn').addEventListener('click', e => { e.stopPropagation(); triggerRename(); });
    item.querySelector('.nb-item-name').addEventListener('dblclick', e => { e.stopPropagation(); triggerRename(); });

    item.querySelector('.nb-del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete notebook "${nb.name}"?`)) return;
      notebooks = notebooks.filter(n => n.id !== nb.id);
      if (activeNotebookId === nb.id) { activeNotebookId = notebooks[0]?.id || null; activeNbTabId = null; }
      saveNotebooks(); renderNotebooks(); renderNbWorkspace();
    });
    list.appendChild(item);
  });
  const empty = document.getElementById('nbEmptyState');
  const ws    = document.getElementById('nbWorkspace');
  if (activeNotebookId && notebooks.length) { empty.style.display='none'; ws.style.display='flex'; }
  else { empty.style.display='flex'; ws.style.display='none'; }
}

function renderNbWorkspace() {
  const nb = notebooks.find(n => n.id === activeNotebookId);
  if (!nb) return;
  if (!nb.tabs.find(t => t.id === activeNbTabId)) activeNbTabId = nb.tabs[0]?.id || null;

  const scroll = document.getElementById('nbTabsScroll');
  if (!scroll) return;
  scroll.innerHTML = '';
  nb.tabs.forEach(tab => {
    const wrap = document.createElement('div');
    wrap.className = 'nb-tab-wrap' + (tab.id === activeNbTabId ? ' active' : '');

    const btn = document.createElement('button');
    btn.className = 'nb-tab-btn';
    btn.textContent = tab.name;
    btn.title = 'Click to switch · Double-click to rename';
    btn.addEventListener('click', () => { activeNbTabId = tab.id; renderNbWorkspace(); });
    btn.addEventListener('dblclick', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.value = tab.name;
      input.className = 'nb-tab-rename-input';
      btn.replaceWith(input);
      input.focus(); input.select();
      const save = () => { tab.name = input.value.trim() || tab.name; saveNotebooks(); renderNbWorkspace(); };
      input.addEventListener('blur', save, { once: true });
      input.addEventListener('keydown', ke => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { input.value = tab.name; input.blur(); }
      });
    });

    // Action buttons (rename + delete) shown on hover
    const actions = document.createElement('div');
    actions.className = 'nb-tab-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'nb-tab-act-btn';
    renameBtn.title = 'Rename section';
    renameBtn.innerHTML = pencilSVG;
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.value = tab.name;
      input.className = 'nb-tab-rename-input';
      btn.replaceWith(input);
      input.focus(); input.select();
      const save = () => { tab.name = input.value.trim() || tab.name; saveNotebooks(); renderNbWorkspace(); };
      input.addEventListener('blur', save, { once: true });
      input.addEventListener('keydown', ke => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        if (ke.key === 'Escape') { input.value = tab.name; input.blur(); }
      });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'nb-tab-act-btn nb-tab-del-btn';
    delBtn.title = 'Delete section';
    delBtn.innerHTML = xSVG;
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (nb.tabs.length <= 1) return; // keep at least one
      if (!confirm(`Delete section "${tab.name}"?`)) return;
      nb.tabs = nb.tabs.filter(t => t.id !== tab.id);
      if (activeNbTabId === tab.id) activeNbTabId = nb.tabs[0]?.id || null;
      saveNotebooks(); renderNbWorkspace();
    });

    actions.appendChild(renameBtn);
    if (nb.tabs.length > 1) actions.appendChild(delBtn);
    wrap.appendChild(btn);
    wrap.appendChild(actions);
    scroll.appendChild(wrap);
  });

  const tab = nb.tabs.find(t => t.id === activeNbTabId);
  renderNbContent(nb, tab);
}

/* ── Rich-text toolbar definition ── */
const RT_TOOLS = [
  { cmd:'bold',                icon:'<b>B</b>',   title:'Bold (Ctrl+B)' },
  { cmd:'italic',              icon:'<i>I</i>',   title:'Italic (Ctrl+I)' },
  { cmd:'underline',           icon:'<u>U</u>',   title:'Underline (Ctrl+U)' },
  { cmd:'strikeThrough',       icon:'<s>S</s>',   title:'Strikethrough' },
  { sep:true },
  { cmd:'formatBlock', val:'h2',  icon:'H1', title:'Heading' },
  { cmd:'formatBlock', val:'p',   icon:'¶',  title:'Paragraph' },
  { sep:true },
  { cmd:'insertUnorderedList', icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><circle cx="2" cy="2" r="1.4" fill="currentColor"/><circle cx="2" cy="6" r="1.4" fill="currentColor"/><circle cx="2" cy="10" r="1.4" fill="currentColor"/><line x1="5" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="5" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Bullet list' },
  { cmd:'insertOrderedList',   icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><text x="0" y="3.5" font-size="4" fill="currentColor">1.</text><text x="0" y="7.5" font-size="4" fill="currentColor">2.</text><text x="0" y="11.5" font-size="4" fill="currentColor">3.</text><line x1="6" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Numbered list' },
  { sep:true },
  { cmd:'indent',   icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="0,5.5 3,8 0,10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="5" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="10.5" x2="14" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, title:'Indent (Tab)' },
  { cmd:'outdent',  icon:`<svg width="12" height="10" viewBox="0 0 14 12" fill="none"><line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="3,5.5 0,8 3,10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="5" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="10.5" x2="14" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, title:'Outdent (Shift+Tab)' },
  { sep:true },
  { cmd:'removeFormat', icon:`<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`, title:'Clear formatting' },
];

function buildRtToolbar(editor) {
  const bar = document.createElement('div');
  bar.className = 'nb-toolbar';
  RT_TOOLS.forEach(t => {
    if (t.sep) { const s = document.createElement('span'); s.className = 'nb-tool-sep'; bar.appendChild(s); return; }
    const btn = document.createElement('button');
    btn.className = 'nb-tool-btn';
    btn.innerHTML = t.icon;
    btn.title = t.title;
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // keep editor focus
      document.execCommand(t.cmd, false, t.val || null);
      editor.focus();
      updateToolbarState(bar, editor);
    });
    bar.appendChild(btn);
  });
  // Update active states on selection change
  editor.addEventListener('keyup',    () => updateToolbarState(bar, editor));
  editor.addEventListener('mouseup',  () => updateToolbarState(bar, editor));
  editor.addEventListener('focus',    () => updateToolbarState(bar, editor));
  return bar;
}

function updateToolbarState(bar, editor) {
  const stateCmds = ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'];
  bar.querySelectorAll('.nb-tool-btn').forEach((btn, i) => {
    const tool = RT_TOOLS.filter(t => !t.sep)[i];
    if (tool && stateCmds.includes(tool.cmd)) {
      btn.classList.toggle('active', document.queryCommandState(tool.cmd));
    }
  });
}

function renderNbContent(nb, tab) {
  const content = document.getElementById('nbContent');
  if (!content || !tab) return;
  content.innerHTML = '';

  // ── TASKS SECTION ──
  const tasksSection = document.createElement('div');
  tasksSection.className = 'nb-tasks-section';
  const taskListId = `nbTL_${tab.id}`;
  tasksSection.innerHTML = `
    <div class="nb-section-header">
      <span class="nb-section-label">Tasks</span>
      <button class="nb-add-task-btn">+ Add task</button>
    </div>
    <div class="nb-task-list" id="${taskListId}"></div>`;
  tasksSection.querySelector('.nb-add-task-btn').addEventListener('click', () => {
    tab.tasks.push({ id: uid(), title: 'New task', done: false, addedToFocus: false });
    saveNotebooks(); renderNbContent(nb, tab);
  });
  const taskListEl = tasksSection.querySelector(`#${taskListId}`);
  tab.tasks.forEach(t => {
    const row = document.createElement('div');
    row.className = 'nb-task-row';
    row.style.setProperty('--nb-color', nb.color);
    const cbStyle = t.done ? ' style="background:var(--white);border-color:var(--white)"' : '';
    const check   = t.done ? `<svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="var(--bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    const addedClass = t.addedToFocus ? ' added' : '';
    const addedLabel = t.addedToFocus ? '✓ In Focus' : '→ Focus';
    row.innerHTML = `
      <div class="nb-task-cb${t.done?' checked':''}"${cbStyle}>${check}</div>
      <input class="nb-task-title${t.done?' done':''}" type="text" value="${esc(t.title)}" spellcheck="false"/>
      <button class="nb-focus-btn${addedClass}">${addedLabel}</button>
      <button class="nb-task-del-btn">${xSVG}</button>`;
    row.querySelector('.nb-task-cb').addEventListener('click', () => { t.done=!t.done; saveNotebooks(); renderNbContent(nb,tab); });
    const inp = row.querySelector('.nb-task-title');
    inp.addEventListener('change', e => { t.title=e.target.value.trim()||t.title; saveNotebooks(); });
    inp.addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });
    row.querySelector('.nb-focus-btn').addEventListener('click', () => {
      if (t.addedToFocus) return;
      t.addedToFocus = true;
      tasks.push({ id:uid(), title:t.title, done:false, seat:false, orbit:false,
        timerLeft:DEFAULT_TASK_TIMER, timerTotal:DEFAULT_TASK_TIMER, nbColor:nb.color });
      saveNotebooks(); render(); renderNbContent(nb,tab);
    });
    row.querySelector('.nb-task-del-btn').addEventListener('click', () => {
      tab.tasks = tab.tasks.filter(tk => tk.id !== t.id); saveNotebooks(); renderNbContent(nb,tab);
    });
    taskListEl.appendChild(row);
  });
  content.appendChild(tasksSection);

  // ── NOTES SECTION ──
  const notesSection = document.createElement('div');
  notesSection.className = 'nb-notes-section';
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'nb-section-header';
  sectionHeader.innerHTML = '<span class="nb-section-label">Notes</span>';
  notesSection.appendChild(sectionHeader);

  // Rich-text editor (contenteditable)
  const editor = document.createElement('div');
  editor.className = 'nb-notes-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('data-placeholder', 'Write your notes here…');
  editor.setAttribute('spellcheck', 'false');
  if (tab.notes) editor.innerHTML = tab.notes;
  editor.addEventListener('input', () => { tab.notes = editor.innerHTML; saveNotebooks(); });
  editor.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
    }
  });

  // Build and prepend toolbar
  const toolbar = buildRtToolbar(editor);
  notesSection.appendChild(toolbar);
  notesSection.appendChild(editor);
  content.appendChild(notesSection);
}

document.getElementById('btnAddNotebook')?.addEventListener('click', () => {
  const color = NB_COLORS[notebooks.length % NB_COLORS.length];
  const nb = { id: uid(), name: 'New Notebook', color, tabs: [{ id: uid(), name: 'Main', tasks: [], notes: '' }] };
  notebooks.push(nb);
  activeNotebookId = nb.id; activeNbTabId = nb.tabs[0].id;
  saveNotebooks(); renderNotebooks(); renderNbWorkspace();
  // Focus name for rename
  requestAnimationFrame(() => {
    const last = document.querySelector('.nb-sidebar-item.active .nb-item-name');
    if (last) last.dispatchEvent(new MouseEvent('dblclick'));
  });
});

document.getElementById('btnAddNbTab')?.addEventListener('click', () => {
  const nb = notebooks.find(n => n.id === activeNotebookId);
  if (!nb) return;
  const tab = { id: uid(), name: 'Section', tasks: [], notes: '' };
  nb.tabs.push(tab);
  activeNbTabId = tab.id;
  saveNotebooks(); renderNbWorkspace();
});

/* ─── MINESWEEPER ────────────────────────────────────────── */

function msInit(diff) {
  diff = diff || ms.diff || 'easy';
  const d = MS_DIFF[diff];
  clearInterval(ms.timerInterval);
  ms = {
    board: [], rows: d.rows, cols: d.cols, mines: d.mines,
    state: 'idle', firstClick: true, timer: 0,
    timerInterval: null, flagsPlaced: 0, diff,
  };
  for (let r = 0; r < d.rows; r++) {
    ms.board[r] = [];
    for (let c = 0; c < d.cols; c++)
      ms.board[r][c] = { mine:false, revealed:false, flagged:false, count:0, hitMine:false };
  }
  const modal = document.getElementById('msModal');
  const cellPx = { easy:34, medium:26, hard:20 }[diff];
  if (modal) modal.style.setProperty('--ms-cs', cellPx + 'px');
  const faceEl = document.getElementById('msFaceBtn');
  if (faceEl) faceEl.textContent = '🙂';
  const timerEl = document.getElementById('msTimerDisplay');
  if (timerEl) timerEl.textContent = '0:00';
  const flagEl = document.getElementById('msFlagCounter');
  if (flagEl) flagEl.textContent = '⚑ ' + d.mines;
  msRender();
}

function msPlaceMines(safeR, safeC) {
  // Avoid 3×3 area around first click so it's never instant death
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = safeR + dr, nc = safeC + dc;
    if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols)
      safe.add(nr * ms.cols + nc);
  }
  let placed = 0;
  while (placed < ms.mines) {
    const idx = Math.floor(Math.random() * ms.rows * ms.cols);
    const r = Math.floor(idx / ms.cols), c = idx % ms.cols;
    if (!safe.has(idx) && !ms.board[r][c].mine) { ms.board[r][c].mine = true; placed++; }
  }
  // Calculate neighbour counts
  for (let r = 0; r < ms.rows; r++) for (let c = 0; c < ms.cols; c++) {
    if (ms.board[r][c].mine) continue;
    let cnt = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols && ms.board[nr][nc].mine) cnt++;
    }
    ms.board[r][c].count = cnt;
  }
}

function msFloodReveal(startR, startC) {
  // Iterative flood fill — safe for large boards
  const queue = [[startR, startC]], seen = new Set();
  while (queue.length) {
    const [r, c] = queue.shift();
    const key = r * ms.cols + c;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = ms.board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.count === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r+dr, nc = c+dc;
        if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols) queue.push([nr, nc]);
      }
    }
  }
}

function msCheckWin() {
  for (let r = 0; r < ms.rows; r++)
    for (let c = 0; c < ms.cols; c++)
      if (!ms.board[r][c].mine && !ms.board[r][c].revealed) return false;
  return true;
}

function msRevealCell(r, c) {
  if (ms.state === 'won' || ms.state === 'lost') return;
  const cell = ms.board[r][c];
  if (cell.revealed || cell.flagged) return;

  // First click: place mines now (guarantees safe first click)
  if (ms.firstClick) {
    ms.firstClick = false;
    msPlaceMines(r, c);
    ms.state = 'playing';
    ms.timerInterval = setInterval(() => {
      ms.timer++;
      const el = document.getElementById('msTimerDisplay');
      if (el) el.textContent = fmtTime(ms.timer);
    }, 1000);
  }

  // Hit a mine
  if (cell.mine) {
    cell.revealed = true; cell.hitMine = true;
    ms.state = 'lost';
    clearInterval(ms.timerInterval);
    // Reveal all un-flagged mines
    for (let rr = 0; rr < ms.rows; rr++) for (let cc = 0; cc < ms.cols; cc++)
      if (ms.board[rr][cc].mine && !ms.board[rr][cc].flagged) ms.board[rr][cc].revealed = true;
    const fb = document.getElementById('msFaceBtn');
    if (fb) fb.textContent = '💀';
    msRender(); return;
  }

  msFloodReveal(r, c);

  if (msCheckWin()) {
    ms.state = 'won';
    clearInterval(ms.timerInterval);
    const fb = document.getElementById('msFaceBtn');
    if (fb) fb.textContent = '😎';
    // Auto-flag remaining mines
    for (let rr = 0; rr < ms.rows; rr++) for (let cc = 0; cc < ms.cols; cc++)
      if (ms.board[rr][cc].mine) ms.board[rr][cc].flagged = true;
    ms.flagsPlaced = ms.mines;
  }

  msRender();
}

function msToggleFlag(r, c) {
  // Can only flag after the first click reveals the board
  if (ms.state !== 'playing') return;
  const cell = ms.board[r][c];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  ms.flagsPlaced += cell.flagged ? 1 : -1;
  const el = document.getElementById('msFlagCounter');
  if (el) el.textContent = '⚑ ' + (ms.mines - ms.flagsPlaced);
  msRender();
}

function msChord(r, c) {
  // Double-click on a revealed number: if flagged neighbours = count, reveal the rest
  if (ms.state !== 'playing') return;
  const cell = ms.board[r][c];
  if (!cell.revealed || cell.count === 0) return;
  let flags = 0; const toReveal = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r+dr, nc = c+dc;
    if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols) {
      const n = ms.board[nr][nc];
      if (n.flagged) flags++;
      else if (!n.revealed) toReveal.push([nr, nc]);
    }
  }
  if (flags !== cell.count) return; // not enough flags — do nothing
  toReveal.forEach(([nr, nc]) => msRevealCell(nr, nc));
}

function msRender() {
  const el = document.getElementById('msBoard');
  if (!el) return;
  el.className = `ms-board ms-board-${ms.diff}`;
  el.style.gridTemplateColumns = `repeat(${ms.cols}, var(--ms-cs, 26px))`;
  el.innerHTML = '';

  for (let r = 0; r < ms.rows; r++) {
    for (let c = 0; c < ms.cols; c++) {
      const cell = ms.board[r][c];
      const div = document.createElement('div');
      div.className = 'ms-cell';

      if (cell.revealed) {
        div.classList.add('ms-cell-open');
        if (cell.mine) {
          div.classList.add(cell.hitMine ? 'ms-cell-boom' : 'ms-cell-mine');
          div.textContent = '●';
        } else if (cell.count > 0) {
          div.textContent = cell.count;
          div.style.color = MS_COLORS[cell.count];
        }
      } else if (cell.flagged) {
        div.classList.add('ms-cell-flag');
        // Wrong flag (flagged non-mine) shown dimmed/struck on loss
        if (ms.state === 'lost' && !cell.mine) div.classList.add('ms-cell-wrong');
        div.textContent = '⚑';
      }

      // Left click = reveal | right click = flag | double click = chord
      div.addEventListener('click',       () => msRevealCell(r, c));
      div.addEventListener('contextmenu', e  => { e.preventDefault(); msToggleFlag(r, c); });
      div.addEventListener('dblclick',    () => msChord(r, c));
      el.appendChild(div);
    }
  }
}

function openMinesweeper() {
  const overlay = document.getElementById('minesweeperOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  // Init on first open; keep an in-progress game alive between opens
  if (!ms.board.length) msInit('easy');
  else msRender();
}

// MS button wiring
document.getElementById('msFaceBtn').addEventListener('click', () => msInit());
document.getElementById('btnMsClose').addEventListener('click', () => {
  document.getElementById('minesweeperOverlay').style.display = 'none';
});
document.getElementById('minesweeperOverlay').addEventListener('contextmenu', e => e.preventDefault());
document.querySelectorAll('.ms-diff-btn').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.ms-diff-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  msInit(btn.dataset.diff);
}));

/* ─── POMODORO ───────────────────────────────────────────── */

function sandColor(p) {
  if (p > 0.50) return '#f0f0f0';
  if (p > 0.25) return '#ffcc44';
  if (p > 0.10) return '#ff8833';
  return '#ff4422';
}

function renderTimer() {
  timerDisplay.textContent = fmtTime(pomo.timeLeft);
  const p = pomo.timeLeft / DURATIONS[pomo.mode];

  // Update hourglass sand
  const topSand = document.getElementById('hgTopSand');
  const botSand = document.getElementById('hgBotSand');
  if (topSand && botSand) {
    const topH = p * 70;               // top chamber height = 70 (y 8→78)
    topSand.setAttribute('y', 78 - topH);
    topSand.setAttribute('height', topH);
    const botH = (1 - p) * 70;        // bot chamber height = 70 (y 92→162)
    botSand.setAttribute('y', 162 - botH);
    botSand.setAttribute('height', botH);
    const col = sandColor(p);
    topSand.setAttribute('fill', col);
    botSand.setAttribute('fill', col);
  }
  // Toggle particle animation
  const hgWrap = document.getElementById('hourglassWrap');
  if (hgWrap) hgWrap.classList.toggle('hourglass-running', pomo.running && pomo.timeLeft > 0);

  btnStartPause.textContent = pomo.running ? 'Pause' : 'Start';
  const dots = sessionDots.querySelectorAll('.s-dot');
  dots.forEach((d,i) => d.classList.toggle('done', i < (pomo.sessions%4)));
}

function startTimer() {
  pomo.running = true;
  pomo.interval = setInterval(() => {
    pomo.timeLeft--;
    renderTimer();
    if (pomo.timeLeft <= 0) {
      clearInterval(pomo.interval); pomo.running = false;
      if (pomo.mode==='work') { pomo.sessions++; setMode(pomo.sessions%4===0?'long':'short'); }
      else setMode('work');
    }
  }, 1000);
}

function pauseTimer() { clearInterval(pomo.interval); pomo.running=false; renderTimer(); }
function resetTimer() { pauseTimer(); pomo.timeLeft=DURATIONS[pomo.mode]; renderTimer(); }
function setMode(mode) {
  pauseTimer(); pomo.mode=mode; pomo.timeLeft=DURATIONS[mode];
  document.querySelectorAll('.pomo-mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  renderTimer();
}

btnStartPause.addEventListener('click', ()=>pomo.running?pauseTimer():startTimer());
btnReset.addEventListener('click', resetTimer);
document.querySelectorAll('.pomo-mode').forEach(btn => btn.addEventListener('click', () => {
  setMode(btn.dataset.mode);
  if (btn.dataset.mode === 'short' || btn.dataset.mode === 'long') openMinesweeper();
}));

/* ─── TAB SWITCHING ──────────────────────────────────────── */

document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const id=tab.dataset.tab;
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${id}`));
  });
});

document.getElementById('btnAddTask').addEventListener('click', addTask);

/* ─── MEDIA TABS ─────────────────────────────────────────── */

document.querySelectorAll('.media-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const m=tab.dataset.media;
    document.querySelectorAll('.media-tab').forEach(t=>t.classList.toggle('active',t===tab));
    document.getElementById('mediaPanelSpotify').classList.toggle('active', m==='spotify');
    document.getElementById('mediaPanelYoutube').classList.toggle('active', m==='youtube');
  });
});

// Init first panel active
document.getElementById('mediaPanelSpotify').classList.add('active');

/* ─── YOUTUBE ────────────────────────────────────────────── */

function extractYtId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) { const m=url.match(p); if(m) return m[1]; }
  return null;
}

function loadYouTube(url) {
  const raw = url.trim();
  const id = extractYtId(raw);
  const player = document.getElementById('ytPlayer');
  if (!id) {
    player.innerHTML = `<div class="yt-player-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity=".3"><rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg><span>Invalid URL or video ID</span></div>`;
    return;
  }
  player.innerHTML = `<iframe width="100%" height="160" src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&controls=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  // Save to history
  ytHistory = ytHistory.filter(h => h.id !== id);
  ytHistory.unshift({ id, title: raw.length < 40 ? raw : id });
  if (ytHistory.length > 5) ytHistory.pop();
  saveYtHistory();
  renderYtHistory();
}

function renderYtHistory() {
  const recent = document.getElementById('ytRecent');
  const list   = document.getElementById('ytRecentList');
  if (!recent || !list) return;
  if (ytHistory.length === 0) { recent.style.display = 'none'; return; }
  recent.style.display = 'flex';
  list.innerHTML = '';
  ytHistory.forEach(h => {
    const item = document.createElement('div');
    item.className = 'yt-recent-item';
    item.innerHTML = `<img class="yt-recent-thumb" src="https://img.youtube.com/vi/${h.id}/default.jpg" alt=""/><span class="yt-recent-title">${esc(h.title)}</span>`;
    item.addEventListener('click', () => {
      document.getElementById('ytInput').value = h.id;
      loadYouTube(h.id);
    });
    list.appendChild(item);
  });
}

document.getElementById('btnYtLoad').addEventListener('click', () => {
  loadYouTube(document.getElementById('ytInput').value);
});
document.getElementById('ytInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadYouTube(e.target.value);
});
document.getElementById('btnYtClear').addEventListener('click', () => {
  document.getElementById('ytInput').value = '';
  document.getElementById('ytPlayer').innerHTML = '';
  document.getElementById('ytInput').focus();
});

/* ─── SETTINGS ───────────────────────────────────────────── */

function loadSettings() {
  document.getElementById('inputGoogleClientId').value  = localStorage.getItem('googleClientId')  || '';
  document.getElementById('inputSpotifyClientId').value = localStorage.getItem('spotifyClientId') || '';
  const redirectUri=window.location.origin+window.location.pathname.replace(/\/?$/,'/');
  const d=document.getElementById('redirectUriDisplay');
  if(d) d.textContent=redirectUri;
  const d2=document.getElementById('redirectUriDisplay2');
  if(d2) d2.textContent=redirectUri;
}

document.getElementById('btnSaveSettings').addEventListener('click',()=>{
  localStorage.setItem('googleClientId',  document.getElementById('inputGoogleClientId').value.trim());
  localStorage.setItem('spotifyClientId', document.getElementById('inputSpotifyClientId').value.trim());
  const msg=document.getElementById('settingsSavedMsg');
  msg.style.display='block'; setTimeout(()=>msg.style.display='none',2000);
});

/* ─── GOOGLE CALENDAR ────────────────────────────────────── */

let googleToken = null;
let googleTokenClient = null;
let calendarEvents = [];

function initGoogleAuth() {
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId || typeof google==='undefined') return;
  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
    callback: async resp => {
      if (resp.error) return;
      googleToken = resp.access_token;
      await loadCalendarEvents();
    },
  });
}

document.getElementById('btnCalConnect').addEventListener('click',()=>{
  const clientId=localStorage.getItem('googleClientId');
  if (!clientId) { document.getElementById('calConfigHint').textContent='Add your Google Client ID in Settings first.'; return; }
  if (!googleTokenClient) initGoogleAuth();
  if (!googleTokenClient) return;
  googleTokenClient.requestAccessToken({prompt:'consent'});
});

document.getElementById('btnCalDisconnect').addEventListener('click',()=>{
  googleToken=null; calendarEvents=[];
  document.getElementById('calEventsState').style.display='none';
  document.getElementById('calConnectState').style.display='flex';
});

document.getElementById('btnCalImportAll').addEventListener('click',()=>{
  calendarEvents.forEach(ev=>{
    const title=(ev.summary||'Untitled').trim();
    if (!tasks.find(t=>t.title===title))
      tasks.push({id:uid(),title,done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER});
  });
  render();
  // Switch to focus tab
  document.querySelector('[data-tab="focus"]').click();
});

async function loadCalendarEvents() {
  if (!googleToken) return;
  const now=new Date().toISOString(), future=new Date(Date.now()+14*86400000).toISOString();
  const url=`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}&singleEvents=true&orderBy=startTime&maxResults=50`;
  try {
    const res=await fetch(url,{headers:{Authorization:`Bearer ${googleToken}`}});
    if (res.status===401){googleToken=null;return;}
    const data=await res.json();
    calendarEvents=data.items||[];
    renderCalendarEvents(calendarEvents);
  } catch(e){ console.error('Calendar fetch failed',e); }
}

function importEventAsTask(title, btn) {
  const trimmed = title.trim();
  if (!tasks.find(t=>t.title===trimmed)) {
    tasks.push({id:uid(),title:trimmed,done:false,seat:false,orbit:false,timerLeft:DEFAULT_TASK_TIMER,timerTotal:DEFAULT_TASK_TIMER});
    render();
  }
  btn.textContent='✓ Added';
  btn.classList.add('imported');
  btn.disabled=true;
}

function renderCalendarEvents(events) {
  document.getElementById('calConnectState').style.display='none';
  document.getElementById('calEventsState').style.display='flex';
  const list=document.getElementById('calEventsList');
  list.innerHTML='';
  if (events.length===0) { list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:20px 0">No upcoming events</div>'; return; }

  const grouped={};
  events.forEach(ev=>{
    const key=ev.start.dateTime?new Date(ev.start.dateTime).toDateString():new Date(ev.start.date+'T00:00:00').toDateString();
    (grouped[key]=grouped[key]||[]).push(ev);
  });

  const today=new Date().toDateString(), tomorrow=new Date(Date.now()+86400000).toDateString();
  Object.entries(grouped).forEach(([dateStr,dayEvs])=>{
    const hdr=document.createElement('div');
    hdr.className='cal-date-header';
    hdr.textContent=dateStr===today?'Today':dateStr===tomorrow?'Tomorrow':new Date(dateStr).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
    list.appendChild(hdr);
    dayEvs.forEach(ev=>{
      const el=document.createElement('div');
      el.className='cal-event';
      const startT=ev.start.dateTime?new Date(ev.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'All day';
      const endT=ev.end.dateTime?' – '+new Date(ev.end.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
      const importBtn=document.createElement('button');
      importBtn.className='cal-import-btn';
      importBtn.textContent='+ Task';
      const title=ev.summary||'Untitled';
      importBtn.addEventListener('click',()=>importEventAsTask(title,importBtn));
      el.innerHTML=`<div class="cal-event-time">${startT}${endT}</div><div class="cal-event-details"><div class="cal-event-title">${esc(title)}</div>${ev.location?`<div class="cal-event-location">${esc(ev.location)}</div>`:''}</div>`;
      el.appendChild(importBtn);
      list.appendChild(el);
    });
  });
}

/* ─── SPOTIFY ────────────────────────────────────────────── */

const SP_SCOPES='user-read-currently-playing user-read-playback-state user-modify-playback-state';
let spotifyPollTimer=null;
let spProgressMs=0, spDurationMs=0, spIsPlaying=false, spProgressInterval=null;

function spVerifier(){ const a=new Uint8Array(64); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
async function spChallenge(v){ const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)); return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }

async function connectSpotify(){
  const clientId=localStorage.getItem('spotifyClientId');
  if (!clientId){ alert('Add your Spotify Client ID in Settings first.'); document.querySelector('[data-tab="settings"]').click(); return; }
  const v=spVerifier(), c=await spChallenge(v);
  const redirectUri=window.location.origin+window.location.pathname.replace(/\/?$/,'/');
  localStorage.setItem('sp_verifier',v); localStorage.setItem('sp_redirect',redirectUri);
  const p=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,code_challenge_method:'S256',code_challenge:c,scope:SP_SCOPES});
  window.location.href=`https://accounts.spotify.com/authorize?${p}`;
}

async function handleSpotifyCallback(){
  const p=new URLSearchParams(window.location.search), code=p.get('code');
  if (!code) return;
  history.replaceState({},'',window.location.pathname);
  const clientId=localStorage.getItem('spotifyClientId'), v=localStorage.getItem('sp_verifier'), redirectUri=localStorage.getItem('sp_redirect');
  if (!clientId||!v) return;
  try {
    const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri,client_id:clientId,code_verifier:v})});
    const data=await res.json();
    if (data.access_token){
      localStorage.setItem('sp_token',data.access_token);
      if(data.refresh_token) localStorage.setItem('sp_refresh',data.refresh_token);
      localStorage.setItem('sp_expiry',Date.now()+data.expires_in*1000);
      showSpotifyPlayer(); pollNowPlaying();
    }
  } catch(e){ console.error('Spotify token exchange failed',e); }
}

async function refreshSpotifyToken(){
  const clientId=localStorage.getItem('spotifyClientId'), refresh=localStorage.getItem('sp_refresh');
  if(!clientId||!refresh) return false;
  try{
    const res=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:clientId})});
    const data=await res.json();
    if(data.access_token){localStorage.setItem('sp_token',data.access_token);localStorage.setItem('sp_expiry',Date.now()+data.expires_in*1000);return true;}
  }catch(e){}
  return false;
}

async function spFetch(url,opts={}){
  const expiry=+localStorage.getItem('sp_expiry')||0;
  if(Date.now()>expiry-60000) await refreshSpotifyToken();
  const token=localStorage.getItem('sp_token');
  if(!token) return null;
  return fetch(url,{...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${token}`}});
}

async function pollNowPlaying(){
  clearTimeout(spotifyPollTimer);
  try{
    const res=await spFetch('https://api.spotify.com/v1/me/player/currently-playing');
    if(!res){hideSpotifyPlayer();return;}
    if(res.status===200){ const data=await res.json(); updateSpotifyDisplay(data); }
    else if(res.status===204){ updateSpotifyDisplay(null); }
    else if(res.status===401){ hideSpotifyPlayer();return; }
  }catch(e){}
  spotifyPollTimer=setTimeout(pollNowPlaying,5000);
}

function updateSpotifyDisplay(data){
  const trackEl=document.getElementById('spotifyTrackName'), artistEl=document.getElementById('spotifyArtist'),
    artEl=document.getElementById('spotifyArt'), playIcon=document.getElementById('playIcon');

  if(!data||!data.item){
    trackEl.textContent='Nothing playing'; artistEl.textContent='—'; artEl.src='';
    playIcon.innerHTML='<path d="M8 5v14l11-7z"/>';
    spProgressMs=0; spDurationMs=0; spIsPlaying=false; renderSpotifyProgress(); return;
  }
  const{name,artists,album,duration_ms,id:trackId}=data.item;
  trackEl.textContent=name; artistEl.textContent=artists.map(a=>a.name).join(', ');
  artEl.src=album.images.slice(-1)[0]?.url||'';
  // Fetch audio features for visualizer (only when track changes)
  if (trackId && trackId !== (window._lastVizTrackId||'')) {
    window._lastVizTrackId = trackId;
    fetchAudioFeatures(trackId);
  }
  spProgressMs=data.progress_ms||0; spDurationMs=duration_ms||0; spIsPlaying=data.is_playing;
  playIcon.innerHTML=data.is_playing?'<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>':'<path d="M8 5v14l11-7z"/>';
  renderSpotifyProgress();
  clearInterval(spProgressInterval);
  if(spIsPlaying) spProgressInterval=setInterval(()=>{ spProgressMs+=1000; if(spProgressMs>spDurationMs)spProgressMs=spDurationMs; renderSpotifyProgress(); },1000);
}

function renderSpotifyProgress(){
  const pct=spDurationMs>0?(spProgressMs/spDurationMs*100):0;
  document.getElementById('spProgressFill').style.width=pct+'%';
  document.getElementById('spCurrentTime').textContent=msToTime(spProgressMs);
  document.getElementById('spTotalTime').textContent=msToTime(spDurationMs);
}

function showSpotifyPlayer(){ document.getElementById('spotifyConnect').style.display='none'; document.getElementById('spotifyPlayer').style.display='flex'; }
function hideSpotifyPlayer(){ document.getElementById('spotifyPlayer').style.display='none'; document.getElementById('spotifyConnect').style.display='block'; }

async function spControl(action){
  const map={play:{method:'PUT',url:'https://api.spotify.com/v1/me/player/play'},pause:{method:'PUT',url:'https://api.spotify.com/v1/me/player/pause'},next:{method:'POST',url:'https://api.spotify.com/v1/me/player/next'},prev:{method:'POST',url:'https://api.spotify.com/v1/me/player/previous'}};
  const{method,url}=map[action];
  await spFetch(url,{method});
  setTimeout(pollNowPlaying,400);
}

document.getElementById('btnSpotifyConnect').addEventListener('click',connectSpotify);
document.getElementById('btnSpotifyDisconnect').addEventListener('click',()=>{
  clearTimeout(spotifyPollTimer); clearInterval(spProgressInterval);
  localStorage.removeItem('sp_token'); localStorage.removeItem('sp_refresh'); localStorage.removeItem('sp_expiry');
  hideSpotifyPlayer();
});
document.getElementById('btnPlay').addEventListener('click',async()=>{
  const res=await spFetch('https://api.spotify.com/v1/me/player');
  if(!res) return;
  const state=res.status===200?await res.json():null;
  spControl(state?.is_playing?'pause':'play');
});
document.getElementById('btnNext').addEventListener('click',()=>spControl('next'));
document.getElementById('btnPrev').addEventListener('click',()=>spControl('prev'));

// Progress bar seek
document.getElementById('spProgressTrack').addEventListener('click', async e => {
  if (!spDurationMs) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const ms = Math.floor(pct * spDurationMs);
  await spFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${ms}`, {method:'PUT'});
  spProgressMs = ms; renderSpotifyProgress();
});

/* ─── THEMES ─────────────────────────────────────────────── */

const THEMES = {
  dark:     { '--bg':'#0d0d0d','--bg2':'#111111','--surface':'#161616','--surface2':'#1c1c1c','--card':'#1e1e1e','--card-hi':'#252525','--border':'#262626','--border2':'#333333','--text':'#f0f0f0','--text2':'#888888','--text3':'#444444' },
  midnight: { '--bg':'#000000','--bg2':'#080808','--surface':'#0d0d0d','--surface2':'#111111','--card':'#141414','--card-hi':'#1a1a1a','--border':'#1a1a1a','--border2':'#252525','--text':'#e8e8e8','--text2':'#777777','--text3':'#363636' },
  ember:    { '--bg':'#0c0906','--bg2':'#110d09','--surface':'#170f0b','--surface2':'#1e140e','--card':'#231810','--card-hi':'#2a1d14','--border':'#2a1d14','--border2':'#3d2b1e','--text':'#f0e8e0','--text2':'#9e7c6a','--text3':'#5c4030' },
  forest:   { '--bg':'#080c08','--bg2':'#0c110c','--surface':'#101610','--surface2':'#151c15','--card':'#182018','--card-hi':'#1e281e','--border':'#1e281e','--border2':'#2d3d2d','--text':'#e8f0e8','--text2':'#7a9e7a','--text3':'#3d5c3d' },
  ocean:    { '--bg':'#07090d','--bg2':'#0b0e12','--surface':'#0f1318','--surface2':'#141920','--card':'#181f28','--card-hi':'#1e2730','--border':'#1e2730','--border2':'#2d3d50','--text':'#e0eaf5','--text2':'#6a8fae','--text3':'#3d5570' },
};

function applyTheme(key) {
  const t = THEMES[key]; if (!t) return;
  Object.entries(t).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
  localStorage.setItem('cc_theme', key);
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme===key));
}

function loadTheme() { applyTheme(localStorage.getItem('cc_theme') || 'dark'); }

document.querySelectorAll('.theme-swatch').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

/* ─── CALENDAR CREATE EVENT ──────────────────────────────── */

document.getElementById('btnCalNewEvent')?.addEventListener('click', () => {
  // Pre-fill date to today
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('calEvDate').value  = today;
  document.getElementById('calEvStart').value = '09:00';
  document.getElementById('calEvEnd').value   = '10:00';
  document.getElementById('calEvTitle').value = '';
  document.getElementById('calEvDesc').value  = '';
  document.getElementById('calCreateStatus').textContent = '';
  document.getElementById('calCreateOverlay').style.display = 'flex';
});

document.getElementById('btnCalCreateClose')?.addEventListener('click', () => {
  document.getElementById('calCreateOverlay').style.display = 'none';
});
document.getElementById('btnCalCreateCancel')?.addEventListener('click', () => {
  document.getElementById('calCreateOverlay').style.display = 'none';
});

document.getElementById('btnCalCreateSave')?.addEventListener('click', async () => {
  const title = document.getElementById('calEvTitle').value.trim();
  const date  = document.getElementById('calEvDate').value;
  const start = document.getElementById('calEvStart').value;
  const end   = document.getElementById('calEvEnd').value;
  const desc  = document.getElementById('calEvDesc').value.trim();
  const status = document.getElementById('calCreateStatus');

  if (!title) { status.style.color='#e87'; status.textContent='Title is required'; return; }
  if (!date)  { status.style.color='#e87'; status.textContent='Date is required'; return; }

  const btn = document.getElementById('btnCalCreateSave');
  btn.disabled = true; btn.textContent = 'Creating…';
  status.style.color='var(--text2)'; status.textContent = '';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: title,
    description: desc || undefined,
    start: start ? { dateTime:`${date}T${start}:00`, timeZone:tz } : { date },
    end:   end   ? { dateTime:`${date}T${end}:00`,   timeZone:tz } : { date },
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization':`Bearer ${googleToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      status.style.color='var(--green)'; status.textContent='Event created ✓';
      await loadCalendarEvents();
      setTimeout(() => { document.getElementById('calCreateOverlay').style.display='none'; }, 900);
    } else {
      const err = await res.json().catch(()=>({}));
      status.style.color='#e87'; status.textContent = err.error?.message || 'Failed to create event';
    }
  } catch(e) {
    status.style.color='#e87'; status.textContent = 'Network error';
  }
  btn.disabled = false; btn.textContent = 'Create Event';
});

/* ─── VISION BOARD ───────────────────────────────────────── */

let vbBoards = [];
let vbActiveId = null;
let vbDraggingBubble = null;
let vbPanningState   = null;

document.addEventListener('mousemove', e => {
  if (vbDraggingBubble) {
    const {bubble, startX, startY, startBX, startBY, el} = vbDraggingBubble;
    bubble.x = startBX + (e.clientX - startX);
    bubble.y = startBY + (e.clientY - startY);
    el.style.left = bubble.x + 'px';
    el.style.top  = bubble.y + 'px';
    const line = document.getElementById(`vbLine_${bubble.id}`);
    if (line) {
      line.setAttribute('x2', bubble.x + Math.floor((bubble.w||180)/2));
      line.setAttribute('y2', bubble.y + Math.floor((bubble.h||100)/2));
    }
  }
  if (vbPanningState) {
    const {board, startX, startY, startPanX, startPanY} = vbPanningState;
    board.panX = startPanX + (e.clientX - startX);
    board.panY = startPanY + (e.clientY - startY);
    const pan = document.getElementById('vbPan');
    if (pan) pan.style.transform = `translate(${board.panX}px,${board.panY}px)`;
  }
});

document.addEventListener('mouseup', () => {
  if (vbDraggingBubble) { saveVb(); vbDraggingBubble = null; }
  if (vbPanningState) {
    saveVb();
    vbPanningState = null;
    const area = document.getElementById('vbCanvasArea');
    if (area) area.classList.remove('panning');
  }
});

function loadVb() {
  try { vbBoards = JSON.parse(localStorage.getItem('vb_boards') || '[]'); } catch(e) { vbBoards = []; }
  if (!vbBoards.length) {
    vbBoards = [{ id:uid(), name:'My Vision', panX:0, panY:0, vision:{title:'My Goal',img:''}, bubbles:[] }];
  }
  if (!vbActiveId || !vbBoards.find(b=>b.id===vbActiveId)) vbActiveId = vbBoards[0]?.id || null;
}

function saveVb() { try { localStorage.setItem('vb_boards', JSON.stringify(vbBoards)); } catch(e) {} }

function vbGetActive() { return vbBoards.find(b=>b.id===vbActiveId); }

function renderVbSidebar() {
  const list = document.getElementById('vbSidebarList');
  if (!list) return;
  list.innerHTML = '';
  vbBoards.forEach(b => {
    const item = document.createElement('div');
    item.className = 'vb-sidebar-item' + (b.id===vbActiveId ? ' active' : '');
    item.innerHTML = `<span class="vb-sidebar-item-name">${esc(b.name)}</span>
      <button class="nb-del" title="Delete">${xSVG}</button>`;

    item.addEventListener('click', e => {
      if (e.target.closest('.nb-del')) return;
      vbActiveId = b.id; renderVbSidebar(); renderVbCanvas();
    });

    item.querySelector('.vb-sidebar-item-name').addEventListener('dblclick', () => {
      const nameEl = item.querySelector('.vb-sidebar-item-name');
      const inp = document.createElement('input');
      inp.className = 'nb-item-name-input'; inp.value = b.name;
      nameEl.replaceWith(inp); inp.focus(); inp.select();
      const save = () => { b.name = inp.value.trim() || b.name; saveVb(); renderVbSidebar(); };
      inp.addEventListener('blur', save, {once:true});
      inp.addEventListener('keydown', ke => {
        if (ke.key==='Enter') { ke.preventDefault(); inp.blur(); }
        if (ke.key==='Escape') { inp.value=b.name; inp.blur(); }
      });
    });

    item.querySelector('.nb-del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete "${b.name}"?`)) return;
      vbBoards = vbBoards.filter(x=>x.id!==b.id);
      if (vbActiveId===b.id) vbActiveId = vbBoards[0]?.id || null;
      saveVb(); renderVbSidebar(); renderVbCanvas();
    });
    list.appendChild(item);
  });
}

function renderVbCanvas() {
  const area = document.getElementById('vbCanvasArea');
  if (!area) return;
  area.innerHTML = '';

  const board = vbGetActive();
  if (!board) {
    const emp = document.createElement('div');
    emp.className = 'vb-canvas-empty';
    emp.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" opacity=".18"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>No board selected</span>`;
    area.appendChild(emp); return;
  }

  const pan = document.createElement('div');
  pan.id = 'vbPan';
  pan.style.cssText = `position:absolute;left:50%;top:50%;width:0;height:0;will-change:transform;transform:translate(${board.panX||0}px,${board.panY||0}px);`;
  area.appendChild(pan);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.id = 'vbSvg';
  svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;';
  pan.appendChild(svg);

  // Vision node
  pan.appendChild(buildVbVisionNode(board));

  // Bubbles
  board.bubbles.forEach(bubble => {
    vbDrawLine(svg, bubble);
    pan.appendChild(buildVbBubble(board, bubble));
  });

  // Canvas panning
  area.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.vb-bubble') || e.target.closest('.vb-vision-node')) return;
    vbPanningState = { board, startX:e.clientX, startY:e.clientY, startPanX:board.panX||0, startPanY:board.panY||0 };
    area.classList.add('panning');
    e.preventDefault();
  });
}

function vbDrawLine(svg, bubble) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(svgNS, 'line');
  line.id = `vbLine_${bubble.id}`;
  line.setAttribute('x1', 0); line.setAttribute('y1', 0);
  line.setAttribute('x2', bubble.x + Math.floor((bubble.w||180)/2));
  line.setAttribute('y2', bubble.y + Math.floor((bubble.h||100)/2));
  line.setAttribute('stroke', 'rgba(255,255,255,0.13)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-dasharray', '5,4');
  line.setAttribute('stroke-linecap', 'round');
  svg.appendChild(line);
}

function buildVbVisionNode(board) {
  const vn = document.createElement('div');
  vn.className = 'vb-vision-node';

  if (board.vision.img) {
    const img = document.createElement('img');
    img.className = 'vb-vision-img'; img.src = board.vision.img;
    img.addEventListener('click', e => { e.stopPropagation(); vbPickImage(board); });
    vn.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'vb-vision-img-placeholder';
    ph.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><span>Add image</span>`;
    ph.addEventListener('click', e => { e.stopPropagation(); vbPickImage(board); });
    vn.appendChild(ph);
  }

  const titleInp = document.createElement('input');
  titleInp.className = 'vb-vision-title-inp';
  titleInp.value = board.vision.title || '';
  titleInp.placeholder = 'Your vision…';
  titleInp.addEventListener('mousedown', e => e.stopPropagation());
  titleInp.addEventListener('change', e => { board.vision.title = e.target.value; saveVb(); });
  vn.appendChild(titleInp);

  const addBtn = document.createElement('button');
  addBtn.className = 'vb-add-bubble-btn';
  addBtn.textContent = '+ Add thought';
  addBtn.addEventListener('mousedown', e => e.stopPropagation());
  addBtn.addEventListener('click', e => { e.stopPropagation(); vbAddBubble(board); });
  vn.appendChild(addBtn);

  return vn;
}

function vbPickImage(board) {
  const inp = document.getElementById('vbImageInput');
  if (!inp) return;
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 400;
        const scale = Math.min(MAX/img.width, MAX/img.height, 1);
        canvas.width  = Math.floor(img.width  * scale);
        canvas.height = Math.floor(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        board.vision.img = canvas.toDataURL('image/jpeg', 0.72);
        inp.value = '';
        saveVb(); renderVbCanvas();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

function vbAddBubble(board) {
  const i = board.bubbles.length;
  const angle = (i * 72) * Math.PI / 180;
  const r = 230 + i * 15;
  const bw = 180, bh = 100;
  const bubble = {
    id: uid(),
    x: Math.round(Math.cos(angle)*r - bw/2),
    y: Math.round(Math.sin(angle)*r - bh/2),
    w: bw, h: bh,
    content: ''
  };
  board.bubbles.push(bubble);
  saveVb(); renderVbCanvas();
}

function buildVbBubble(board, bubble) {
  const bel = document.createElement('div');
  bel.className = 'vb-bubble';
  bel.id = `vbBubble_${bubble.id}`;
  bel.style.cssText = `left:${bubble.x}px;top:${bubble.y}px;width:${bubble.w||180}px;height:${bubble.h||100}px;`;

  // Header (drag handle + mini toolbar)
  const header = document.createElement('div');
  header.className = 'vb-bubble-header';

  const editor = document.createElement('div');
  editor.className = 'vb-bubble-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('data-placeholder', 'Write a thought…');
  editor.spellcheck = false;
  if (bubble.content) editor.innerHTML = bubble.content;

  const BTOOLS = [
    {cmd:'bold',icon:'<b>B</b>'},{cmd:'italic',icon:'<i>I</i>'},
    {cmd:'underline',icon:'<u>U</u>'},{cmd:'strikeThrough',icon:'<s>S</s>'},
  ];
  BTOOLS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'nb-tool-btn'; btn.innerHTML = t.icon;
    btn.style.cssText = 'width:20px;height:18px;font-size:10px;';
    btn.addEventListener('mousedown', e => { e.preventDefault(); document.execCommand(t.cmd,false,null); editor.focus(); });
    header.appendChild(btn);
  });

  editor.addEventListener('input', () => { bubble.content = editor.innerHTML; saveVb(); });
  editor.addEventListener('mousedown', e => e.stopPropagation());

  // Delete btn
  const del = document.createElement('button');
  del.className = 'vb-bubble-del'; del.innerHTML = xSVG;
  del.addEventListener('click', e => {
    e.stopPropagation();
    board.bubbles = board.bubbles.filter(b2=>b2.id!==bubble.id);
    saveVb(); renderVbCanvas();
  });

  bel.appendChild(header);
  bel.appendChild(editor);
  bel.appendChild(del);

  // Drag via header
  header.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    vbDraggingBubble = { bubble, startX:e.clientX, startY:e.clientY, startBX:bubble.x, startBY:bubble.y, el:bel };
    e.preventDefault(); e.stopPropagation();
  });

  // Track resize
  const ro = new ResizeObserver(() => {
    bubble.w = bel.offsetWidth; bubble.h = bel.offsetHeight; saveVb();
    const line = document.getElementById(`vbLine_${bubble.id}`);
    if (line) {
      line.setAttribute('x2', bubble.x + Math.floor(bubble.w/2));
      line.setAttribute('y2', bubble.y + Math.floor(bubble.h/2));
    }
  });
  ro.observe(bel);

  return bel;
}

document.getElementById('btnAddVbBoard')?.addEventListener('click', () => {
  const board = { id:uid(), name:'New Board', panX:0, panY:0, vision:{title:'',img:''}, bubbles:[] };
  vbBoards.push(board);
  vbActiveId = board.id;
  saveVb(); renderVbSidebar(); renderVbCanvas();
});

/* ─── VISUALIZER ─────────────────────────────────────────── */

let vizCtx = null, vizRaf = null;
let vizBPM = 120, vizEnergy = 0.5;
let vizLastBeatTime = Date.now();

function initVisualizer() {
  const canvas = document.getElementById('spVizCanvas');
  if (!canvas) return;
  // Match CSS width
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  vizCtx = canvas.getContext('2d');
  vizCtx.scale(dpr, dpr);
  vizLoop();
}

function vizLoop() {
  vizRaf = requestAnimationFrame(vizLoop);
  const canvas = document.getElementById('spVizCanvas');
  if (!canvas || !vizCtx) return;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  vizCtx.clearRect(0, 0, W, H);

  const now = Date.now();
  const t = now * 0.001;
  const beatMs = 60000 / vizBPM;
  const phase = ((now - vizLastBeatTime) % beatMs) / beatMs;
  const beatPulse = spIsPlaying ? Math.pow(Math.max(0, 1 - phase * 2.5), 2) : 0;

  const bars = 20;
  const gap  = 1;
  const barW = (W - gap*(bars-1)) / bars;

  for (let i = 0; i < bars; i++) {
    const center = (bars - 1) / 2;
    const dist   = Math.abs(i - center) / center;   // 0=center, 1=edge
    const wave   = Math.sin(t * 2.5 + i * 0.55) * 0.5 + 0.5;

    let h;
    if (spIsPlaying) {
      h = H * (0.15 + vizEnergy * 0.45 + beatPulse * 0.35) * (1 - dist * 0.4) * (0.7 + wave * 0.3);
    } else {
      h = H * (0.08 + wave * 0.18) * (1 - dist * 0.35);
    }
    h = Math.max(2, h);

    const x = i * (barW + gap);
    const y = (H - h) / 2;
    const alpha = spIsPlaying ? 0.35 + beatPulse * 0.5 + vizEnergy * 0.15 : 0.18;
    vizCtx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    vizCtx.beginPath();
    vizCtx.rect(x, y, Math.max(1, barW), h);
    vizCtx.fill();
  }
}

async function fetchAudioFeatures(trackId) {
  if (!trackId) return;
  try {
    const res = await spFetch(`https://api.spotify.com/v1/audio-features/${trackId}`);
    if (!res || res.status !== 200) return;
    const data = await res.json();
    vizBPM    = data.tempo    || 120;
    vizEnergy = data.energy   || 0.5;
    vizLastBeatTime = Date.now();
  } catch(e) {}
}

/* ─── BOOT ───────────────────────────────────────────────── */

loadSettings();
loadTheme();
loadNotebooks();
loadYtHistory();
loadVb();
render();
renderTimer();
renderNotebooks();
if (activeNotebookId) renderNbWorkspace();
renderYtHistory();
renderVbSidebar();
renderVbCanvas();

requestAnimationFrame(() => initVisualizer());
window.addEventListener('load', () => setTimeout(initGoogleAuth, 500));
handleSpotifyCallback();
if (localStorage.getItem('sp_token')){ showSpotifyPlayer(); pollNowPlaying(); }
