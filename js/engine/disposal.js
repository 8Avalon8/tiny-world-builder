// engine/disposal.js — Three.js geometry/material disposal helpers.
//
// safeDisposeGeometry is a pure function: it skips the dispose call when the
// geometry is flagged `userData.cached = true` (the shared roundedSlab/box
// geometry pool). Disposing those would tear down VBOs that other meshes
// still depend on.
//
// disposeGroup needs two external owners injected at assembly time:
//   - opacityRoots: a Set the fade-material cache uses to track top-level
//     groups under animation; removed entries stop being walked by the
//     fade tick.
//   - unregisterRuntimeObject: registry hook that drops the group from any
//     ward-side bookkeeping (agents, weather props, etc.) before tree-walk
//     disposal. Decoupling this from disposal keeps the engine ignorant of
//     ward-specific tracking.
//
// Materials are intentionally NOT disposed here. M.* and the fade-material
// cache buckets are shared across many meshes; disposing them on tile teardown
// would corrupt other tiles still using the same material. Per-instance
// material disposal is the owning callsite's responsibility (see chimney
// smoke for the established pattern).

export function safeDisposeGeometry(geo) {
  if (geo && !(geo.userData && geo.userData.cached)) geo.dispose();
}

export function createDisposeGroup({ opacityRoots, unregisterRuntimeObject }) {
  return function disposeGroup(group) {
    if (opacityRoots) opacityRoots.delete(group);
    if (typeof unregisterRuntimeObject === 'function') unregisterRuntimeObject(group);
    group.traverse(o => {
      safeDisposeGeometry(o.geometry);
    });
  };
}
