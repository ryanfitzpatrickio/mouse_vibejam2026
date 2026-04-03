**Mouse Trouble -- Game Design Document (Revised v1.1)**

**1. Concept & Vision**  
**One-line pitch:** You are a mouse. So are your friends. Break into the house, grab the goods, cause glorious chaos, and scamper out alive.  

**Genre:** Third-person loot-extraction survival with mischief scoring. Multiplayer (2–8 players, squad or free-for-all).  
**Tone:** Chaotic, adorable-but-heart-pounding. Think *Untitled Goose Game* meets *Fortnite*’s buttery-smooth third-person movement and *Escape from Tarkov* tension, all shrunk to mouse scale.  
**Platform:** Browser (Three.js + WebGPU/WebGL2 fallback). Target: under 3 seconds to playable on first visit.  

**Core Fantasy:** You feel like a tiny, hyper-agile Fortnite character — responsive controls, fluid camera, satisfying physics — but you’re a cartoon mouse causing mayhem in a giant human house. Every cheese wedge stolen feels like a legendary loot drop.

**2. Core Gameplay Loop**  
Each round is a high-stakes 3–5 minute raid:

1. **Deploy** — Mice spawn in the backyard or under the foundation.  
2. **Infiltrate** — Third-person scamper through the 3D house, using Fortnite-style movement to climb, squeeze, and vault.  
3. **Mischief** — Knock things over, chew wires, steal food, trigger chain reactions for bonus points.  
4. **Extract** — Reach the mouse hole/drainpipe before the timer hits zero. Dead mice drop loot for others to steal.  
5. **Score** — Loot value + Mischief points = round score + Mischievery letter grade (encourages style over pure greed).

**Session flow:** <10 s matchmaking → 3–5 min raid → results screen → instant re-queue or lobby. Persistent cumulative “Chaos Rank” across sessions (post-jam).

**3. Player Role — The Mouse**  
**Camera & Controls (Fortnite Feel):**  
- Smooth third-person follow camera (spring-arm style with camera collision to prevent clipping).  
- Mouse-look rotates camera freely (360° horizontal, generous vertical).  
- WASD movement is camera-relative (W = forward in the direction you’re looking).  
- Sprint (stamina bar — drains fast, regenerates while stationary or slow-walking).  
- Light hop/jump (mouse-scale double-jump feel for vaulting small gaps or furniture legs).  
- Crouch/slide under furniture or through tight gaps (Fortnite slide momentum).  
- Contextual “Interact” (E or left-click) for chew, pickup, knock-over.  
- Right-click “Squeak” (quick radial ping + audible distraction).  
- Carry one item at a time (visible in mouth/backpack — heavy items visibly slow you and affect animation).  

**Abilities:**  
- **Sprint** — limited stamina, essential for escaping the cat or outrunning other mice.  
- **Squeak** — team ping + distracts NPCs (cat investigates the sound).  
- **Carry** — one item; drop instantly with G or by sprinting.  
- **Chew** — hold on destructibles/containers (creates new paths or hazards).  
- **Bump/Shove** — light PvP knockback (steal dropped loot or push rivals into traps).  

**Health & Death:**  
- One-hit from cats, traps, or falls.  
- Two hits from minor hazards (falling books, water, other mice).  
- No mid-raid healing.  
- Death: dramatic ragdoll tumble, drop all loot, spectate teammates in third-person (with option to “ghost-squeak” for laughs).

**4. Game World**  
**View:** Full 3D third-person (no longer flat top-down). House interior feels alive and vertical.  
**Key Features:**  
- Multi-room layout with verticality: climb table legs, curtains, bookshelves; squeeze under sofas; run along countertops.  
- Navigable undersides + tops of furniture (clear visual distinction via lighting and outlines).  
- Interactive physics objects (books topple in chains, cups spill, wires spark).  
- Hiding spots that actually hide you from the camera (under beds, inside cabinets).  
- Chokepoints with Fortnite-style flow: narrow baseboard gaps, ventilation shafts you can climb, open floor areas that become death traps during broom sweeps.  

**Map Design (v1):** One hand-crafted house map (kitchen + living room + hallway + basement). Grid-augmented collision for performance + precise mouse-scale navigation. Procedural lighting and subtle day/night cycle for replayability.

**5. Loot System**  
Same categories as original, now with third-person visual flair:  
- Items visibly dangle from your mouth or sit on your back.  
- Heavy items (gold watch, diamond) force a slower “struggle” animation — perfect for dramatic chases.  
- Dropped loot glows and emits particles so it’s easy to spot and steal in the chaos.

**6. Threats & Hazards**  
**Static:** Mouse traps (now with satisfying snap animation + slow-mo on kill), open drops, water puddles, sparking wires.  
**Dynamic:**  
- **Cat Patrol** — AI cat with Fortnite-style “boss” presence. Predictable patrol but reacts to noise/visuals. One-hit kill with cinematic pounce.  
- **Broom Sweep** — periodic human event that sweeps open areas (forces players into vertical cover or tight squeezes).  
- **Other Players** — full optional PvP: shove, loot-steal, trap-baiting. Friendly fire off by default, toggleable in lobby.

**7. Mischief Scoring**  
Unchanged core table, but now with third-person juice:  
- Knock combos show particle trails and combo counter on-screen.  
- “Scare the Cat” now has a slow-motion near-miss camera cut.  
- Mischievery Rating (A–F) based on mischief-to-loot ratio, displayed with cute mouse emojis and sound stingers.  
- Full extraction with rare item = 200 bonus + “Legendary Chaos” animation.

**8. Extraction Mechanic**  
- Fixed exit point(s) with dramatic 3-second channel (camera pulls back slightly, dramatic music swell).  
- Interrupted by any damage (including PvP shove).  
- Partial extraction still awards all mischief points — encourages high-risk play.

**9. Session Structure**  
- Lobby: 2–8 players, host picks map/variant (PvP on/off).  
- Raid → Results screen with replay highlights (top 3 mischief moments in third-person cinematic).  
- Persistent Chaos Rank across sessions + cosmetic mouse skins (hats, bandanas, glow tails) unlocked via total score (post-jam).

**10. Technical Architecture**  
**Frontend** — unchanged except:  
- **Camera:** Custom third-person spring-arm controller (inspired by Fortnite/Unreal).  
- **Animation:** Mixamo-style or simple procedural + keyframe mouse rig (run, chew, carry, death tumble).  
- **Physics:** Custom AABB + simple character controller for Fortnite-smooth feel (no heavy engine needed).  
- **Instant Load:** Same aggressive strategy — procedural walls/floors, texture atlas, <100 KB gzipped JS.

**Multiplayer Backend:** Still **PartyKit (Option A) recommended** — authoritative server handles positions, loot state, cat AI, scoring at 30 tick/s. Perfect for third-person precision.

**11. Scope & Timeline (Vibe Jam — Target: Playable by May 1, 2026)**  
**Phase 1: Foundation (Week 1)**  
- Three.js setup + **third-person camera & Fortnite-style character controller**  
- Mouse model + basic animations (idle, run, jump, chew)  
- Single room with vertical navigation + one loot item  

**Phase 2: Multiplayer (Week 1–2)**  
- PartyKit room + authoritative sync (positions, camera-relative movement)  
- Player spawning + scoreboard  

**Phase 3: Core Gameplay (Week 2)**  
- Loot carry/drop/extract (with visual carry model)  
- Mischief physics + scoring  
- Cat AI + traps + broom event  

**Phase 4: Polish (Week 3)**  
- Full 4–6 room house  
- Sound design (Web Audio + spatial squeaks/crashes)  
- Mischief combo VFX + letter-grade screen  
- Results screen with third-person highlight reel  
- Mobile touch controls (virtual joystick + camera drag)  

**Phase 5: Ship (Week 3–4)**  
- Performance (bundle <100 KB, texture compression, LOD)  
- Balance + playtest  
- Deploy to Cloudflare Pages  

**12. Risk Register (Updated)**  
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Third-person camera clipping / motion sickness | Medium | Medium | Spring-arm + generous collision; optional FOV slider |
| Performance hit from 3D animations + particles | Medium | High | Aggressive LOD, texture atlas, procedural geometry |
| Desync in fast third-person movement | Medium | High | Authoritative server + client-side prediction |
| PartyKit latency affecting camera feel | Low | High | Test in Phase 2; fallback to raw Durable Objects |
| Bundle size with 3D assets | Low | Medium | Same aggressive tree-shaking + streaming |

**13. Out of Scope (v1)**  
- Account system / login  
- Persistent progression beyond Chaos Rank  
- In-game purchases  
- Custom map editor  
- Voice chat  
- Mobile native apps  
- Advanced AI (all human players)  
- Building/fortification (keep pure mouse mischief)

**New Additions That Make It Pop**  
- **Art Style:** Bright, stylized cartoon 3D (low-poly but expressive). Big expressive mouse eyes, squash-and-stretch animations, vibrant house colors, particle “sparkle” on shiny loot.  
- **Audio:** Spatial 3D audio (squeaks get louder when close), dynamic music that ramps during cat chases or combo streaks.  
- **Accessibility:** Color-blind modes, remappable controls, reduced motion option, screen-reader friendly score screen.  
- **Highlight Reel:** Every round ends with a 15-second third-person montage of the funniest moments — perfect for sharing.

Public Repo: https://github.com/ryanfitzpatrickio/vibejam2026