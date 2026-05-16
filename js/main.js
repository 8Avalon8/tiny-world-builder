// ES module entry — PR-2 wiring stub.
// During PR-2 the legacy inline <script> in tiny-world-builder.html still owns
// the actual runtime. main.js exists to land the module loader, prove vendor
// classic UMD (window.THREE) is available, and expose a host object that each
// PR-2 step can write into. Each step replaces a slice of the inline script
// with an imported module, then assigns the export onto window.__twb so any
// inline reference keeps working until the inline block is finally deleted.

const ready = (typeof window !== 'undefined') && !!window.THREE;
if (!ready) {
  console.error('[twb] vendor THREE missing — vendor/three/three.r128.min.js must load before js/main.js');
}

window.__twb = window.__twb || { engine: {}, ward: {}, game: {}, ui: {} };
