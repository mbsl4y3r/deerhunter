window.DH = window.DH || {};

// Every tunable number in the game lives here.
DH.data = (() => {
  const scoring = {
    distMult: [1.5, 1.25, 1.0],          // by lane: far, mid, near
    partMult: { head: 1.5, vitals: 1.25, body: 1.0 },
    runMult: 1.5,
    trotMult: 1.2,
    trophyStep: 0.15,                     // ×(1 + step·(trophy−1))
    accuracyBonusMax: 1000,
    threeBuckBonus: 1000,
    doePenalty: -1000,
    perfectTrek: 5000,
    duckPoints: 150,
    allDucksBonus: 1500,
  };

  const shells = 3;
  const reloadTime = 0.45;
  const fireCooldown = 0.12;
  const bulletSpeed = 1350;   // logical px/s — shots take time, lead your target

  // Painter proportions are in animal-local units: origin at the ground
  // under the body center, +x = facing direction. Hitboxes share the space.
  const species = {
    deer: {
      name: 'WHITETAIL', base: 400, bodyScale: 1.0,
      walkSpeed: 70, runSpeed: 200, spookChance: 0.4,
      p: {
        shoulderH: 50, bodyLen: 84, bodyH: 36, legLen: 40, legW: 6.5,
        neckLen: 30, neckW: 13, headLen: 24, headH: 15, earLen: 13,
        tail: 10, hump: 0, snoutDrop: 4,
        coat: '#96603a', coatDark: '#7a4b2c', belly: '#e8dcc4',
        headC: '#8a5732', antler: '#d9c9a0', hoof: '#3a2a1c',
      },
      doeP: { coat: '#a57248', coatDark: '#8a5d3a', headC: '#9a6940' },
      antlerStyle: 'branched',
      hitboxes: [
        { part: 'head',   cx: 56, cy: -76, rx: 15, ry: 13 },
        { part: 'vitals', cx: 16, cy: -52, rx: 20, ry: 17 },
        { part: 'body',   cx: -6, cy: -50, rx: 46, ry: 24 },
      ],
    },
    elk: {
      name: 'ELK', base: 600, bodyScale: 1.22,
      walkSpeed: 64, runSpeed: 215, spookChance: 0.45,
      p: {
        shoulderH: 54, bodyLen: 92, bodyH: 40, legLen: 44, legW: 7.5,
        neckLen: 34, neckW: 16, headLen: 26, headH: 16, earLen: 12,
        tail: 7, hump: 4, snoutDrop: 5,
        coat: '#c2a679', coatDark: '#6b4a33', belly: '#d9c8a8',
        headC: '#5d4030', antler: '#e3d5ae', hoof: '#332419',
      },
      doeP: { coat: '#c9b189', coatDark: '#8a6f52', headC: '#7a5c42' },
      antlerStyle: 'branched-tall',
      hitboxes: [
        { part: 'head',   cx: 60, cy: -84, rx: 16, ry: 14 },
        { part: 'vitals', cx: 18, cy: -58, rx: 22, ry: 19 },
        { part: 'body',   cx: -6, cy: -55, rx: 50, ry: 26 },
      ],
    },
    moose: {
      name: 'MOOSE', base: 800, bodyScale: 1.45,
      walkSpeed: 55, runSpeed: 175, spookChance: 0.3,
      p: {
        shoulderH: 58, bodyLen: 96, bodyH: 46, legLen: 50, legW: 9,
        neckLen: 26, neckW: 20, headLen: 32, headH: 18, earLen: 12,
        tail: 5, hump: 10, snoutDrop: 10, bell: true,
        coat: '#4e3a2c', coatDark: '#3a2b20', belly: '#5d4736',
        headC: '#423227', antler: '#d8c9a4', hoof: '#221812',
      },
      doeP: { coat: '#5d4736', coatDark: '#463527', headC: '#4e3c2e' },
      antlerStyle: 'palmate',
      hitboxes: [
        { part: 'head',   cx: 62, cy: -88, rx: 18, ry: 15 },
        { part: 'vitals', cx: 20, cy: -64, rx: 24, ry: 21 },
        { part: 'body',   cx: -6, cy: -60, rx: 52, ry: 30 },
      ],
    },
    duck: {
      name: 'DUCK', base: 150,
      hitboxes: [{ part: 'body', cx: 0, cy: 0, rx: 22, ry: 16 }],
    },
  };

  // Lane presets: depth drives scale + draw/hit order; y is the ground line.
  const LANES = [
    { depth: 0.25, y: 318 },   // 0 far
    { depth: 0.55, y: 392 },   // 1 mid
    { depth: 0.85, y: 468 },   // 2 near
  ];

  // Spawn entry: t (s), role buck|doe, lane 0-2, side L|R, behavior
  // walk|trot|run, trophy [min,max], pauses [{atX 0..1, dur s}].
  const treks = [
    {
      id: 'forest', name: 'WHITETAIL RIDGE', species: 'deer', env: 'forest',
      sites: [
        { duration: 26, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'L', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.45, dur: 1.8 }] },
          { t: 5.5,  role: 'doe',  lane: 2, side: 'R', behavior: 'walk' },
          { t: 9.0,  role: 'buck', lane: 0, side: 'R', behavior: 'walk', trophy: [1, 3], pauses: [{ atX: 0.6, dur: 1.4 }] },
          { t: 13.5, role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 16.0, role: 'buck', lane: 2, side: 'L', behavior: 'trot', trophy: [3, 5] },
        ]},
        { duration: 25, spawns: [
          { t: 1.0,  role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 3.5,  role: 'buck', lane: 0, side: 'L', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.5, dur: 1.5 }] },
          { t: 8.0,  role: 'buck', lane: 2, side: 'R', behavior: 'walk', trophy: [1, 3] },
          { t: 12.0, role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 15.0, role: 'buck', lane: 1, side: 'L', behavior: 'trot', trophy: [3, 5], pauses: [{ atX: 0.35, dur: 1.0 }] },
          { t: 18.0, role: 'doe',  lane: 2, side: 'L', behavior: 'walk' },
        ]},
        { duration: 24, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'L', behavior: 'walk', trophy: [2, 4] },
          { t: 2.2,  role: 'buck', lane: 0, side: 'R', behavior: 'walk', trophy: [1, 4], pauses: [{ atX: 0.4, dur: 2.0 }] },
          { t: 7.0,  role: 'doe',  lane: 2, side: 'R', behavior: 'walk' },
          { t: 10.0, role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 14.0, role: 'buck', lane: 2, side: 'L', behavior: 'trot', trophy: [4, 5] },
          { t: 16.5, role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
        ]},
        { duration: 23, spawns: [
          { t: 1.0,  role: 'doe',  lane: 2, side: 'L', behavior: 'walk' },
          { t: 3.0,  role: 'buck', lane: 1, side: 'R', behavior: 'trot', trophy: [2, 4] },
          { t: 6.5,  role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 9.5,  role: 'buck', lane: 0, side: 'L', behavior: 'trot', trophy: [3, 5] },
          { t: 13.0, role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 15.5, role: 'buck', lane: 2, side: 'R', behavior: 'run', trophy: [3, 5] },
        ]},
        { duration: 21, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'L', behavior: 'run', trophy: [3, 5] },
          { t: 4.0,  role: 'doe',  lane: 2, side: 'R', behavior: 'trot' },
          { t: 6.0,  role: 'buck', lane: 0, side: 'R', behavior: 'trot', trophy: [2, 5] },
          { t: 9.0,  role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 11.0, role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
          { t: 13.5, role: 'buck', lane: 2, side: 'L', behavior: 'run', trophy: [4, 5] },
        ]},
      ],
    },
    {
      id: 'mountain', name: 'ELK SUMMIT', species: 'elk', env: 'mountain',
      sites: [
        { duration: 26, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'R', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.55, dur: 1.8 }] },
          { t: 6.0,  role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
          { t: 9.5,  role: 'buck', lane: 2, side: 'L', behavior: 'walk', trophy: [1, 3] },
          { t: 14.0, role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 16.5, role: 'buck', lane: 0, side: 'R', behavior: 'trot', trophy: [3, 5] },
        ]},
        { duration: 25, spawns: [
          { t: 1.0,  role: 'doe',  lane: 2, side: 'R', behavior: 'walk' },
          { t: 4.0,  role: 'buck', lane: 0, side: 'L', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.45, dur: 1.6 }] },
          { t: 8.5,  role: 'buck', lane: 1, side: 'R', behavior: 'trot', trophy: [2, 4] },
          { t: 12.5, role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 15.0, role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 17.5, role: 'buck', lane: 2, side: 'L', behavior: 'trot', trophy: [3, 5] },
        ]},
        { duration: 24, spawns: [
          { t: 1.0,  role: 'buck', lane: 0, side: 'R', behavior: 'walk', trophy: [1, 4], pauses: [{ atX: 0.6, dur: 2.0 }] },
          { t: 3.0,  role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 7.0,  role: 'buck', lane: 2, side: 'R', behavior: 'trot', trophy: [2, 4] },
          { t: 11.0, role: 'doe',  lane: 2, side: 'L', behavior: 'walk' },
          { t: 14.0, role: 'buck', lane: 1, side: 'L', behavior: 'trot', trophy: [4, 5] },
          { t: 16.0, role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
        ]},
        { duration: 23, spawns: [
          { t: 1.0,  role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 3.5,  role: 'buck', lane: 2, side: 'L', behavior: 'run', trophy: [2, 4] },
          { t: 7.0,  role: 'buck', lane: 0, side: 'L', behavior: 'trot', trophy: [3, 5] },
          { t: 10.5, role: 'doe',  lane: 2, side: 'R', behavior: 'trot' },
          { t: 13.0, role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 15.5, role: 'buck', lane: 1, side: 'R', behavior: 'run', trophy: [3, 5] },
        ]},
        { duration: 21, spawns: [
          { t: 1.0,  role: 'buck', lane: 2, side: 'R', behavior: 'run', trophy: [3, 5] },
          { t: 3.5,  role: 'doe',  lane: 1, side: 'L', behavior: 'trot' },
          { t: 6.0,  role: 'buck', lane: 1, side: 'L', behavior: 'run', trophy: [2, 5] },
          { t: 9.0,  role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 11.5, role: 'doe',  lane: 2, side: 'L', behavior: 'trot' },
          { t: 14.0, role: 'buck', lane: 0, side: 'R', behavior: 'run', trophy: [4, 5] },
        ]},
      ],
    },
    {
      id: 'tundra', name: 'MOOSE MARSH', species: 'moose', env: 'tundra',
      sites: [
        { duration: 26, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'L', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.5, dur: 2.0 }] },
          { t: 6.5,  role: 'doe',  lane: 2, side: 'L', behavior: 'walk' },
          { t: 10.0, role: 'buck', lane: 0, side: 'R', behavior: 'walk', trophy: [1, 3], pauses: [{ atX: 0.4, dur: 1.6 }] },
          { t: 14.5, role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
          { t: 17.0, role: 'buck', lane: 2, side: 'R', behavior: 'walk', trophy: [3, 5] },
        ]},
        { duration: 25, spawns: [
          { t: 1.0,  role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 4.0,  role: 'buck', lane: 2, side: 'L', behavior: 'walk', trophy: [2, 4] },
          { t: 8.0,  role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 11.0, role: 'buck', lane: 0, side: 'L', behavior: 'walk', trophy: [2, 4], pauses: [{ atX: 0.65, dur: 1.6 }] },
          { t: 15.0, role: 'doe',  lane: 2, side: 'R', behavior: 'walk' },
          { t: 17.5, role: 'buck', lane: 1, side: 'R', behavior: 'trot', trophy: [3, 5] },
        ]},
        { duration: 24, spawns: [
          { t: 1.0,  role: 'buck', lane: 0, side: 'L', behavior: 'walk', trophy: [1, 4], pauses: [{ atX: 0.5, dur: 2.2 }] },
          { t: 2.5,  role: 'buck', lane: 2, side: 'R', behavior: 'walk', trophy: [2, 4] },
          { t: 8.0,  role: 'doe',  lane: 1, side: 'R', behavior: 'walk' },
          { t: 11.5, role: 'doe',  lane: 2, side: 'L', behavior: 'walk' },
          { t: 14.5, role: 'buck', lane: 1, side: 'L', behavior: 'trot', trophy: [4, 5] },
          { t: 17.0, role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
        ]},
        { duration: 23, spawns: [
          { t: 1.0,  role: 'doe',  lane: 2, side: 'R', behavior: 'walk' },
          { t: 3.5,  role: 'buck', lane: 1, side: 'R', behavior: 'trot', trophy: [2, 4] },
          { t: 7.5,  role: 'doe',  lane: 0, side: 'L', behavior: 'walk' },
          { t: 10.0, role: 'buck', lane: 2, side: 'L', behavior: 'trot', trophy: [3, 5] },
          { t: 13.5, role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 16.0, role: 'buck', lane: 0, side: 'R', behavior: 'trot', trophy: [3, 5] },
        ]},
        { duration: 22, spawns: [
          { t: 1.0,  role: 'buck', lane: 1, side: 'R', behavior: 'run', trophy: [3, 5] },
          { t: 4.0,  role: 'doe',  lane: 0, side: 'R', behavior: 'walk' },
          { t: 6.5,  role: 'buck', lane: 2, side: 'L', behavior: 'trot', trophy: [2, 5] },
          { t: 10.0, role: 'doe',  lane: 2, side: 'R', behavior: 'trot' },
          { t: 12.0, role: 'doe',  lane: 1, side: 'L', behavior: 'walk' },
          { t: 14.5, role: 'buck', lane: 0, side: 'L', behavior: 'run', trophy: [4, 5] },
        ]},
      ],
    },
  ];

  const bonus = {
    name: 'DUCK FLUSH', duration: 22,
    waves: [
      { t: 0.5, count: 3, speed: 150 },
      { t: 7.0, count: 4, speed: 190 },
      { t: 13.5, count: 5, speed: 235 },
    ],
  };

  return { scoring, shells, reloadTime, fireCooldown, bulletSpeed, species, LANES, treks, bonus };
})();
