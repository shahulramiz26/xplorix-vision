# XPLORIX Pulse · Copilot

XPLORIX Copilot is an AI agent that runs inside XPLORIX Pulse. Add it, and it reads every sensor reading on every rig, every second, together with what XPLORIX knows about each rig, and tells the crew **what to do, how to do it, and why**. Then it watches the readings and says whether it worked.

Run: `npm install && npm run dev`, open `/pulse`, press **Add XPLORIX Copilot**.

## What Copilot does

| | Feature | Example |
|---|---|---|
| ① | Sees the rock ahead (from the cored holes around the rig) | "Broken ground in 0.9 m. Ease to 760 rpm and 16 kN, shorten runs." |
| ② | Guards the money | "Client standby: SAR 510 billable so far. Log it now." / "Costing SAR 1,039 a metre; the contract pays SAR 700." |
| ③ | Protects core quality | "Core being lost: recovery heading for about 82%." |
| ④ | Catches failures early | Bit blocking, engine losing its cooling, water pump wearing out |
| ⑤ | Says when to stop a hole (Geology GPS) | "No target left below: stop at 155 m and save 45 m." |
| ⑥ | Writes the shift logs | From the sensors, the crew's actions and what the driller says |
| ⑦ | Checks its own advice | "Worked: pressure back to 16.8 bar. 1.5 h saved." Each card shows "worked 26 of 31 times." |

Plus: three levels (Advise, Assist: one-tap apply to rig, Auto: Copilot adjusts within safe limits), voice in English, Arabic, Hindi and Urdu, ask by voice or text, and urgent advice nobody answers in a minute goes to the supervisor.

## What is real

`data/xplorix-data.json` is exported from the XPLORIX MVP: rigs, holes, plans, surveys, the core of the cored holes metre by metre, each rig's normal speed by ground, the best crew in each ground, bits, contract rates and costs.

The sensor readings are a model (`lib/rig.ts`); the screen says so. Copilot's brain is rules (`lib/copilot.ts`); the launch version puts trained models behind the same agent, learning from the outcomes it records (`lib/memory.ts`).

## Files

- `app/pulse/page.tsx`: Pulse with the Copilot switch, panel, actions and checks
- `lib/copilot.ts`: the agent: what it watches, what it says, how, why, and the verdicts
- `lib/ground.ts`: the rock ahead and Geology GPS
- `lib/rig.ts`: the simulated rigs
- `lib/ask.ts`: questions and voice logging
- `components/rigview.tsx`: gauges, trends, hole and rock ahead
