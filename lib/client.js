window.__ModuleLoader__.load({
  id: "dsh-desktop-app",
  factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  applyAdvancedShell: () => applyAdvancedShell,
  inject: () => inject,
  parseDesktopClientEnvironment: () => parseDesktopClientEnvironment
});
module.exports = __toCommonJS(index_exports);

// src/client/AdvancedFrame.tsx
var import_react = require("react");

// src/client/layout-state.ts
var SIDEBAR_COLLAPSED = 56;
var MACOS_SIDEBAR_COLLAPSED = 90;
var SIDEBAR_DEFAULT = 280;
var SIDEBAR_MIN = 264;
var SIDEBAR_MAX = 420;
var SIDEBAR_AUTO_COLLAPSE = 1024;
var DETAILS_DEFAULT = 360;
var DETAILS_MIN = 300;
var DETAILS_MAX = 520;
var CENTER_MIN = 640;
function computeDesktopColumns(viewport, sidebar, details, collapsedWidth = SIDEBAR_COLLAPSED) {
  const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, SIDEBAR_MIN, SIDEBAR_MAX);
  const preferredDetails = details === 0 ? 0 : clamp(details, DETAILS_MIN, DETAILS_MAX);
  if (sidebarWidth + preferredDetails + CENTER_MIN <= viewport) {
    return { sidebar: sidebarWidth, center: viewport - sidebarWidth - preferredDetails, details: preferredDetails };
  }
  const reducedDetails = preferredDetails === 0 ? 0 : Math.max(DETAILS_MIN, viewport - sidebarWidth - CENTER_MIN);
  if (sidebarWidth + reducedDetails + CENTER_MIN <= viewport) {
    return { sidebar: sidebarWidth, center: CENTER_MIN, details: reducedDetails };
  }
  return { sidebar: sidebarWidth, center: Math.max(0, viewport - sidebarWidth), details: 0 };
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
var DesktopLayoutState = class {
  snapshot = Object.freeze({
    sidebar: SIDEBAR_DEFAULT,
    details: 0,
    narrow: false,
    narrowExpanded: false
  });
  listeners = /* @__PURE__ */ new Set();
  /** @returns the immutable current panel snapshot. */
  getSnapshot() {
    return this.snapshot;
  }
  /** @param listener - callback notified after a snapshot replacement. @returns its disposer. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Toggle the wide sidebar and the platform-selected compact rail. */
  toggleSidebar() {
    if (this.snapshot.narrow) {
      this.publish({ ...this.snapshot, narrowExpanded: !this.snapshot.narrowExpanded });
      return;
    }
    this.publish({ ...this.snapshot, sidebar: this.snapshot.sidebar === 0 ? SIDEBAR_DEFAULT : 0 });
  }
  /** @param narrow - whether the frame is below the automatic-collapse breakpoint. */
  setNarrow(narrow) {
    if (this.snapshot.narrow === narrow) return;
    this.publish({ ...this.snapshot, narrow, narrowExpanded: false });
  }
  /** Open details at its default width. */
  openDetails() {
    if (this.snapshot.details === 0) this.publish({ ...this.snapshot, details: DETAILS_DEFAULT });
  }
  /** Close details while keeping its slot mounted. */
  closeDetails() {
    if (this.snapshot.details !== 0) this.publish({ ...this.snapshot, details: 0 });
  }
  /** @param width - requested sidebar width from a resize gesture. */
  setSidebar(width) {
    this.publish({ ...this.snapshot, sidebar: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX) });
  }
  /** @param width - requested details width from a resize gesture. */
  setDetails(width) {
    this.publish({ ...this.snapshot, details: clamp(width, DETAILS_MIN, DETAILS_MAX) });
  }
  publish(next) {
    this.snapshot = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
};

// src/client/AdvancedFrame.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function tauriWindowCommand(command) {
  try {
    const internals = window.__TAURI_INTERNALS__;
    if (internals?.invoke !== void 0) {
      void internals.invoke(command).catch(() => void 0);
    }
  } catch {
  }
}
function DesktopWindowControls() {
  const onMinimize = (0, import_react.useCallback)(() => tauriWindowCommand("plugin:window|minimize"), []);
  const onToggleMaximize = (0, import_react.useCallback)(() => tauriWindowCommand("plugin:window|toggle_maximize"), []);
  const onClose = (0, import_react.useCallback)(() => tauriWindowCommand("plugin:window|close"), []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopWindowControls", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopCaptionButton", "aria-label": "\u6700\u5C0F\u5316", onClick: onMinimize, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 12 12", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1 6h10", stroke: "currentColor", strokeWidth: "1", fill: "none" }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopCaptionButton", "aria-label": "\u6700\u5927\u5316", onClick: onToggleMaximize, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 12 12", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "1.5", y: "1.5", width: "9", height: "9", stroke: "currentColor", strokeWidth: "1", fill: "none" }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopCaptionButton dshDesktopCaptionButton-close", "aria-label": "\u5173\u95ED", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 12 12", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M2 2l8 8M10 2l-8 8", stroke: "currentColor", strokeWidth: "1" }) }) })
  ] });
}
function AdvancedFrame({ layout, platform, renderSlot, useSessions }) {
  const subscribeLayout = (0, import_react.useCallback)((listener) => layout.subscribe(listener), [layout]);
  const readLayout = (0, import_react.useCallback)(() => layout.getSnapshot(), [layout]);
  const panels = (0, import_react.useSyncExternalStore)(subscribeLayout, readLayout);
  const frameRef = (0, import_react.useRef)(null);
  const [viewport, setViewport] = (0, import_react.useState)(() => window.innerWidth);
  const detailsSession = useSessions((state) => {
    const current = state.current;
    return current !== void 0 && state.byId[current]?.blank === false ? current : void 0;
  });
  (0, import_react.useEffect)(() => {
    const element = frameRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== void 0 && entry.contentRect.width > 0) setViewport(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
  (0, import_react.useEffect)(() => {
    layout.setNarrow(narrow);
  }, [layout, narrow]);
  const previousSession = (0, import_react.useRef)(detailsSession);
  (0, import_react.useEffect)(() => {
    if (detailsSession !== void 0 && previousSession.current !== void 0 && previousSession.current !== detailsSession) {
      layout.closeDetails();
    }
    previousSession.current = detailsSession;
  }, [detailsSession, layout]);
  const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0;
  const sidebarPreference = collapsed ? 0 : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar;
  const columns = computeDesktopColumns(
    viewport,
    sidebarPreference,
    detailsSession === void 0 ? 0 : panels.details,
    platform === "darwin" ? MACOS_SIDEBAR_COLLAPSED : SIDEBAR_COLLAPSED
  );
  const hasCaption = platform !== "darwin";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: frameRef,
      className: "dshDesktopFrame",
      "data-desktop-platform": platform,
      "data-sidebar-collapsed": collapsed || void 0,
      style: { gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` },
      children: [
        platform === "darwin" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopMacCaptionRow", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopMacCaptionDrag", "data-tauri-drag-region": true, "aria-hidden": "true" }) }),
        platform === "win32" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopWindowsCaptionRow", "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopCaptionDrag", "data-tauri-drag-region": true, "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DesktopWindowControls, {})
        ] }),
        platform === "linux" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopLinuxCaptionRow", "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopCaptionDrag", "data-tauri-drag-region": true, "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DesktopWindowControls, {})
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: "dshDesktopSidebarSurface", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopSidebarDrag", "data-tauri-drag-region": true, "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopUpstreamSidebar", children: renderSlot("sidebar", { collapsed, width: columns.sidebar }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", { className: "dshDesktopConversationSurface", children: renderSlot("conversation", {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", { className: "dshDesktopDetailsSurface", children: renderSlot("details", {}) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopOverlay", "data-shell-overlay": true, children: renderSlot("shell.overlay", {}) }),
        !collapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ResizeHandle,
          {
            side: "sidebar",
            left: columns.sidebar,
            size: columns.sidebar,
            onResize: (width) => {
              layout.setSidebar(width);
            }
          }
        ),
        columns.details > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ResizeHandle,
          {
            side: "details",
            left: viewport - columns.details,
            size: columns.details,
            onResize: (width) => {
              layout.setDetails(width);
            }
          }
        )
      ]
    }
  );
}
function ResizeHandle(props) {
  const origin = (0, import_react.useRef)(0);
  const base = (0, import_react.useRef)(0);
  const onPointerDown = (0, import_react.useCallback)((event) => {
    origin.current = event.clientX;
    base.current = props.size;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [props.size]);
  const onPointerMove = (0, import_react.useCallback)((event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const delta = event.clientX - origin.current;
    props.onResize(base.current + (props.side === "sidebar" ? delta : -delta));
  }, [props]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: "dshDesktopResizeHandle",
      "data-side": props.side,
      style: { left: props.left },
      onPointerDown,
      onPointerMove
    }
  );
}

// src/client/layout-service.ts
function provideDesktopLayout(ctx, layout) {
  const dispose = ctx.reflect.provide("layout", layout);
  return () => {
    void dispose();
  };
}

// src/client/window-chrome.ts
var MACOS_TITLEBAR_HEIGHT = 20;
var MACOS_DRAG_REGION_HEIGHT = 32;
var MACOS_TRAFFIC_LIGHT_SAFE_WIDTH = 80;
var WINDOWS_TITLEBAR_HEIGHT = 32;
var WINDOWS_CAPTION_CONTROLS_WIDTH = 138;
var LINUX_TITLEBAR_HEIGHT = 32;
var LINUX_CAPTION_CONTROLS_WIDTH = 138;

// src/client/styles.ts
var ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: var(--dsw-alias-bg-base); }
/* \u4FA7\u680F surface \u7528\u4FA7\u680F\u586B\u5145\u8272\u800C\u975E\u900F\u660E\uFF1A\u907F\u514D Tauri Overlay \u6807\u9898\u680F\u533A\u57DF\u7684 webview
   \u900F\u660E\u50CF\u7D20\u900F\u51FA\u5230\u684C\u9762\uFF08\u53C2\u8003\u9879\u76EE\u7684 Electron \u6709 vibrancy \u73BB\u7483\u886C\u5E95\uFF0C\u6211\u4EEC\u7528\u5B9E\u5FC3\u8272\uFF09\u3002 */
.dshDesktopSidebarSurface { position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base)); border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: ${MACOS_TITLEBAR_HEIGHT}px; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: ${SIDEBAR_COLLAPSED}px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: ${MACOS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
/* \u4E09\u5E73\u53F0\u901A\u7528\uFF1Asidebar \u9876\u90E8\u7A7A\u767D\u62D6\u62FD\u6761\uFF08logo \u4E0A\u65B9\u7559\u767D\u533A\uFF09\u2014\u2014\u771F\u5B9E\u5143\u7D20\uFF0C\u8D70 Tauri data-tauri-drag-region */
.dshDesktopSidebarDrag { position: absolute; top: 0; right: 0; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; cursor: default; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarDrag { left: ${MACOS_TRAFFIC_LIGHT_SAFE_WIDTH}px; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarDrag,
.dshDesktopFrame[data-desktop-platform="linux"] .dshDesktopSidebarDrag { left: 0; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionDrag { position: absolute; top: 0; right: 0; left: 0; height: ${MACOS_DRAG_REGION_HEIGHT}px; user-select: none; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: ${WINDOWS_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="linux"] { grid-template-rows: ${LINUX_TITLEBAR_HEIGHT}px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface,
.dshDesktopFrame[data-desktop-platform="linux"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface,
.dshDesktopFrame[data-desktop-platform="linux"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="linux"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopLinuxCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
/* \u81EA\u7ED8 caption \u884C\uFF1A\u5DE6\u4FA7\u5360\u6EE1\u4E3A\u62D6\u62FD\u6761\uFF0C\u53F3\u4FA7\u7559\u51FA\u7A97\u53E3\u63A7\u5236\u6309\u94AE\u533A\u57DF */
.dshDesktopCaptionDrag { position: absolute; top: 0; bottom: 0; left: 0; right: ${WINDOWS_CAPTION_CONTROLS_WIDTH}px; user-select: none; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopCaptionDrag { right: ${WINDOWS_CAPTION_CONTROLS_WIDTH}px; }
.dshDesktopFrame[data-desktop-platform="linux"] .dshDesktopCaptionDrag { right: ${LINUX_CAPTION_CONTROLS_WIDTH}px; }
.dshDesktopWindowControls { position: absolute; top: 0; right: 0; height: 100%; display: flex; align-items: stretch; }
.dshDesktopCaptionButton { width: 46px; border: none; margin: 0; padding: 0; background: transparent; color: var(--dsw-alias-label-primary); display: grid; place-items: center; cursor: default; }
.dshDesktopCaptionButton:hover { background: rgba(128, 128, 128, 0.18); }
.dshDesktopCaptionButton-close:hover { background: #e81123; color: #fff; }
.dshDesktopCaptionButton svg { width: 12px; height: 12px; display: block; }
.dshDesktopFrame[data-sidebar-collapsed] { transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; }
@media (prefers-reduced-motion: reduce) { .dshDesktopFrame { transition: none !important; } }
`;
function installAdvancedStyles() {
  const style = document.createElement("style");
  style.dataset.plugin = "dsh-desktop-app";
  style.dataset.pluginCss = "dsh-desktop-app/advanced-shell";
  style.textContent = ADVANCED_STYLES;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}

// src/client/theme-presenter.ts
var DARK_ATTRIBUTE = "data-ds-dark-theme";
var DesktopThemePresenter = class {
  appliedTokens = [];
  themeColorMeta = document.createElement("meta");
  constructor() {
    this.themeColorMeta.name = "theme-color";
  }
  /** @param snapshot - current resolved palette and token overrides. */
  apply(snapshot) {
    const scheme = snapshot.active.colorScheme;
    document.documentElement.style.colorScheme = scheme;
    if (scheme === "dark") document.body.setAttribute(DARK_ATTRIBUTE, "");
    else document.body.removeAttribute(DARK_ATTRIBUTE);
    for (const name of this.appliedTokens) document.body.style.removeProperty(name);
    this.appliedTokens = [];
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      document.body.style.setProperty(name, value);
      this.appliedTokens.push(name);
    }
    this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
    if (!this.themeColorMeta.isConnected) document.head.appendChild(this.themeColorMeta);
  }
  /** Remove only DOM state owned by this presenter. */
  dispose() {
    document.documentElement.style.removeProperty("color-scheme");
    document.body.removeAttribute(DARK_ATTRIBUTE);
    for (const name of this.appliedTokens) document.body.style.removeProperty(name);
    this.appliedTokens = [];
    this.themeColorMeta.remove();
  }
};

// src/client/advanced-shell.ts
function applyAdvancedShell(ctx, environment) {
  if (environment.mode !== "advanced") {
    throw new Error(`dsh-desktop-app: advanced shell received mode ${JSON.stringify(environment.mode)}`);
  }
  const desktopLayout = new DesktopLayoutState();
  ctx.effect(
    () => provideDesktopLayout(ctx, desktopLayout),
    "desktop: layout service"
  );
  ctx.effect(() => {
    document.body.dataset.dshDesktopMode = "advanced";
    document.body.dataset.dshDesktopPlatform = environment.platform;
    const removeStyles = installAdvancedStyles();
    return () => {
      removeStyles();
      delete document.body.dataset.dshDesktopMode;
      delete document.body.dataset.dshDesktopPlatform;
    };
  }, "desktop: advanced shell styles");
  ctx.effect(() => {
    const presenter = new DesktopThemePresenter();
    presenter.apply(ctx.theme.getTheme());
    const off = ctx.on("theme/change", (snapshot) => {
      presenter.apply(snapshot);
    });
    return () => {
      off();
      presenter.dispose();
    };
  }, "desktop: theme presenter");
  ctx.effect(() => ctx.slots.register({
    name: "root",
    children: {
      "sidebar": { kind: "single", scope: "root" },
      "conversation": { kind: "single", scope: "session-maybe" },
      "details": { kind: "single", scope: "session" },
      "shell.overlay": { kind: "list", scope: "root" }
    },
    inject: () => ({ layout: desktopLayout, platform: environment.platform })
  }, AdvancedFrame), "desktop: advanced root slot");
}

// src/client/environment.ts
var MODES = /* @__PURE__ */ new Set(["compatibility", "advanced"]);
var PLATFORMS = /* @__PURE__ */ new Set(["darwin", "win32", "linux"]);
function parseDesktopClientEnvironment(search) {
  const params = new URLSearchParams(search);
  const mode = params.get("dsh-desktop-mode");
  const platform = params.get("dsh-desktop-platform");
  if (mode === null && platform === null) return void 0;
  if (!MODES.has(mode)) {
    throw new Error(`dsh-desktop-app: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`);
  }
  if (!PLATFORMS.has(platform)) {
    throw new Error(`dsh-desktop-app: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`);
  }
  return { mode, platform };
}

// src/client/index.ts
var inject = [
  "slots",
  "sessions",
  "theme",
  "workspaces"
];
function apply(ctx) {
  const environment = parseDesktopClientEnvironment(window.location.search);
  if (!environment) return;
  if (environment.mode === "advanced") applyAdvancedShell(ctx, environment);
}
return module.exports;
  }
});

//# sourceMappingURL=client.js.map
