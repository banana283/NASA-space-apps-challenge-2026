import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import sciFiTrackOne from './assets/Sci-Fi 1.mp3'
import sciFiTrackTwo from './assets/Sci-fi 2.mp3'
import marsMicRecording from './assets/scam-mic-sol001-run001.wav'
import './App.css'

const JourneyScene3D = lazy(() => import('./JourneyScene3D'))
const Surface3DScene = lazy(() => import('./Surface3DScene'))

type Planet = 'Moon' | 'Mars'
type Screen = 'earth' | 'launch' | 'space' | 'landing' | 'surface' | 'summary'
type ResultType = 'success' | 'failure' | null
type EnergyAsset = 'solar' | 'reactor' | 'rtg'
type TaskAction = 'repair' | 'science' | 'rest' | 'food' | 'shield' | 'farm'
type OperationStage = 'work' | 'repair-target' | 'repair-parts' | 'repair-work' | 'resting' | 'report' | 'awaiting-ack'
type RepairSystemId = 'rover' | 'ascent-vehicle' | 'power-converter'
type PowerPlanId = 'balanced' | 'life-support' | 'communications' | 'science' | 'food'
type HabitatPart = 'foundation' | 'pressure-shell' | 'airlock' | 'oxygen-recycler' | 'bed' | 'radio-antenna'
type ResourceKind = 'metal' | 'ice' | 'regolith' | 'hydrated-mineral'
type BaseRadioMessage = {
  id: number
  sender: 'Crew' | 'Mission Control AI'
  text: string
}
type OperationDetails = {
  label: string
  hours: number
}
type ResourceDeposit = {
  id: string
  kind: ResourceKind
  longitude: number
  latitude: number
  remaining: number
}
type Excavation = {
  id: string
  longitude: number
  latitude: number
  depth: number
}

type Inventory = {
  metal: number
  wires: number
  ice: number
  fuel: number
  tools: number
  food: number
  medicine: number
  regolith: number
  seeds: number
}

type RepairSystem = {
  id: RepairSystemId
  label: string
  parts: Partial<Inventory>
  steps: [string, string, string]
}

type MissionState = {
  planet: Planet
  siteId: string
  crew: number
  days: number
  hours: number
  safeSolStreak: number
  health: number
  oxygen: number
  water: number
  food: number
  fuel: number
  power: number
  powerPlan: PowerPlanId
  solarPanels: number
  nuclearReactors: number
  rtgUnits: number
  baseExpansions: number
  radiationRisk: number
  shielding: number
  farmBuilt: boolean
  oxygenInstalled: boolean
  learningNote: string
  science: number
  habitat: number
  habitatKits: Record<HabitatPart, number>
  placedHabitatParts: HabitatPart[]
  habitatAnchor: { longitude: number; latitude: number } | null
  resourceDeposits: ResourceDeposit[]
  excavations: Excavation[]
  drones: number
  repairedSystems: RepairSystemId[]
  logs: string[]
  inventory: Inventory
}

type PlayerPosition = {
  x: number
  y: number
  worldX: number
  worldY: number
}

type MapLocation = {
  longitude: number
  latitude: number
}

type FieldMapMarker = MapLocation & {
  id: number
  name: string
  kind: 'base' | 'note'
}

const baseSites: Record<Planet, { id: string; label: string; summary: string; longitude: number; latitude: number }[]> = {
  Moon: [
    { id: 'south-pole', label: 'South Pole Crater', summary: 'Dark permanent-shadow ice fields and a cold but stable landing zone.', longitude: 0, latitude: -85 },
    { id: 'imbrium', label: 'Mare Imbrium', summary: 'Smooth basalt plains with easier mobility for your first Moon camp.', longitude: -15.4, latitude: 32.8 },
    { id: 'aristarchus', label: 'Aristarchus Ridge', summary: 'Bright highlands and sunlight-rich terrain for solar power.', longitude: -47.4, latitude: 23.7 },
  ],
  Mars: [
    { id: 'gale', label: 'Gale Crater', summary: 'A dramatic canyon floor with sedimentary layers and good science value.', longitude: 137.4, latitude: -4.6 },
    { id: 'jezero', label: 'Jezero Delta', summary: 'Ancient lake bed and hydrated mineral fields ideal for a long-term base.', longitude: 77.4, latitude: 18.4 },
    { id: 'elysium', label: 'Elysium Planitia', summary: 'Broad plains and lower terrain risk for early landing and expansion.', longitude: 147.2, latitude: 24.7 },
  ],
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const HAND_DIG_LIMIT = 5
const MISSION_SUCCESS_SAFE_SOLS = 30
const SURVIVAL_THRESHOLD = 50
const surfaceDistance = (
  longitudeA: number,
  latitudeA: number,
  longitudeB: number,
  latitudeB: number,
) => {
  const longitudeDelta = ((longitudeA - longitudeB + 540) % 360) - 180
  return Math.hypot(longitudeDelta * 5.456, (latitudeA - latitudeB) * 9.093)
}

const habitatPartLabels: Record<HabitatPart, string> = {
  foundation: 'Foundation',
  'pressure-shell': 'Pressure shell',
  airlock: 'Airlock',
  'oxygen-recycler': 'Oxygen recycler',
  bed: 'Crew bed',
  'radio-antenna': 'Radio antenna',
}

const habitatPartLabel = (part: HabitatPart, planet: Planet) =>
  part === 'oxygen-recycler' && planet === 'Mars'
    ? 'MOXIE'
    : habitatPartLabels[part]

const survivalVitals = (mission: MissionState) => [
  mission.health,
  mission.oxygen,
  mission.water,
  mission.food,
  mission.power,
]

const isCrewSafe = (mission: MissionState) =>
  survivalVitals(mission).every((value) => value >= SURVIVAL_THRESHOLD)

const isCrewInCriticalCondition = (mission: MissionState) =>
  survivalVitals(mission).every((value) => value < SURVIVAL_THRESHOLD)

const trackSurvivalSol = (mission: MissionState) =>
  isCrewSafe(mission) ? mission : { ...mission, safeSolStreak: 0 }

const resourceLabels: Record<ResourceKind, string> = {
  metal: 'Metal ore',
  ice: 'Water ice',
  regolith: 'Regolith',
  'hydrated-mineral': 'Hydrated minerals',
}

const operationDetails: Record<TaskAction, OperationDetails> = {
  repair: { label: 'Systems repair', hours: 4 },
  science: { label: 'Sample analysis', hours: 4 },
  food: { label: 'Ration preparation', hours: 2 },
  rest: { label: 'Crew rest', hours: 8 },
  shield: { label: 'Radiation shielding', hours: 6 },
  farm: { label: 'Food growing system', hours: 8 },
}

const workSteps: Partial<Record<TaskAction, string[]>> = {
  science: ['Prepare the sample', 'Run the analyzer', 'Record the result'],
  food: ['Select a ration', 'Rehydrate the meal', 'Prepare the water pouch'],
  shield: ['Move regolith to the shelter', 'Stack shielding around the crew area', 'Seal gaps in the shield wall'],
  farm: ['Mount the grow trays', 'Plant the seed packets', 'Connect water and grow lights'],
}

const operationLessons: Record<TaskAction, string> = {
  repair: 'A repair uses spare parts carried from Earth or made locally. Every spare adds launch mass, so crews cannot carry everything.',
  science: 'A sample is useful only when it is measured and recorded. More science power can produce more results, but it leaves less for other systems.',
  rest: 'Astronauts need sleep to stay healthy and make careful decisions. A habitat protects the crew while they rest.',
  food: 'Stored meals are dependable but limited. Preparing a ration restores the crew’s food meter; it does not replace growing future food.',
  shield: 'Regolith can add mass between a crew and some space radiation. Real protection depends on the particles and shield design; this game’s protection is simplified.',
  farm: 'Plants need light, water, nutrients, and time. A farm can add food, but its lights and water compete with other outpost needs.',
}

const repairSystems: RepairSystem[] = [
  {
    id: 'rover',
    label: 'Surface rover drive',
    parts: { tools: 1, wires: 1, metal: 1 },
    steps: ['Remove the damaged wheel cover', 'Replace the drive coupler', 'Test rover traction'],
  },
  {
    id: 'ascent-vehicle',
    label: 'Ascent vehicle fuel system',
    parts: { tools: 1, wires: 1, metal: 2 },
    steps: ['Inspect the fuel feed', 'Replace the valve and wiring', 'Run a sealed pressure test'],
  },
  {
    id: 'power-converter',
    label: 'Habitat power converter',
    parts: { tools: 1, wires: 1 },
    steps: ['Open the converter housing', 'Replace the fuse assembly', 'Run a load test'],
  },
]

const powerPlans: Record<PowerPlanId, { label: string; lifeSupport: number; communications: number; science: number; food: number }> = {
  balanced: { label: 'Balanced', lifeSupport: 55, communications: 15, science: 15, food: 15 },
  'life-support': { label: 'Life support first', lifeSupport: 70, communications: 10, science: 10, food: 10 },
  communications: { label: 'Communications window', lifeSupport: 45, communications: 25, science: 20, food: 10 },
  science: { label: 'Science window', lifeSupport: 45, communications: 10, science: 35, food: 10 },
  food: { label: 'Grow food', lifeSupport: 50, communications: 10, science: 10, food: 30 },
}
const energyAssets: Record<EnergyAsset, { label: string; cost: Partial<Inventory>; limit: number }> = {
  solar: { label: 'Solar panel', cost: { metal: 2, wires: 1 }, limit: 4 },
  reactor: { label: 'Nuclear reactor', cost: { metal: 3, wires: 2, fuel: 2 }, limit: 1 },
  rtg: { label: 'RTG backup generator', cost: { metal: 2, wires: 1 }, limit: 2 },
}
const baseExpansionCost: Partial<Inventory> = { metal: 3, wires: 2, regolith: 1 }

const NASA_SEP_TRAINING_EVENT = {
  sol: 3,
  date: 'May 10, 2024',
  eventId: '2024-05-10T13:35:00-SEP-001',
  instrument: 'GOES-P: SEISS >10 MeV',
  url: 'https://api.nasa.gov/DONKI/SEP?startDate=2024-05-10&endDate=2024-05-10&api_key=DEMO_KEY',
}

const hasParts = (inventory: Inventory, parts: RepairSystem['parts']) =>
  (Object.keys(parts) as (keyof Inventory)[]).every((part) => inventory[part] >= (parts[part] ?? 0))

const getActionBlockReason = (action: TaskAction, mission: MissionState) => {
  if (action === 'repair' && !repairSystems.some((system) =>
    !mission.repairedSystems.includes(system.id) && hasParts(mission.inventory, system.parts),
  )) return 'No damaged system can be repaired with the parts currently in inventory.'
  if (action === 'science' && (mission.inventory.ice < 1 || mission.power < 6)) {
    return 'Operation not started: sample or power is unavailable.'
  }
  if (action === 'food' && mission.inventory.food < 1) return 'Operation not started: stored food is depleted.'
  if (action === 'shield' && mission.shielding >= 100) return 'Radiation shielding is already at its training cap.'
  if (action === 'shield' && mission.inventory.regolith < 3) return 'Operation not started: three regolith bags are needed.'
  if (action === 'farm' && (mission.farmBuilt || mission.inventory.seeds < 1 || mission.inventory.metal < 1 || mission.inventory.wires < 1)) {
    return mission.farmBuilt
      ? 'A food-growing system is already installed.'
      : 'Operation not started: a seed packet, metal, and wiring are needed.'
  }
  return null
}

const createResourceDeposits = (planet: Planet, siteId: string): ResourceDeposit[] => {
  const site = getCurrentSite(planet, siteId)
  const localKinds: ResourceKind[] = planet === 'Moon'
    ? ['regolith', 'metal', 'ice', 'metal', 'regolith', 'ice', 'metal', 'regolith']
    : ['regolith', 'metal', 'ice', 'hydrated-mineral', 'regolith', 'metal', 'ice', 'hydrated-mineral']
  const localOffsets = [
    [-0.35, 0.1], [0.55, 0.3], [0.15, -0.5], [-0.8, -0.25],
    [0.9, -0.45], [-0.4, 0.7], [1.25, 0.35], [-1.1, 0.5],
  ]
  const deposits = localKinds.map((kind, index) => ({
    id: `${planet.toLowerCase()}-${siteId}-${index}`,
    kind,
    longitude: site.longitude + localOffsets[index][0],
    latitude: clamp(site.latitude + localOffsets[index][1], -85, 85),
    remaining: kind === 'regolith' ? 3 : 2,
  }))

  const globalKinds: ResourceKind[] = planet === 'Moon'
    ? ['regolith', 'metal', 'ice']
    : ['regolith', 'metal', 'ice', 'hydrated-mineral']
  const longitudeBands = 18
  const latitudeBands = 9
  for (let latitudeIndex = 0; latitudeIndex < latitudeBands; latitudeIndex += 1) {
    const bandLatitude = -82 + latitudeIndex * 20.5
    for (let longitudeIndex = 0; longitudeIndex < longitudeBands; longitudeIndex += 1) {
      const longitudeJitter = ((latitudeIndex * 17 + longitudeIndex * 31) % 9 - 4) * 0.75
      const latitudeJitter = ((latitudeIndex * 29 + longitudeIndex * 13) % 9 - 4) * 0.75
      const longitude = ((-170 + longitudeIndex * 20 + longitudeJitter + 180 + 360) % 360) - 180
      const latitude = clamp(bandLatitude + latitudeJitter, -84, 84)
      if (surfaceDistance(site.longitude, site.latitude, longitude, latitude) < 3.5) continue

      const kind = globalKinds[(latitudeIndex * 7 + longitudeIndex * 13) % globalKinds.length]
      deposits.push({
        id: `${planet.toLowerCase()}-${siteId}-global-${latitudeIndex}-${longitudeIndex}`,
        kind,
        longitude,
        latitude,
        remaining: kind === 'regolith' ? 3 : 2,
      })
    }
  }
  return deposits
}

const createMissionState = (planet: Planet, siteId?: string): MissionState => ({
  planet,
  siteId: siteId ?? baseSites[planet][0].id,
  crew: 4,
  days: 1,
  hours: 0,
  safeSolStreak: 0,
  health: 94,
  oxygen: 91,
  water: 88,
  food: 90,
  fuel: 78,
  power: 80,
  powerPlan: 'balanced',
  solarPanels: 1,
  nuclearReactors: 0,
  rtgUnits: 0,
  baseExpansions: 0,
  radiationRisk: 0,
  shielding: 0,
  farmBuilt: false,
  oxygenInstalled: false,
  learningNote: 'Your first Sol has not ended yet. The selected power plan will affect oxygen, water, radio time, science, and food when it does.',
  science: 14,
  habitat: 0,
  habitatKits: {
    foundation: 1,
    'pressure-shell': 1,
    airlock: 1,
    'oxygen-recycler': 1,
    bed: 1,
    'radio-antenna': 1,
  },
  placedHabitatParts: [],
  habitatAnchor: null,
  resourceDeposits: createResourceDeposits(planet, siteId ?? baseSites[planet][0].id),
  excavations: [],
  drones: 1,
  repairedSystems: [],
  logs: [
    `Player astronaut enters the International GameLand Space Station on Earth.`,
    `Mission route set for ${planet}.`,
  ],
  inventory: {
    metal: 4,
    wires: 3,
    ice: 2,
    fuel: 5,
    tools: 2,
    food: 8,
    medicine: 1,
    regolith: 0,
    seeds: 2,
  },
})

const resolveSolSystems = (mission: MissionState, solNumber: number): MissionState => {
  const next: MissionState = { ...mission, inventory: { ...mission.inventory } }
  const plan = powerPlans[next.powerPlan]
  const units = {
    lifeSupport: 20 * plan.lifeSupport / 100,
    communications: 20 * plan.communications / 100,
    science: 20 * plan.science / 100,
    food: 20 * plan.food / 100,
  }
  const usedPower = units.lifeSupport + units.communications + units.science + (next.farmBuilt ? units.food : 0)
  const generatedPower = 20 + (next.solarPanels - 1) * 8 + next.nuclearReactors * 14 + next.rtgUnits * 6
  next.power = clamp(next.power + generatedPower - usedPower, 0, 100)

  const lifeSupportPowered = units.lifeSupport >= 10
  const oxygenRecyclePowered = next.oxygenInstalled && lifeSupportPowered
  next.oxygen = clamp(next.oxygen - (oxygenRecyclePowered ? 1 : lifeSupportPowered ? 5 : 10), 0, 100)
  next.water = clamp(next.water - (lifeSupportPowered ? 5 : 10), 0, 100)
  next.food = clamp(next.food - 7, 0, 100)

  const farmHarvested = next.farmBuilt && units.food >= 5 && next.water >= 3
  if (farmHarvested) {
    next.water = clamp(next.water - 3, 0, 100)
    next.food = clamp(next.food + 10, 0, 100)
    next.inventory.food = Math.min(20, next.inventory.food + 1)
  }

  const scienceGain = units.science >= 5 ? 4 : units.science >= 3 ? 1 : 0
  next.science = clamp(next.science + scienceGain, 0, 100)

  const unshieldedRisk = solNumber === NASA_SEP_TRAINING_EVENT.sol ? 18 : 2
  const addedRisk = Math.ceil(unshieldedRisk * (1 - next.shielding / 100))
  next.radiationRisk += addedRisk
  if (next.radiationRisk >= 30) next.health = clamp(next.health - 5, 0, 100)
  if (next.oxygen < 30 || next.water < 25 || next.food < 25) next.health = clamp(next.health - 3, 0, 100)

  const eventLog = solNumber === NASA_SEP_TRAINING_EVENT.sol
    ? `Archived NASA DONKI event drill on Sol ${solNumber}: ${NASA_SEP_TRAINING_EVENT.instrument}, ${NASA_SEP_TRAINING_EVENT.date}. Radiation-risk points are simulated, not a measured dose.`
    : null
  const systemsLog = `Sol ${solNumber} complete: life support used ${units.lifeSupport} power units; ${next.farmBuilt && units.food >= 5 ? 'the farm produced food' : 'no powered crop harvest'}; radiation risk +${addedRisk} training points.`
  next.learningNote = [
    `${powerPlans[next.powerPlan].label} sent ${units.lifeSupport} of 20 game power units to life support. ${lifeSupportPowered ? 'That met the model’s minimum.' : 'Oxygen and water fell because life support was underpowered.'}`,
    next.farmBuilt
      ? farmHarvested
        ? `The farm used ${units.food} power units and 3 water units to grow one ration.`
        : `The farm received ${units.food} power units; it needs at least 5 plus water to produce a ration.`
      : 'No farm is installed, so no food was grown this Sol.',
    `Science gained ${scienceGain} points. Communications received ${units.communications} power units; more power shortens the game’s reply wait.`,
    `Radiation risk increased by ${addedRisk} game points${next.shielding > 0 ? ` with ${next.shielding}% shielding in the model` : ' without added regolith shielding'}. These points are not a real dose.`,
    ...(eventLog ? [`NASA DONKI’s archived ${NASA_SEP_TRAINING_EVENT.instrument} observation is the source for this Sol ${solNumber} drill, not a forecast or a habitat dose reading.`] : []),
  ].join(' ')
  next.logs = [eventLog ?? systemsLog, ...(eventLog ? [systemsLog] : []), ...next.logs].slice(0, 7)
  next.safeSolStreak = isCrewSafe(next) ? mission.safeSolStreak + 1 : 0
  return next
}

const advanceMissionHours = (mission: MissionState, hours: number) => {
  let next: MissionState = {
    ...mission,
    inventory: { ...mission.inventory },
    hours: mission.hours + hours,
  }
  next.days = Math.floor(next.hours / 24) + 1
  for (let sol = mission.days; sol < next.days; sol += 1) {
    next = resolveSolSystems(next, sol)
  }
  return next
}

const isMissionSuccessful = (mission: MissionState) =>
  mission.safeSolStreak >= MISSION_SUCCESS_SAFE_SOLS && isCrewSafe(mission)

const getMissionOutcome = (mission: MissionState): ResultType =>
  isCrewInCriticalCondition(mission) ? 'failure' : null

const createMissionControlReply = (message: string, mission: MissionState) => {
  const topic = message.toLowerCase()
  if (/(oxygen|o2|air)/.test(topic)) {
    const generator = habitatPartLabel('oxygen-recycler', mission.planet)
    return mission.oxygenInstalled
      ? `${generator} is online. Oxygen is ${mission.oxygen}%; keep life-support power available and monitor the habitat.`
      : `Install the ${generator} inside the completed habitat. Current oxygen is ${mission.oxygen}%.`
  }
  if (/(water|ice|thirst)/.test(topic)) {
    return `Water is ${mission.water}% with ${mission.inventory.ice} ice units in storage. Use G to dig for subsurface resources and E to collect nearby deposits.`
  }
  if (/(food|hungry|ration|farm)/.test(topic)) {
    return `Food is ${mission.food}% with ${mission.inventory.food} stored rations. A powered farm can replenish supplies; check water and the power plan.`
  }
  if (/(power|energy|battery|solar)/.test(topic)) {
    return `Power is ${mission.power}%. Review the power plan and keep the solar array clear; life support needs enough power each Sol.`
  }
  if (/(health|hurt|injur|medical|sick)/.test(topic)) {
    return `Crew health is ${mission.health}%. Rest in the habitat and maintain oxygen, water, and food above 50%.`
  }
  if (/(dig|drill|excavat|machine)/.test(topic)) {
    return 'Copy. Press G to dig a test pit; after five hand-dug levels the machine digger can continue much deeper.'
  }
  const loggedMessage = message.length > 160 ? `${message.slice(0, 157)}...` : message
  return `Copy, crew. We logged "${loggedMessage}". Sol ${mission.days} status: health ${mission.health}%, oxygen ${mission.oxygen}%, water ${mission.water}%, food ${mission.food}%, power ${mission.power}%.`
}

const getCurrentSite = (planet: Planet, siteId: string) =>
  baseSites[planet].find((site) => site.id === siteId) ?? baseSites[planet][0]

const MARS_TREK_PERMALINK = 'https://trek.nasa.gov/mars/#v=0.1&x=0&y=0&z=1&p=urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104905&d=&locale=&b=mars&e=-269.999994963537%2C-123.57421644490009%2C269.999994963537%2C123.57421644490009&sfz=&w='

const terrainServiceByPlanet: Record<Planet, { imageService: string; spatialReference: number }> = {
  Moon: {
    imageService: 'https://trek.nasa.gov/moon/trekarcgis/rest/services/LRO_WAC_Mosaic_Global_303ppd_v02/ImageServer/exportImage',
    spatialReference: 104903,
  },
  Mars: {
    imageService: 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Viking_MDIM21_ClrMosaic_global_232m/ImageServer/exportImage',
    spatialReference: 104905,
  },
}

const getTerrainUrl = (planet: Planet, x: number, y: number) => {
  const service = terrainServiceByPlanet[planet]
  const halfWidth = 8
  const halfHeight = 4
  const params = new URLSearchParams({
    bbox: `${x - halfWidth},${y - halfHeight},${x + halfWidth},${y + halfHeight}`,
    bboxSR: String(service.spatialReference),
    imageSR: String(service.spatialReference),
    size: '1024,512',
    format: 'jpg',
    f: 'image',
  })

  return `${service.imageService}?${params.toString()}`
}

function MusicToggle({
  enabled,
  trackName,
  error,
  onToggle,
}: {
  enabled: boolean
  trackName: string | null
  error: string | null
  onToggle: () => void
}) {
  return (
    <span className="music-control">
      <button
        className="music-toggle"
        aria-pressed={enabled}
        title={enabled ? `Stop ${trackName}` : 'Play a randomly selected sci-fi track'}
        onClick={onToggle}
      >
        {enabled ? `Music: ${trackName} · On` : 'Play music'}
      </button>
      {error && <span className="music-error" role="status">{error}</span>}
    </span>
  )
}

function App() {
  const [selectedPlanet, setSelectedPlanet] = useState<Planet>('Moon')
  const [screen, setScreen] = useState<Screen>('earth')
  const [mission, setMission] = useState<MissionState>(() => createMissionState('Moon'))
  const [launchTimer, setLaunchTimer] = useState(5)
  const [spaceProgress, setSpaceProgress] = useState(0)
  const [returningToEarth, setReturningToEarth] = useState(false)
  const [result, setResult] = useState<ResultType>(null)
  const [stationX, setStationX] = useState(46)
  const [stationDepth, setStationDepth] = useState(0)
  const [stationDoorOpen, setStationDoorOpen] = useState(false)
  const [shipBoarded, setShipBoarded] = useState(false)
  const [crewBoarding, setCrewBoarding] = useState(false)
  const [boardingProgress, setBoardingProgress] = useState(0)
  const [stationStatus, setStationStatus] = useState('Station secure · Airlock sealed · Vehicle on standby')
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>({ x: 50, y: 16, worldX: 0, worldY: 0 })
  const [mapCenter, setMapCenter] = useState({ x: 0, y: 0 })
  const [explorationRoute, setExplorationRoute] = useState<MapLocation[]>([])
  const [fieldMapMarkers, setFieldMapMarkers] = useState<FieldMapMarker[]>([])
  const [fieldMapOpen, setFieldMapOpen] = useState(false)
  const [fieldMapMarkerName, setFieldMapMarkerName] = useState('')
  const nextMapMarkerId = useRef(0)
  const [jumping, setJumping] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [insideHabitat, setInsideHabitat] = useState(false)
  const [interactionMessage, setInteractionMessage] = useState('')
  const [learningOpen, setLearningOpen] = useState(false)
  const [howToOpen, setHowToOpen] = useState(false)
  const [activeOperation, setActiveOperation] = useState<TaskAction | null>(null)
  const [operationProgress, setOperationProgress] = useState(0)
  const [operationStage, setOperationStage] = useState<OperationStage | null>(null)
  const [activityStep, setActivityStep] = useState(0)
  const [selectedRepairSystem, setSelectedRepairSystem] = useState<RepairSystemId | null>(null)
  const [radioReport, setRadioReport] = useState('')
  const [earthReply, setEarthReply] = useState('')
  const [radioDelayMs, setRadioDelayMs] = useState(2600)
  const [radioOpen, setRadioOpen] = useState(false)
  const [radioDraft, setRadioDraft] = useState('')
  const [radioMessages, setRadioMessages] = useState<BaseRadioMessage[]>([])
  const [radioPending, setRadioPending] = useState(false)
  const [baseRadioDelayMs, setBaseRadioDelayMs] = useState(1800)
  const baseRadioMessageId = useRef(0)
  const [musicEnabled, setMusicEnabled] = useState(false)
  const [musicTrackName, setMusicTrackName] = useState<string | null>(null)
  const [musicError, setMusicError] = useState<string | null>(null)
  const musicAudio = useRef<HTMLAudioElement | null>(null)
  const [marsAmbientError, setMarsAmbientError] = useState<string | null>(null)
  const marsAmbientAudio = useRef<HTMLAudioElement | null>(null)
  const movementTimer = useRef<number | null>(null)
  const jumpTimer = useRef<number | null>(null)
  const outerHabitatParts: HabitatPart[] = ['foundation', 'pressure-shell', 'airlock']
  const completedOuterParts = outerHabitatParts.every((part) => mission.placedHabitatParts.includes(part))
  const bedInstalled = mission.placedHabitatParts.includes('bed')
  const radioInstalled = mission.placedHabitatParts.includes('radio-antenna')
  const habitatReady = completedOuterParts && mission.oxygenInstalled && bedInstalled
  const nearHabitat = mission.habitatAnchor !== null &&
    surfaceDistance(
      playerPosition.worldX,
      playerPosition.worldY,
      mission.habitatAnchor.longitude,
      mission.habitatAnchor.latitude,
    ) <= 5
  const radioAvailable = radioInstalled && (insideHabitat || nearHabitat)
  const radioLinkReady = radioAvailable && mission.power >= 2 && powerPlans[mission.powerPlan].communications >= 10

  const toggleMusic = useCallback(async () => {
    const audio = musicAudio.current
    if (!audio) return
    if (musicEnabled) {
      audio.pause()
      audio.currentTime = 0
      setMusicEnabled(false)
      setMusicError(null)
      return
    }

    try {
      const tracks = [
        { name: 'Sci-Fi 1', src: sciFiTrackOne },
        { name: 'Sci-Fi 2', src: sciFiTrackTwo },
      ]
      const selectedTrack = tracks[Math.floor(Math.random() * tracks.length)]
      audio.src = selectedTrack.src
      await audio.play()
      setMusicTrackName(selectedTrack.name)
      setMusicEnabled(true)
      setMusicError(null)
    } catch {
      setMusicEnabled(false)
      setMusicError('The soundtrack could not be played. Check browser audio settings and try again.')
    }
  }, [musicEnabled])

  useEffect(() => {
    const audio = musicAudio.current
    if (audio) audio.volume = 0.4
    return () => audio?.pause()
  }, [])

  useEffect(() => {
    const audio = marsAmbientAudio.current
    if (!audio) return
    if (screen !== 'surface' || mission.planet !== 'Mars') {
      audio.pause()
      audio.currentTime = 0
      return
    }

    audio.volume = 0.28
    let timer: number | null = null
    let stopped = false
    const scheduleNextClip = () => {
      timer = window.setTimeout(() => {
        timer = null
        if (stopped) return
        audio.currentTime = 0
        void audio.play().then(() => {
          if (!stopped) setMarsAmbientError(null)
        }).catch(() => {
          if (stopped) return
          setMarsAmbientError('Mars ambience could not play. Check your browser audio settings.')
          scheduleNextClip()
        })
      }, 45_000 + Math.random() * 45_000)
    }
    const handleClipEnded = () => {
      if (!stopped) scheduleNextClip()
    }

    audio.addEventListener('ended', handleClipEnded)
    scheduleNextClip()
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
      audio.removeEventListener('ended', handleClipEnded)
      audio.pause()
      audio.currentTime = 0
    }
  }, [screen, mission.planet])

  const startJump = useCallback(() => {
    if (jumpTimer.current !== null) return
    setJumping(true)
    jumpTimer.current = window.setTimeout(() => {
      setJumping(false)
      jumpTimer.current = null
    }, 2200)
  }, [])

  const moveSurfacePlayer = useCallback((dx: number, dy: number) => {
    let x = playerPosition.x + dx * 2.2
    let y = playerPosition.y + dy * 2.2
    const worldX = ((playerPosition.worldX + dx * 0.25 + 180 + 360) % 360) - 180
    const worldY = clamp(playerPosition.worldY + dy * 0.15, -89.5, 89.5)
    const nextMapCenter = {
      x: clamp(Math.round(worldX / 8) * 8, -172, 172),
      y: clamp(Math.round(worldY / 4) * 4, -86, 86),
    }

    if (x >= 96) {
      x = 4
    } else if (x <= 4) {
      x = 96
    }

    if (y >= 82) {
      y = 12
    } else if (y <= 12) {
      y = 82
    }

    setPlayerPosition({ x, y, worldX, worldY })
    setExplorationRoute((route) => {
      const previous = route[route.length - 1]
      if (previous && Math.hypot((worldX - previous.longitude) * Math.cos(worldY * Math.PI / 180), worldY - previous.latitude) < 0.02) {
        return route
      }
      return [...route.slice(-1999), { longitude: worldX, latitude: worldY }]
    })
    setInteractionMessage('')
    if (nextMapCenter.x !== mapCenter.x || nextMapCenter.y !== mapCenter.y) setMapCenter(nextMapCenter)
  }, [mapCenter, playerPosition])

  const startSurfaceMove = (key: string) => {
    if (movementTimer.current !== null) window.clearInterval(movementTimer.current)
    const move = () => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    move()
    movementTimer.current = window.setInterval(move, 140)
  }

  const stopSurfaceMove = () => {
    if (movementTimer.current !== null) {
      window.clearInterval(movementTimer.current)
      movementTimer.current = null
    }
  }

  useEffect(() => () => {
    if (movementTimer.current !== null) window.clearInterval(movementTimer.current)
    if (jumpTimer.current !== null) window.clearTimeout(jumpTimer.current)
  }, [])

  function beginMission(planet: Planet, siteId = baseSites[planet][0].id) {
    const state = createMissionState(planet, siteId)
    const landingSite = getCurrentSite(planet, state.siteId)
    setSelectedPlanet(planet)
    setMission(state)
    setLaunchTimer(5)
    setSpaceProgress(0)
    setReturningToEarth(false)
    setResult(null)
    setInventoryOpen(false)
    setInsideHabitat(false)
    setInteractionMessage('')
    setLearningOpen(false)
    setActiveOperation(null)
    setOperationProgress(0)
    setOperationStage(null)
    setActivityStep(0)
    setSelectedRepairSystem(null)
    setRadioReport('')
    setEarthReply('')
    setRadioOpen(false)
    setRadioDraft('')
    setRadioMessages([])
    setRadioPending(false)
    baseRadioMessageId.current = 0
    setPlayerPosition({ x: 50, y: 46, worldX: landingSite.longitude, worldY: landingSite.latitude })
    setMapCenter({
      x: clamp(Math.round(landingSite.longitude / 8) * 8, -172, 172),
      y: clamp(Math.round(landingSite.latitude / 4) * 4, -86, 86),
    })
    setExplorationRoute([{ longitude: landingSite.longitude, latitude: landingSite.latitude }])
    setFieldMapMarkers([])
    setFieldMapOpen(false)
    setFieldMapMarkerName('')
    nextMapMarkerId.current = 0
    setScreen('launch')
  }

  const addFieldMapMarker = (name: string, location: MapLocation, kind: FieldMapMarker['kind']) => {
    setFieldMapMarkers((markers) => [
      ...markers,
      {
        id: ++nextMapMarkerId.current,
        name,
        longitude: location.longitude,
        latitude: location.latitude,
        kind,
      },
    ])
  }

  const interactAtStation = useCallback(() => {
    if (!shipBoarded && !crewBoarding) {
      setStationDoorOpen(true)
      setBoardingProgress(0)
      setCrewBoarding(true)
      setStationStatus('Airlock cycling · Crew member exiting the station')
    } else if (shipBoarded) {
      beginMission(selectedPlanet, mission.siteId)
    }
  }, [crewBoarding, shipBoarded, selectedPlanet, mission.siteId])

  useEffect(() => {
    if (!crewBoarding) return

    const duration = 6500
    let frame = 0
    const startedAt = performance.now()
    const animateBoarding = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      setBoardingProgress(progress * 100)
      if (progress < 1) {
        frame = window.requestAnimationFrame(animateBoarding)
        return
      }

      setCrewBoarding(false)
      setShipBoarded(true)
      setStationStatus('Crew aboard · Cabin pressure nominal · Flight systems ready')
    }

    frame = window.requestAnimationFrame(animateBoarding)
    return () => window.cancelAnimationFrame(frame)
  }, [crewBoarding])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isSpace = event.code === 'Space'
      const dx = key === 'arrowright' || key === 'd' ? 1 : key === 'arrowleft' || key === 'a' ? -1 : 0
      const dy = key === 'arrowup' || key === 'w' ? 1 : key === 'arrowdown' || key === 's' ? -1 : 0

      if (screen === 'earth') {
        if (dx !== 0 || dy !== 0 || isSpace || key === 'e' || key === 'enter') event.preventDefault()
        if (dx !== 0) {
          setStationX((x) => clamp(x + dx * 2.2, 4, stationDoorOpen ? 95 : 61))
        }
        if (dy !== 0) setStationDepth((depth) => clamp(depth + dy * 0.35, -3, 3))
        if (isSpace && !event.repeat) startJump()
        if ((key === 'e' || key === 'enter') && !event.repeat) interactAtStation()
        return
      }

      if (screen !== 'surface' || inventoryOpen || radioOpen || insideHabitat || activeOperation) return
      if (dx !== 0 || dy !== 0 || isSpace) event.preventDefault()

      if (dx !== 0 || dy !== 0) {
        moveSurfacePlayer(dx, dy)
      }

      if (isSpace && !event.repeat) startJump()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [screen, stationX, stationDoorOpen, shipBoarded, selectedPlanet, interactAtStation, inventoryOpen, radioOpen, insideHabitat, activeOperation, moveSurfacePlayer, startJump])

  useEffect(() => {
    if (screen !== 'launch') return

    const timer = window.setInterval(() => {
    setLaunchTimer((current) => {
      if (current <= 1) {
        window.clearInterval(timer)
        setScreen('space')
        setSpaceProgress(0)
        return 0
      }
      return current - 1
    })
    }, 700)

    return () => window.clearInterval(timer)
  }, [screen])

  useEffect(() => {
    if (screen !== 'space') return

    const timer = window.setInterval(() => {
    setSpaceProgress((current) => {
      if (current >= 100) {
        window.clearInterval(timer)
        setSpaceProgress(0)
        setScreen('landing')
        return 0
      }
      return current + 10
    })
    }, 500)

    return () => window.clearInterval(timer)
  }, [screen])

  useEffect(() => {
    if (screen !== 'landing') return

    const timer = window.setInterval(() => {
      setSpaceProgress((current) => {
        if (current >= 100) {
          window.clearInterval(timer)
          if (returningToEarth) setScreen('summary')
          else setScreen('surface')
          return 100
        }
        return current + 10
      })
    }, 350)

    return () => window.clearInterval(timer)
  }, [screen, returningToEarth])

  const currentSite = getCurrentSite(mission.planet, mission.siteId)
  const terrainBackground = getTerrainUrl(mission.planet, mapCenter.x, mapCenter.y)
  const activeRepairSystem = repairSystems.find((system) => system.id === selectedRepairSystem)
  const activeWorkSteps = activeOperation ? workSteps[activeOperation] ?? [] : []
  const nearbyDeposit = mission.resourceDeposits
    .filter((deposit) => deposit.remaining > 0)
    .map((deposit) => ({
      deposit,
      distance: surfaceDistance(playerPosition.worldX, playerPosition.worldY, deposit.longitude, deposit.latitude),
    }))
    .filter(({ distance }) => distance <= 2.8)
    .sort((a, b) => a.distance - b.distance)[0]?.deposit
  const surfaceMovementDisabled = inventoryOpen || radioOpen || fieldMapOpen || Boolean(activeOperation)
  const missionObjectives = [
    { label: 'Safe sols', complete: mission.safeSolStreak >= MISSION_SUCCESS_SAFE_SOLS, value: `${mission.safeSolStreak}/${MISSION_SUCCESS_SAFE_SOLS}` },
    { label: 'Build the base', complete: mission.habitat >= 2, value: mission.habitat >= 2 ? 'Operational' : 'First goal' },
    { label: 'Science', complete: mission.science >= 80, value: `${mission.science}%` },
    { label: 'Power', complete: mission.power >= 45, value: `${mission.power}%` },
    { label: 'Farm', complete: mission.farmBuilt, value: mission.farmBuilt ? 'Built' : 'Missing' },
    { label: 'Shielding', complete: mission.shielding >= 25, value: `${mission.shielding}%` },
  ]
  const missionControlReport = [
    { label: 'Power plan', value: powerPlans[mission.powerPlan].label },
    { label: 'Life support', value: `${mission.oxygenInstalled ? `${habitatPartLabel('oxygen-recycler', mission.planet)} online` : 'No oxygen generator'} · ${mission.oxygen}% O₂ / ${mission.water}% water` },
    { label: 'Crew health', value: `${mission.health}%` },
    { label: 'Radiation risk', value: `${mission.radiationRisk} pts` },
    { label: 'Science output', value: `${mission.science}%` },
    { label: 'Food status', value: `${mission.food}% / ${mission.inventory.food} rations` },
  ]

  const commitMissionProgress = useCallback((next: MissionState) => {
    const tracked = trackSurvivalSol(next)
    setMission(tracked)
    const outcome = getMissionOutcome(tracked)
    if (outcome) {
      setResult(outcome)
      setScreen('summary')
    }
  }, [])

  const installEnergyAsset = useCallback((asset: EnergyAsset) => {
    const specification = energyAssets[asset]
    const currentCount = asset === 'solar' ? mission.solarPanels : asset === 'reactor' ? mission.nuclearReactors : mission.rtgUnits
    if (activeOperation || currentCount >= specification.limit || !hasParts(mission.inventory, specification.cost)) return

    const timed = advanceMissionHours(mission, 4)
    const inventory = { ...timed.inventory }
    for (const part of Object.keys(specification.cost) as (keyof Inventory)[]) {
      inventory[part] -= specification.cost[part] ?? 0
    }
    const next: MissionState = {
      ...timed,
      inventory,
      solarPanels: timed.solarPanels + (asset === 'solar' ? 1 : 0),
      nuclearReactors: timed.nuclearReactors + (asset === 'reactor' ? 1 : 0),
      rtgUnits: timed.rtgUnits + (asset === 'rtg' ? 1 : 0),
      logs: [`Installed ${specification.label}; power generation increased.`, ...timed.logs].slice(0, 7),
    }
    commitMissionProgress(next)
  }, [mission, activeOperation, commitMissionProgress])

  const expandBase = useCallback(() => {
    if (activeOperation || mission.baseExpansions >= 3 || !hasParts(mission.inventory, baseExpansionCost)) return
    const timed = advanceMissionHours(mission, 6)
    const inventory = { ...timed.inventory }
    for (const part of Object.keys(baseExpansionCost) as (keyof Inventory)[]) {
      inventory[part] -= baseExpansionCost[part] ?? 0
    }
    commitMissionProgress({
      ...timed,
      inventory,
      baseExpansions: timed.baseExpansions + 1,
      logs: ['Habitat expansion module installed beside the outpost.', ...timed.logs].slice(0, 7),
    })
  }, [mission, activeOperation, commitMissionProgress])

  const returnToEarth = useCallback(() => {
    if (activeOperation) return
    setReturningToEarth(true)
    setResult(isCrewSafe(mission) ? 'success' : 'failure')
    setLaunchTimer(5)
    setSpaceProgress(0)
    setScreen('launch')
  }, [activeOperation, mission])

  const setSite = (planet: Planet, siteId: string) => {
    setSelectedPlanet(planet)
    setMission((previous) => ({ ...previous, planet, siteId }))
  }

  const placeHabitatPart = useCallback((part: HabitatPart) => {
    if (mission.habitatKits[part] < 1) return

    const installed = mission.placedHabitatParts
    const outerParts: HabitatPart[] = ['foundation', 'pressure-shell', 'airlock']
    if (outerParts.includes(part)) {
      const nextOuterPart = outerParts.find((item) => !installed.includes(item))
      const canPlaceAtAnchor = mission.habitatAnchor === null || nearHabitat
      if (insideHabitat || !canPlaceAtAnchor || part !== nextOuterPart) {
        setInteractionMessage('That part does not attach here yet. It stays in your pack.')
        return
      }

      const anchor = mission.habitatAnchor ?? {
        longitude: playerPosition.worldX,
        latitude: playerPosition.worldY,
      }
      const nextParts = [...installed, part]
      const nextHabitat = outerParts.every((item) => nextParts.includes(item)) ? 2 : 1
      const timed = advanceMissionHours(mission, 1)
      commitMissionProgress({
        ...timed,
        habitatAnchor: anchor,
        habitat: nextHabitat,
        placedHabitatParts: nextParts,
        habitatKits: { ...mission.habitatKits, [part]: mission.habitatKits[part] - 1 },
        logs: [`${habitatPartLabel(part, mission.planet)} deployed at the outpost.`, ...timed.logs].slice(0, 7),
      })
      setInteractionMessage(`${habitatPartLabel(part, mission.planet)} deployed.`)
      return
    }

    if (part === 'radio-antenna') {
      if (insideHabitat || !completedOuterParts || !nearHabitat || installed.includes(part)) {
        setInteractionMessage('The radio antenna can only be deployed outside beside the completed base.')
        return
      }

      const timed = advanceMissionHours(mission, 1)
      commitMissionProgress({
        ...timed,
        placedHabitatParts: [...installed, part],
        habitatKits: { ...mission.habitatKits, [part]: mission.habitatKits[part] - 1 },
        logs: ['Radio antenna deployed for satellite relay and Earth communications.', ...timed.logs].slice(0, 7),
      })
      setInteractionMessage('Radio antenna deployed. Open the radio console near the base to contact Earth.')
      return
    }

    if (!insideHabitat || !completedOuterParts || installed.includes(part)) {
      setInteractionMessage('This equipment can only be installed inside a completed habitat.')
      return
    }

    const timed = advanceMissionHours(mission, 1)
    commitMissionProgress({
      ...timed,
      oxygenInstalled: mission.oxygenInstalled || part === 'oxygen-recycler',
      placedHabitatParts: [...mission.placedHabitatParts, part],
      habitatKits: { ...mission.habitatKits, [part]: mission.habitatKits[part] - 1 },
      oxygen: part === 'oxygen-recycler' ? clamp(timed.oxygen + 15, 0, 100) : timed.oxygen,
      logs: [`${habitatPartLabel(part, mission.planet)} installed inside the habitat.`, ...timed.logs].slice(0, 7),
    })
    setInteractionMessage(`${habitatPartLabel(part, mission.planet)} installed inside the habitat.`)
  }, [mission, nearHabitat, insideHabitat, completedOuterParts, playerPosition, commitMissionProgress])

  const enterHabitat = useCallback(() => {
    if (insideHabitat) return
    if (!completedOuterParts) {
      setInteractionMessage('Build the foundation, pressure shell, and airlock before entering the base.')
      return
    }
    if (!nearHabitat) {
      setInteractionMessage('Move closer to the base airlock to enter.')
      return
    }
    setInventoryOpen(false)
    setLearningOpen(false)
    setRadioOpen(false)
    setFieldMapOpen(false)
    setInsideHabitat(true)
    setInteractionMessage('Entered the habitat.')
  }, [completedOuterParts, nearHabitat, insideHabitat])

  const interactAtSurface = useCallback(() => {
    if (insideHabitat) {
      setInsideHabitat(false)
      setInteractionMessage('You are back outside the habitat.')
      return
    }
    const nearbyDeposit = mission.resourceDeposits
      .filter((deposit) => deposit.remaining > 0)
      .map((deposit) => ({
        deposit,
        distance: surfaceDistance(playerPosition.worldX, playerPosition.worldY, deposit.longitude, deposit.latitude),
      }))
      .filter(({ distance }) => distance <= 2.8)
      .sort((a, b) => a.distance - b.distance)[0]?.deposit

    if (nearbyDeposit) {
      if (mission.inventory.tools < 1) {
        setInteractionMessage('No serviceable tool is available for extraction.')
        return
      }
      const timed = advanceMissionHours(mission, 1)
      const resourceDeposits = timed.resourceDeposits.map((deposit) =>
        deposit.id === nearbyDeposit.id
          ? { ...deposit, remaining: Math.max(0, deposit.remaining - 1) }
          : deposit,
      )
      const inventory = { ...timed.inventory }
      let water = timed.water
      let science = timed.science
      if (nearbyDeposit.kind === 'metal') inventory.metal += 1
      if (nearbyDeposit.kind === 'ice') {
        inventory.ice += 1
        water = clamp(water + 3, 0, 100)
      }
      if (nearbyDeposit.kind === 'regolith') inventory.regolith += 2
      if (nearbyDeposit.kind === 'hydrated-mineral') {
        inventory.regolith += 1
        science = clamp(timed.science + 2, 0, 100)
      }
      commitMissionProgress({
        ...timed,
        science,
        water,
        inventory,
        resourceDeposits,
        power: clamp(timed.power - 2, 0, 100),
        logs: [`Extracted ${resourceLabels[nearbyDeposit.kind]} from the surface.`, ...timed.logs].slice(0, 7),
      })
      setInteractionMessage(`Extracted ${resourceLabels[nearbyDeposit.kind]}.`)
      return
    }

    if (completedOuterParts && nearHabitat) {
      enterHabitat()
      return
    }
    setInteractionMessage('Nothing close enough to interact with.')
  }, [insideHabitat, mission, playerPosition, completedOuterParts, nearHabitat, commitMissionProgress, enterHabitat])

  const digAtPlayer = useCallback(() => {
    if (insideHabitat) return
    if (mission.inventory.tools < 1) {
      setInteractionMessage('No serviceable tool is available for excavation.')
      return
    }

    const longitude = Math.round(playerPosition.worldX * 100) / 100
    const latitude = Math.round(playerPosition.worldY * 100) / 100
    const id = `excavation-${longitude.toFixed(2)}-${latitude.toFixed(2)}`
    const previousHole = mission.excavations.find((hole) => hole.id === id)

    const depth = (previousHole?.depth ?? 0) + 1
    const discovery = depth === 2
      ? mission.planet === 'Moon' ? 'A deeper regolith layer was exposed.' : 'Iron-rich material was exposed.'
      : depth === 3 ? 'A buried water-ice layer was exposed.'
        : depth === 4 ? mission.planet === 'Mars' ? 'Hydrated minerals were found in the sediment.' : 'A compact mineral layer was exposed.'
          : ''
    const timed = advanceMissionHours(mission, 1)
    const excavations = previousHole
      ? timed.excavations.map((hole) => hole.id === id ? { ...hole, depth } : hole)
      : [...timed.excavations, { id, longitude, latitude, depth }]
    const inventory = { ...timed.inventory }
    let water = timed.water
    if (depth === 2) {
      if (mission.planet === 'Moon') inventory.regolith += 2
      else inventory.metal += 1
    } else if (depth === 3) {
      inventory.ice += 1
      water = clamp(water + 3, 0, 100)
    } else if (depth === 4) {
      inventory.regolith += 2
    }
    const diggingMode = depth > HAND_DIG_LIMIT ? 'Machine drilling' : 'Hand digging'
    const interactionUpdate = depth === HAND_DIG_LIMIT
      ? 'Hand digging limit reached. Machine digger ready—press G to drill much deeper.'
      : depth > HAND_DIG_LIMIT
        ? `Machine digger drilling at depth ${depth} m.${discovery ? ` ${discovery}` : ''}`
        : discovery || `Hand-dug test pit reached depth ${depth} m.`
    commitMissionProgress({
      ...timed,
      inventory,
      water,
      excavations,
      power: clamp(timed.power - 3, 0, 100),
      logs: [`${diggingMode} depth ${depth}: ${discovery || 'subsurface material examined.'}`, ...timed.logs].slice(0, 7),
    })
    setInteractionMessage(interactionUpdate)
  }, [insideHabitat, mission, playerPosition, commitMissionProgress])

  const performAction = useCallback((action: TaskAction) => {
    const descriptions: Record<TaskAction, string> = {
      repair: `Field repair complete: ${repairSystems.find((system) => system.id === selectedRepairSystem)?.label ?? 'system'} restored.`,
      science: 'Sample analysis complete: science data recorded.',
      rest: 'Crew rest period complete.',
      food: 'Ration preparation complete.',
      shield: 'Radiation shield layers installed around the crew area.',
      farm: 'Food growing system installed and seeds planted.',
    }
    let next: MissionState = {
      ...mission,
      inventory: { ...mission.inventory },
    }

    switch (action) {
      case 'repair':
        if (!selectedRepairSystem) {
          return
        }
        next.repairedSystems = [...next.repairedSystems, selectedRepairSystem]
        if (selectedRepairSystem === 'power-converter') next.power = clamp(next.power + 12, 0, 100)
        if (selectedRepairSystem === 'ascent-vehicle') next.fuel = clamp(next.fuel + 10, 0, 100)
        break
      case 'science':
        if (next.inventory.ice < 1 || next.power < 6) {
          next.logs = ['Sample analysis paused: sample or power unavailable.', ...next.logs].slice(0, 7)
          setMission(next)
          return
        }
        next.inventory.ice -= 1
        next.science = clamp(next.science + 16, 0, 100)
        next.power = clamp(next.power - 6, 0, 100)
        break
      case 'rest':
        next.health = clamp(next.health + 10, 0, 100)
        next.oxygen = clamp(next.oxygen + 5, 0, 100)
        break
      case 'food':
        if (next.inventory.food < 1) {
          next.logs = ['Ration preparation paused: stored food is depleted.', ...next.logs].slice(0, 7)
          setMission(next)
          return
        }
        next.inventory.food -= 1
        next.food = clamp(next.food + 15, 0, 100)
        next.water = clamp(next.water + 4, 0, 100)
        break
      case 'shield':
        next.inventory.regolith -= 3
        next.shielding = clamp(next.shielding + 25, 0, 100)
        next.power = clamp(next.power - 8, 0, 100)
        break
      case 'farm':
        next.inventory.seeds -= 1
        next.inventory.metal -= 1
        next.inventory.wires -= 1
        next.farmBuilt = true
        next.power = clamp(next.power - 10, 0, 100)
        break
      default:
        break
    }

    const duration = operationDetails[action].hours
    next.hours += duration
    next.days = Math.floor(next.hours / 24) + 1
    next.oxygen = clamp(next.oxygen - Math.ceil(duration / 6), 0, 100)
    next.water = clamp(next.water - Math.ceil(duration / 6), 0, 100)
    next.food = clamp(next.food - Math.ceil(duration / 8), 0, 100)
    next.power = clamp(next.power - Math.ceil(duration / 8), 0, 100)
    for (let sol = mission.days; sol < next.days; sol += 1) {
      next = resolveSolSystems(next, sol)
    }
    if (next.oxygen < 30 || next.water < 25 || next.food < 25) {
      next.health = clamp(next.health - 3, 0, 100)
    }
    next.logs = [`${descriptions[action]} · ${duration} h`, ...next.logs].slice(0, 7)
    next = trackSurvivalSol(next)

    setMission(next)

    const outcome = getMissionOutcome(next)
    if (outcome) {
      setResult(outcome)
      setScreen('summary')
    }
  }, [mission, selectedRepairSystem])

  const startSleep = useCallback(() => {
    if (!insideHabitat || !bedInstalled || activeOperation) return
    setActiveOperation('rest')
    setOperationStage('resting')
    setOperationProgress(0)
    setInteractionMessage('Crew sleep cycle started.')
  }, [insideHabitat, bedInstalled, activeOperation])

  useEffect(() => {
    if (screen !== 'surface') return
    const handleSurfaceInteraction = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      if (inventoryOpen || radioOpen || fieldMapOpen || activeOperation) return
      const key = event.key.toLowerCase()
      if (key === 'e') {
        event.preventDefault()
        if (!event.repeat) interactAtSurface()
      } else if (key === 'g') {
        event.preventDefault()
        if (!event.repeat) digAtPlayer()
      } else if (key === 'h') {
        event.preventDefault()
        if (!event.repeat) enterHabitat()
      } else if (key === 'z' && insideHabitat) {
        event.preventDefault()
        if (!event.repeat) startSleep()
      }
    }
    window.addEventListener('keydown', handleSurfaceInteraction)
    return () => window.removeEventListener('keydown', handleSurfaceInteraction)
  }, [screen, inventoryOpen, radioOpen, fieldMapOpen, activeOperation, insideHabitat, interactAtSurface, digAtPlayer, enterHabitat, startSleep])

  const endCurrentSol = () => {
    if (activeOperation) return
    const solNumber = mission.days
    const hoursToNextSol = 24 - (mission.hours % 24)
    let next: MissionState = {
      ...mission,
      hours: mission.hours + hoursToNextSol,
      days: mission.days + 1,
      inventory: { ...mission.inventory },
    }
    next = resolveSolSystems(next, solNumber)
    next = trackSurvivalSol(next)
    setMission(next)
    const outcome = getMissionOutcome(next)
    if (outcome) {
      setResult(outcome)
      setScreen('summary')
    }
  }

  const startOperation = useCallback((action: TaskAction) => {
    if (activeOperation) return

    const blockReason = getActionBlockReason(action, mission)
    if (blockReason) {
      setMission((previous) => ({ ...previous, logs: [blockReason, ...previous.logs].slice(0, 7) }))
      return
    }

    setOperationProgress(0)
    setActivityStep(0)
    setSelectedRepairSystem(null)
    setRadioReport('')
    setEarthReply('')
    setOperationStage(
      action === 'repair' ? 'repair-target' :
        action === 'rest' ? 'resting' : 'work',
    )
    setActiveOperation(action)
  }, [activeOperation, mission])

  const advanceActivity = () => {
    if (!activeOperation || operationStage !== 'work') return
    const steps = workSteps[activeOperation] ?? []
    const nextStep = Math.min(activityStep + 1, steps.length)
    setActivityStep(nextStep)
    setOperationProgress((nextStep / steps.length) * 100)
    if (nextStep === steps.length) setOperationStage('report')
  }

  const selectRepairSystem = (systemId: RepairSystemId) => {
    const system = repairSystems.find((item) => item.id === systemId)
    if (!system || mission.repairedSystems.includes(systemId) || !hasParts(mission.inventory, system.parts)) return
    setSelectedRepairSystem(systemId)
    setActivityStep(0)
    setOperationProgress(0)
    setOperationStage('repair-parts')
  }

  const retrieveRepairParts = () => {
    const system = repairSystems.find((item) => item.id === selectedRepairSystem)
    if (!system || operationStage !== 'repair-parts' || !hasParts(mission.inventory, system.parts)) return
    setMission((previous) => {
      const inventory = { ...previous.inventory }
      for (const part of Object.keys(system.parts) as (keyof Inventory)[]) {
        inventory[part] -= system.parts[part] ?? 0
      }
      return { ...previous, inventory }
    })
    setActivityStep(0)
    setOperationProgress(0)
    setOperationStage('repair-work')
  }

  const advanceRepair = () => {
    const system = repairSystems.find((item) => item.id === selectedRepairSystem)
    if (!system || operationStage !== 'repair-work') return
    const nextStep = Math.min(activityStep + 1, system.steps.length)
    setActivityStep(nextStep)
    setOperationProgress((nextStep / system.steps.length) * 100)
    if (nextStep === system.steps.length) setOperationStage('report')
  }

  const sendRadioReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!radioReport.trim() || operationStage !== 'report') return
    setEarthReply('')
    const baseDelay = mission.planet === 'Moon' ? 2600 : 6000
    setRadioDelayMs(baseDelay * (powerPlans[mission.powerPlan].communications < 20 ? 2 : 1))
    setOperationStage('awaiting-ack')
  }

  const sendBaseRadioMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = radioDraft.trim()
    if (!text || !radioLinkReady || radioPending) return

    const message = { id: ++baseRadioMessageId.current, sender: 'Crew' as const, text }
    const communicationsShare = powerPlans[mission.powerPlan].communications
    const replyDelay = mission.planet === 'Moon' ? 1800 : 4200
    setRadioMessages((messages) => [...messages, message].slice(-20))
    setRadioDraft('')
    setRadioPending(true)
    setBaseRadioDelayMs(replyDelay * (communicationsShare < 20 ? 2 : 1))
    commitMissionProgress({
      ...mission,
      power: clamp(mission.power - 1, 0, 100),
      logs: ['Crew transmitted a message to Earth through the satellite relay.', ...mission.logs].slice(0, 7),
    })
  }

  const acknowledgeEarth = () => {
    if (!activeOperation || !earthReply) return
    performAction(activeOperation)
    setActiveOperation(null)
    setOperationStage(null)
    setOperationProgress(0)
    setActivityStep(0)
  }

  useEffect(() => {
    if (screen !== 'surface' || activeOperation !== 'rest' || operationStage !== 'resting') return
    const startedAt = Date.now()
    const duration = operationDetails.rest.hours * 1000
    const timer = window.setInterval(() => {
      const progress = Math.min(100, ((Date.now() - startedAt) / duration) * 100)
      setOperationProgress(progress)
      if (progress >= 100) {
        window.clearInterval(timer)
        performAction('rest')
        setActiveOperation(null)
        setOperationStage(null)
      }
    }, 100)

    return () => window.clearInterval(timer)
  }, [screen, activeOperation, operationStage, performAction])

  useEffect(() => {
    if (operationStage !== 'awaiting-ack' || !activeOperation) return
    const reply = window.setTimeout(() => {
      setEarthReply(`OK. Copy that. ${operationDetails[activeOperation].label} report received and logged.`)
    }, radioDelayMs)
    return () => window.clearTimeout(reply)
  }, [operationStage, activeOperation, radioDelayMs])

  useEffect(() => {
    if (!radioPending) return
    const reply = window.setTimeout(() => {
      const crewMessage = [...radioMessages].reverse().find((message) => message.sender === 'Crew')
      setRadioMessages((messages) => [
        ...messages,
        {
          id: ++baseRadioMessageId.current,
          sender: 'Mission Control AI' as const,
          text: createMissionControlReply(crewMessage?.text ?? '', mission),
        },
      ].slice(-20))
      setRadioPending(false)
    }, baseRadioDelayMs)
    return () => window.clearTimeout(reply)
  }, [radioPending, baseRadioDelayMs, mission, radioMessages])

  useEffect(() => {
    if (screen !== 'surface') return

    const handleInventoryAndTaskKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'i') {
        event.preventDefault()
        if (event.repeat) return
        setLearningOpen(false)
        setRadioOpen(false)
        setInventoryOpen((open) => !open)
        return
      }
      if (key === 'escape') {
        setInventoryOpen(false)
        setLearningOpen(false)
        setRadioOpen(false)
        setFieldMapOpen(false)
        return
      }
    }

    window.addEventListener('keydown', handleInventoryAndTaskKeys)
    return () => window.removeEventListener('keydown', handleInventoryAndTaskKeys)
  }, [screen])

  const restartEarth = () => {
    setScreen('earth')
    setResult(null)
    setReturningToEarth(false)
    const siteId = mission.planet === selectedPlanet ? mission.siteId : baseSites[selectedPlanet][0].id
    setMission(createMissionState(selectedPlanet, siteId))
    setStationX(46)
    setStationDepth(0)
    setStationDoorOpen(false)
    setShipBoarded(false)
    setCrewBoarding(false)
    setBoardingProgress(0)
    setInventoryOpen(false)
    setInsideHabitat(false)
    setInteractionMessage('')
    setLearningOpen(false)
    setActiveOperation(null)
    setOperationProgress(0)
    setOperationStage(null)
    setActivityStep(0)
    setSelectedRepairSystem(null)
    setRadioReport('')
    setEarthReply('')
    setRadioOpen(false)
    setRadioDraft('')
    setRadioMessages([])
    setRadioPending(false)
    baseRadioMessageId.current = 0
    setStationStatus('Station secure · Airlock sealed · Vehicle on standby')
  }

  const summaryText = result === 'success'
    ? isMissionSuccessful(mission)
      ? `The ${selectedPlanet} crew returned to Earth after ${MISSION_SUCCESS_SAFE_SOLS} consecutive safe sols.`
      : `The ${selectedPlanet} crew made a safe early return to Earth with every survival reading at or above ${SURVIVAL_THRESHOLD}%.`
    : returningToEarth
      ? `The ${selectedPlanet} crew returned to Earth, but at least one survival reading was below ${SURVIVAL_THRESHOLD}%.`
      : `The ${selectedPlanet} mission ended because health, oxygen, water, food, and power were all below ${SURVIVAL_THRESHOLD}%.`

  const successReasons = [
    isMissionSuccessful(mission)
      ? `The crew maintained all five survival readings at or above ${SURVIVAL_THRESHOLD}% for ${mission.safeSolStreak} consecutive sols.`
      : `The crew returned early with health, oxygen, water, food, and power all at or above ${SURVIVAL_THRESHOLD}%.`,
    `Final readings — health ${mission.health}%, oxygen ${mission.oxygen}%, water ${mission.water}%, food ${mission.food}%, power ${mission.power}%.`,
  ]

  const failureReasons = [
    returningToEarth
      ? `The crew returned before all five readings were safe: health ${mission.health}%, oxygen ${mission.oxygen}%, water ${mission.water}%, food ${mission.food}%, power ${mission.power}%.`
      : `All five survival readings fell below ${SURVIVAL_THRESHOLD}%: health ${mission.health}%, oxygen ${mission.oxygen}%, water ${mission.water}%, food ${mission.food}%, and power ${mission.power}%.`,
  ]

  const missionOutcomeReasons = result === 'success' ? successReasons : failureReasons
  const fieldMapLocations = [
    ...explorationRoute,
    { longitude: playerPosition.worldX, latitude: playerPosition.worldY },
    ...fieldMapMarkers,
  ]
  const relativeMapLongitude = (longitude: number) =>
    ((longitude - currentSite.longitude + 540) % 360) - 180
  const mapLongitudes = fieldMapLocations.map((location) => relativeMapLongitude(location.longitude))
  const mapLatitudes = fieldMapLocations.map((location) => location.latitude)
  const mapMinLongitude = Math.min(...mapLongitudes)
  const mapMaxLongitude = Math.max(...mapLongitudes)
  const mapMinLatitude = Math.min(...mapLatitudes)
  const mapMaxLatitude = Math.max(...mapLatitudes)
  const mapLongitudeSpan = Math.max(mapMaxLongitude - mapMinLongitude, 0.05)
  const mapLatitudeSpan = Math.max(mapMaxLatitude - mapMinLatitude, 0.05)
  const projectMapPoint = (location: MapLocation) => ({
    x: 24 + ((relativeMapLongitude(location.longitude) - mapMinLongitude) / mapLongitudeSpan) * 432,
    y: 24 + ((mapMaxLatitude - location.latitude) / mapLatitudeSpan) * 272,
  })
  const mapRoutePath = explorationRoute.reduce((path, location, index) => {
    const point = projectMapPoint(location)
    const previous = explorationRoute[index - 1]
    const startsNewSegment = previous &&
      Math.abs(relativeMapLongitude(location.longitude) - relativeMapLongitude(previous.longitude)) > 180
    return `${path}${index === 0 || startsNewSegment ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)} `
  }, '')

  return (
    <div className="game-shell">
    <audio
      ref={musicAudio}
      loop
      preload="none"
    />
    <audio
      ref={marsAmbientAudio}
      src={marsMicRecording}
      preload="none"
    />
    {screen === 'earth' && (
      <section className="station-scene">
        <header className="station-header">
            <div className="station-title">
            <p className="eyebrow">International GameLand</p>
            <h1>Frontier One</h1>
          </div>
            <div className="destination-controls">
              <label htmlFor="destination-select">Destination</label>
              <select
                id="destination-select"
                value={selectedPlanet}
                onChange={(event) => {
                  const planet = event.target.value as Planet
                  setSelectedPlanet(planet)
                  setSite(planet, baseSites[planet][0].id)
                }}
              >
                <option value="Moon">Moon</option>
                <option value="Mars">Mars</option>
              </select>
              <select
                aria-label={`${selectedPlanet} landing site`}
                value={mission.planet === selectedPlanet ? mission.siteId : baseSites[selectedPlanet][0].id}
                onChange={(event) => setSite(selectedPlanet, event.target.value)}
              >
                {baseSites[selectedPlanet].map((site) => (
                  <option key={site.id} value={site.id}>{site.label}</option>
                ))}
              </select>
            </div>
            <div className="station-header-tools">
              <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={musicError} onToggle={toggleMusic} />
              <button className="help-button" onClick={() => setHowToOpen(true)}>How to use</button>
            </div>
        </header>

        <main className="station-world" aria-label="Ground-based Earth space station in Canada">
          <Suspense fallback={<div className="journey-scene-3d scene-loading" />}>
            <JourneyScene3D
              screen="earth"
              planet={selectedPlanet}
              progress={0}
              returningToEarth={returningToEarth}
              stationX={stationX}
              stationDepth={stationDepth}
              stationDoorOpen={stationDoorOpen}
              shipBoarded={shipBoarded}
              boardingProgress={boardingProgress}
              jumping={jumping}
              onFirstPersonMove={(dx, dy) => {
                setStationX((x) => clamp(x + dx * 2.2, 4, stationDoorOpen ? 95 : 61))
                setStationDepth((depth) => clamp(depth + dy * 0.35, -3, 3))
              }}
            />
          </Suspense>
        </main>

        <div className="station-controls">
            <div>
              <strong>{stationStatus}</strong>
              <p>Earth space station · Canada · Flight plan: {selectedPlanet} / {getCurrentSite(selectedPlanet, mission.siteId).label}</p>
            </div>
            <button className="primary-button" onClick={interactAtStation} disabled={crewBoarding}>
              {crewBoarding
                ? 'Crew boarding…'
                : shipBoarded
                  ? `Launch to ${selectedPlanet} · E`
                  : 'Open airlock · Board rocket · E'}
            </button>
        </div>

        {howToOpen && (
          <div className="modal-backdrop" onClick={() => setHowToOpen(false)}>
            <section
              className="howto-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="howto-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="howto-heading">
                <div>
                  <p className="eyebrow">Reference</p>
                  <h2 id="howto-title">How to use</h2>
                </div>
                <button className="secondary-button" onClick={() => setHowToOpen(false)}>Close</button>
              </div>
              <dl className="control-list">
                <div><dt>Move / back up</dt><dd>WASD or arrow keys · in first-person, movement follows your view</dd></div>
                <div><dt>Jump</dt><dd>Space</dd></div>
                <div><dt>Camera view</dt><dd>Q toggles first- and third-person; move the mouse to look around in first-person</dd></div>
                <div><dt>Board and launch</dt><dd>Press E or Open airlock to watch the astronaut exit the station and board the rocket, then press Launch to depart</dd></div>
                <div><dt>Inventory on surface</dt><dd>I, or Esc to close</dd></div>
                <div><dt>Field map</dt><dd>Open Field map to see only your explored route; mark the landing site or add named pins at your current location</dd></div>
                <div><dt>Explore</dt><dd>E extracts nearby resources or exits; H enters your habitat; G digs by hand, then starts the machine digger for deep drilling</dd></div>
                <div><dt>Mars microphone recording</dt><dd>A recording plays at random intervals while exploring Mars, even with music enabled</dd></div>
                <div><dt>Build</dt><dd>Open inventory and try placing habitat parts near the landing site</dd></div>
                <div><dt>Mission tasks</dt><dd>Choose any available field activity; no numbered job sequence</dd></div>
                <div><dt>Mission outcome</dt><dd>Return to Earth after 30 consecutive safe sols for full mission success. A safe early return also succeeds; returning with any survival reading below 50% fails. The mission can also fail if all five readings fall below 50% together.</dd></div>
                <div><dt>Crew rest</dt><dd>Install a bed, enter the habitat, and choose Sleep now</dd></div>
              </dl>
              <p>Operations use mission time and supplies. Daily power plans change what life support, communications, science, and food production can do; there is no prescribed task order.</p>
              <p>The archived NASA DONKI event is a historical training example. Radiation-risk points and power units are game-only values, not real astronaut measurements.</p>
            </section>
          </div>
        )}
      </section>
    )}

    {screen === 'launch' && (
      <section className="launch-scene">
        <Suspense fallback={<div className="journey-scene-3d scene-loading" />}>
          <JourneyScene3D
            screen="launch"
            planet={selectedPlanet}
            progress={((5 - launchTimer) / 5) * 100}
            returningToEarth={returningToEarth}
            stationX={stationX}
            stationDepth={stationDepth}
            stationDoorOpen={stationDoorOpen}
            shipBoarded={shipBoarded}
            boardingProgress={boardingProgress}
            jumping={jumping}
          />
        </Suspense>
        <div className="journey-audio-control">
          <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={musicError} onToggle={toggleMusic} />
        </div>
      </section>
    )}

    {screen === 'space' && (
      <section className="space-scene">
        <Suspense fallback={<div className="journey-scene-3d scene-loading" />}>
          <JourneyScene3D
            screen="space"
            planet={selectedPlanet}
            progress={spaceProgress}
            returningToEarth={returningToEarth}
            stationX={stationX}
            stationDepth={stationDepth}
            stationDoorOpen={stationDoorOpen}
            shipBoarded={shipBoarded}
            boardingProgress={boardingProgress}
            jumping={jumping}
          />
        </Suspense>
        <div className="journey-audio-control">
          <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={marsAmbientError ?? musicError} onToggle={toggleMusic} />
        </div>
      </section>
    )}

    {screen === 'landing' && (
      <section className="space-scene">
        <Suspense fallback={<div className="journey-scene-3d scene-loading" />}>
          <JourneyScene3D
            screen="landing"
            planet={selectedPlanet}
            progress={spaceProgress}
            returningToEarth={returningToEarth}
            stationX={stationX}
            stationDepth={stationDepth}
            stationDoorOpen={stationDoorOpen}
            shipBoarded={shipBoarded}
            boardingProgress={boardingProgress}
            jumping={jumping}
          />
        </Suspense>
        <div className="journey-audio-control">
          <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={marsAmbientError ?? musicError} onToggle={toggleMusic} />
        </div>
      </section>
    )}

    {screen === 'surface' && (
      <div className="surface-game">
        <main className="planet-world">
          <Suspense fallback={<div className="surface-3d-scene scene-loading" />}>
            <Surface3DScene
              planet={mission.planet}
              terrainUrl={terrainBackground}
              playerLongitude={playerPosition.worldX}
              playerLatitude={playerPosition.worldY}
              mapCenterLongitude={mapCenter.x}
              mapCenterLatitude={mapCenter.y}
              baseLongitude={currentSite.longitude}
              baseLatitude={currentSite.latitude}
              farmBuilt={mission.farmBuilt}
              solarPanelCount={mission.solarPanels}
              nuclearReactorCount={mission.nuclearReactors}
              rtgCount={mission.rtgUnits}
              baseExpansionCount={mission.baseExpansions}
              shielding={mission.shielding}
              habitatParts={mission.placedHabitatParts}
              habitatAnchor={mission.habitatAnchor}
              resourceDeposits={mission.resourceDeposits}
              excavations={mission.excavations}
              insideHabitat={insideHabitat}
              operation={activeOperation}
              jumping={jumping}
              movementEnabled={!surfaceMovementDisabled}
              onFirstPersonMove={moveSurfacePlayer}
            />
          </Suspense>
          <div className="planet-topbar">
            <div className="planet-location">
              <p className="eyebrow">Landing zone · {mission.planet}</p>
              <h2>{currentSite.label}</h2>
              <a
                href={mission.planet === 'Mars' ? MARS_TREK_PERMALINK : 'https://trek.nasa.gov/moon/'}
                target="_blank"
                rel="noreferrer"
              >
                NASA {mission.planet} Trek dataset
              </a>
            </div>
            <div className="world-coordinates">
              <strong>X {playerPosition.worldX.toFixed(2)}°</strong>
              <strong>Y {playerPosition.worldY.toFixed(2)}°</strong>
              <span>{insideHabitat ? 'Habitat interior · E exit' : 'E extract · H enter · G dig · Q view'}</span>
              <button
                className="inventory-toggle"
                aria-expanded={fieldMapOpen}
                onClick={() => {
                  setInventoryOpen(false)
                  setLearningOpen(false)
                  setRadioOpen(false)
                  setFieldMapOpen((open) => !open)
                }}
              >
                Field map · {explorationRoute.length} fixes
              </button>
              <button
                className="inventory-toggle"
                aria-expanded={inventoryOpen}
                onClick={() => {
                  setLearningOpen(false)
                  setRadioOpen(false)
                  setFieldMapOpen(false)
                  setInventoryOpen((open) => !open)
                }}
              >
                Inventory [I]
              </button>
              <button
                className="inventory-toggle"
                aria-expanded={learningOpen}
                onClick={() => {
                  setInventoryOpen(false)
                  setRadioOpen(false)
                  setFieldMapOpen(false)
                  setLearningOpen((open) => !open)
                }}
              >
                Science notebook
              </button>
              {radioAvailable && (
                <button
                  className="inventory-toggle"
                  aria-expanded={radioOpen}
                  onClick={() => {
                    setInventoryOpen(false)
                    setLearningOpen(false)
                    setFieldMapOpen(false)
                    setRadioOpen((open) => !open)
                  }}
                >
                  Radio · Satellite link
                </button>
              )}
              <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={musicError} onToggle={toggleMusic} />
            </div>
          </div>

          {fieldMapOpen && (
            <section className="field-map-panel" role="dialog" aria-modal="true" aria-labelledby="field-map-title">
              <div className="inventory-title">
                <div>
                  <strong id="field-map-title">{mission.planet.toUpperCase()} FIELD MAP</strong>
                  <p>{explorationRoute.length} location fixes · Unexplored terrain is hidden</p>
                </div>
                <button onClick={() => setFieldMapOpen(false)}>Close</button>
              </div>
              <svg className="field-map-canvas" viewBox="0 0 480 320" role="img" aria-label={`${mission.planet} map showing explored route only`}>
                <defs>
                  <pattern id="field-map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(156, 190, 166, 0.18)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="480" height="320" fill="#121d1b" />
                <rect x="0" y="0" width="480" height="320" fill="url(#field-map-grid)" />
                {mapRoutePath && (
                  <>
                    <path d={mapRoutePath} fill="none" stroke="#647e66" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
                    <path d={mapRoutePath} fill="none" stroke="#b8d78e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
                {explorationRoute.map((location, index) => {
                  const point = projectMapPoint(location)
                  return <circle key={`fix-${index}`} cx={point.x} cy={point.y} r="2.4" fill="#d0e6a3" opacity="0.55" />
                })}
                {fieldMapMarkers.map((marker) => {
                  const point = projectMapPoint(marker)
                  return (
                    <g key={marker.id}>
                      <path d={`M ${point.x} ${point.y - 7} L ${point.x + 6} ${point.y} L ${point.x} ${point.y + 7} L ${point.x - 6} ${point.y} Z`} fill={marker.kind === 'base' ? '#f0cb70' : '#f29b76'} stroke="#17221e" strokeWidth="1.5" />
                      <text x={point.x + 9} y={point.y - 5} fill="#f3f1d8" fontSize="11" paintOrder="stroke" stroke="#121d1b" strokeWidth="3">{marker.name}</text>
                    </g>
                  )
                })}
                {(() => {
                  const point = projectMapPoint({ longitude: playerPosition.worldX, latitude: playerPosition.worldY })
                  return (
                    <g>
                      <circle cx={point.x} cy={point.y} r="8" fill="#63d5e8" stroke="#e6ffff" strokeWidth="2" />
                      <circle cx={point.x} cy={point.y} r="13" fill="none" stroke="#63d5e8" strokeWidth="1.5" opacity="0.7" />
                    </g>
                  )
                })()}
              </svg>
              <div className="field-map-legend">
                <span><i className="map-legend-route" /> Explored route</span>
                <span><i className="map-legend-player" /> You are here</span>
                <span><i className="map-legend-pin" /> Your markers</span>
              </div>
              <div className="field-map-actions">
                <button
                  disabled={fieldMapMarkers.some((marker) => marker.kind === 'base')}
                  onClick={() => addFieldMapMarker(`${currentSite.label} base`, currentSite, 'base')}
                >
                  {fieldMapMarkers.some((marker) => marker.kind === 'base') ? 'Base marked' : 'Mark landing site / base'}
                </button>
                <form onSubmit={(event) => {
                  event.preventDefault()
                  const name = fieldMapMarkerName.trim()
                  if (!name) return
                  addFieldMapMarker(name, { longitude: playerPosition.worldX, latitude: playerPosition.worldY }, 'note')
                  setFieldMapMarkerName('')
                }}>
                  <label htmlFor="field-map-marker-name">Name this location</label>
                  <input
                    id="field-map-marker-name"
                    value={fieldMapMarkerName}
                    onChange={(event) => setFieldMapMarkerName(event.target.value)}
                    maxLength={32}
                    placeholder="e.g. Ice deposit"
                  />
                  <button type="submit" disabled={!fieldMapMarkerName.trim()}>Mark current location</button>
                </form>
              </div>
              {fieldMapMarkers.length > 0 && (
                <ul className="field-map-marker-list">
                  {fieldMapMarkers.map((marker) => (
                    <li key={marker.id}>
                      <span>{marker.name} · {marker.longitude.toFixed(2)}°, {marker.latitude.toFixed(2)}°</span>
                      <button aria-label={`Remove ${marker.name} marker`} onClick={() => setFieldMapMarkers((markers) => markers.filter((item) => item.id !== marker.id))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

        </main>

        <div className="surface-hud">
        <div className="movement-controls" aria-label="On-screen movement controls">
          <button
            aria-label="Move forward"
            disabled={surfaceMovementDisabled}
            onPointerDown={(event) => { event.preventDefault(); startSurfaceMove('w') }}
            onPointerUp={stopSurfaceMove}
            onPointerLeave={stopSurfaceMove}
            onPointerCancel={stopSurfaceMove}
          >↑</button>
          <button
            aria-label="Move left"
            disabled={surfaceMovementDisabled}
            onPointerDown={(event) => { event.preventDefault(); startSurfaceMove('a') }}
            onPointerUp={stopSurfaceMove}
            onPointerLeave={stopSurfaceMove}
            onPointerCancel={stopSurfaceMove}
          >←</button>
          <button
            aria-label="Move backward"
            disabled={surfaceMovementDisabled}
            onPointerDown={(event) => { event.preventDefault(); startSurfaceMove('s') }}
            onPointerUp={stopSurfaceMove}
            onPointerLeave={stopSurfaceMove}
            onPointerCancel={stopSurfaceMove}
          >↓</button>
          <button
            aria-label="Move right"
            disabled={surfaceMovementDisabled}
            onPointerDown={(event) => { event.preventDefault(); startSurfaceMove('d') }}
            onPointerUp={stopSurfaceMove}
            onPointerLeave={stopSurfaceMove}
            onPointerCancel={stopSurfaceMove}
          >→</button>
          <button
            className="jump-control"
            disabled={surfaceMovementDisabled || insideHabitat}
            aria-pressed={jumping}
            onClick={startJump}
          >{jumping ? 'In the air!' : 'Jump'}</button>
        </div>
        {insideHabitat && (
          <aside className="habitat-interior-banner" aria-live="polite">
            <strong>Habitat interior</strong>
            <span>{mission.oxygenInstalled ? `${habitatPartLabel('oxygen-recycler', mission.planet)} online` : 'Life-support equipment not installed'}</span>
            <span className="habitat-controls-hint">WASD / arrows to move · Mouse to look</span>
            {bedInstalled && !activeOperation && <button className="operation-action-button" onClick={startSleep}>Sleep now</button>}
            <button className="inventory-toggle" onClick={interactAtSurface}>Exit habitat · E</button>
          </aside>
        )}
        <div className="mission-brief" aria-live="polite">
          <strong>{!completedOuterParts ? 'First goal · Build the base' : habitatReady ? 'Crew habitat · Ready' : 'Habitat shell · Sealed'}</strong>
          <span>{interactionMessage || (nearbyDeposit
            ? `Nearby: ${resourceLabels[nearbyDeposit.kind]} · press E to extract`
            : completedOuterParts && nearHabitat
              ? 'Habitat airlock nearby · press H to enter'
            : 'Explore freely, collect resources, and place the parts you carry.')}</span>
          {completedOuterParts && nearHabitat && !insideHabitat && (
            <button className="inventory-toggle" onClick={enterHabitat}>Enter habitat · H</button>
          )}
          <div className="mission-objectives">
            {missionObjectives.map((objective) => (
              <div key={objective.label} className={objective.complete ? 'objective complete' : 'objective'}>
                <span>{objective.label}</span>
                <strong>{objective.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <aside className="mission-control-panel" aria-live="polite">
          <strong>Mission Control</strong>
          <div className="mission-control-grid">
            {missionControlReport.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </aside>

          <div className="survival-strip">
            <div><span>HP</span><strong>{mission.health}%</strong></div>
            <div><span>O₂</span><strong>{mission.oxygen}%</strong></div>
            <div><span>Water</span><strong>{mission.water}%</strong></div>
            <div><span>Food</span><strong>{mission.food}%</strong></div>
            <div><span>Power</span><strong>{mission.power}%</strong></div>
            <div><span>Science</span><strong>{mission.science}%</strong></div>
            <div><span>Radiation risk</span><strong>{mission.radiationRisk} pts</strong></div>
            <div><span>Shielding</span><strong>{mission.shielding}%</strong></div>
          </div>

          <details className="power-plan-panel">
            <summary>Daily power plan · {powerPlans[mission.powerPlan].label}</summary>
            <p className="power-sources">
              Installed power: {mission.solarPanels} solar panel{mission.solarPanels === 1 ? '' : 's'}, {mission.nuclearReactors} nuclear reactor{mission.nuclearReactors === 1 ? '' : 's'}, {mission.rtgUnits} RTG backup unit{mission.rtgUnits === 1 ? '' : 's'} · {20 + (mission.solarPanels - 1) * 8 + mission.nuclearReactors * 14 + mission.rtgUnits * 6} game power units generated per Sol.
            </p>
            <div className="energy-build-grid">
              {(Object.keys(energyAssets) as EnergyAsset[]).map((asset) => {
                const specification = energyAssets[asset]
                const currentCount = asset === 'solar' ? mission.solarPanels : asset === 'reactor' ? mission.nuclearReactors : mission.rtgUnits
                const costLabel = Object.entries(specification.cost).map(([part, count]) => `${part} ×${count}`).join(' · ')
                return (
                  <button
                    key={asset}
                    disabled={Boolean(activeOperation) || currentCount >= specification.limit || !hasParts(mission.inventory, specification.cost)}
                    title={`${specification.label} · Cost: ${costLabel}`}
                    onClick={() => installEnergyAsset(asset)}
                  >
                    {currentCount >= specification.limit ? `${specification.label} · Limit reached` : `Install ${specification.label} · ${costLabel}`}
                  </button>
                )
              })}
              <button
                disabled={Boolean(activeOperation) || mission.baseExpansions >= 3 || !hasParts(mission.inventory, baseExpansionCost)}
                title="Expand the habitat · Cost: metal ×3 · wires ×2 · regolith ×1"
                onClick={expandBase}
              >
                {mission.baseExpansions >= 3 ? 'Habitat expansion · Limit reached' : `Expand base · Metal 3 · Wires 2 · Regolith 1`}
              </button>
            </div>
            <label htmlFor="power-plan">Choose where the outpost sends power:</label>
            <select
              id="power-plan"
              value={mission.powerPlan}
              onChange={(event) => setMission((previous) => ({
                ...previous,
                powerPlan: event.target.value as PowerPlanId,
              }))}
            >
              {(Object.keys(powerPlans) as PowerPlanId[]).map((id) => (
                <option key={id} value={id}>{powerPlans[id].label}</option>
              ))}
            </select>
            <div className="power-plan-splits">
              <span>Life support <strong>{powerPlans[mission.powerPlan].lifeSupport}%</strong></span>
              <span>Communications <strong>{powerPlans[mission.powerPlan].communications}%</strong></span>
              <span>Science <strong>{powerPlans[mission.powerPlan].science}%</strong></span>
              <span>Food farm <strong>{powerPlans[mission.powerPlan].food}%</strong></span>
            </div>
            <p>These are game-scale shares of 20 power units per Sol, not NASA engineering measurements. Low life-support power drains oxygen and water; a farm needs 25% power to grow food; science and radio work improve with their shares.</p>
            <p>
              Historical practice event: NASA DONKI recorded {NASA_SEP_TRAINING_EVENT.instrument} on {NASA_SEP_TRAINING_EVENT.date} (entry {NASA_SEP_TRAINING_EVENT.eventId}). It is used only as a Sol {NASA_SEP_TRAINING_EVENT.sol} drill—not a live warning. Radiation points are invented game units, not an astronaut dose.
              {' '}<a href={NASA_SEP_TRAINING_EVENT.url} target="_blank" rel="noreferrer">View NASA DONKI event</a>
            </p>
            <p>Game signal delay is shortened: Earth–Moon is about 1.3 seconds one way; Earth–Mars is about 4–24 minutes one way, depending on distance.</p>
          </details>

          {inventoryOpen && (
            <aside className="inventory-panel" role="dialog" aria-label="Inventory">
              <div className="inventory-title">
                <strong>INVENTORY</strong>
                <button onClick={() => setInventoryOpen(false)}>Close · I / Esc</button>
              </div>
              <div className="inventory-grid">
                <div><span>Metal</span><strong>{mission.inventory.metal}</strong></div>
                <div><span>Wires</span><strong>{mission.inventory.wires}</strong></div>
                <div><span>Ice</span><strong>{mission.inventory.ice}</strong></div>
                <div><span>Fuel</span><strong>{mission.inventory.fuel}</strong></div>
                <div><span>Tools</span><strong>{mission.inventory.tools}</strong></div>
                <div><span>Food</span><strong>{mission.inventory.food}</strong></div>
                <div><span>Medicine</span><strong>{mission.inventory.medicine}</strong></div>
                <div><span>Regolith</span><strong>{mission.inventory.regolith}</strong></div>
                <div><span>Seeds</span><strong>{mission.inventory.seeds}</strong></div>
              </div>
              <h3>Habitat parts</h3>
              <div className="habitat-kit-grid">
                {(Object.keys(habitatPartLabels) as HabitatPart[])
                  .sort((a, b) => habitatPartLabel(a, mission.planet).localeCompare(habitatPartLabel(b, mission.planet)))
                  .map((part) => (
                    <div className="habitat-kit" key={part}>
                      <span>{habitatPartLabel(part, mission.planet)}</span>
                      <strong>×{mission.habitatKits[part]}</strong>
                      <button
                        disabled={mission.habitatKits[part] < 1 || Boolean(activeOperation)}
                        onClick={() => placeHabitatPart(part)}
                      >
                        Place
                      </button>
                    </div>
                  ))}
              </div>
              <p>Stored supplies · Placeable equipment stays in your pack if it cannot be attached.</p>
            </aside>
          )}

          {learningOpen && (
            <aside className="learning-panel" role="dialog" aria-label="Mission science notebook">
              <div className="inventory-title">
                <strong>MISSION SCIENCE NOTEBOOK</strong>
                <button onClick={() => setLearningOpen(false)}>Close</button>
              </div>
              <h3>Latest Sol debrief</h3>
              <p>{mission.learningNote}</p>
              <div className="learning-grid">
                <section>
                  <h3>Power is a budget</h3>
                  <p>The base starts with 20 game power units per Sol. Additional solar panels, a nuclear reactor, and RTG backup generators add to production. Life support, radios, science instruments, and grow lights share the available power; these units are not spacecraft watts.</p>
                </section>
                <section>
                  <h3>Radiation and shielding</h3>
                  <p>The Sun and space can send out high-energy particles. NASA DONKI records space-weather events, but an event report is not a measurement of the dose inside a habitat. This drill uses made-up risk points to show why shielding choices matter.</p>
                </section>
                <section>
                  <h3>Food and water</h3>
                  <p>A crop system needs both water and powered lights. If either is missing, it cannot make a harvest in this model. Growing food may help later, while using water and electricity today.</p>
                </section>
                <section>
                  <h3>Talking to Earth</h3>
                  <p>Moon messages take about 1.3 seconds one way. Mars messages take about 4–24 minutes one way as the planets move around the Sun. The game shortens that wait so you do not have to wait real minutes.</p>
                </section>
              </div>
              <h3>Where the real data appears</h3>
              <p>
                Moon terrain: <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noreferrer">NASA Trek LRO WAC</a>. Mars terrain: <a href={MARS_TREK_PERMALINK} target="_blank" rel="noreferrer">NASA Trek Viking mosaic</a>. The Earth illustration is generated cartoon art.
              </p>
              <p>
                Space-weather example: archived NASA DONKI entry {NASA_SEP_TRAINING_EVENT.eventId}, recorded {NASA_SEP_TRAINING_EVENT.date} by {NASA_SEP_TRAINING_EVENT.instrument}. It is a historical observation used for a practice drill, not a live forecast.
                {' '}<a href={NASA_SEP_TRAINING_EVENT.url} target="_blank" rel="noreferrer">Open the NASA DONKI record</a>
              </p>
            </aside>
          )}

          {radioOpen && radioAvailable && (
            <aside className="base-radio-panel" role="dialog" aria-label="Base satellite radio">
              <div className="inventory-title">
                <strong>BASE RADIO · SATELLITE RELAY</strong>
                <button onClick={() => setRadioOpen(false)}>Close</button>
              </div>
              <div className={radioLinkReady ? 'radio-link-status connected' : 'radio-link-status offline'}>
                <span className="radio-link-indicator" />
                <strong>{radioLinkReady ? 'Relay connected' : 'Radio offline · check power'}</strong>
              </div>
              <p className="radio-route">Habitat antenna → relay satellite → Earth mission control</p>
              <div className="radio-message-list" aria-live="polite">
                {radioMessages.length === 0 && (
                  <p className="radio-empty">No messages yet. Send a status update to Mission Control.</p>
                )}
                {radioMessages.map((message) => (
                  <article className={`radio-message ${message.sender === 'Crew' ? 'outbound' : 'inbound'}`} key={message.id}>
                    <strong>{message.sender === 'Crew' ? 'CREW · OUTBOUND' : 'MISSION CONTROL AI · INBOUND'}</strong>
                    <p>{message.text}</p>
                  </article>
                ))}
                {radioPending && (
                  <p className="radio-waiting">Transmission routed through relay satellite · waiting for Mission Control…</p>
                )}
              </div>
              <form className="base-radio-form" onSubmit={sendBaseRadioMessage}>
                <label htmlFor="base-radio-message">Message to Mission Control</label>
                <textarea
                  id="base-radio-message"
                  rows={3}
                  maxLength={500}
                  value={radioDraft}
                  onChange={(event) => setRadioDraft(event.target.value)}
                  placeholder="Ask Mission Control for advice…"
                />
                <button className="operation-action-button" type="submit" disabled={!radioDraft.trim() || !radioLinkReady || radioPending}>
                  {radioPending ? 'Waiting for reply…' : 'Transmit message'}
                </button>
              </form>
              <small className="radio-delay-note">
                Relay delay: {mission.planet === 'Moon' ? 'about 1.3 seconds to the Moon' : 'about 4–24 minutes to Mars'}. Mission Control AI replies use your message and current mission status; no real messages are sent.
              </small>
            </aside>
          )}

          <div className="surface-bottom">
            {activeOperation && (
              <aside className="operation-panel" aria-live="polite">
                <div className="operation-heading">
                  <div>
                    <strong>{operationDetails[activeOperation].label}</strong>
                    <span>
                      {operationStage === 'work' && activeWorkSteps[activityStep] && `Step ${activityStep + 1} of ${activeWorkSteps.length}`}
                      {operationStage === 'repair-target' && 'Select a damaged system'}
                      {operationStage === 'repair-parts' && 'Retrieve parts from inventory'}
                      {operationStage === 'repair-work' && activeRepairSystem?.steps[activityStep]}
                      {operationStage === 'resting' && 'Crew sleep cycle'}
                      {operationStage === 'report' && 'Earth contact console'}
                      {operationStage === 'awaiting-ack' && 'Waiting for Earth confirmation'}
                    </span>
                  </div>
                  {operationStage === 'resting' && <b>{Math.floor(operationProgress)}%</b>}
                </div>
                <p className="operation-lesson">{operationLessons[activeOperation]}</p>

                {(operationStage === 'work' || operationStage === 'repair-work' || operationStage === 'resting') && (
                  <div className="operation-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(operationProgress)}>
                    <span style={{ width: `${operationProgress}%` }} />
                  </div>
                )}

                {operationStage === 'work' && activeWorkSteps[activityStep] && (
                  <div className="activity-step">
                    <p>{activeWorkSteps[activityStep]}</p>
                    <button className="operation-action-button" onClick={advanceActivity}>
                      {activeWorkSteps[activityStep]}
                    </button>
                  </div>
                )}

                {operationStage === 'repair-target' && (
                  <div className="repair-system-list">
                    {repairSystems.map((system) => {
                      const repaired = mission.repairedSystems.includes(system.id)
                      const available = hasParts(mission.inventory, system.parts)
                      return (
                        <button
                          key={system.id}
                          disabled={repaired || !available}
                          onClick={() => selectRepairSystem(system.id)}
                        >
                          <span>{system.label}</span>
                          <small>{repaired ? 'Operational' : `Parts: ${Object.entries(system.parts).map(([part, count]) => `${part} ×${count}`).join(' · ')}`}</small>
                        </button>
                      )
                    })}
                  </div>
                )}

                {operationStage === 'repair-parts' && activeRepairSystem && (
                  <div className="activity-step">
                    <p>Retrieve these parts from inventory for {activeRepairSystem.label}:</p>
                    <button className="operation-action-button" onClick={retrieveRepairParts}>
                      Gather {Object.entries(activeRepairSystem.parts).map(([part, count]) => `${part} ×${count}`).join(' · ')}
                    </button>
                  </div>
                )}

                {operationStage === 'repair-work' && activeRepairSystem && (
                  <div className="activity-step">
                    <p>{activeRepairSystem.steps[activityStep]} · Step {activityStep + 1} of {activeRepairSystem.steps.length}</p>
                    <button className="operation-action-button" onClick={advanceRepair}>Work on {activeRepairSystem.label}</button>
                  </div>
                )}

                {operationStage === 'resting' && (
                  <div className="operation-footer">
                    <span>Rest period · {Math.floor(operationDetails.rest.hours * operationProgress / 100)} / {operationDetails.rest.hours} simulated hours</span>
                    <span>Habitat bunk occupied</span>
                  </div>
                )}

                {operationStage === 'report' && (
                  <form className="radio-console" onSubmit={sendRadioReport}>
                    <strong>COMMUNICATIONS · EARTH</strong>
                    <label htmlFor="earth-report">Type a completion report to mission control.</label>
                    <textarea
                      id="earth-report"
                      rows={2}
                      value={radioReport}
                      onChange={(event) => setRadioReport(event.target.value)}
                      placeholder={`Report that ${operationDetails[activeOperation].label.toLowerCase()} is finished…`}
                    />
                    <button className="operation-action-button" type="submit" disabled={!radioReport.trim()}>
                      Transmit to Earth
                    </button>
                  </form>
                )}

                {operationStage === 'awaiting-ack' && (
                  <div className="earth-reply">
                    <strong>EARTH · MISSION CONTROL</strong>
                    <p>{earthReply || 'Signal transmitted · waiting for response…'}</p>
                    <small>
                      Training reply delay: {Math.round(radioDelayMs / 1000)} game seconds. Real one-way signal time is about {mission.planet === 'Moon' ? '1.3 seconds to the Moon' : '4–24 minutes to Mars'}.
                    </small>
                    {earthReply && (
                      <>
                        <blockquote>{radioReport}</blockquote>
                        <button className="operation-action-button" onClick={acknowledgeEarth}>Acknowledge Earth reply</button>
                      </>
                    )}
                  </div>
                )}
              </aside>
            )}
            <div className="action-grid">
              <button disabled={Boolean(activeOperation)} title="Inspect and repair outpost systems" onClick={() => startOperation('repair')}>Systems repair</button>
              <button disabled={Boolean(activeOperation)} title="Analyze a collected sample" onClick={() => startOperation('science')}>Sample analysis</button>
              <button disabled={Boolean(activeOperation)} title="Use a stored ration" onClick={() => startOperation('food')}>Prepare ration</button>
              <button disabled={Boolean(activeOperation)} title="Requires 3 regolith · Adds 25% shielding" onClick={() => startOperation('shield')}>Radiation shielding</button>
              <button disabled={Boolean(activeOperation)} title="Requires seeds, metal, and wiring" onClick={() => startOperation('farm')}>Install food farm</button>
            </div>
            <div className="surface-status">
              <span>Sol {mission.days} · {mission.hours % 24}/24 h · Habitat {mission.habitat} · Drones {mission.drones}</span>
              <span>
                {activeOperation
                  ? `${operationDetails[activeOperation].label} · ${operationStage === 'report' ? 'Reporting to Earth' : operationStage === 'awaiting-ack' ? 'Awaiting Earth' : 'In progress'}`
                  : mission.logs[0]}
              </span>
              <button className="end-sol-button" disabled={Boolean(activeOperation)} onClick={endCurrentSol} title="Advance to the next Sol and apply power, life-support, farm, and radiation consequences">
                End Sol
              </button>
              <button className="secondary-button" disabled={Boolean(activeOperation)} onClick={returnToEarth}>Board rocket · Return to Earth</button>
            </div>
          </div>
        </div>
      </div>
    )}

    {screen === 'summary' && (
      <section className="summary-screen">
        <Suspense fallback={<div className="journey-scene-3d scene-loading" />}>
          <JourneyScene3D
            screen="summary"
            planet={mission.planet}
            progress={0}
            returningToEarth={returningToEarth}
            stationX={stationX}
            stationDepth={stationDepth}
            stationDoorOpen={stationDoorOpen}
            shipBoarded={shipBoarded}
            boardingProgress={boardingProgress}
            jumping={jumping}
          />
        </Suspense>
        <div className="summary-card">
          <p className="eyebrow">Mission outcome</p>
          <h2>{result === 'success' ? 'Mission successful' : 'Mission failed'}</h2>
          <MusicToggle enabled={musicEnabled} trackName={musicTrackName} error={musicError} onToggle={toggleMusic} />
          <p>{summaryText}</p>
          <ul className="mission-outcome-list">
            {missionOutcomeReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <div className="summary-grid">
            <div><span>Science</span><strong>{mission.science}%</strong></div>
            <div><span>Health</span><strong>{mission.health}%</strong></div>
            <div><span>Oxygen</span><strong>{mission.oxygen}%</strong></div>
            <div><span>Power</span><strong>{mission.power}%</strong></div>
            <div><span>Shielding</span><strong>{mission.shielding}%</strong></div>
            <div><span>Food</span><strong>{mission.food}%</strong></div>
            </div>
          <div className="summary-buttons">
              <button className="primary-button" onClick={restartEarth}>Retry mission</button>
              <button className="secondary-button" onClick={restartEarth}>Return to station</button>
            </div>
        </div>
      </section>
    )}
    </div>
  )
}

export default App
