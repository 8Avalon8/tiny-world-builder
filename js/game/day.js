import { spawnVagrants } from './agents/spawn.js';
import { expireStalePetitions, runPetitionSpawners } from './petitions.js';
import {
  maybeSpawnFireEvent,
  maybeSpawnStampedeEvent,
  maybeSpawnInspectionEvent,
  expireStaleEvents,
  maybeSpawnRitualEvent,
  maybeSpawnLanternFestivalEvent,
  maybeSpawnVendorRestrictionEvent,
  maybeSpawnScandalEvent,
  maybeSpawnBlackMarketEvent,
  maybeSpawnLanternDonationEvent,
  maybeSpawnVendorNobleClashEvent,
  maybeSpawnTempleMediationEvent,
} from './events.js';
import { applyDailyTick, dailyLaborCap, tryAutoHire } from './citizens.js';
import { tickPromises } from './promises.js';
import { tickWastelandWork } from './wasteland.js';
import { applyStanceDailyBuffs } from './balance-stance.js';
import { evaluateEndgame } from './endgame.js';
import { getDailyGains } from './difficulty.js';
import { applyLocalEffectConsequences } from './local-effects.js';

export function summarizeDay(state, addLog = null) {
  const log = typeof addLog === 'function' ? addLog : null;

  const before = { labor: state.stats.labor, money: state.stats.money, wood: state.stats.wood };
  const cap = dailyLaborCap(state);
  const gains = getDailyGains(state);
  state.stats.labor = Math.max(state.stats.labor, cap);
  state.stats.money += gains.money;
  state.stats.wood += gains.wood;
  const laborGain = state.stats.labor - before.labor;
  const laborText = laborGain > 0 ? `人力 +${laborGain}（上限 ${cap}）` : `人力已满（上限 ${cap}）`;
  if (log) log(`第 ${state.day} 日结束。${laborText}、钱粮 +${gains.money}、木料 +${gains.wood}。`, true);

  runPetitionSpawners(state, 'preTick');
  expireStalePetitions(state, log);
  applyDailyTick(state, log);
  applyLocalEffectConsequences(state, log);

  tickPromises(state, log, tryAutoHire, spawnVagrants);
  tickWastelandWork(state, log);

  // 在 fire/stampede 爆发前抢先 spawn 防御类请愿,让玩家有机会预防
  runPetitionSpawners(state, 'preEvents');

  maybeSpawnFireEvent(state);
  maybeSpawnStampedeEvent(state);
  maybeSpawnInspectionEvent(state);
  expireStaleEvents(state, log);

  runPetitionSpawners(state, 'postEvents');
  maybeSpawnRitualEvent(state);
  maybeSpawnLanternFestivalEvent(state);
  const bonus = state.passiveMoneyBonus || 0;
  if (bonus > 0) {
    state.stats.money += bonus;
    if (log) log(`上元法会余泽：钱粮 +${bonus}。`);
  }

  runPetitionSpawners(state, 'postFestival');
  maybeSpawnVendorRestrictionEvent(state);
  maybeSpawnScandalEvent(state);

  runPetitionSpawners(state, 'postScandal');
  maybeSpawnBlackMarketEvent(state);
  maybeSpawnLanternDonationEvent(state);
  maybeSpawnVendorNobleClashEvent(state);
  maybeSpawnTempleMediationEvent(state);

  // slice-8: 坊势 ≥ 50 → 每日被动 buff
  const buffs = applyStanceDailyBuffs(state);
  if (buffs.length > 0) {
    const desc = buffs.map(b => `${b.stat} +${b.delta}`).join('，');
    if (log) log(`坊势余泽：${desc}。`);
  }

  const ending = evaluateEndgame(state);
  if (ending.status !== 'playing' && log) log(`${ending.title}：${ending.text}`, true);
}
