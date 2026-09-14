"use client";

import { useState } from "react";
import { RewardAnnouncement } from "@/components/city-map/RewardAnnouncement";
import type { RewardAnnouncement as Announcement } from "@/lib/city/rewards";

const SCENARIOS: Record<string, Announcement> = {
  "100 users": {
    xpGained: 80, previousXpTotal: 110, xpTotal: 190,
    previousBuildingLevel: 1, buildingLevel: 1, levelChanged: false,
    currentLevelXp: 0, nextLevelXp: 490,
    achievements: [{ type: "users_100", label: "100+ users", xp: 50 }],
  },
  "Multiple achievements": {
    xpGained: 80, previousXpTotal: 110, xpTotal: 190,
    previousBuildingLevel: 1, buildingLevel: 1, levelChanged: false,
    currentLevelXp: 0, nextLevelXp: 490,
    achievements: [
      { type: "users_10", label: "10 users", xp: 5 },
      { type: "users_50", label: "50 users", xp: 25 },
      { type: "users_100", label: "100+ users", xp: 50 },
    ],
  },
  "Level up": {
    xpGained: 150, previousXpTotal: 390, xpTotal: 540,
    previousBuildingLevel: 1, buildingLevel: 2, levelChanged: true,
    currentLevelXp: 490, nextLevelXp: 690,
    achievements: [{ type: "revenue_100", label: "$100 earned", xp: 150 }],
  },
};

export function RewardPreview() {
  const [scenario, setScenario] = useState("100 users");
  const [replay, setReplay] = useState(0);
  const [visible, setVisible] = useState(true);
  return <main style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#102c2e" }}>
    <nav aria-label="Preview controls" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12, color: "white" }}>
      <label>Preview: <select value={scenario} style={{ color: "black" }} onChange={(e) => {
        setScenario(e.target.value); setVisible(true); setReplay(replay + 1);
      }}>{Object.keys(SCENARIOS).map((name) => <option key={name}>{name}</option>)}</select></label>
      <button onClick={() => { setVisible(true); setReplay(replay + 1); }}>Replay celebration</button>
    </nav>
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      {visible && <RewardAnnouncement key={replay} announcement={SCENARIOS[scenario]} onDismiss={() => setVisible(false)} />}
    </div>
  </main>;
}
