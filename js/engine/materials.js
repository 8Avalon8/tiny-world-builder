// engine/materials.js — Lambert + Basic material palette (M.*).
//
// Factory pattern: a top-level `new THREE.MeshLambertMaterial(...)` at module
// parse time would crash if vendor THREE somehow hadn't finished loading.
// Defer is supposed to guarantee classic vendor runs first, but the cost of
// the factory wrapper is zero and it makes the materials testable from node
// (pass a stub THREE).
//
// Stylized low-poly looks better with flat Lambert shading than physical
// energy conservation — so this whole palette is intentionally non-PBR.
//
// IMPORTANT: every material in M is SHARED across many meshes. Never mutate
// in place (e.g., `M.foo.color.set(...)`). Clone first, then mutate. The
// fade-material cache and chimney smoke follow this contract.

export function createMaterials(THREE) {
  return {
    grass:     new THREE.MeshLambertMaterial({ color: 0xb0d949 }),
    grassEdge: new THREE.MeshLambertMaterial({ color: 0x95c138 }),
    dirt:      new THREE.MeshLambertMaterial({ color: 0x7d4519 }),
    dirtRich:  new THREE.MeshLambertMaterial({ color: 0x462b15 }),
    path:      new THREE.MeshLambertMaterial({ color: 0xf2d29c }),
    pathTrim:  new THREE.MeshLambertMaterial({ color: 0xd9b780 }),
    pathScuff: new THREE.MeshLambertMaterial({ color: 0xc9aa70 }),
    water:     new THREE.MeshLambertMaterial({ color: 0x3a8fcc }),
    waterDk:   new THREE.MeshLambertMaterial({ color: 0x2f77ad }),
    waterFoam: new THREE.MeshLambertMaterial({ color: 0xbbe9ff, transparent: true, opacity: 0.74 }),
    shore:     new THREE.MeshLambertMaterial({ color: 0xd8c18a }),

    rock:      new THREE.MeshLambertMaterial({ color: 0x9b9a8f }),
    rockDk:    new THREE.MeshLambertMaterial({ color: 0x707066 }),
    rockHi:    new THREE.MeshLambertMaterial({ color: 0xc3c0b2 }),
    rockMoss:  new THREE.MeshLambertMaterial({ color: 0x6f8a3a }),

    stone:     new THREE.MeshLambertMaterial({ color: 0x8f8a82 }),
    stoneDk:   new THREE.MeshLambertMaterial({ color: 0x5e5a52 }),
    lava:      new THREE.MeshLambertMaterial({ color: 0xe7592b, emissive: 0xb02410, emissiveIntensity: 0.8 }),
    lavaCrust: new THREE.MeshLambertMaterial({ color: 0x3a201a }),
    sand:      new THREE.MeshLambertMaterial({ color: 0xe6cc7c }),
    sandDk:    new THREE.MeshLambertMaterial({ color: 0xc6a64b }),
    snow:      new THREE.MeshLambertMaterial({ color: 0xf2f5fa }),
    snowDk:    new THREE.MeshLambertMaterial({ color: 0xc9d1dc }),
    bridgeWood:  new THREE.MeshLambertMaterial({ color: 0x8b5a32 }),
    bridgeWoodD: new THREE.MeshLambertMaterial({ color: 0x5f3a20 }),

    trunk:     new THREE.MeshLambertMaterial({ color: 0x5c3818 }),
    leaves:    new THREE.MeshLambertMaterial({ color: 0x86d139 }),
    leavesDk:  new THREE.MeshLambertMaterial({ color: 0x5fab26 }),

    wallCream: new THREE.MeshLambertMaterial({ color: 0xf2dfb0 }),
    wallTrim:  new THREE.MeshLambertMaterial({ color: 0xe5cf99 }),
    roofBlue:  new THREE.MeshLambertMaterial({ color: 0x2a6dd1 }),
    roofBlueD: new THREE.MeshLambertMaterial({ color: 0x1d4d9c }),
    door:      new THREE.MeshLambertMaterial({ color: 0x7a4a2e }),
    woodTrim:  new THREE.MeshLambertMaterial({ color: 0x5c3818 }),
    windowB:   new THREE.MeshLambertMaterial({ color: 0x2a6dd1 }),
    chimney:   new THREE.MeshLambertMaterial({ color: 0xc9c4ba }),
    step:      new THREE.MeshLambertMaterial({ color: 0xa9a49a }),
    knob:      new THREE.MeshLambertMaterial({ color: 0xe8c050 }),

    fence:     new THREE.MeshLambertMaterial({ color: 0x7d4519 }),
    fenceWire: new THREE.MeshLambertMaterial({ color: 0x777d7a }),
    fenceSteel:new THREE.MeshLambertMaterial({ color: 0x8d98a5 }),
    castleStone:  new THREE.MeshLambertMaterial({ color: 0xb8b1a5 }),
    castleStoneD: new THREE.MeshLambertMaterial({ color: 0x8a8378 }),
    castleSlit:   new THREE.MeshLambertMaterial({ color: 0x2a251f }),
    flagRed:      new THREE.MeshLambertMaterial({ color: 0xb84838 }),
    skyBody:   new THREE.MeshLambertMaterial({ color: 0x4a6680 }),
    skyGlass:  new THREE.MeshLambertMaterial({ color: 0x6db8e0 }),
    skyFrame:  new THREE.MeshLambertMaterial({ color: 0x2a3a4c }),
    skyRoof:   new THREE.MeshLambertMaterial({ color: 0x3a4a5c }),

    manorBrick:    new THREE.MeshLambertMaterial({ color: 0xa84a3a }),
    manorBrickD:   new THREE.MeshLambertMaterial({ color: 0x7a3325 }),
    manorTrim:     new THREE.MeshLambertMaterial({ color: 0xf2ece0 }),
    manorRoof:     new THREE.MeshLambertMaterial({ color: 0x3a3a40 }),
    manorRoofD:    new THREE.MeshLambertMaterial({ color: 0x26262c }),
    manorWindow:   new THREE.MeshLambertMaterial({ color: 0xc8d8e8 }),

    towerStone:    new THREE.MeshLambertMaterial({ color: 0xa9a39a }),
    towerStoneD:   new THREE.MeshLambertMaterial({ color: 0x77716a }),
    towerRoof:     new THREE.MeshLambertMaterial({ color: 0x4a3a8c }),
    towerRoofD:    new THREE.MeshLambertMaterial({ color: 0x2f2660 }),
    cropLeaf:  new THREE.MeshLambertMaterial({ color: 0x96d943 }),
    cropStem:  new THREE.MeshLambertMaterial({ color: 0x5e9c2e }),

    cornStalk: new THREE.MeshLambertMaterial({ color: 0x6fa848 }),
    cornCob:   new THREE.MeshLambertMaterial({ color: 0xf2c849 }),
    cornLeaf:  new THREE.MeshLambertMaterial({ color: 0xa8c948 }),
    wheatStalk:new THREE.MeshLambertMaterial({ color: 0xc9b76e }),
    wheatHead: new THREE.MeshLambertMaterial({ color: 0xe6c354 }),
    pumpkin:   new THREE.MeshLambertMaterial({ color: 0xe07c2a }),
    pumpkinDk: new THREE.MeshLambertMaterial({ color: 0xb35a18 }),
    pumpkinStem: new THREE.MeshLambertMaterial({ color: 0x4d6a18 }),
    carrotBody:new THREE.MeshLambertMaterial({ color: 0xe06a2a }),
    sunflowerStalk:  new THREE.MeshLambertMaterial({ color: 0x4d8a2a }),
    sunflowerPetal:  new THREE.MeshLambertMaterial({ color: 0xf2c849 }),
    sunflowerCenter: new THREE.MeshLambertMaterial({ color: 0x5a3a18 }),

    cloud:     new THREE.MeshLambertMaterial({ color: 0xfdfcf8 }),
    cloudShade:new THREE.MeshLambertMaterial({ color: 0xdcd9d0 }),

    hover:     new THREE.MeshBasicMaterial({ color: 0x2a2722, transparent: true, opacity: 0.18, depthWrite: false }),
    hoverErase:new THREE.MeshBasicMaterial({ color: 0xb84838, transparent: true, opacity: 0.28, depthWrite: false }),

    // Tang-dynasty Chang'an ward palette (青瓦/夯土/朱漆/纸窗).
    tangTile:     new THREE.MeshLambertMaterial({ color: 0x4a3a2a }),
    tangTileDk:   new THREE.MeshLambertMaterial({ color: 0x2e231a }),
    mudBrick:     new THREE.MeshLambertMaterial({ color: 0xcca97a }),
    mudBrickDk:   new THREE.MeshLambertMaterial({ color: 0xa9885d }),
    redLacquer:   new THREE.MeshLambertMaterial({ color: 0xb02a1f }),
    redLacquerDk: new THREE.MeshLambertMaterial({ color: 0x802018 }),
    lanternRed:   new THREE.MeshLambertMaterial({ color: 0xd64236 }),
    flagYellow:   new THREE.MeshLambertMaterial({ color: 0xd8b34a }),
    stoneStep:    new THREE.MeshLambertMaterial({ color: 0xa9a39a }),
    paperWindow:  new THREE.MeshLambertMaterial({ color: 0xf2e6c8 }),
    tangCloth:    new THREE.MeshLambertMaterial({ color: 0xdcc8a8 }),
    skinTang:     new THREE.MeshLambertMaterial({ color: 0xe8c8a8 }),
    monkRobe:     new THREE.MeshLambertMaterial({ color: 0xa05a2a }),
  };
}
