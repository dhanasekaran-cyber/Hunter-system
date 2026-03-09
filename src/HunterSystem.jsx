import { useState, useEffect, useRef, useCallback } from "react";

// ════════════════════════════════════════════════════════
//  SOUND ENGINE  (Web Audio API — works while app is open)
// ════════════════════════════════════════════════════════
const AudioCtx = typeof window !== "undefined"
  ? (window.AudioContext || window.webkitAudioContext) : null;
let _ctx = null;
function getAudioCtx() {
  if (!_ctx && AudioCtx) _ctx = new AudioCtx();
  if (_ctx?.state === "suspended") _ctx.resume();
  return _ctx;
}

// Plays a sequence of notes — feel free to tune
function playSound(type = "notify") {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const sequences = {
      // gentle system chime
      notify: [[523, 0, 0.12], [659, 0.13, 0.12], [784, 0.26, 0.18]],
      // level-up fanfare
      levelup: [[523,0,.1],[659,.11,.1],[784,.22,.1],[1047,.33,.3]],
      // ominous penalty alarm
      penalty: [[220,0,.2],[185,.22,.2],[165,.44,.4],[110,.66,.6]],
      // deadline warning pulse
      deadline: [[440,0,.08],[440,.12,.08],[440,.24,.08],[880,.36,.25]],
      // quest complete
      quest: [[784,0,.08],[1047,.1,.15]],
      // boss hit
      boss: [[110,0,.06],[87,.07,.1]],
    };

    const seq = sequences[type] || sequences.notify;
    seq.forEach(([freq, start, dur]) => {
      const osc = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc.connect(g2); g2.connect(gain);
      osc.type = type === "penalty" || type === "deadline" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      g2.gain.setValueAtTime(0.25, ctx.currentTime + start);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.01);
    });
  } catch (e) {
    console.warn("Audio error:", e);
  }
}

// ════════════════════════════════════════════════════════
//  NOTIFICATION ENGINE
// ════════════════════════════════════════════════════════

// Daily reminder schedule — times in HH:MM (local)
const REMINDER_SCHEDULE = [
  { hh: 8,  mm: 0,  title: "⚔ Morning Briefing",       body: "Your quests await, Hunter. Begin now before the day escapes you.", tag: "morning",  sound: "notify" },
  { hh: 13, mm: 0,  title: "🧠 Midday Check-In",        body: "Half the day gone. Have you completed your quests? The System is watching.", tag: "midday",   sound: "notify" },
  { hh: 19, mm: 0,  title: "🔥 Evening Warning",        body: "5 hours until penalty. Unfinished quests will cost you HP and XP.", tag: "evening",  sound: "deadline" },
  { hh: 23, mm: 0,  title: "☠ FINAL WARNING — 1 HOUR", body: "ONE HOUR REMAINS. Complete your quests or face PUNISHMENT.", tag: "deadline", sound: "penalty", requireInteraction: true },
];

function buildTodaySchedule(doneTasks) {
  const now = new Date();
  return REMINDER_SCHEDULE.map(r => {
    const fire = new Date(now);
    fire.setHours(r.hh, r.mm, 0, 0);
    // If already past today, skip (don't roll to tomorrow — daily re-register handles it)
    if (fire.getTime() <= Date.now()) return null;
    // Skip morning/midday if all quests already done
    if (Object.keys(doneTasks).length >= 4 && r.tag !== "deadline") return null;
    return { ...r, fireAt: fire.getTime() };
  }).filter(Boolean);
}

async function registerNotifications(doneTasks) {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  if (!reg.active) return false;
  const schedule = buildTodaySchedule(doneTasks);
  reg.active.postMessage({ type: "SCHEDULE_NOTIFICATIONS", schedule });
  return schedule.length;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

async function sendTestNotification() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: "TEST_NOTIFICATION" });
}

// ════════════════════════════════════════════════════════
//  CONSTANTS & DATA
// ════════════════════════════════════════════════════════

const TASKS_DEF = [
  { id: "study",    label: "Study 1H",    xp: 40, icon: "📖", timer: 3600 },
  { id: "deepwork", label: "Deep Work 2H",xp: 60, icon: "🧠", timer: 7200 },
  { id: "workout",  label: "Workout",      xp: 35, icon: "💪", timer: null  },
  { id: "skill",    label: "Skill Quest",  xp: 45, icon: "🎯", timer: null, dynamic: true },
];

// ════════════════════════════════════════════════════════
//  BOSS CHALLENGE POOL — real life, all types, scales with level
// ════════════════════════════════════════════════════════
const BOSS_POOL = {
  E: [
    { id:"b_e1", title:"The Silence Gate",       desc:"No social media, no streaming, no entertainment for 24 full hours. Sit with your own thoughts.", reward:150, duration:"24 hours",  type:"Mental",   icon:"🧠" },
    { id:"b_e2", title:"The First Step",          desc:"Pick a goal you've had for 6+ months and haven't started. Take the FIRST real concrete action today.", reward:150, duration:"Today",     type:"Mental",   icon:"🎯" },
    { id:"b_e3", title:"The Body Awakens",        desc:"100 push-ups + 100 squats + 5km walk. Spread across the day. No excuses.", reward:150, duration:"1 day",     type:"Physical", icon:"💪" },
    { id:"b_e4", title:"The Kitchen Initiation",  desc:"Cook one complete meal entirely from scratch — no processed ingredients. Eat what you make.", reward:150, duration:"Today",     type:"Cooking",  icon:"🍳" },
    { id:"b_e5", title:"The Jump Trial",          desc:"500 jump rope skips total today. Split however you want. Count every one.", reward:150, duration:"1 day",     type:"Calisthenics", icon:"🪢" },
    { id:"b_e6", title:"The Terminal Gate",       desc:"Open a terminal. Complete the first 3 levels of OverTheWire: Bandit (levels 0-2). Screenshot proof.", reward:160, duration:"Today",     type:"Hacking",  icon:"💻" },
  ],
  D: [
    { id:"b_d1", title:"The Uncomfortable Truth", desc:"Have the conversation you've been avoiding — with a friend, family, or yourself in 2 pages of honest writing.", reward:175, duration:"Today",     type:"Social",   icon:"🗣" },
    { id:"b_d2", title:"The Focus Dungeon",       desc:"4 hours of deep work, zero distractions. Phone in another room. Door closed. Track your output.", reward:175, duration:"4 hours",   type:"Mental",   icon:"🧠" },
    { id:"b_d3", title:"The Cold King",           desc:"7 consecutive days of cold showers. Every single day. Log each session.", reward:200, duration:"7 days",    type:"Physical", icon:"🧊" },
    { id:"b_d4", title:"The Chef's Trial",        desc:"Plan and cook all 3 meals for one full day from scratch. No takeaway, no instant food.", reward:180, duration:"1 day",     type:"Cooking",  icon:"🍽" },
    { id:"b_d5", title:"The Rope Warrior",        desc:"1000 jump rope skips in a single session. Rest as needed but finish the count.", reward:175, duration:"1 session", type:"Calisthenics", icon:"🪢" },
    { id:"b_d6", title:"The Recon Mission",       desc:"Complete OverTheWire Bandit levels 0-10. Document every command you used and what it taught you.", reward:200, duration:"3 days",    type:"Hacking",  icon:"💻" },
  ],
  C: [
    { id:"b_c1", title:"The Content Blackout",   desc:"72 hours — no social media, no YouTube, no Netflix. Read, train, cook, and build instead.", reward:220, duration:"3 days",    type:"Mental",   icon:"📵" },
    { id:"b_c2", title:"The Social Sovereign",   desc:"Have genuine conversations with 5 new people across 5 days. Not just hi — real exchanges.", reward:220, duration:"5 days",    type:"Social",   icon:"🤝" },
    { id:"b_c3", title:"The Iron Week",           desc:"Train every single day for 7 days. Different movements each day. Track every rep.", reward:250, duration:"7 days",    type:"Physical", icon:"⚡" },
    { id:"b_c4", title:"The Flavor Study",        desc:"Cook one dish from a cuisine you've never tried before. Research it, source the ingredients, execute it.", reward:220, duration:"This week", type:"Cooking",  icon:"🌍" },
    { id:"b_c5", title:"The Thousand Gates",      desc:"2000 jump rope skips in one session. No quitting. Build up to it across the week if needed.", reward:230, duration:"7 days",    type:"Calisthenics", icon:"🪢" },
    { id:"b_c6", title:"The Privilege Escalation",desc:"Set up Kali Linux (VM or live USB). Run your first vulnerability scan on a test target. Document findings.", reward:250, duration:"5 days",    type:"Hacking",  icon:"🔓" },
  ],
  B: [
    { id:"b_b1", title:"The Monk Protocol",      desc:"5 AM wake-up for 7 consecutive days. No snooze. First 2 hours belong to your most important goal.", reward:280, duration:"7 days",    type:"Mental",   icon:"🌅" },
    { id:"b_b2", title:"The Skill Forge",        desc:"10 hours this week dedicated to one specific skill. Every session logged. No scattered effort.", reward:280, duration:"7 days",    type:"Creative", icon:"🔥" },
    { id:"b_b3", title:"The Rejection Trials",   desc:"Get intentionally rejected 5 times this week. Ask big. Expect no. Grow from every one.", reward:300, duration:"7 days",    type:"Social",   icon:"⚔" },
    { id:"b_b4", title:"The Peak Run",           desc:"Complete your longest run or hardest physical challenge to date. Track distance, time, heart rate.", reward:280, duration:"1 day",     type:"Physical", icon:"🏃" },
    { id:"b_b5", title:"The Meal Prep Sovereign",desc:"Prep all your meals for the entire week in one session. Clean ingredients only. No junk food all week.", reward:280, duration:"7 days",    type:"Cooking",  icon:"🥗" },
    { id:"b_b6", title:"The Jump Sovereign",     desc:"100 consecutive skips without stopping, then 50 double-unders (or 200 fast singles). Every day for 5 days.", reward:290, duration:"5 days",    type:"Calisthenics", icon:"🪢" },
    { id:"b_b7", title:"The CTF Infiltrator",    desc:"Complete one beginner CTF challenge on HackTheBox or TryHackMe. Write a full writeup of your method.", reward:300, duration:"7 days",    type:"Hacking",  icon:"🚩" },
  ],
  A: [
    { id:"b_a1", title:"The Shadow Month",       desc:"30 days straight: 5 AM wake, daily training, 20 min reading, zero junk food. Log every single day.", reward:400, duration:"30 days",   type:"All",      icon:"👁" },
    { id:"b_a2", title:"The Creation Gate",      desc:"Build something real and publish it publicly this week — code, article, video, art. Ship it.", reward:350, duration:"7 days",    type:"Creative", icon:"🌑" },
    { id:"b_a3", title:"The Deep Discomfort",    desc:"Execute the one thing you fear most in your life right now. Plan it Monday. Do it by Friday.", reward:400, duration:"5 days",    type:"Mental",   icon:"🔥" },
    { id:"b_a4", title:"The Iron Chef Trial",    desc:"Cook 7 different healthy meals across 7 days — all new recipes, all nutritionally balanced. Log macros.", reward:380, duration:"7 days",    type:"Cooking",  icon:"👨‍🍳" },
    { id:"b_a5", title:"The Calisthenics Ascent",desc:"Achieve: 20 clean pull-ups OR 50 consecutive push-ups OR 100 consecutive jump rope double-unders.", reward:400, duration:"This month", type:"Calisthenics", icon:"🏋" },
    { id:"b_a6", title:"The Network Breach",     desc:"Complete a medium-difficulty box on HackTheBox solo. Write a full technical writeup. Post it.", reward:420, duration:"2 weeks",   type:"Hacking",  icon:"💀" },
  ],
  S: [
    { id:"b_s1", title:"The Monarch's Trial",    desc:"Design your own 30-day total transformation protocol. Execute it completely. Document the result publicly.", reward:500, duration:"30 days",   type:"All",      icon:"👑" },
    { id:"b_s2", title:"The Shadow Sovereign",   desc:"Mentor one person for 30 days in any of your skills. Their measurable growth is your victory condition.", reward:500, duration:"30 days",   type:"Social",   icon:"⚔" },
    { id:"b_s3", title:"The Cyber Monarch",      desc:"Pass the eJPT or CompTIA Security+ certification exam. No shortcuts. Real knowledge, real credential.", reward:600, duration:"60 days",   type:"Hacking",  icon:"🔱" },
  ],
};

function getBossesForRank(rank) {
  const ranks = ["E","D","C","B","A","S"];
  const idx = ranks.indexOf(rank);
  const current = BOSS_POOL[rank] || BOSS_POOL.E;
  const lower = idx > 0 ? (BOSS_POOL[ranks[idx-1]] || []).slice(0,2) : [];
  return [...current, ...lower];
}

// ════════════════════════════════════════════════════════
//  SKILL POOL — 7 areas, AI rotates based on mastery gaps
// ════════════════════════════════════════════════════════
const SKILL_POOL = {
  communication: [
    { id:"s_eye",    label:"Eye Contact",        desc:"Maintain steady eye contact in every conversation today. Don't look away first.", icon:"👁",  xp:45, area:"communication" },
    { id:"s_listen", label:"Active Listening",   desc:"Listen fully before speaking in every conversation. Zero interruptions.", icon:"👂", xp:45, area:"communication" },
    { id:"s_voice",  label:"Voice Projection",   desc:"Speak louder and clearer than usual. Record 2 minutes of yourself and review.", icon:"🎙", xp:45, area:"communication" },
    { id:"s_story",  label:"Storytelling",       desc:"Tell one compelling story to someone today — real event, made engaging.", icon:"📢", xp:50, area:"communication" },
    { id:"s_debate", label:"Argue Both Sides",   desc:"Pick any topic. Write a clear argument FOR it and AGAINST it. 10 minutes each.", icon:"⚖",  xp:50, area:"communication" },
    { id:"s_cold",   label:"Cold Conversation",  desc:"Start a genuine conversation with someone you have never spoken to before.", icon:"🤝", xp:55, area:"communication" },
  ],
  physical: [
    { id:"p_cold",    label:"Cold Shower",        desc:"End your shower with 2 full minutes of cold water. No easing in. No shortcuts.", icon:"🧊", xp:50, area:"physical" },
    { id:"p_stretch", label:"Mobility Work",      desc:"30 minutes of intentional stretching or yoga. Full range of motion focus.", icon:"🧘", xp:40, area:"physical" },
    { id:"p_posture", label:"Posture Discipline", desc:"Perfect posture for the entire day. Set an hourly reminder to check.", icon:"🏛",  xp:40, area:"physical" },
    { id:"p_breath",  label:"Breathwork",         desc:"10 minutes of box breathing (4-4-4-4). Log your focus level before and after.", icon:"💨", xp:45, area:"physical" },
    { id:"p_fast",    label:"Intermittent Fast",  desc:"Skip breakfast. Eat only within a 6-hour window today. Track energy levels.", icon:"⚡", xp:50, area:"physical" },
    { id:"p_sleep",   label:"Sleep Discipline",   desc:"In bed by 10 PM, phone off 1 hour before. Note sleep quality next morning.", icon:"🌙", xp:45, area:"physical" },
  ],
  mental: [
    { id:"m_nophone",   label:"No Phone 2H",        desc:"Zero phone use for 2 consecutive hours. No glances, no checks. Total blackout.", icon:"📵", xp:55, area:"mental" },
    { id:"m_journal",   label:"Reflection Journal", desc:"Write 1 page about what you're currently avoiding and exactly why. Be brutal.", icon:"📓", xp:45, area:"mental" },
    { id:"m_meditate",  label:"Meditation 20min",   desc:"20 minutes of silent meditation. When focus breaks, calmly return. No app.", icon:"🧠", xp:45, area:"mental" },
    { id:"m_hard",      label:"Do The Hard Thing",  desc:"Name the one task you've been avoiding most. Do it today. No rescheduling.", icon:"🔥", xp:60, area:"mental" },
    { id:"m_gratitude", label:"Gratitude Practice", desc:"Write 10 specific things you're grateful for. Not generic — be precise each one.", icon:"🙏", xp:40, area:"mental" },
    { id:"m_plan",      label:"Weekly Planning",    desc:"Block out your full week with time slots. Review what worked and failed last week.", icon:"🗓", xp:50, area:"mental" },
  ],
  creative: [
    { id:"c_read",    label:"Read 30 Pages",      desc:"30 pages of a non-fiction book. Summarise 3 key insights you'll actually apply.", icon:"📚", xp:45, area:"creative" },
    { id:"c_learn",   label:"Learn Something New",desc:"45 minutes on one skill you have never tried before. Document what you learned.", icon:"💡", xp:50, area:"creative" },
    { id:"c_create",  label:"Create Something",   desc:"Make something today — write, draw, build, code. It doesn't have to be perfect.", icon:"✍",  xp:55, area:"creative" },
    { id:"c_teach",   label:"Teach to Learn",     desc:"Explain something you've recently learned to another person in full detail.", icon:"🎓", xp:50, area:"creative" },
    { id:"c_problem", label:"Problem Mapping",    desc:"Write one real problem in your life. Map 5 concrete, actionable solutions.", icon:"🔍", xp:50, area:"creative" },
    { id:"c_audit",   label:"Skill Audit",        desc:"List your top 5 skills. Rate yourself 1-10 on each. Write a plan for the weakest.", icon:"📊", xp:45, area:"creative" },
  ],
  cooking: [
    { id:"ck_boil",   label:"Master Boiling",       desc:"Cook a perfect soft-boiled (6 min) and hard-boiled egg. Understand timing by feel.", icon:"🥚", xp:40, area:"cooking" },
    { id:"ck_sauce",  label:"Build a Sauce",         desc:"Make any sauce from scratch — no jar, no packet. Taste and adjust seasoning yourself.", icon:"🫕", xp:45, area:"cooking" },
    { id:"ck_knife",  label:"Knife Skills",          desc:"Spend 20 minutes practising your knife technique. Fine dice an onion cleanly.", icon:"🔪", xp:45, area:"cooking" },
    { id:"ck_meal",   label:"Full Balanced Meal",    desc:"Cook a complete meal with protein, carbs and vegetables — all from raw ingredients.", icon:"🍽", xp:50, area:"cooking" },
    { id:"ck_new",    label:"New Cuisine",           desc:"Cook a recipe from a cuisine you've never made before. Research the technique properly.", icon:"🌍", xp:55, area:"cooking" },
    { id:"ck_macro",  label:"Macro-Tracked Meal",    desc:"Cook a meal and calculate its macros (protein/carbs/fat) manually. Hit your targets.", icon:"📊", xp:50, area:"cooking" },
  ],
  calisthenics: [
    { id:"jr_basics",  label:"Jump Rope 5min",     desc:"5 continuous minutes of jump rope without stopping. Maintain rhythm throughout.", icon:"🪢", xp:40, area:"calisthenics" },
    { id:"jr_500",     label:"500 Skips",          desc:"Complete 500 total jump rope skips today. Split across sets if needed.", icon:"🪢", xp:45, area:"calisthenics" },
    { id:"ca_push",    label:"Push-Up Ladder",     desc:"1-2-3-4-5-4-3-2-1 push-up ladder. Rest only between sets. Full range of motion.", icon:"💪", xp:45, area:"calisthenics" },
    { id:"ca_squat",   label:"100 Squats",         desc:"100 bodyweight squats today. Break into sets. Full depth, no half-reps.", icon:"🦵", xp:45, area:"calisthenics" },
    { id:"ca_hollow",  label:"Core Holds",         desc:"3 sets of hollow body hold — as long as you can. Then 3 sets of plank. Log times.", icon:"🔩", xp:50, area:"calisthenics" },
    { id:"jr_double",  label:"Double-Unders",      desc:"Learn and complete 10 consecutive double-unders. Practise until you land them clean.", icon:"⚡", xp:60, area:"calisthenics" },
    { id:"ca_pull",    label:"Pull-Up Practice",   desc:"Max pull-ups in 3 sets, 2 min rest between. Track reps. If no bar: do 50 rows.", icon:"🏋", xp:55, area:"calisthenics" },
  ],
  hacking: [
    { id:"hk_terminal",label:"Terminal Fluency",    desc:"Open a terminal. Run 10 commands you've never used before. Document what each does.", icon:"💻", xp:45, area:"hacking" },
    { id:"hk_net",     label:"Network Recon",       desc:"Use nmap to scan your own home network. Identify every device. Understand the output.", icon:"🌐", xp:50, area:"hacking" },
    { id:"hk_bandit",  label:"Bandit Level",        desc:"Complete one level of OverTheWire: Bandit (start at your current level). Document method.", icon:"🔐", xp:55, area:"hacking" },
    { id:"hk_python",  label:"Scripting Practice",  desc:"Write a Python script that automates something useful — file renaming, ping sweep, etc.", icon:"🐍", xp:55, area:"hacking" },
    { id:"hk_ctf",     label:"CTF Challenge",       desc:"Complete one challenge on picoCTF or HackTheBox Starting Point. Write what you learned.", icon:"🚩", xp:65, area:"hacking" },
    { id:"hk_vuln",    label:"Vuln Research",       desc:"Read one CVE in full. Understand the attack vector, impact, and patch. Summarise it.", icon:"🔍", xp:50, area:"hacking" },
    { id:"hk_enum",    label:"Enumeration Drill",   desc:"Set up a local vulnerable VM (VulnHub) and run a full enumeration. List all findings.", icon:"🛡", xp:60, area:"hacking" },
  ],
};

const ALL_SKILLS = Object.values(SKILL_POOL).flat();

const AREA_META = {
  communication: { icon:"💬", color:"#00f7ff" },
  physical:      { icon:"💪", color:"#ff4d6d" },
  mental:        { icon:"🧠", color:"#a259ff" },
  creative:      { icon:"✍",  color:"#ffe600" },
  cooking:       { icon:"🍳", color:"#ff9c00" },
  calisthenics:  { icon:"🪢", color:"#00ff9c" },
  hacking:       { icon:"💻", color:"#00cfff" },
};

// AI-style rotation: picks weakest area, least-done skill, avoids today's repeat
function getNextSkill(skillLog) {
  const areas = Object.keys(SKILL_POOL);
  const todayK = todayKey();

  // Score each area by average completions (lower = needs more work)
  const areaScores = areas.map(area => {
    const skills = SKILL_POOL[area];
    const avg = skills.reduce((s, sk) => s + (skillLog[sk.id]?.completions || 0), 0) / skills.length;
    return { area, avg };
  }).sort((a, b) => a.avg - b.avg);

  // Try areas from weakest first, find a valid skill
  for (const { area } of areaScores) {
    const candidates = SKILL_POOL[area]
      .filter(s => skillLog[s.id]?.lastDoneDay !== todayK)
      .sort((a, b) => (skillLog[a.id]?.completions || 0) - (skillLog[b.id]?.completions || 0));
    if (candidates.length > 0) return candidates[0];
  }
  // Fallback: return any skill from weakest area
  return SKILL_POOL[areaScores[0].area][0];
}

const PENALTY_TIERS = [
  { missed: 1, label: "MILD PUNISHMENT",   hpLoss: 10, xpLoss: 20,  streakReset: false, color: "#ff9c00", icon: "⚠",  msg: "One quest ignored. The shadow stirs within you." },
  { missed: 2, label: "HARSH PUNISHMENT",  hpLoss: 25, xpLoss: 50,  streakReset: false, color: "#ff4d00", icon: "🔥", msg: "Two quests unfulfilled. The System is displeased. Do better." },
  { missed: 3, label: "SEVERE PUNISHMENT", hpLoss: 40, xpLoss: 80,  streakReset: true,  color: "#cc0000", icon: "💀", msg: "Three quests abandoned. Streak DESTROYED. You are pathetically weak." },
  { missed: 4, label: "TOTAL FAILURE",     hpLoss: 60, xpLoss: 120, streakReset: true,  color: "#880000", icon: "☠",  msg: "ALL quests failed. You disgrace the System. Rise from the shadows or perish." },
];

const LEVEL_REWARDS = [
  { level: 5,  title: "Iron Will",       desc: "+50 Bonus XP granted",                 bonus: 50,  icon: "🥷" },
  { level: 10, title: "XP Boost",        desc: "Earn 30% more XP from all tasks",       bonus: 0,   icon: "⚡", skillUnlock: "xpBoost" },
  { level: 15, title: "Streak Guardian", desc: "Streak Guard now active",               bonus: 0,   icon: "🛡", skillUnlock: "streakGuard" },
  { level: 20, title: "Shadow Soldier",  desc: "Rank B achieved — +150 Bonus XP",       bonus: 150, icon: "🌑" },
  { level: 30, title: "Monarch's Eye",   desc: "Boss damage +50% permanently + 200 XP", bonus: 200, icon: "👁", perk: "bossBoost" },
  { level: 35, title: "Arise",           desc: "Rank A — The System acknowledges you",  bonus: 300, icon: "⚔" },
  { level: 50, title: "Shadow Monarch",  desc: "Rank S — You stand above all hunters",  bonus: 500, icon: "👑" },
];

const RANKS = [
  { min: 50, label: "S", color: "#ff0060" },
  { min: 35, label: "A", color: "#ff6600" },
  { min: 20, label: "B", color: "#c084fc" },
  { min: 10, label: "C", color: "#00ff9c" },
  { min: 5,  label: "D", color: "#00cfff" },
  { min: 0,  label: "E", color: "#00f7ff" },
];

const MOTIVATIONAL_TAGS = [
  "ARISE.", "THE SYSTEM WATCHES.", "WEAKNESS IS NOT PERMITTED.",
  "EVERY SHADOW BEGINS WITH LIGHT.", "LEVEL UP OR FADE.",
  "THE GATE IS OPEN.", "YOUR POTENTIAL IS UNMEASURED.",
];

// ════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════
function getRankObj(level) {
  for (const r of RANKS) if (level >= r.min) return r;
  return RANKS[RANKS.length - 1];
}
function raidReq(level) { return 10 + level; }
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function getStored(k, fb) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; }
  catch { return fb; }
}
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

const DEFAULT_SYS = {
  level: 1, xp: 0, xpNeeded: 100, hp: 100, maxHp: 100,
  rank: "E", streak: 0, dailyTasks: 0, weeklyTasks: 0,
  skills: { xpBoost: false, streakGuard: false },
  perks: { bossBoost: false },
  claimedRewards: [],
  penaltyLog: [],
  activityLog: {},
  skillLog: {},        // { skillId: { completions, lastDoneDay, area } }
  activeBoss: null,    // current boss challenge the user accepted
  bossLog: [],         // completed boss history
  lastDayKey: todayKey(),
  lastActive: Date.now(),
};
const DEFAULT_BOSS = { hp: 200, maxHp: 200 };

// ════════════════════════════════════════════════════════
//  CSS
// ════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
:root{--cyan:#00f7ff;--red:#ff0040;--orange:#ff9c00;--green:#00ff9c;--purple:#c084fc;--gold:#ffe600;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
@keyframes flicker{0%,100%{opacity:1}85%{opacity:.97}87%{opacity:.5}89%{opacity:.97}}
@keyframes glowPulse{0%,100%{box-shadow:0 0 8px #00f7ff18,inset 0 0 8px #00f7ff07}50%{box-shadow:0 0 20px #00f7ff33,inset 0 0 16px #00f7ff12}}
@keyframes bossShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes rewardPop{0%{transform:scale(.7) translateY(20px);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
@keyframes penaltySlam{0%{transform:scale(1.3);opacity:0}60%{transform:scale(.97)}100%{transform:scale(1);opacity:1}}
@keyframes clockTick{0%,100%{text-shadow:0 0 12px var(--cyan)}50%{text-shadow:0 0 24px var(--cyan),0 0 48px #00f7ff33}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes borderGlow{0%,100%{border-color:#00f7ff14}50%{border-color:#00f7ff44}}
@keyframes urgentPulse{0%,100%{border-color:#ff4d0044;background:rgba(255,77,0,.05)}50%{border-color:#ff4d0099;background:rgba(255,77,0,.12)}}

.root{min-height:100vh;background:#000507;font-family:'Share Tech Mono',monospace;color:var(--cyan);padding-bottom:80px;overflow-x:hidden;position:relative;}
.bg-grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,247,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,247,255,.02) 1px,transparent 1px);background-size:44px 44px;}
.bg-vig{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 50% 30%,transparent 25%,rgba(0,0,0,.9) 100%);}
.scan{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;opacity:.03;}
.scan::after{content:'';position:absolute;left:0;right:0;height:2px;background:var(--cyan);animation:scanline 7s linear infinite;}
.wrap{position:relative;z-index:2;max-width:520px;margin:0 auto;padding:0 14px;}

.hdr{text-align:center;padding:26px 0 18px;animation:fadeUp .6s ease both;}
.hdr-title{font-family:'Cinzel',serif;font-size:clamp(18px,5vw,26px);font-weight:900;letter-spacing:6px;color:var(--cyan);text-shadow:0 0 30px var(--cyan),0 0 60px #00f7ff33;animation:flicker 9s infinite;}
.hdr-tag{font-size:9px;letter-spacing:4px;color:#0d4a55;margin-top:5px;animation:pulse 3s ease infinite;}
.rank-badge{display:inline-block;margin-top:10px;padding:4px 20px;border-radius:2px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:4px;border:1px solid;transition:all .4s;}

.live-clock{background:rgba(0,12,24,.95);border:1px solid #00f7ff14;border-radius:5px;padding:10px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;animation:fadeUp .5s ease .1s both;}
.clock-time{font-family:'Cinzel',serif;font-size:20px;letter-spacing:4px;color:var(--cyan);animation:clockTick 2s ease infinite;}

.tab-bar{display:flex;background:rgba(0,8,16,.9);border:1px solid #00f7ff10;border-radius:4px;margin-bottom:14px;overflow:hidden;animation:fadeUp .6s ease .15s both;}
.tab-btn{flex:1;padding:11px 2px;background:transparent;color:#1a4a5a;border:none;border-bottom:2px solid transparent;font-family:'Share Tech Mono',monospace;font-size:8px;letter-spacing:1px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
.tab-btn.on{color:var(--cyan);border-bottom-color:var(--cyan);background:rgba(0,247,255,.06);text-shadow:0 0 8px var(--cyan);}

.panel{background:linear-gradient(135deg,rgba(0,10,22,.97),rgba(0,6,16,.99));border:1px solid #00f7ff18;border-radius:6px;padding:18px;margin-bottom:12px;position:relative;overflow:hidden;animation:glowPulse 5s ease infinite,fadeUp .5s ease both;}
.panel::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,#00f7ff55,transparent);}
.ptitle{font-family:'Cinzel',serif;font-size:10px;letter-spacing:5px;text-transform:uppercase;color:var(--cyan);margin-bottom:14px;text-shadow:0 0 10px #00f7ff55;display:flex;align-items:center;gap:8px;}
.ptitle-line{flex:1;height:1px;background:linear-gradient(90deg,#00f7ff33,transparent);}

.srow{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #00f7ff09;font-size:11px;}
.slabel{color:#1e6a7a;letter-spacing:2px;}

.pbar-wrap{width:100%;border-radius:3px;overflow:hidden;background:#01080f;border:1px solid #00f7ff10;margin:5px 0;}
.pbar-fill{border-radius:3px;transition:width .5s cubic-bezier(.4,0,.2,1);position:relative;}
.pbar-fill::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 60%,rgba(255,255,255,.15));animation:shimmer 2s infinite;background-size:400px 100%;}

.cbtn{background:transparent;border:1px solid;border-radius:3px;font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:2px;padding:9px 16px;cursor:pointer;transition:all .2s;text-transform:uppercase;}
.cbtn:disabled{opacity:.2;cursor:not-allowed;}
.cbtn:not(:disabled):hover{box-shadow:0 0 14px currentColor;text-shadow:0 0 8px currentColor;background:rgba(255,255,255,.07);}
.brow{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}

.task-card{background:rgba(0,247,255,.02);border:1px solid #00f7ff14;border-radius:5px;padding:14px;margin-bottom:9px;transition:all .2s;animation:borderGlow 4s ease infinite;}
.task-card:hover{border-color:#00f7ff44;}
.task-card.done{border-color:#00ff9c22;background:rgba(0,255,156,.03);opacity:.65;}
.task-card.urgent{animation:urgentPulse 1.5s ease infinite;}
.task-hdr{display:flex;justify-content:space-between;align-items:center;}
.task-name{font-size:11px;letter-spacing:2px;}
.task-xp{font-size:9px;color:#0d5a6a;}

.timer-big{font-size:24px;text-align:center;letter-spacing:6px;margin:10px 0 6px;font-family:'Cinzel',serif;font-weight:700;}

.boss-skull{font-size:52px;text-align:center;margin:8px 0 4px;filter:drop-shadow(0 0 18px #ff004055);animation:float 3s ease infinite;}

.penalty-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.93);display:flex;align-items:center;justify-content:center;animation:fadeIn .3s ease;}
.penalty-box{background:linear-gradient(160deg,#0d0000,#180000);border:1px solid;border-radius:8px;padding:32px 26px;text-align:center;max-width:360px;width:92%;animation:penaltySlam .5s cubic-bezier(.34,1.3,.64,1) both;}
.penalty-icon{font-size:56px;margin-bottom:10px;animation:pulse 1s ease infinite;}
.penalty-title{font-family:'Cinzel',serif;font-size:17px;letter-spacing:4px;margin-bottom:8px;}
.penalty-msg{font-size:10px;letter-spacing:1px;line-height:1.8;margin-bottom:16px;}
.penalty-stats{display:flex;gap:12px;justify-content:center;margin-bottom:18px;flex-wrap:wrap;}
.pstat{border:1px solid;border-radius:4px;padding:8px 14px;font-size:10px;letter-spacing:1px;}

.reward-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;animation:fadeIn .3s ease;}
.reward-box{background:linear-gradient(160deg,#000c18,#001520);border:1px solid #00f7ff44;border-radius:8px;padding:32px 26px;text-align:center;max-width:340px;width:92%;box-shadow:0 0 60px #00f7ff22;animation:rewardPop .5s cubic-bezier(.34,1.56,.64,1) both;}
.reward-icon{font-size:52px;margin-bottom:10px;}
.reward-title{font-family:'Cinzel',serif;font-size:17px;letter-spacing:4px;color:var(--cyan);text-shadow:0 0 20px var(--cyan);margin-bottom:8px;}
.reward-desc{font-size:10px;color:#3a8a9a;line-height:1.8;margin-bottom:18px;letter-spacing:1px;}

.milestone-item{display:flex;align-items:center;gap:12px;padding:12px;border-radius:4px;margin-bottom:8px;border:1px solid;transition:all .2s;}
.milestone-item.claimed{background:rgba(0,247,255,.03);border-color:#00f7ff14;opacity:.5;}
.milestone-item.available{background:rgba(0,247,255,.08);border-color:#00f7ff44;box-shadow:0 0 12px #00f7ff14;}
.milestone-item.locked{background:rgba(0,0,0,.25);border-color:#ffffff07;}

.ai-chat{display:flex;flex-direction:column;gap:10px;max-height:320px;overflow-y:auto;margin:10px 0;padding-right:4px;}
.ai-msg{padding:12px 14px;border-radius:4px;font-size:10px;line-height:1.8;letter-spacing:.5px;animation:fadeUp .3s ease;}
.ai-msg.user{background:rgba(0,247,255,.06);border:1px solid #00f7ff1a;color:#00cfff;text-align:right;}
.ai-msg.ai{background:rgba(0,18,32,.9);border:1px solid #00f7ff10;color:#6abccc;border-left:2px solid var(--cyan);}
.ai-msg.loading{color:#1a5a6a;font-style:italic;}
.ai-input-row{display:flex;gap:8px;margin-top:8px;}
.ai-input{flex:1;background:rgba(0,10,22,.9);border:1px solid #00f7ff1a;border-radius:3px;color:var(--cyan);font-family:'Share Tech Mono',monospace;font-size:10px;padding:10px 12px;outline:none;letter-spacing:1px;}
.ai-input:focus{border-color:#00f7ff44;}
.ai-input::placeholder{color:#1a4a5a;}

.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#000d1a;border:1px solid var(--cyan);color:var(--cyan);font-family:'Share Tech Mono',monospace;padding:11px 22px;border-radius:4px;box-shadow:0 0 20px #00f7ff22;font-size:10px;letter-spacing:2px;animation:fadeUp .3s ease;z-index:999;white-space:nowrap;}

.log-item{padding:9px 12px;border-radius:3px;margin-bottom:7px;border-left:2px solid;font-size:9px;letter-spacing:1px;line-height:1.7;background:rgba(0,0,0,.3);}

.day-dot{width:100%;aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;border:1px solid;transition:all .3s;}

.skill-node{padding:15px;border-radius:5px;margin-bottom:10px;border:1px solid;transition:all .3s;}
.skill-node.unlocked{border-color:#00f7ff2a;background:rgba(0,247,255,.05);}
.skill-node.locked{border-color:#ffffff08;background:rgba(0,0,0,.3);}

::-webkit-scrollbar{width:3px;background:#000;}
::-webkit-scrollbar-thumb{background:#00f7ff15;border-radius:3px;}

.notif-banner{border-radius:5px;padding:14px 16px;margin-bottom:12px;border:1px solid;font-size:10px;letter-spacing:1px;line-height:1.8;animation:fadeUp .4s ease both;}
.notif-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block;margin-right:6px;animation:pulse 2s ease infinite;}
.schedule-item{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #00f7ff09;font-size:9px;letter-spacing:1px;}
.sound-test-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}
`;

// ════════════════════════════════════════════════════════
//  SHARED COMPONENTS
// ════════════════════════════════════════════════════════
function Bar({ val, max, c1 = "#00f7ff", c2 = "#00ff9c", h = 10 }) {
  const pct = Math.min(100, Math.max(0, (val / max) * 100));
  return (
    <div className="pbar-wrap" style={{ height: h }}>
      <div className="pbar-fill" style={{
        height: "100%", width: pct + "%",
        background: `linear-gradient(90deg,${c1},${c2})`,
        boxShadow: `0 0 6px ${c1}`,
      }} />
    </div>
  );
}

function Btn({ children, onClick, disabled, color = "#00f7ff", small }) {
  return (
    <button className="cbtn" onClick={onClick} disabled={disabled} style={{
      color: disabled ? "#1a3a4a" : color,
      borderColor: disabled ? "#0a1a24" : color,
      fontSize: small ? 9 : 10,
      padding: small ? "7px 12px" : "9px 16px",
    }}>{children}</button>
  );
}

function Panel({ title, icon, children, color = "#00f7ff", delay = 0 }) {
  return (
    <div className="panel" style={{ animationDelay: delay + "s", borderColor: color + "18" }}>
      <div className="ptitle" style={{ color }}>
        <span>{icon}</span>{title}
        <div className="ptitle-line" style={{ background: `linear-gradient(90deg,${color}2a,transparent)` }} />
      </div>
      {children}
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

// ════════════════════════════════════════════════════════
//  COUNTDOWN TIMER
// ════════════════════════════════════════════════════════
function CountdownTimer({ totalSeconds, onComplete }) {
  const [left, setLeft] = useState(totalSeconds);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  const pct = ((totalSeconds - left) / totalSeconds) * 100;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  const toggle = () => {
    if (running) { clearInterval(ref.current); setRunning(false); }
    else { if (left === 0) setLeft(totalSeconds); setRunning(true); }
  };
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setLeft(t => {
          if (t <= 1) { clearInterval(ref.current); setRunning(false); if (onComplete) onComplete(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(ref.current);
  }, [running]);

  return (
    <div style={{ margin: "10px 0" }}>
      <div className="timer-big" style={{
        color: running ? "#00ff9c" : left === 0 ? "#ff0040" : "#00f7ff",
        textShadow: `0 0 16px ${running ? "#00ff9c" : "#00f7ff"}`,
      }}>{mm}:{ss}</div>
      <Bar val={totalSeconds - left} max={totalSeconds} c1="#00ff9c" c2="#00f7ff" h={4} />
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
        <Btn onClick={toggle} color={running ? "#ff0040" : "#00ff9c"} small>
          {running ? "⏹ STOP" : left === 0 ? "↺ REDO" : "▶ START"}
        </Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  PENALTY MODAL
// ════════════════════════════════════════════════════════
function PenaltyModal({ tier, missedTasks, onAck }) {
  return (
    <div className="penalty-overlay">
      <div className="penalty-box" style={{
        borderColor: tier.color + "55",
        boxShadow: `0 0 80px ${tier.color}33`,
      }}>
        <div className="penalty-icon">{tier.icon}</div>
        <div className="penalty-title" style={{ color: tier.color, textShadow: `0 0 20px ${tier.color}` }}>
          {tier.label}
        </div>
        <div className="penalty-msg" style={{ color: tier.color + "aa" }}>{tier.msg}</div>
        <div style={{ fontSize: 9, color: "#3a1a1a", letterSpacing: 2, marginBottom: 14 }}>
          MISSED: {missedTasks.map(t => t.label).join(" · ")}
        </div>
        <div className="penalty-stats">
          <div className="pstat" style={{ color: tier.color, borderColor: tier.color + "44", background: tier.color + "0a" }}>
            −{tier.hpLoss} HP
          </div>
          <div className="pstat" style={{ color: tier.color, borderColor: tier.color + "44", background: tier.color + "0a" }}>
            −{tier.xpLoss} XP
          </div>
          {tier.streakReset && (
            <div className="pstat" style={{ color: "#ff0040", borderColor: "#ff004044", background: "#ff00400a" }}>
              STREAK RESET
            </div>
          )}
        </div>
        <Btn onClick={onAck} color={tier.color}>I ACCEPT MY PUNISHMENT</Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  REWARD MODAL
// ════════════════════════════════════════════════════════
function RewardModal({ reward, onClaim }) {
  return (
    <div className="reward-overlay">
      <div className="reward-box">
        <div className="reward-icon">{reward.icon}</div>
        <div className="reward-title">{reward.title}</div>
        <div className="reward-desc">{reward.desc}</div>
        <div style={{ fontSize: 9, color: "#1a4a5a", letterSpacing: 2, marginBottom: 16 }}>
          — LEVEL {reward.level} MILESTONE —
        </div>
        <Btn onClick={onClaim} color="#00f7ff">⚡ CLAIM POWER</Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  LIVE CLOCK
// ════════════════════════════════════════════════════════
function LiveClock({ timeLeft }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  const tl = Math.floor(timeLeft / 1000);
  const tlH = String(Math.floor(tl / 3600)).padStart(2, "0");
  const tlM = String(Math.floor((tl % 3600) / 60)).padStart(2, "0");
  const tlS = String(tl % 60).padStart(2, "0");
  const urgent = tl < 3600;

  return (
    <div className="live-clock">
      <div>
        <div className="clock-time">{hh}:{mm}:{ss}</div>
        <div style={{ fontSize: 9, color: "#1a5a6a", letterSpacing: 2, marginTop: 3 }}>{dateStr}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 9, color: urgent ? "#ff4d00" : "#1a4a3a", letterSpacing: 1, marginBottom: 3 }}>
          {urgent ? "⚠ PENALTY IMMINENT" : "RESET IN"}
        </div>
        <div style={{
          fontFamily: "'Cinzel',serif", fontSize: 14, letterSpacing: 3,
          color: urgent ? "#ff4d00" : "#00ff9c",
          textShadow: urgent ? "0 0 10px #ff4d00" : "0 0 8px #00ff9c",
        }}>{tlH}:{tlM}:{tlS}</div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  AI COACH
// ════════════════════════════════════════════════════════
function AICoach({ sys, penaltyLog }) {
  const [msgs, setMsgs] = useState([{
    role: "ai",
    text: "SYSTEM COACH ONLINE. I observe your every action. Ask me about your progress, strategy, or what to do next. I do not sugarcoat the truth."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMsgs(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    const systemPrompt = `You are the SYSTEM COACH — an AI embedded in a Solo Leveling-style self-development app called Hunter System. You speak exactly like the System from Solo Leveling: direct, slightly ominous, dramatic, but ultimately invested in the hunter's growth. Never be warm or soft. Be blunt, motivating, and brutally honest. Use short dramatic sentences. Reference the hunter's actual stats.

Hunter Stats:
- Level: ${sys.level} | Rank: ${sys.rank}
- XP: ${sys.xp}/${sys.xpNeeded}
- HP: ${sys.hp}/${sys.maxHp || 100}
- Streak: ${sys.streak} days
- Daily tasks done today: ${sys.dailyTasks}/4
- Weekly tasks: ${sys.weeklyTasks}
- Skills: ${Object.entries(sys.skills).filter(([,v])=>v).map(([k])=>k).join(", ") || "none"}
- Active boss challenge: ${sys.activeBoss ? sys.activeBoss.title : "none"}
- Bosses defeated: ${sys.bossLog?.length || 0}
- Skill mastery by area: ${Object.keys(SKILL_POOL).map(a => { const t = SKILL_POOL[a].reduce((s,sk)=>s+(sys.skillLog?.[sk.id]?.completions||0),0); const max = SKILL_POOL[a].length*7; return `${AREA_META[a].icon}${a}:${t}/${max}`; }).join(", ")}
- Current skill quest: ${(() => { const s = getNextSkill(sys.skillLog||{}); return `${s?.label} (${s?.area}, ${sys.skillLog?.[s?.id]?.completions||0}/7 mastery)`; })()}
- Recent penalties: ${(penaltyLog||[]).slice(-3).map(p=>p.label).join(", ") || "none"}

Respond in 3-5 sentences. Use the stats for specific, actionable, personalised advice. Keep the Solo Leveling aesthetic.`;

    const apiMsgs = msgs
      .filter((m, i) => i > 0)
      .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    apiMsgs.push({ role: "user", content: userMsg });

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: apiMsgs,
        })
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "…the System is silent.";
      setMsgs(prev => [...prev, { role: "ai", text: reply }]);
    } catch {
      setMsgs(prev => [...prev, { role: "ai", text: "Connection to the System lost. Reconnecting…" }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    "How am I doing?",
    "What should I focus on?",
    "Motivate me.",
    "Analyse my weakness.",
  ];

  return (
    <Panel title="SYSTEM COACH — AI" icon="🤖" color="#c084fc">
      <div style={{ fontSize: 9, color: "#3a1a5a", letterSpacing: 2, marginBottom: 10 }}>
        POWERED BY CLAUDE AI — YOUR PERSONAL DUNGEON ANALYST
      </div>
      <div className="ai-chat">
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>
        ))}
        {loading && <div className="ai-msg loading">▌ Analysing your soul…</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, marginTop: 6 }}>
        {quickPrompts.map(q => (
          <button key={q} className="cbtn" onClick={() => { setInput(q); }}
            style={{ color: "#2a6a7a", borderColor: "#1a3a4a", fontSize: 8, padding: "5px 10px" }}>
            {q}
          </button>
        ))}
      </div>
      <div className="ai-input-row">
        <input className="ai-input" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Speak to the System…" maxLength={300} />
        <Btn onClick={send} disabled={loading || !input.trim()} color="#c084fc" small>SEND</Btn>
      </div>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════
export default function HunterSystem() {
  const [sys, setSys] = useState(() => {
    const s = getStored("hs4", DEFAULT_SYS);
    if (!s.perks) s.perks = { bossBoost: false };
    if (!s.claimedRewards) s.claimedRewards = [];
    if (!s.penaltyLog) s.penaltyLog = [];
    if (!s.activityLog) s.activityLog = {};
    if (!s.maxHp) s.maxHp = s.hp;
    return s;
  });
  const [boss, setBoss] = useState(() => getStored("boss4", DEFAULT_BOSS));
  const [doneTasks, setDoneTasks] = useState(() => getStored("done4_" + todayKey(), {}));
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("status");
  const [pendingReward, setPendingReward] = useState(null);
  const [pendingPenalty, setPendingPenalty] = useState(null);
  const [bossAnim, setBossAnim] = useState(false);
  const [timeLeft, setTimeLeft] = useState(msUntilMidnight());
  const [tag] = useState(() => MOTIVATIONAL_TAGS[Math.floor(Math.random() * MOTIVATIONAL_TAGS.length)]);
  const penaltyApplied = useRef(false);
  const lastCheckedDay = useRef(sys.lastDayKey);

  // ── NOTIFICATION STATE ───────────────────────────────
  const [notifPerm, setNotifPerm] = useState(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [notifScheduled, setNotifScheduled] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => getStored("soundEnabled", true));

  // Unlock audio context on first user interaction (iOS requirement)
  useEffect(() => {
    const unlock = () => { getAudioCtx(); document.removeEventListener("touchstart", unlock); document.removeEventListener("click", unlock); };
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
  }, []);

  // Persist sound preference
  useEffect(() => { localStorage.setItem("soundEnabled", JSON.stringify(soundEnabled)); }, [soundEnabled]);

  // Re-register notification schedule whenever doneTasks changes or on mount
  useEffect(() => {
    if (notifPerm === "granted") {
      registerNotifications(doneTasks).then(count => {
        if (count !== false) setNotifScheduled(count);
      });
    }
  }, [notifPerm, doneTasks]);

  // In-app interval reminders while app is open (every 2h between 8am-11pm)
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      const tl = msUntilMidnight();
      if (h >= 8 && h < 23 && Object.keys(doneTasks).length < TASKS_DEF.length) {
        // Show in-app toast reminder every 2 hours
        const mins = new Date().getMinutes();
        if (mins === 0) { // top of the hour
          notify("⏰ SYSTEM REMINDER: Incomplete quests detected");
          if (soundEnabled) playSound("notify");
        }
        // Urgent sound 1h before midnight
        if (tl < 3600000 && tl > 3540000 && soundEnabled) {
          playSound("deadline");
        }
      }
    };
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [doneTasks, soundEnabled]);

  const handleRequestNotif = async () => {
    const result = await requestNotificationPermission();
    setNotifPerm(result);
    if (result === "granted") {
      const count = await registerNotifications(doneTasks);
      setNotifScheduled(count || 0);
      if (soundEnabled) playSound("notify");
      notify("✅ Notifications enabled — System will remind you");
    } else if (result === "denied") {
      notify("⚠ Notifications denied — enable in iOS Settings");
    }
  };

  // Persist
  useEffect(() => { localStorage.setItem("hs4", JSON.stringify(sys)); }, [sys]);
  useEffect(() => { localStorage.setItem("boss4", JSON.stringify(boss)); }, [boss]);
  useEffect(() => { localStorage.setItem("done4_" + todayKey(), JSON.stringify(doneTasks)); }, [doneTasks]);

  // Register service worker + schedule notifications on mount
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").then(reg => {
        console.log("SW registered:", reg.scope);
      }).catch(console.warn);
    }
    // Re-schedule notifications on every app open
    if (Notification.permission === "granted") {
      registerNotifications(doneTasks).then(c => setNotifScheduled(c || 0));
    }
  }, []);

  // Live countdown to midnight
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(msUntilMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── MIDNIGHT PENALTY CHECK ───────────────────────────
  useEffect(() => {
    const runCheck = () => {
      const currentDay = todayKey();
      if (lastCheckedDay.current !== currentDay && !penaltyApplied.current) {
        penaltyApplied.current = true;
        const prevDone = getStored("done4_" + lastCheckedDay.current, {});
        const missed = TASKS_DEF.filter(t => !prevDone[t.id]);

        // Update activity log and roll day
        setSys(prev => ({
          ...prev,
          activityLog: {
            ...prev.activityLog,
            [lastCheckedDay.current]: { done: Object.keys(prevDone).length, total: TASKS_DEF.length }
          },
          lastDayKey: currentDay,
          dailyTasks: 0,
        }));
        setDoneTasks({});
        lastCheckedDay.current = currentDay;

        if (missed.length > 0) {
          const tier = PENALTY_TIERS[Math.min(missed.length - 1, PENALTY_TIERS.length - 1)];
          setPendingPenalty({ tier, missed });
        }
      }
    };
    runCheck();
    const interval = setInterval(runCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  const applyPenalty = () => {
    if (!pendingPenalty) return;
    const { tier } = pendingPenalty;
    if (soundEnabled) playSound("penalty");
    setSys(prev => {
      const s = { ...prev };
      s.hp = Math.max(1, s.hp - tier.hpLoss);
      s.xp = Math.max(0, s.xp - tier.xpLoss);
      if (tier.streakReset && !s.skills.streakGuard) s.streak = 0;
      s.penaltyLog = [...(s.penaltyLog || []), {
        date: new Date().toLocaleDateString(),
        label: tier.label,
        missed: pendingPenalty.missed.length,
        hpLoss: tier.hpLoss,
        xpLoss: tier.xpLoss,
        color: tier.color,
      }].slice(-50);
      return s;
    });
    setPendingPenalty(null);
    penaltyApplied.current = false;
  };

  // ── XP ENGINE ────────────────────────────────────────
  const notify = m => setToast(m);

  const checkRewards = useCallback((s) => {
    for (const r of LEVEL_REWARDS) {
      if (s.level >= r.level && !s.claimedRewards.includes(r.level)) return r;
    }
    return null;
  }, []);

  const applyXP = useCallback((xpGain, extra = {}) => {
    setSys(prev => {
      let s = { ...prev, ...extra };
      s.xp += xpGain;
      let leveled = false;
      while (s.xp >= s.xpNeeded) {
        s.xp -= s.xpNeeded;
        s.level++;
        s.xpNeeded = Math.floor(100 + (s.level - 1) * 50);
        s.maxHp = (s.maxHp || 100) + 15;
        s.hp = s.hp + 15;
        leveled = true;
      }
      if (leveled) { notify(`⚡ LEVEL UP → LVL ${s.level}`); if (soundEnabled) playSound("levelup"); }
      s.rank = getRankObj(s.level).label;
      const r = checkRewards(s);
      if (r) setPendingReward(r);
      return s;
    });
  }, [checkRewards]);

  const claimReward = r => {
    setSys(prev => {
      let s = { ...prev, claimedRewards: [...prev.claimedRewards, r.level] };
      if (r.bonus) s.xp += r.bonus;
      if (r.skillUnlock) s.skills = { ...s.skills, [r.skillUnlock]: true };
      if (r.perk) s.perks = { ...s.perks, [r.perk]: true };
      return s;
    });
    setPendingReward(null);
    notify(`✅ Claimed: ${r.title}`);
  };

  const doTask = (t, activeSkill = null) => {
    if (doneTasks[t.id]) { notify("Already completed today!"); return; }
    setHistory(h => [...h.slice(-19), JSON.stringify({ sys, boss })]);
    let xp = activeSkill ? activeSkill.xp : t.xp;
    if (sys.skills.xpBoost) xp = Math.floor(xp * 1.3);
    const extra = { weeklyTasks: sys.weeklyTasks + 1, streak: sys.streak + 1 };
    // Update skill log if this was a skill quest
    if (t.dynamic && activeSkill) {
      const prev = sys.skillLog?.[activeSkill.id] || { completions: 0 };
      extra.skillLog = {
        ...sys.skillLog,
        [activeSkill.id]: {
          completions: prev.completions + 1,
          lastDoneDay: todayKey(),
          area: activeSkill.area,
        }
      };
    }
    applyXP(xp, extra);
    setDoneTasks(prev => ({ ...prev, [t.id]: true }));
    setSys(prev => ({ ...prev, dailyTasks: prev.dailyTasks + 1, ...(extra.skillLog ? { skillLog: extra.skillLog } : {}) }));
    notify(`+${xp} XP ← ${activeSkill ? activeSkill.label : t.label}`);
    if (soundEnabled) playSound("quest");
  };

  const attackBoss = () => {
    setHistory(h => [...h.slice(-19), JSON.stringify({ sys, boss })]);
    let dmg = 20 + sys.level * 3;
    if (sys.perks?.bossBoost) dmg = Math.floor(dmg * 1.5);
    setBossAnim(true); setTimeout(() => setBossAnim(false), 400);
    setBoss(prev => {
      const newHp = prev.hp - dmg;
      if (newHp <= 0) {
        const nMax = 200 + sys.level * 40;
        notify("🏆 BOSS DEFEATED! +200 XP");
        applyXP(200);
        return { hp: nMax, maxHp: nMax };
      }
      notify(`⚔ Dealt ${dmg} dmg`);
      if (soundEnabled) playSound("boss");
      return { ...prev, hp: newHp };
    });
  };

  const undoLast = () => {
    if (!history.length) { notify("Nothing to undo"); return; }
    const snap = JSON.parse(history[history.length - 1]);
    setSys(snap.sys); setBoss(snap.boss);
    setHistory(h => h.slice(0, -1)); notify("↩ Undone");
  };

  // ── DERIVED ──────────────────────────────────────────
  const rankObj = getRankObj(sys.level);
  const req = raidReq(sys.level);
  const doneCount = Object.keys(doneTasks).length;
  const urgentWarning = timeLeft < 3 * 3600 * 1000 && doneCount < TASKS_DEF.length;

  // 7-day heatmap data
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const isToday = k === todayKey();
    const done = isToday ? doneCount : (sys.activityLog?.[k]?.done || 0);
    const pct = done / TASKS_DEF.length;
    const col = pct >= 1 ? "#00ff9c" : pct >= .5 ? "#00f7ff" : pct > 0 ? "#ff9c00" : isToday ? "#00f7ff18" : "#ff004033";
    return { done, col, isToday, day: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2) };
  });

  const TABS = [
    { id: "status",  label: "STATUS" },
    { id: "quests",  label: "QUESTS" },
    { id: "battle",  label: "BATTLE" },
    { id: "rewards", label: "REWARDS" },
    { id: "coach",   label: "COACH" },
    { id: "log",     label: "LOG" },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="root">
        <div className="bg-grid" />
        <div className="bg-vig" />
        <div className="scan" />

        <div className="wrap">
          {/* ── HEADER ── */}
          <div className="hdr">
            <div className="hdr-title">⚔ HUNTER SYSTEM ⚔</div>
            <div className="hdr-tag">{tag}</div>
            <div className="rank-badge" style={{
              color: rankObj.color, borderColor: rankObj.color + "66",
              background: rankObj.color + "10",
              textShadow: `0 0 10px ${rankObj.color}`,
              boxShadow: `0 0 16px ${rankObj.color}14`,
            }}>RANK {sys.rank} · LVL {sys.level}</div>
          </div>

          <LiveClock timeLeft={timeLeft} />

          {/* Urgent deadline banner */}
          {urgentWarning && (
            <div style={{
              background: "rgba(255,60,0,.07)", border: "1px solid #ff3c0055",
              borderRadius: 4, padding: "10px 14px", marginBottom: 12,
              fontSize: 9, color: "#ff5500", letterSpacing: 2, textAlign: "center",
              animation: "urgentPulse 1.2s ease infinite",
            }}>
              ⚠ {TASKS_DEF.length - doneCount} QUEST{TASKS_DEF.length - doneCount !== 1 ? "S" : ""} UNFINISHED — PENALTY IN {String(Math.floor(timeLeft / 3600000)).padStart(2,"0")}:{String(Math.floor((timeLeft % 3600000) / 60000)).padStart(2,"0")}
            </div>
          )}

          {/* TABS */}
          <div className="tab-bar">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn${tab === t.id ? " on" : ""}`}
                onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* ══════ STATUS ══════ */}
          {tab === "status" && (<>
            <Panel title="HUNTER STATUS" icon="🧬">
              <div className="srow"><span className="slabel">RANK</span>
                <span style={{ color: rankObj.color, textShadow: `0 0 10px ${rankObj.color}`, fontWeight: 600, fontSize: 11 }}>{sys.rank}</span></div>
              <div className="srow"><span className="slabel">LEVEL</span><span style={{ fontSize: 11, fontWeight: 600 }}>{sys.level}</span></div>
              <div className="srow"><span className="slabel">VITALITY</span>
                <span style={{ color: "#ff4d6d", fontWeight: 600, fontSize: 11 }}>{sys.hp} / {sys.maxHp}</span></div>
              <div className="srow"><span className="slabel">STREAK</span>
                <span style={{ color: "#ff9c00", fontWeight: 600, fontSize: 11 }}>{sys.streak} 🔥</span></div>
              <div className="srow"><span className="slabel">TODAY</span>
                <span style={{ color: doneCount === 4 ? "#00ff9c" : urgentWarning ? "#ff5500" : "#00f7ff", fontWeight: 600, fontSize: 11 }}>
                  {doneCount}/{TASKS_DEF.length} DONE
                </span></div>
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#1a5a6a", marginBottom: 3, letterSpacing: 2 }}>
                  <span>EXPERIENCE</span><span>{sys.xp} / {sys.xpNeeded}</span>
                </div>
                <Bar val={sys.xp} max={sys.xpNeeded} h={9} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3a1a2a", marginBottom: 3, letterSpacing: 2 }}>
                  <span>VITALITY</span><span>{sys.hp} HP</span>
                </div>
                <Bar val={sys.hp} max={sys.maxHp} c1="#ff0040" c2="#ff4d6d" h={6} />
              </div>
              {sys.perks?.bossBoost && (
                <div style={{ marginTop: 10, fontSize: 9, color: "#ff6600", letterSpacing: 2, textAlign: "right" }}>
                  👁 MONARCH'S EYE — +50% BOSS DMG
                </div>
              )}
            </Panel>

            {/* 7-day heatmap */}
            <Panel title="ACTIVITY — 7 DAYS" icon="📅" color="#a259ff" delay={0.05}>
              <div style={{ display: "flex", gap: 6 }}>
                {last7.map((d, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: "#1a2a4a", marginBottom: 5, letterSpacing: 1 }}>{d.day}</div>
                    <div className="day-dot" style={{
                      background: d.col + "22", borderColor: d.col,
                      color: d.col,
                      boxShadow: d.isToday ? `0 0 10px ${d.col}` : "none",
                      fontWeight: d.isToday ? "bold" : "normal",
                      margin: "0 auto", width: "100%",
                    }}>{d.done}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, fontSize: 8, justifyContent: "center", color: "#1a2a4a", letterSpacing: 1 }}>
                <span style={{ color: "#00ff9c" }}>■ ALL</span>
                <span style={{ color: "#00f7ff" }}>■ HALF</span>
                <span style={{ color: "#ff9c00" }}>■ LOW</span>
                <span style={{ color: "#ff0040" }}>■ NONE</span>
              </div>
            </Panel>

            <Panel title="WEEKLY RAID" icon="🛡" color="#a259ff" delay={0.08}>
              <div className="srow"><span className="slabel">PROGRESS</span>
                <span style={{ color: "#a259ff", fontWeight: 600, fontSize: 11 }}>{sys.weeklyTasks} / {req}</span></div>
              <Bar val={sys.weeklyTasks} max={req} c1="#a259ff" c2="#ff6fcf" h={8} />
            </Panel>

            {/* Skill mastery overview */}
            <Panel title="SKILL MASTERY" icon="🎯" color="#c084fc" delay={0.1}>
              <div style={{ fontSize: 9, color: "#2a1a3a", letterSpacing: 2, marginBottom: 12 }}>
                WEAKEST AREA GETS ASSIGNED NEXT — ROTATES AUTOMATICALLY
              </div>
              {Object.keys(SKILL_POOL).map(area => {
                const skills = SKILL_POOL[area];
                const total = skills.reduce((s, sk) => s + (sys.skillLog?.[sk.id]?.completions || 0), 0);
                const max = skills.length * 7;
                const meta = AREA_META[area];
                return (
                  <div key={area} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: meta.color + "99", letterSpacing: 1, marginBottom: 3 }}>
                      <span>{meta.icon} {area.toUpperCase()}</span>
                      <span style={{ color: meta.color + "66" }}>{total}/{max}</span>
                    </div>
                    <Bar val={total} max={max} c1={meta.color} c2={meta.color + "aa"} h={5} />
                  </div>
                );
              })}
              <div style={{ fontSize: 9, color: "#2a1a3a", letterSpacing: 1, marginTop: 10, padding: "8px 10px", background: "rgba(192,132,252,.05)", border: "1px solid #c084fc18", borderRadius: 3 }}>
                NEXT SKILL: {(() => { const s = getNextSkill(sys.skillLog||{}); const m = AREA_META[s?.area]; return `${m?.icon || ""} ${s?.icon} ${s?.label} — ${s?.area}`; })()}
              </div>
            </Panel>
          </>)}

          {/* ══════ QUESTS ══════ */}
          {tab === "quests" && (
            <Panel title="DAILY QUESTS" icon="📋" color="#00ff9c">
              <div style={{ fontSize: 9, color: "#1a3a2a", letterSpacing: 2, marginBottom: 12, lineHeight: 1.7 }}>
                COMPLETE ALL QUESTS BEFORE MIDNIGHT.<br />
                FAILURE TRIGGERS AUTOMATIC PUNISHMENT.
              </div>
              {TASKS_DEF.map((t, i) => {
                // Dynamic skill slot — show current rotating skill
                const isSkill = t.dynamic;
                const activeSkill = isSkill ? getNextSkill(sys.skillLog || {}) : null;
                const displayTask = isSkill ? { ...t, label: activeSkill?.label || t.label, icon: activeSkill?.icon || t.icon, xp: activeSkill?.xp || t.xp } : t;
                const completions = isSkill ? (sys.skillLog?.[activeSkill?.id]?.completions || 0) : null;
                const masteryGoal = 7;

                return (
                  <div key={t.id}
                    className={`task-card${doneTasks[t.id] ? " done" : urgentWarning ? " urgent" : ""}`}
                    style={{ animationDelay: i * 0.06 + "s", borderColor: isSkill ? "#c084fc22" : "" }}>
                    <div className="task-hdr">
                      <span className="task-name" style={{ color: doneTasks[t.id] ? "#00ff9c" : isSkill ? "#c084fc" : "#00f7ff" }}>
                        {doneTasks[t.id] ? "✅" : "○"} {displayTask.icon} {displayTask.label}
                      </span>
                      <span className="task-xp">
                        +{sys.skills.xpBoost ? Math.floor(displayTask.xp * 1.3) : displayTask.xp} XP
                        {sys.skills.xpBoost && <span style={{ color: "#00ff9c" }}> ⚡</span>}
                      </span>
                    </div>

                    {/* Skill quest extra info */}
                    {isSkill && activeSkill && !doneTasks[t.id] && (
                      <div style={{ margin: "10px 0 4px", padding: "10px 12px", background: `${AREA_META[activeSkill.area]?.color}0a`, border: `1px solid ${AREA_META[activeSkill.area]?.color}22`, borderRadius: 4 }}>
                        <div style={{ fontSize: 9, color: AREA_META[activeSkill.area]?.color + "88", letterSpacing: 1, marginBottom: 5 }}>
                          {AREA_META[activeSkill.area]?.icon} {activeSkill.area.toUpperCase()} SKILL — {completions}/{masteryGoal} MASTERY
                        </div>
                        <Bar val={completions} max={masteryGoal} c1={AREA_META[activeSkill.area]?.color} c2={AREA_META[activeSkill.area]?.color + "88"} h={4} />
                        <div style={{ fontSize: 9, color: AREA_META[activeSkill.area]?.color + "66", marginTop: 8, lineHeight: 1.7, letterSpacing: .5 }}>
                          {activeSkill.desc}
                        </div>
                        {completions >= masteryGoal && (
                          <div style={{ fontSize: 9, color: "#00ff9c", marginTop: 6, letterSpacing: 1 }}>
                            ✅ MASTERED — New skill unlocks after this completion
                          </div>
                        )}
                      </div>
                    )}

                    {t.timer && !doneTasks[t.id] && (
                      <CountdownTimer totalSeconds={t.timer} onComplete={() => doTask(t, activeSkill)} />
                    )}
                    {!doneTasks[t.id] ? (
                      <div style={{ marginTop: t.timer ? 4 : 10 }}>
                        <Btn onClick={() => doTask(t, activeSkill)} color={isSkill ? "#c084fc" : "#00ff9c"}>✓ MARK COMPLETE</Btn>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: "#1a4a2a", letterSpacing: 2, marginTop: 8 }}>
                        QUEST COMPLETE — XP BANKED
                      </div>
                    )}
                  </div>
                );
              })}
              <Bar val={doneCount} max={TASKS_DEF.length} c1="#00ff9c" c2="#00f7ff" h={7} />
              <div style={{ textAlign: "right", fontSize: 9, color: "#1a4a3a", marginTop: 4 }}>
                {doneCount === TASKS_DEF.length ? "⚡ ALL QUESTS COMPLETE" : `${TASKS_DEF.length - doneCount} remaining before midnight`}
              </div>
            </Panel>
          )}

          {/* ══════ BATTLE ══════ */}
          {tab === "battle" && (<>
            {/* ACTIVE BOSS CHALLENGE */}
            {sys.activeBoss ? (
              <Panel title="ACTIVE BOSS CHALLENGE" icon="⚔" color="#ff0040">
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 36, marginBottom: 8, filter: "drop-shadow(0 0 16px #ff004066)", animation: "float 3s ease infinite" }}>
                    {sys.activeBoss.type === "Physical" ? "💪" : sys.activeBoss.type === "Mental" ? "🧠" : sys.activeBoss.type === "Social" ? "🤝" : "👁"}
                  </div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 14, color: "#ff0040", letterSpacing: 3, textShadow: "0 0 16px #ff0040", marginBottom: 6 }}>
                    {sys.activeBoss.title}
                  </div>
                  <div style={{ display: "inline-block", padding: "3px 12px", borderRadius: 2, border: "1px solid #ff004033", fontSize: 8, color: "#5a1a1a", letterSpacing: 2, marginBottom: 12 }}>
                    {sys.activeBoss.type} · {sys.activeBoss.duration}
                  </div>
                </div>
                <div style={{ background: "rgba(255,0,40,.04)", border: "1px solid #ff004022", borderRadius: 4, padding: "12px 14px", marginBottom: 14, fontSize: 10, color: "#6a2a2a", lineHeight: 1.9, letterSpacing: .5 }}>
                  {sys.activeBoss.desc}
                </div>
                <div style={{ fontSize: 9, color: "#3a1a1a", letterSpacing: 2, marginBottom: 10 }}>
                  REWARD ON COMPLETION: +{sys.activeBoss.reward} XP
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn onClick={() => {
                    const reward = sys.activeBoss.reward;
                    const title = sys.activeBoss.title;
                    setSys(prev => ({
                      ...prev,
                      activeBoss: null,
                      bossLog: [...(prev.bossLog||[]), { ...prev.activeBoss, completedAt: new Date().toLocaleDateString() }],
                    }));
                    applyXP(reward);
                    notify(`🏆 BOSS DEFEATED: ${title} — +${reward} XP`);
                    if (soundEnabled) playSound("levelup");
                  }} color="#00ff9c">🏆 BOSS DEFEATED — CLAIM REWARD</Btn>
                  <Btn onClick={() => {
                    setSys(prev => ({ ...prev, activeBoss: null }));
                    notify("Boss challenge abandoned.");
                  }} color="#ff0040" small>✗ ABANDON</Btn>
                </div>
              </Panel>
            ) : (
              <Panel title="BOSS CHAMBER" icon="💀" color="#ff0040">
                <div style={{ fontSize: 9, color: "#2a0a0a", letterSpacing: 2, marginBottom: 14, lineHeight: 1.8 }}>
                  THESE ARE REAL-LIFE CHALLENGES SCALED TO YOUR RANK.<br />
                  ACCEPT ONE. COMPLETE IT. CLAIM YOUR REWARD.
                </div>
                {getBossesForRank(sys.rank, sys.level).map(b => (
                  <div key={b.id} style={{
                    background: "rgba(255,0,40,.03)", border: "1px solid #ff004022",
                    borderRadius: 5, padding: 14, marginBottom: 10,
                    transition: "all .2s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: "#ff4d4d", letterSpacing: 2 }}>{b.title}</div>
                      <div style={{ fontSize: 8, color: "#3a1a1a", letterSpacing: 1, textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ color: "#ff6600" }}>+{b.reward} XP</div>
                        <div style={{ marginTop: 2 }}>{b.type}</div>
                        <div>{b.duration}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: "#4a2a2a", lineHeight: 1.8, letterSpacing: .5, marginBottom: 10 }}>
                      {b.desc}
                    </div>
                    <Btn onClick={() => {
                      setSys(prev => ({ ...prev, activeBoss: { ...b, acceptedAt: new Date().toLocaleDateString() } }));
                      notify(`⚔ Boss accepted: ${b.title}`);
                      if (soundEnabled) playSound("boss");
                    }} color="#ff0040" small>⚔ ACCEPT CHALLENGE</Btn>
                  </div>
                ))}
              </Panel>
            )}

            {/* Boss history */}
            {sys.bossLog?.length > 0 && (
              <Panel title="DEFEATED BOSSES" icon="🏆" color="#ff6600" delay={0.06}>
                {[...(sys.bossLog||[])].reverse().slice(0,5).map((b, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #ff004011", fontSize: 9, color: "#4a2a00", letterSpacing: 1 }}>
                    <span style={{ color: "#ff6600" }}>{b.title}</span> — {b.completedAt} · +{b.reward} XP
                  </div>
                ))}
              </Panel>
            )}

            <Panel title="WEEKLY RAID" icon="🛡" color="#a259ff" delay={0.1}>
              <Bar val={sys.weeklyTasks} max={req} c1="#a259ff" c2="#ff6fcf" h={8} />
              <div style={{ fontSize: 9, color: "#1a1a3a", textAlign: "right", marginTop: 4 }}>{sys.weeklyTasks}/{req}</div>
              <div className="brow">
                <Btn onClick={() => { applyXP(25, { weeklyTasks: sys.weeklyTasks + 1 }); notify("+25 XP ← Raid Task"); }} color="#a259ff">+ RAID TASK</Btn>
                <Btn onClick={() => {
                  if (sys.weeklyTasks >= req) { applyXP(300); notify("🛡 Raid cleared! +300 XP"); }
                  else notify(`Need ${req - sys.weeklyTasks} more`);
                }} color="#ff6fcf">🏁 CLAIM RAID</Btn>
              </div>
            </Panel>
          </>)}

          {/* ══════ REWARDS ══════ */}
          {tab === "rewards" && (
            <Panel title="LEVEL REWARDS" icon="🏆" color="#ffe600">
              <div style={{ fontSize: 9, color: "#2a2200", letterSpacing: 2, marginBottom: 14 }}>
                ASCEND TO UNLOCK POWERS. CURRENT LVL: {sys.level}
              </div>
              {LEVEL_REWARDS.map(r => {
                const claimed = sys.claimedRewards.includes(r.level);
                const available = sys.level >= r.level && !claimed;
                const locked = sys.level < r.level;
                return (
                  <div key={r.level} className={`milestone-item ${claimed ? "claimed" : available ? "available" : "locked"}`}>
                    <div style={{ fontSize: 22, opacity: locked ? .2 : 1 }}>{r.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, letterSpacing: 2, color: claimed ? "#1a4a3a" : available ? "#00f7ff" : "#1a2a3a" }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 8, color: "#1a3a3a", marginTop: 3, letterSpacing: 1 }}>{r.desc}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 9, color: "#1a3a4a" }}>LVL {r.level}</div>
                      {claimed && <div style={{ fontSize: 8, color: "#1a4a3a", marginTop: 3 }}>✓ DONE</div>}
                      {available && (
                        <button className="cbtn" onClick={() => claimReward(r)}
                          style={{ color: "#ffe600", borderColor: "#ffe600", fontSize: 8, padding: "5px 10px", marginTop: 4 }}>
                          CLAIM
                        </button>
                      )}
                      {locked && (
                        <div style={{ marginTop: 6 }}>
                          <Bar val={sys.level} max={r.level} c1="#ffe600" c2="#ff9c00" h={3} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </Panel>
          )}

          {/* ══════ COACH ══════ */}
          {tab === "coach" && (<>
            <AICoach sys={sys} penaltyLog={sys.penaltyLog || []} />

            {/* ── NOTIFICATIONS & SOUND PANEL ── */}
            <Panel title="ALERTS & SOUND" icon="🔔" color="#00ff9c" delay={0.04}>
              {/* Notification permission status */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#1a5a3a" }}>NOTIFICATION STATUS</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="notif-dot" style={{
                      background: notifPerm === "granted" ? "#00ff9c" : notifPerm === "denied" ? "#ff0040" : "#ff9c00",
                      boxShadow: `0 0 6px ${notifPerm === "granted" ? "#00ff9c" : notifPerm === "denied" ? "#ff0040" : "#ff9c00"}`,
                    }} />
                    <span style={{ fontSize: 9, color: notifPerm === "granted" ? "#00ff9c" : notifPerm === "denied" ? "#ff0040" : "#ff9c00", letterSpacing: 2 }}>
                      {notifPerm === "granted" ? "ACTIVE" : notifPerm === "denied" ? "BLOCKED" : notifPerm === "unsupported" ? "UNSUPPORTED" : "NOT SET"}
                    </span>
                  </div>
                </div>

                {notifPerm === "default" && (
                  <div style={{ background: "rgba(0,255,156,.05)", border: "1px solid #00ff9c22", borderRadius: 4, padding: 12, marginBottom: 10, fontSize: 9, color: "#1a5a3a", lineHeight: 1.8, letterSpacing: 1 }}>
                    ⚠ iOS REQUIREMENT: App must be installed to Home Screen via Safari → Share → "Add to Home Screen" for notifications to work.
                  </div>
                )}

                {notifPerm === "denied" && (
                  <div style={{ background: "rgba(255,0,40,.05)", border: "1px solid #ff004022", borderRadius: 4, padding: 12, marginBottom: 10, fontSize: 9, color: "#5a1a1a", lineHeight: 1.8, letterSpacing: 1 }}>
                    Notifications blocked. Go to iOS Settings → Safari → [this site] → Allow Notifications.
                  </div>
                )}

                {notifPerm !== "granted" && notifPerm !== "denied" && notifPerm !== "unsupported" && (
                  <Btn onClick={handleRequestNotif} color="#00ff9c">🔔 ENABLE NOTIFICATIONS</Btn>
                )}

                {notifPerm === "granted" && (
                  <>
                    <div style={{ fontSize: 9, color: "#1a4a3a", marginBottom: 8, letterSpacing: 1 }}>
                      {notifScheduled > 0 ? `${notifScheduled} reminder${notifScheduled !== 1 ? "s" : ""} scheduled for today` : "All reminders for today already passed"}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn onClick={() => { sendTestNotification(); notify("Test notification sent!"); }} color="#00ff9c" small>📳 TEST NOTIFICATION</Btn>
                      <Btn onClick={() => registerNotifications(doneTasks).then(c => { setNotifScheduled(c || 0); notify(`↺ Rescheduled ${c || 0} reminders`); })} color="#00f7ff" small>↺ RESCHEDULE</Btn>
                    </div>
                  </>
                )}
              </div>

              {/* Daily reminder schedule */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#1a4a3a", letterSpacing: 2, marginBottom: 8 }}>DAILY REMINDER SCHEDULE</div>
                {REMINDER_SCHEDULE.map(r => {
                  const now = new Date();
                  const fireTime = new Date(); fireTime.setHours(r.hh, r.mm, 0, 0);
                  const past = fireTime < now;
                  return (
                    <div key={r.tag} className="schedule-item" style={{ color: past ? "#1a3a3a" : "#00f7ff" }}>
                      <span>{r.title}</span>
                      <span style={{ color: past ? "#1a2a2a" : "#1a5a6a" }}>
                        {String(r.hh).padStart(2,"0")}:{String(r.mm).padStart(2,"0")} {past ? "✓" : "⏳"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Sound controls */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#1a5a3a" }}>IN-APP SOUND</div>
                  <button className="cbtn" onClick={() => { setSoundEnabled(p => !p); }} style={{
                    color: soundEnabled ? "#00ff9c" : "#1a3a4a",
                    borderColor: soundEnabled ? "#00ff9c" : "#1a2a2a",
                    fontSize: 9, padding: "6px 14px",
                  }}>{soundEnabled ? "🔊 ON" : "🔇 OFF"}</button>
                </div>
                <div style={{ fontSize: 9, color: "#1a3a3a", letterSpacing: 1, marginBottom: 8 }}>TEST SOUNDS:</div>
                <div className="sound-test-row">
                  {[
                    { label: "Notify", type: "notify", c: "#00f7ff" },
                    { label: "Quest ✓", type: "quest", c: "#00ff9c" },
                    { label: "Level Up", type: "levelup", c: "#ffe600" },
                    { label: "Penalty", type: "penalty", c: "#ff0040" },
                    { label: "Deadline", type: "deadline", c: "#ff9c00" },
                    { label: "Boss Hit", type: "boss", c: "#ff4d00" },
                  ].map(s => (
                    <button key={s.type} className="cbtn" onClick={() => { getAudioCtx(); playSound(s.type); }}
                      style={{ color: s.c, borderColor: s.c + "66", fontSize: 8, padding: "6px 10px" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="SKILL TREE" icon="⚡" color="#ffe600" delay={0.06}>
              {[
                { key: "xpBoost",    label: "XP BOOST",     desc: "All tasks give 30% more XP",               req: 10 },
                { key: "streakGuard",label: "STREAK GUARD",  desc: "Streak preserved on missed days (HP/XP penalty still applies)", req: 15 },
              ].map(sk => {
                const unlocked = sys.skills[sk.key];
                const can = sys.level >= sk.req;
                return (
                  <div key={sk.key} className={`skill-node ${unlocked ? "unlocked" : "locked"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: unlocked ? "#ffe600" : can ? "#4a6a7a" : "#1a2a3a" }}>
                          {unlocked ? "✅" : can ? "⬡" : "🔒"} {sk.label}
                        </div>
                        <div style={{ fontSize: 9, color: "#1a3a4a", marginTop: 3, letterSpacing: 1 }}>{sk.desc}</div>
                      </div>
                      <div style={{ fontSize: 9, color: "#1a3a4a", flexShrink: 0, marginLeft: 10 }}>LVL {sk.req}</div>
                    </div>
                    {!unlocked && <>
                      <Bar val={Math.min(sys.level, sk.req)} max={sk.req} c1="#ffe600" c2="#ff9c00" h={4} />
                      <div style={{ marginTop: 8 }}>
                        <Btn onClick={() => {
                          if (can) { setSys(p => ({ ...p, skills: { ...p.skills, [sk.key]: true } })); notify(`✅ ${sk.label} unlocked`); }
                          else notify(`Need Level ${sk.req}`);
                        }} disabled={!can} color="#ffe600">UNLOCK</Btn>
                      </div>
                    </>}
                  </div>
                );
              })}
            </Panel>
            <Panel title="SYSTEM CONTROL" icon="⚙" color="#ff0040" delay={0.1}>
              <div style={{ display: "grid", gap: 8 }}>
                {[
                  { l: "↩ UNDO LAST ACTION", fn: undoLast, c: "#00f7ff" },
                  { l: "↺ RESET DAILY QUESTS", fn: () => { setSys(p => ({ ...p, dailyTasks: 0 })); setDoneTasks({}); notify("Daily reset"); }, c: "#ff9c00" },
                  { l: "💀 FULL SYSTEM RESET", fn: () => { setSys({ ...DEFAULT_SYS, lastActive: Date.now() }); setBoss({ ...DEFAULT_BOSS }); setDoneTasks({}); setHistory([]); notify("System wiped."); }, c: "#ff0040" },
                ].map(b => (
                  <div key={b.l} style={{ padding: 10, background: "rgba(255,0,40,.02)", border: "1px solid #ff00400c", borderRadius: 4 }}>
                    <Btn onClick={b.fn} color={b.c}>{b.l}</Btn>
                  </div>
                ))}
              </div>
            </Panel>
          </>)}

          {/* ══════ LOG ══════ */}
          {tab === "log" && (
            <Panel title="PUNISHMENT RECORD" icon="📜" color="#ff0040">
              {(!sys.penaltyLog || sys.penaltyLog.length === 0) ? (
                <div style={{ fontSize: 10, color: "#1a3a4a", letterSpacing: 2, textAlign: "center", padding: "24px 0", lineHeight: 1.8 }}>
                  NO PENALTIES ON RECORD.<br />
                  <span style={{ color: "#00ff9c" }}>STAY DISCIPLINED.</span>
                </div>
              ) : (
                [...(sys.penaltyLog || [])].reverse().map((p, i) => (
                  <div key={i} className="log-item" style={{ borderLeftColor: p.color }}>
                    <span style={{ color: p.color }}>{p.label}</span>
                    <span style={{ color: "#1a3a4a" }}> — {p.date}</span>
                    <br />
                    <span style={{ color: "#1a3a4a" }}>
                      Missed {p.missed} quest{p.missed !== 1 ? "s" : ""} · −{p.hpLoss} HP · −{p.xpLoss} XP
                    </span>
                  </div>
                ))
              )}
              {sys.penaltyLog?.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 9, color: "#1a3a4a", letterSpacing: 2, textAlign: "center" }}>
                  TOTAL PENALTIES: {sys.penaltyLog.length}
                </div>
              )}
            </Panel>
          )}

        </div>{/* end wrap */}

        {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        {pendingPenalty && (
          <PenaltyModal tier={pendingPenalty.tier} missedTasks={pendingPenalty.missed} onAck={applyPenalty} />
        )}
        {pendingReward && <RewardModal reward={pendingReward} onClaim={claimReward} />}
      </div>
    </>
  );
}
