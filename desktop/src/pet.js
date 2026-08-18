// Deepseek Harness 桌宠：JS 手动拖拽（点击/拖拽分离）+ 右键菜单 + 气泡 + 穿透开关
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;
const win = getCurrentWindow();

// ---- 拖拽 vs 点击判定 ----
const stage = document.getElementById('stage');
let startX = 0;
let startY = 0;
let downT = 0;
let dragging = false;

stage.addEventListener('pointerdown', (e) => {
  if (e.button === 0) {
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    downT = Date.now();
  }
});
stage.addEventListener('pointermove', (e) => {
  // 位移超 4px 才进入系统级拖动；此后鼠标交给 OS，JS 只收 pointerup
  if (
    e.buttons & 1 &&
    !dragging &&
    Math.hypot(e.clientX - startX, e.clientY - startY) > 4
  ) {
    dragging = true;
    win.startDragging();
  }
});
stage.addEventListener('pointerup', (e) => {
  if (dragging) {
    dragging = false;
    return; // 位置由 Rust 侧 WindowEvent::Moved 防抖落盘
  }
  if (e.button === 0 && Date.now() - downT < 300) {
    invoke('pet_show_main'); // 点击 → 唤起主窗
  }
});

// ---- 右键自绘菜单 ----
const menu = document.getElementById('menu');
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  menu.hidden = !menu.hidden;
});
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 2) menu.hidden = true;
});
menu.addEventListener('click', async (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'show-main') invoke('pet_show_main');
  if (act === 'toggle-passthrough') {
    const on = await invoke('pet_toggle_passthrough');
    showHint(on ? '穿透已开：点击不再生效，请从托盘关闭' : '穿透已关');
  }
  if (act === 'hide') invoke('pet_hide');
  if (act === 'quit') invoke('pet_quit');
  menu.hidden = true;
});

// ---- 气泡：监听 Rust 侧 pet-say 事件（任务完成联动）----
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
let bubbleTimer = null;

async function initBubble() {
  await listen('pet-say', (e) => {
    bubbleText.textContent = e.payload?.body || '任务完成啦～';
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.hidden = true;
    }, 5000);
  });
}

function showHint(msg) {
  bubbleText.textContent = msg;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.hidden = true;
  }, 3500);
}

initBubble();
