// src/agents/characters/demoNpc.js
// PR5: 演示用 demo 主角；张小敬之类的真人物在游戏剧情成熟后再加。

export const demoNpc = {
  id: 'demoNpc',
  displayName: '路人甲',
  role: 'StoryAgent',
  unique: true,
  appearance: {
    color: '#5e2a1b',
    banner: '路人甲',
  },
  needs: null,
  interruptibility: 0,
  ignoresPhaseFlush: true,
  ignoresCurfew: true,
  spawn: (state) => ({
    type: 'Resident',                   // 渲染身份借用 Resident
    x: state.gates.W.cell.x + 0.5,
    y: state.gates.W.cell.y + 0.5,
    interactable: true,
  }),
  script: 'demoNpc_walkthrough',
};
