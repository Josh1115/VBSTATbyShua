import { useEffect, useState } from 'react';

// Silhouette SVG player components — feet at (0,0), body extends upward (negative y)
const FILL = 'white';
const S = { stroke: 'white', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
const W = 2.5; // thick limb stroke
const w = 2.0; // thin limb stroke

function Idle() {
  return (
    <g>
      <circle cx="0" cy="-24" r="3.5" fill={FILL} />
      <path d="M-3.5,-20.5 L3.5,-20.5 L2.5,-12 L-2.5,-12 Z" fill={FILL} />
      <line x1="-3.5" y1="-20.5" x2="-6.5" y2="-15" {...S} strokeWidth={W} />
      <line x1="-6.5" y1="-15" x2="-5.5" y2="-10.5" {...S} strokeWidth={w} />
      <line x1="3.5" y1="-20.5" x2="6.5" y2="-15" {...S} strokeWidth={W} />
      <line x1="6.5" y1="-15" x2="5.5" y2="-10.5" {...S} strokeWidth={w} />
      <line x1="-2.5" y1="-12" x2="-3.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="-3.5" y1="-5.5" x2="-2.5" y2="0" {...S} strokeWidth={w} />
      <line x1="2.5" y1="-12" x2="3.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="3.5" y1="-5.5" x2="2.5" y2="0" {...S} strokeWidth={w} />
    </g>
  );
}

function Attack() {
  // Jumping — lifted 5 units, hitting arm raised high
  return (
    <g transform="translate(0,-5)">
      <circle cx="0" cy="-24" r="3.5" fill={FILL} />
      <path d="M-3.5,-20.5 L3.5,-20.5 L2.5,-12 L-2.5,-12 Z" fill={FILL} />
      {/* right hitting arm — raised and extended */}
      <line x1="3.5" y1="-20.5" x2="8" y2="-28" {...S} strokeWidth={W} />
      <line x1="8" y1="-28" x2="10" y2="-33" {...S} strokeWidth={w} />
      {/* left balance arm — out to side */}
      <line x1="-3.5" y1="-20.5" x2="-7.5" y2="-16.5" {...S} strokeWidth={W} />
      <line x1="-7.5" y1="-16.5" x2="-7" y2="-12" {...S} strokeWidth={w} />
      {/* legs bent back in jump */}
      <line x1="-2.5" y1="-12" x2="-5.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="-5.5" y1="-5.5" x2="-4" y2="0" {...S} strokeWidth={w} />
      <line x1="2.5" y1="-12" x2="4.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="4.5" y1="-5.5" x2="3" y2="0" {...S} strokeWidth={w} />
    </g>
  );
}

function Block() {
  // Standing at net, both arms raised straight up
  return (
    <g>
      <circle cx="0" cy="-24" r="3.5" fill={FILL} />
      <path d="M-3.5,-20.5 L3.5,-20.5 L2.5,-12 L-2.5,-12 Z" fill={FILL} />
      <line x1="-3.5" y1="-20.5" x2="-6" y2="-27.5" {...S} strokeWidth={W} />
      <line x1="-6" y1="-27.5" x2="-5" y2="-33.5" {...S} strokeWidth={w} />
      <line x1="3.5" y1="-20.5" x2="6" y2="-27.5" {...S} strokeWidth={W} />
      <line x1="6" y1="-27.5" x2="5" y2="-33.5" {...S} strokeWidth={w} />
      <line x1="-2.5" y1="-12" x2="-3" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="-3" y1="-5.5" x2="-2" y2="0" {...S} strokeWidth={w} />
      <line x1="2.5" y1="-12" x2="3" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="3" y1="-5.5" x2="2" y2="0" {...S} strokeWidth={w} />
    </g>
  );
}

function SetPose() {
  // Both arms raised in front in setting position
  return (
    <g>
      <circle cx="0" cy="-24" r="3.5" fill={FILL} />
      <path d="M-3.5,-20.5 L3.5,-20.5 L2.5,-12 L-2.5,-12 Z" fill={FILL} />
      <line x1="-3.5" y1="-20.5" x2="-5" y2="-26.5" {...S} strokeWidth={W} />
      <line x1="-5" y1="-26.5" x2="-2.5" y2="-31" {...S} strokeWidth={w} />
      <line x1="3.5" y1="-20.5" x2="5" y2="-26.5" {...S} strokeWidth={W} />
      <line x1="5" y1="-26.5" x2="2.5" y2="-31" {...S} strokeWidth={w} />
      <line x1="-2.5" y1="-12" x2="-3.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="-3.5" y1="-5.5" x2="-2.5" y2="0" {...S} strokeWidth={w} />
      <line x1="2.5" y1="-12" x2="3.5" y2="-5.5" {...S} strokeWidth={W} />
      <line x1="3.5" y1="-5.5" x2="2.5" y2="0" {...S} strokeWidth={w} />
    </g>
  );
}

function Dig() {
  // Low defensive posture — body bent forward, arms in passing platform
  return (
    <g>
      <circle cx="3.5" cy="-13.5" r="3.5" fill={FILL} />
      <path d="M0,-10.5 L6,-10.5 L4.5,-5 L-1.5,-5 Z" fill={FILL} />
      {/* left arm — extended in passing platform */}
      <line x1="0" y1="-10.5" x2="-3.5" y2="-6.5" {...S} strokeWidth={W} />
      <line x1="-3.5" y1="-6.5" x2="-5.5" y2="-2.5" {...S} strokeWidth={w} />
      {/* right arm */}
      <line x1="6" y1="-10.5" x2="9" y2="-6.5" {...S} strokeWidth={W} />
      <line x1="9" y1="-6.5" x2="11" y2="-2.5" {...S} strokeWidth={w} />
      {/* legs: wide stance, bent low */}
      <line x1="-1.5" y1="-5" x2="-5.5" y2="0" {...S} strokeWidth={W} />
      <line x1="4.5" y1="-5" x2="7" y2="0" {...S} strokeWidth={W} />
    </g>
  );
}

const POSES = [Idle, Attack, Block, SetPose, Dig];
const NUM_PLAYERS = 4;
const FLOOR_Y = 57;

// Base x positions (2 left of net, 2 right), left-facing/right-facing
const BASE_POSITIONS = [
  { x: 97,  flipX: false },
  { x: 190, flipX: false },
  { x: 410, flipX: true  },
  { x: 503, flipX: true  },
];

export function VBPlayerScene() {
  const [players, setPlayers] = useState(() =>
    BASE_POSITIONS.map((p) => ({
      ...p,
      x: p.x + (Math.random() * 18 - 9), // ±9 positional jitter
      poseIdx: Math.floor(Math.random() * POSES.length),
      animKey: 0,
    }))
  );

  useEffect(() => {
    const timers = new Array(NUM_PLAYERS).fill(null);

    function scheduleCycle(i) {
      const delay = 2500 + Math.random() * 2500; // 2.5–5 s
      timers[i] = setTimeout(() => {
        setPlayers((prev) => {
          const next = [...prev];
          let newPose;
          do { newPose = Math.floor(Math.random() * POSES.length); }
          while (newPose === next[i].poseIdx);
          next[i] = { ...next[i], poseIdx: newPose, animKey: next[i].animKey + 1 };
          return next;
        });
        scheduleCycle(i);
      }, delay);
    }

    BASE_POSITIONS.forEach((_, i) => scheduleCycle(i));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden"
      aria-hidden="true"
      viewBox="0 0 600 66"
      preserveAspectRatio="xMidYMid slice"
      style={{ opacity: 0.18 }}
    >
      {players.map((p, i) => {
        const PoseComp = POSES[p.poseIdx];
        return (
          <g key={i} transform={`translate(${p.x},${FLOOR_Y})${p.flipX ? ' scale(-1,1)' : ''}`}>
            <g key={p.animKey} className="vb-pose-in">
              <PoseComp />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
