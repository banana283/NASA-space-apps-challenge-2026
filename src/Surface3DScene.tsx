import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type Surface3DSceneProps = {
  planet: 'Moon' | 'Mars'
  terrainUrl: string
  playerLongitude: number
  playerLatitude: number
  mapCenterLongitude: number
  mapCenterLatitude: number
  baseLongitude: number
  baseLatitude: number
  farmBuilt: boolean
  solarPanelCount: number
  nuclearReactorCount: number
  rtgCount: number
  baseExpansionCount: number
  shielding: number
  habitatParts: string[]
  habitatAnchor: { longitude: number; latitude: number } | null
  resourceDeposits: { id: string; kind: string; longitude: number; latitude: number; remaining: number }[]
  excavations: { id: string; longitude: number; latitude: number; depth: number }[]
  insideHabitat: boolean
  operation: string | null
  jumping: boolean
  movementEnabled: boolean
  onFirstPersonMove: (dx: number, dy: number) => void
}

type SceneRuntime = {
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  groundMaterial: THREE.MeshStandardMaterial
  terrainTexture: THREE.Texture | null
  terrainGround: THREE.Mesh
  subsurfaceGround: THREE.Mesh
  outpost: THREE.Group
  astronaut: THREE.Group
  solarPanel: THREE.Group
  habitat: THREE.Group
  interior: THREE.Group
  habitatWalkPosition: THREE.Vector3
  farm: THREE.Group
  tool: THREE.Group
  resourceNodes: Map<string, THREE.Group>
  excavationNodes: Map<string, THREE.Group>
  jumpStartedAt: number | null
  frame: (time: number) => void
}

const makeMaterial = (color: number, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })
const HAND_DIG_LIMIT = 5
const TERRAIN_TILE_WIDTH = 16
const TERRAIN_TILE_HEIGHT = 8
const TERRAIN_WORLD_WIDTH = TERRAIN_TILE_WIDTH * 5.456
const TERRAIN_WORLD_HEIGHT = TERRAIN_TILE_HEIGHT * 9.093

const createAstronaut = () => {
  const astronaut = new THREE.Group()
  const suit = makeMaterial(0xe4e7df)
  const trim = makeMaterial(0x758890)
  const dark = makeMaterial(0x1b2d38, 0.35)
  const gold = makeMaterial(0xd19a48, 0.55)

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.72, 4, 8), suit)
  torso.position.y = 1.18
  astronaut.add(torso)

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), suit)
  helmet.position.set(0, 2.02, 0)
  astronaut.add(helmet)

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10), dark)
  visor.scale.set(1, 0.67, 0.42)
  visor.position.set(0, 2.04, 0.29)
  astronaut.add(visor)

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.32), trim)
  backpack.position.set(0, 1.25, -0.37)
  astronaut.add(backpack)

  const legs: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.4, 3, 6), trim)
    leg.position.set(side * 0.2, 0.45, 0)
    astronaut.add(leg)
    legs.push(leg)

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.44, 3, 6), suit)
    arm.position.set(side * 0.53, 1.28, 0.04)
    arm.rotation.z = side * -0.18
    astronaut.add(arm)

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), gold)
    glove.position.set(side * 0.56, 0.94, 0.06)
    astronaut.add(glove)
  }

  const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.08), dark)
  chestPanel.position.set(0, 1.4, 0.4)
  astronaut.add(chestPanel)

  const tool = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6), makeMaterial(0x886744))
  handle.rotation.z = -0.55
  tool.add(handle)
  const pickHead = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.08, 0.1), makeMaterial(0xc0c9c4, 0.45))
  pickHead.position.set(0.25, 0.38, 0)
  pickHead.rotation.z = -0.55
  tool.add(pickHead)
  tool.position.set(0.52, 1.38, 0.38)
  astronaut.add(tool)
  tool.visible = false

  astronaut.userData.legs = legs
  astronaut.userData.tool = tool
  astronaut.userData.body = torso
  return astronaut
}

const createHabitat = (parent: THREE.Object3D, parts: string[], shielding: number) => {
  const habitat = new THREE.Group()
  const shellMaterial = makeMaterial(0xd9ded5)
  const frameMaterial = makeMaterial(0x8c9a99)
  if (parts.includes('foundation')) {
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 4.2), frameMaterial)
    foundation.position.y = 0.14
    habitat.add(foundation)
    for (const x of [-2, 2]) {
      for (const z of [-1.5, 1.5]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), frameMaterial)
        leg.position.set(x, -0.35, z)
        habitat.add(leg)
      }
    }
  }
  if (parts.includes('pressure-shell')) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 4.8, 24), shellMaterial)
    shell.rotation.z = Math.PI / 2
    shell.position.y = 1.8
    habitat.add(shell)
    for (const side of [-1, 1]) {
      const endCap = new THREE.Mesh(new THREE.SphereGeometry(1.68, 14, 10), shellMaterial)
      endCap.scale.set(0.18, 1, 1)
      endCap.position.set(side * 2.35, 1.8, 0)
      habitat.add(endCap)
    }
    const window = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), makeMaterial(0x213740, 0.45))
    window.position.set(-0.2, 2.15, 1.68)
    habitat.add(window)
  }
  if (parts.includes('airlock')) {
    const airlock = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.4, 16), frameMaterial)
    airlock.rotation.z = Math.PI / 2
    airlock.position.set(2.85, 1.8, 0)
    habitat.add(airlock)
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), makeMaterial(0x263e48, 0.4))
    hatch.rotation.y = Math.PI / 2
    hatch.position.set(3.55, 1.8, 0)
    habitat.add(hatch)
  }
  if (parts.includes('radio-antenna')) {
    const antennaFrame = makeMaterial(0x677a7d, 0.42, 0.55)
    const reflectorMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbd6d3,
      roughness: 0.28,
      metalness: 0.68,
      side: THREE.DoubleSide,
    })
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.75, 10), antennaFrame)
    mast.position.set(-1.35, 3.78, 0)
    habitat.add(mast)
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      reflectorMaterial,
    )
    dish.scale.y = 0.38
    dish.position.set(-1.35, 4.12, 0)
    habitat.add(dish)
    const feedSupport = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), antennaFrame)
    feedSupport.position.set(-1.35, 4.34, 0)
    habitat.add(feedSupport)
    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), makeMaterial(0x78d6cb, 0.32, 0.35))
    feed.position.set(-1.35, 4.58, 0)
    habitat.add(feed)
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x74f4bc, emissive: 0x24b77d, emissiveIntensity: 1.1 }),
    )
    beacon.position.set(-1.35, 4.92, 0)
    habitat.add(beacon)
  }
  if (parts.includes('oxygen-recycler')) {
    const recycler = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.8), makeMaterial(0x6ab8bd))
    recycler.position.set(-0.9, 1.3, 1.88)
    habitat.add(recycler)
  }
  if (parts.includes('bed')) {
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.75), frameMaterial)
    bedFrame.position.set(0, 0.55, -1.35)
    habitat.add(bedFrame)
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.7), makeMaterial(0xd9d8bd))
    mattress.position.set(0, 0.76, -1.35)
    habitat.add(mattress)
  }

  if (shielding > 0) {
    const bermMaterial = makeMaterial(0x8a7456)
    const berm = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.4, 5, 20), bermMaterial)
    berm.rotation.x = Math.PI / 2
    berm.position.set(5, 0.45, 0)
    berm.scale.set(1.15, 0.9, 1)
    berm.userData.coverage = shielding / 100
    habitat.add(berm)
  }

  parent.add(habitat)
  return habitat
}

const createHabitatInterior = (parts: string[]) => {
  const interior = new THREE.Group()
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(1.68, 1.68, 4.6, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xcbd5d2, roughness: 0.72, metalness: 0.16, side: THREE.BackSide }),
  )
  hull.rotation.z = Math.PI / 2
  hull.position.y = 1.8
  interior.add(hull)

  const frame = makeMaterial(0x53646a, 0.55, 0.35)
  const trim = makeMaterial(0x9caaa8, 0.6, 0.2)
  const cabinet = makeMaterial(0x7d8d8e, 0.7, 0.18)
  const benchTop = makeMaterial(0xc5ceca, 0.42, 0.12)
  const darkScreen = makeMaterial(0x102b35, 0.35, 0.22)
  const screenGlow = new THREE.MeshStandardMaterial({ color: 0x63d5c6, emissive: 0x1d8f85, emissiveIntensity: 0.8, roughness: 0.32 })
  const safety = makeMaterial(0xd0a345, 0.55, 0.15)
  const addBox = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    interior.add(mesh)
    return mesh
  }

  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.14, 3.05), makeMaterial(0x526266, 0.78, 0.28))
  floor.position.y = 0.08
  interior.add(floor)
  addBox(4.35, 0.025, 0.08, 0, 0.17, 0, safety)
  for (let x = -2; x <= 2; x += 0.5) {
    addBox(0.025, 0.025, 2.7, x, 0.17, 0, frame)
  }

  for (const x of [-1.7, -0.55, 0.6, 1.65]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.59, 0.045, 6, 32), frame)
    rib.rotation.y = Math.PI / 2
    rib.position.set(x, 1.8, 0)
    interior.add(rib)
  }
  const light = new THREE.MeshStandardMaterial({ color: 0xe7fff7, emissive: 0xa5dfd1, emissiveIntensity: 0.65, roughness: 0.35 })
  for (const z of [-0.52, 0.52]) {
    addBox(1.5, 0.045, 0.12, 0, 3.28, z, light)
  }
  for (const side of [-1, 1]) {
    const workbench = addBox(2.45, 0.68, 0.58, -0.05, 0.58, side * 1.08, cabinet)
    workbench.name = `lab-cabinet-${side}`
    addBox(2.55, 0.09, 0.68, -0.05, 0.97, side * 1.08, benchTop)
    for (const x of [-0.86, 0, 0.86]) {
      for (const y of [0.42, 0.7]) {
        addBox(0.63, 0.2, 0.035, x, y, side * 0.78, trim)
        addBox(0.12, 0.025, 0.025, x, y, side * 0.755, frame)
      }
    }

    addBox(0.82, 0.56, 0.11, 0.42, 1.72, side * 1.42, frame)
    addBox(0.7, 0.43, 0.035, 0.42, 1.72, side * 1.35, darkScreen)
    for (let index = 0; index < 5; index += 1) {
      const bar = addBox(0.075, 0.06 + (index % 3) * 0.045, 0.018, 0.18 + index * 0.12, 1.59, side * 1.325, screenGlow)
      bar.rotation.z = index % 2 === 0 ? 0.12 : -0.12
    }
    addBox(0.4, 0.025, 0.018, 0.42, 1.88, side * 1.325, screenGlow)
    addBox(0.18, 0.035, 0.02, 0.18, 1.98, side * 1.32, safety)
  }

  // Compact microscope and sealed sample tubes make the work surface read as a research bench.
  addBox(0.42, 0.07, 0.32, -0.72, 1.06, 1.05, frame)
  const microscopeColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.34, 8), trim)
  microscopeColumn.position.set(-0.72, 1.25, 1.05)
  interior.add(microscopeColumn)
  addBox(0.34, 0.07, 0.1, -0.56, 1.39, 1.05, trim)
  const objective = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 8), frame)
  objective.position.set(-0.43, 1.3, 1.05)
  interior.add(objective)
  const tubeGlass = new THREE.MeshStandardMaterial({ color: 0xb9e8e1, transparent: true, opacity: 0.72, roughness: 0.2 })
  for (let index = 0; index < 4; index += 1) {
    addBox(0.16, 0.08, 0.25, 0.14 + index * 0.18, 1.05, 1.08, frame)
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8), tubeGlass)
    tube.position.set(0.14 + index * 0.18, 1.2, 1.08)
    interior.add(tube)
    const sample = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), index % 2 ? screenGlow : safety)
    sample.position.set(0.14 + index * 0.18, 1.12, 1.08)
    interior.add(sample)
  }

  // A sealed analyzer and equipment locker occupy the opposite bench.
  addBox(0.72, 0.5, 0.5, 0.42, 1.28, -1.08, frame)
  addBox(0.5, 0.25, 0.04, 0.42, 1.34, -0.81, darkScreen)
  for (let index = 0; index < 3; index += 1) {
    addBox(0.09, 0.035, 0.025, 0.25 + index * 0.16, 1.34, -0.78, index === 0 ? screenGlow : safety)
  }
  for (let index = 0; index < 4; index += 1) {
    addBox(0.34, 0.035, 0.025, 0.42, 1.1 + index * 0.09, -0.81, trim)
  }

  // A small end-wall command panel faces the center aisle.
  addBox(0.08, 1.3, 1.35, 2.18, 1.65, 0, cabinet)
  addBox(0.035, 0.48, 0.72, 2.12, 1.9, 0, darkScreen)
  for (let index = 0; index < 4; index += 1) {
    addBox(0.025, 0.04, 0.1, 2.095, 1.72 - index * 0.12, -0.18 + index * 0.12, index % 2 ? safety : screenGlow)
  }

  if (parts.includes('oxygen-recycler')) {
    addBox(0.7, 0.9, 0.5, -0.78, 1.43, -1.08, makeMaterial(0x526f72, 0.52, 0.32))
    addBox(0.42, 0.2, 0.035, -0.78, 1.68, -0.81, darkScreen)
    addBox(0.28, 0.035, 0.02, -0.78, 1.68, -0.785, screenGlow)
    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), trim)
    fan.position.set(-0.78, 1.28, -0.8)
    interior.add(fan)
    for (let index = 0; index < 4; index += 1) {
      addBox(0.32, 0.025, 0.025, -0.78, 1.05 + index * 0.08, -0.8, trim)
    }
  }
  if (parts.includes('radio-antenna')) {
    addBox(0.72, 0.48, 0.11, 1.22, 1.66, -1.42, frame)
    addBox(0.58, 0.32, 0.035, 1.22, 1.66, -1.34, darkScreen)
    addBox(0.18, 0.035, 0.018, 1.03, 1.73, -1.315, screenGlow)
    addBox(0.18, 0.035, 0.018, 1.25, 1.73, -1.315, screenGlow)
    addBox(0.18, 0.035, 0.018, 1.47, 1.73, -1.315, safety)
  }
  if (parts.includes('bed')) {
    addBox(0.88, 0.14, 1.55, -1.7, 0.56, 0, frame)
    addBox(0.82, 0.16, 1.45, -1.68, 0.69, 0, makeMaterial(0xd9d8bd, 0.92))
    addBox(0.05, 0.26, 1.58, -2.14, 0.7, 0, trim)
    addBox(0.6, 0.035, 0.06, -1.68, 0.82, -0.45, safety)
  }

  interior.visible = false
  return interior
}

const createResourceNode = (kind: string) => {
  const group = new THREE.Group()
  const color = kind === 'ice' ? 0x82cde0 : kind === 'metal' ? 0xd3a65c : kind === 'hydrated-mineral' ? 0x6bb18f : 0x9a8b72
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), makeMaterial(color, 0.75, 0.12))
  rock.scale.set(1.3, 0.72, 1)
  rock.position.y = 0.35
  group.add(rock)
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), makeMaterial(color, 0.35, 0.25))
  crystal.position.set(0.18, 0.75, 0.1)
  group.add(crystal)
  group.userData.kind = kind
  return group
}

const createMachineDigger = () => {
  const machine = new THREE.Group()
  const trackMaterial = makeMaterial(0x26373a, 0.8, 0.15)
  const bodyMaterial = makeMaterial(0xd58b38, 0.65, 0.1)
  const metalMaterial = makeMaterial(0xaeb8b3, 0.45, 0.3)
  for (const z of [-0.34, 0.34]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.24, 0.28), trackMaterial)
    track.position.set(1.35, -0.05, z)
    machine.add(track)
  }
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.7), bodyMaterial)
  chassis.position.set(1.35, 0.22, 0)
  machine.add(chassis)
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.52), makeMaterial(0x657d83, 0.4, 0.2))
  cab.position.set(1.55, 0.62, 0)
  machine.add(cab)
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.16), bodyMaterial)
  boom.position.set(0.72, 0.48, 0)
  boom.rotation.z = -0.08
  machine.add(boom)
  const drill = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 1.45, 8), metalMaterial)
  drill.position.set(0.2, -0.18, 0)
  machine.add(drill)
  const drillTip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), bodyMaterial)
  drillTip.position.set(0.2, -1.02, 0)
  machine.add(drillTip)
  return machine
}

const createExcavation = (depth: number) => {
  const hole = new THREE.Group()
  hole.userData.depth = depth
  const topY = -0.18
  const handDepth = Math.min(depth, HAND_DIG_LIMIT)
  const machineDepth = Math.max(depth - HAND_DIG_LIMIT, 0)
  const boreDepth = handDepth * 0.06 + Math.log1p(machineDepth) * 0.45
  const bottomY = topY - 0.1 - boreDepth
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 20), makeMaterial(0x8a795f))
  rim.rotation.x = Math.PI / 2
  rim.position.y = topY + 0.04
  hole.add(rim)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.76, 0.56, topY - bottomY, 20, 1, true),
    makeMaterial(machineDepth ? 0x4c3028 : 0x59372d),
  )
  shaft.position.y = (topY + bottomY) / 2
  hole.add(shaft)
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.56, 20), makeMaterial(0x9e4932))
  bottom.rotation.x = -Math.PI / 2
  bottom.position.y = bottomY + 0.006
  hole.add(bottom)
  const layer = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 5, 16), makeMaterial(0xb65a3b))
  layer.rotation.x = Math.PI / 2
  layer.position.y = bottomY + (topY - bottomY) * 0.38
  hole.add(layer)
  if (machineDepth > 0) hole.add(createMachineDigger())
  return hole
}

const createTerrainGeometry = (holes: { x: number; z: number }[], radius = 0.92) => {
  const shape = new THREE.Shape()
  shape.moveTo(-TERRAIN_WORLD_WIDTH / 2, -TERRAIN_WORLD_HEIGHT / 2)
  shape.lineTo(TERRAIN_WORLD_WIDTH / 2, -TERRAIN_WORLD_HEIGHT / 2)
  shape.lineTo(TERRAIN_WORLD_WIDTH / 2, TERRAIN_WORLD_HEIGHT / 2)
  shape.lineTo(-TERRAIN_WORLD_WIDTH / 2, TERRAIN_WORLD_HEIGHT / 2)
  shape.closePath()

  holes.forEach(({ x, z }) => {
    if (
      x < -TERRAIN_WORLD_WIDTH / 2 + radius ||
      x > TERRAIN_WORLD_WIDTH / 2 - radius ||
      z < -TERRAIN_WORLD_HEIGHT / 2 + radius ||
      z > TERRAIN_WORLD_HEIGHT / 2 - radius
    ) return
    const opening = new THREE.Path()
    opening.absellipse(x, -z, radius, radius, 0, Math.PI * 2, true, 0)
    shape.holes.push(opening)
  })

  const geometry = new THREE.ShapeGeometry(shape, 16)
  const positions = geometry.getAttribute('position')
  const uvs = new Float32Array(positions.count * 2)
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    uvs[index * 2] = (x + TERRAIN_WORLD_WIDTH / 2) / TERRAIN_WORLD_WIDTH
    uvs[index * 2 + 1] = (y + TERRAIN_WORLD_HEIGHT / 2) / TERRAIN_WORLD_HEIGHT
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

const disposeObject = (root: THREE.Object3D) => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => material.dispose())
  })
}

const createSolarArray = (positionX = -5.5, positionZ = 2) => {
  const group = new THREE.Group()
  const supportMaterial = makeMaterial(0x596c73)
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x286b91,
    roughness: 0.35,
    metalness: 0.25,
    side: THREE.DoubleSide,
  })
  const panel = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 2.8), panelMaterial)
  panel.position.y = 1.35
  panel.rotation.x = -0.2
  group.add(panel)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.25, 8), supportMaterial)
  post.position.y = 0.65
  group.add(post)
  for (let x = -2; x <= 2; x += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 2.9), makeMaterial(0x8cc6df, 0.4))
    line.position.set(x, 1.42, 0)
    group.add(line)
  }
  for (let z = -1; z <= 1; z += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(5, 0.14, 0.035), makeMaterial(0x8cc6df, 0.4))
    line.position.set(0, 1.42, z)
    group.add(line)
  }
  group.position.set(positionX, 0, positionZ)
  return group
}

const createNuclearReactor = () => {
  const reactor = new THREE.Group()
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.8, 12), makeMaterial(0xb7c5c6, 0.4, 0.35))
  core.position.y = 1.2
  reactor.add(core)
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 12), makeMaterial(0x67a8a2, 0.35, 0.25))
  cap.position.y = 2.15
  reactor.add(cap)
  for (const x of [-1.25, 1.25]) {
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.6), makeMaterial(0x718997, 0.5, 0.3))
    radiator.position.set(x, 1.25, 0)
    reactor.add(radiator)
  }
  reactor.position.set(7.5, 0, -4)
  return reactor
}

const createRtg = (index: number) => {
  const rtg = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.55, 1.1, 12), makeMaterial(0xc8784e, 0.5, 0.25))
  body.position.y = 1.05
  rtg.add(body)
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), makeMaterial(0xd4a15f, 0.4, 0.2))
  top.position.y = 1.6
  rtg.add(top)
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 1.3), makeMaterial(0x596c73))
  stand.position.y = 0.2
  rtg.add(stand)
  rtg.position.set(7 + index * 1.8, 0, 1.6)
  return rtg
}

const createBaseExpansion = (index: number) => {
  const module = new THREE.Group()
  const shell = new THREE.Mesh(
    new THREE.CapsuleGeometry(1.2, 1.7, 4, 10),
    makeMaterial(0xb9c2bd, 0.65, 0.12),
  )
  shell.rotation.z = Math.PI / 2
  shell.position.y = 1.55
  module.add(shell)
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), makeMaterial(0x384c54, 0.5, 0.2))
  door.position.set(0, 1.55, 1.18)
  module.add(door)
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), makeMaterial(0x6d7f82))
  for (const x of [-0.85, 0.85]) {
    const support = leg.clone()
    support.position.set(x, 0.6, 0)
    module.add(support)
  }
  module.position.set(9 + index * 3.2, 0, 5)
  return module
}

const createLandedRocket = () => {
  const lander = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3.1, 16), makeMaterial(0xd5d9d4, 0.4, 0.2))
  body.position.y = 2.05
  lander.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16), makeMaterial(0xe4e7e5, 0.38, 0.2))
  nose.position.y = 4.3
  lander.add(nose)
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.86, 0.3, 16), makeMaterial(0x3f9cb5, 0.35, 0.15))
  stripe.position.y = 1.6
  lander.add(stripe)
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.48, 12), makeMaterial(0x465964, 0.45, 0.3))
  engine.position.y = 0.25
  lander.add(engine)
  for (let index = 0; index < 3; index += 1) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.4, 0.13), makeMaterial(0x718087, 0.5, 0.3))
    leg.position.y = 0.35
    leg.rotation.z = -0.5
    leg.rotation.y = index * Math.PI * 2 / 3
    leg.translateX(0.9)
    lander.add(leg)
  }
  lander.position.set(5, 0, -4)
  return lander
}

const createFarm = () => {
  const farm = new THREE.Group()
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x86c8c0,
    transparent: true,
    opacity: 0.28,
    roughness: 0.15,
    metalness: 0.1,
  })
  const greenhouse = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), glass)
  greenhouse.position.y = 1
  farm.add(greenhouse)
  const frame = makeMaterial(0x879a8a)
  for (const x of [-1.6, 1.6]) {
    for (const z of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2, 6), frame)
      post.position.set(x, 1, z)
      farm.add(post)
    }
  }
  for (let index = 0; index < 5; index += 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.65, 5), makeMaterial(0x4e8d4a))
    stem.position.set(-1.1 + index * 0.55, 0.52, 0)
    farm.add(stem)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), makeMaterial(0x73b96b))
    leaf.scale.set(1.3, 0.6, 0.7)
    leaf.position.set(-1.1 + index * 0.55, 0.83, 0)
    farm.add(leaf)
  }
  farm.position.set(5.2, 0, 6)
  farm.visible = false
  return farm
}

const createRover = () => {
  const rover = new THREE.Group()
  const frame = makeMaterial(0xd0d5ce, 0.55, 0.12)
  const dark = makeMaterial(0x26343a, 0.9)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.5), frame)
  chassis.position.y = 1.05
  rover.add(chassis)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.1), makeMaterial(0x7195a0, 0.4, 0.2))
  deck.position.set(0, 1.42, 0)
  rover.add(deck)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), frame)
  mast.position.set(-0.65, 1.95, -0.3)
  rover.add(mast)
  const camera = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), makeMaterial(0x85c7d7, 0.3, 0.25))
  camera.position.set(-0.65, 2.5, -0.3)
  rover.add(camera)

  for (const x of [-0.82, 0, 0.82]) {
    for (const z of [-0.86, 0.86]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), dark)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x, 0.58, z)
      rover.add(wheel)
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 10), makeMaterial(0xb78c50))
      hub.rotation.x = Math.PI / 2
      hub.position.copy(wheel.position)
      rover.add(hub)
    }
  }
  rover.position.set(-7, 0, -4.5)
  rover.rotation.y = -0.3
  return rover
}

const createRocks = (scene: THREE.Scene, planet: 'Moon' | 'Mars') => {
  const colors = planet === 'Moon' ? [0x777975, 0x96948b, 0x5d6260] : [0x8f4e3a, 0xb3694a, 0x754133]
  for (let index = 0; index < 34; index += 1) {
    const angle = index * 2.399
    const radius = 8 + (index % 7) * 2.2
    const geometry = new THREE.DodecahedronGeometry(0.4 + (index % 5) * 0.16, 0)
    const material = makeMaterial(colors[index % colors.length])
    const rock = new THREE.Mesh(geometry, material)
    rock.position.set(Math.cos(angle) * radius, -0.1, Math.sin(angle) * radius)
    rock.scale.set(1.3, 0.55 + (index % 3) * 0.22, 1)
    rock.rotation.set(angle * 0.2, angle, angle * 0.13)
    scene.add(rock)
  }
}

export default function Surface3DScene({
  planet,
  terrainUrl,
  playerLongitude,
  playerLatitude,
  mapCenterLongitude,
  mapCenterLatitude,
  baseLongitude,
  baseLatitude,
  farmBuilt,
  solarPanelCount,
  nuclearReactorCount,
  rtgCount,
  baseExpansionCount,
  shielding,
  habitatParts,
  habitatAnchor,
  resourceDeposits,
  excavations,
  insideHabitat,
  operation,
  jumping,
  movementEnabled,
  onFirstPersonMove,
}: Surface3DSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const [runtimeVersion, setRuntimeVersion] = useState(0)
  const firstPersonRef = useRef(false)
  const insideHabitatRef = useRef(insideHabitat)
  const resourceDepositsRef = useRef(resourceDeposits)
  const excavationsRef = useRef(excavations)
  const lookYawRef = useRef(Math.PI / 2)
  const lookPitchRef = useRef(0)
  const movementEnabledRef = useRef(movementEnabled)
  const onFirstPersonMoveRef = useRef(onFirstPersonMove)
  const [firstPerson, setFirstPerson] = useState(false)

  useEffect(() => {
    const handleViewToggle = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q' || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      firstPersonRef.current = !firstPersonRef.current
      setFirstPerson(firstPersonRef.current)
    }

    window.addEventListener('keydown', handleViewToggle)
    return () => window.removeEventListener('keydown', handleViewToggle)
  }, [])

  useEffect(() => {
    movementEnabledRef.current = movementEnabled
    onFirstPersonMoveRef.current = onFirstPersonMove
  }, [movementEnabled, onFirstPersonMove])

  useEffect(() => {
    insideHabitatRef.current = insideHabitat
    resourceDepositsRef.current = resourceDeposits
    excavationsRef.current = excavations
    if (insideHabitat) {
      runtimeRef.current?.habitatWalkPosition.set(0, 0, 0)
      lookYawRef.current = 0
      lookPitchRef.current = 0
    }
  }, [insideHabitat, resourceDeposits, excavations])

  useEffect(() => {
    const handleFirstPersonMovement = (event: KeyboardEvent) => {
      const insideHabitat = insideHabitatRef.current
      if ((!insideHabitat && !firstPersonRef.current) || !movementEnabledRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const right = key === 'arrowright' || key === 'd' ? 1 : key === 'arrowleft' || key === 'a' ? -1 : 0
      const forward = key === 'arrowup' || key === 'w' ? 1 : key === 'arrowdown' || key === 's' ? -1 : 0
      if (right === 0 && forward === 0) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const yaw = lookYawRef.current
      if (insideHabitat) {
        const position = runtimeRef.current?.habitatWalkPosition
        if (!position) return
        const moveX = right * Math.sin(yaw) + forward * Math.cos(yaw)
        const moveZ = -right * Math.cos(yaw) + forward * Math.sin(yaw)
        const isBlocked = (x: number, z: number) =>
          (x > -1.35 && x < 1.3 && Math.abs(z) > 0.7) ||
          (x < -1.15 && Math.abs(z) < 0.86)
        const nextX = THREE.MathUtils.clamp(position.x + moveX * 0.42, -2.05, 2)
        const nextZ = THREE.MathUtils.clamp(position.z + moveZ * 0.42, -1.28, 1.28)
        if (!isBlocked(nextX, position.z)) position.x = nextX
        if (!isBlocked(position.x, nextZ)) position.z = nextZ
        return
      }
      onFirstPersonMoveRef.current(
        right * Math.sin(yaw) + forward * Math.cos(yaw),
        -right * Math.cos(yaw) + forward * Math.sin(yaw),
      )
    }

    window.addEventListener('keydown', handleFirstPersonMovement, true)
    return () => window.removeEventListener('keydown', handleFirstPersonMovement, true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!firstPersonRef.current && !insideHabitatRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      lookYawRef.current -= event.movementX * 0.0025
      lookPitchRef.current = Math.max(-1.35, Math.min(1.35, lookPitchRef.current - event.movementY * 0.0025))
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(planet === 'Moon' ? 0x111823 : 0x261815)
    scene.fog = new THREE.Fog(scene.background, 34, 115)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180)
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xc9dcff, planet === 'Moon' ? 0x46433e : 0x6d382b, 1.55))
    const sunlight = new THREE.DirectionalLight(0xffe6c1, 2.5)
    sunlight.position.set(-18, 28, 12)
    scene.add(sunlight)

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: planet === 'Moon' ? 0x777772 : 0xa2583e,
      roughness: 1,
      metalness: 0,
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN_WORLD_WIDTH, TERRAIN_WORLD_HEIGHT, 1, 1), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.18
    scene.add(ground)
    const subsurface = new THREE.Mesh(
      new THREE.PlaneGeometry(TERRAIN_WORLD_WIDTH, TERRAIN_WORLD_HEIGHT),
      makeMaterial(0x9e4932, 1),
    )
    subsurface.rotation.x = -Math.PI / 2
    subsurface.position.y = -0.62
    scene.add(subsurface)

    createRocks(scene, planet)
    const outpost = new THREE.Group()
    const habitat = createHabitat(outpost, habitatParts, shielding)
    const interior = createHabitatInterior(habitatParts)
    habitat.add(interior)
    const solarPanel = createSolarArray()
    outpost.add(solarPanel)
    for (let index = 1; index < solarPanelCount; index += 1) {
      outpost.add(createSolarArray(-5.5 + index * 6.2, 2))
    }
    for (let index = 0; index < nuclearReactorCount; index += 1) outpost.add(createNuclearReactor())
    for (let index = 0; index < rtgCount; index += 1) outpost.add(createRtg(index))
    for (let index = 0; index < baseExpansionCount; index += 1) outpost.add(createBaseExpansion(index))
    outpost.add(createLandedRocket())
    outpost.add(createRover())
    const farm = createFarm()
    outpost.add(farm)
    scene.add(outpost)

    const astronaut = createAstronaut()
    scene.add(astronaut)
    const resourceNodes = new Map<string, THREE.Group>()
    resourceDepositsRef.current.forEach((deposit) => {
      const node = createResourceNode(deposit.kind)
      node.visible = deposit.remaining > 0
      resourceNodes.set(deposit.id, node)
      scene.add(node)
    })
    const excavationNodes = new Map<string, THREE.Group>()
    excavationsRef.current.forEach((excavation) => {
      const hole = createExcavation(excavation.depth)
      excavationNodes.set(excavation.id, hole)
      scene.add(hole)
    })

    let frameId = 0
    const clock = new THREE.Clock()
    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    const frame = () => {
      frameId = window.requestAnimationFrame(frame)
      const elapsed = clock.getElapsedTime()
      const { x, z } = astronaut.position
      const runtime = runtimeRef.current
      if (runtime?.jumpStartedAt !== null && runtime?.jumpStartedAt !== undefined) {
        const progress = Math.min((performance.now() - runtime.jumpStartedAt) / 2200, 1)
        astronaut.position.y = Math.sin(progress * Math.PI) * 1.8
        if (progress === 1) runtime.jumpStartedAt = null
      } else {
        astronaut.position.y = 0
      }
      if (insideHabitatRef.current && runtime) {
        runtime.interior.visible = true
        const habitatPosition = runtime.habitat.getWorldPosition(new THREE.Vector3())
        const walker = habitatPosition.clone().add(runtime.habitatWalkPosition)
        if (firstPersonRef.current) {
          astronaut.visible = false
          const eye = walker.clone().add(new THREE.Vector3(0, 1.65, 0))
          const lookDirection = new THREE.Vector3(
            Math.cos(lookYawRef.current) * Math.cos(lookPitchRef.current),
            Math.sin(lookPitchRef.current),
            -Math.sin(lookYawRef.current) * Math.cos(lookPitchRef.current),
          )
          camera.position.lerp(eye, 0.18)
          camera.lookAt(camera.position.clone().add(lookDirection))
        } else {
          astronaut.visible = true
          astronaut.position.copy(walker)
          astronaut.position.y = 0
          const behind = new THREE.Vector3(
            -Math.cos(lookYawRef.current) * 1.35,
            1.05,
            Math.sin(lookYawRef.current) * 1.35,
          )
          camera.position.lerp(walker.clone().add(behind), 0.18)
          camera.lookAt(walker.clone().add(new THREE.Vector3(0, 1.15, 0)))
        }
      } else if (firstPersonRef.current) {
        if (runtime) runtime.interior.visible = false
        const eyeY = 1.8 + astronaut.position.y
        astronaut.visible = false
        const eye = new THREE.Vector3(x, eyeY, z - 0.45)
        const lookDirection = new THREE.Vector3(
          Math.cos(lookYawRef.current) * Math.cos(lookPitchRef.current),
          Math.sin(lookPitchRef.current),
          -Math.sin(lookYawRef.current) * Math.cos(lookPitchRef.current),
        )
        camera.position.lerp(eye, 0.18)
        camera.lookAt(camera.position.clone().add(lookDirection))
      } else {
        if (runtime) runtime.interior.visible = false
        astronaut.visible = true
        camera.position.lerp(new THREE.Vector3(x + 5.8, 6.1, z + 8.2), 0.06)
        camera.lookAt(new THREE.Vector3(x + 0.7, 2.4, z - 0.5))
      }
      astronaut.userData.legs[0].rotation.x = Math.sin(elapsed * 3.2) * 0.04
      astronaut.userData.legs[1].rotation.x = -Math.sin(elapsed * 3.2) * 0.04
      renderer.render(scene, camera)
    }

    runtimeRef.current = {
      scene,
      renderer,
      camera,
      groundMaterial,
      terrainTexture: null,
      terrainGround: ground,
      subsurfaceGround: subsurface,
      outpost,
      astronaut,
      solarPanel,
      habitat,
      interior,
      habitatWalkPosition: new THREE.Vector3(),
      farm,
      tool: astronaut.userData.tool,
      resourceNodes,
      excavationNodes,
      jumpStartedAt: null,
      frame,
    }
    setRuntimeVersion((version) => version + 1)
    frame()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      runtimeRef.current?.terrainTexture?.dispose()
      runtimeRef.current = null
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => material.dispose())
        }
      })
      renderer.dispose()
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
    }
  }, [planet, habitatParts, shielding, solarPanelCount, nuclearReactorCount, rtgCount, baseExpansionCount])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const texture = loader.load(terrainUrl, (loaded) => {
      if (runtimeRef.current !== runtime || runtime.terrainTexture !== loaded) {
        loaded.dispose()
        return
      }
      loaded.colorSpace = THREE.SRGBColorSpace
      loaded.anisotropy = runtime.renderer.capabilities.getMaxAnisotropy()
      runtime.groundMaterial.map = loaded
      runtime.groundMaterial.color.set(0xffffff)
      runtime.groundMaterial.needsUpdate = true
    })
    texture.colorSpace = THREE.SRGBColorSpace
    runtime.terrainTexture?.dispose()
    runtime.terrainTexture = texture

    return () => {
      if (runtime.terrainTexture === texture) {
        runtime.terrainTexture = null
        runtime.groundMaterial.map = null
        runtime.groundMaterial.color.set(planet === 'Moon' ? 0x777772 : 0xa2583e)
        runtime.groundMaterial.needsUpdate = true
        texture.dispose()
      }
    }
  }, [planet, terrainUrl, runtimeVersion])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    const worldX = (((playerLongitude - mapCenterLongitude + 540) % 360) - 180) * 5.456
    const worldZ = -(playerLatitude - mapCenterLatitude) * 9.093
    runtime.astronaut.position.set(worldX, 0, worldZ)
    const baseLongitudeFromTile = ((baseLongitude - mapCenterLongitude + 540) % 360) - 180
    const baseLatitudeFromTile = baseLatitude - mapCenterLatitude
    runtime.outpost.position.set(baseLongitudeFromTile * 5.456, 0, -baseLatitudeFromTile * 9.093)
    const anchorLongitudeDelta = habitatAnchor
      ? ((habitatAnchor.longitude - baseLongitude + 540) % 360) - 180
      : 0
    const anchorLatitudeDelta = habitatAnchor ? habitatAnchor.latitude - baseLatitude : 0
    runtime.habitat.position.set(anchorLongitudeDelta * 5.456, 0, -anchorLatitudeDelta * 9.093)
    runtime.habitat.visible = habitatAnchor !== null
    resourceDeposits.forEach((deposit) => {
      const node = runtime.resourceNodes.get(deposit.id)
      if (!node) return
      const longitudeDelta = ((deposit.longitude - mapCenterLongitude + 540) % 360) - 180
      const latitudeDelta = deposit.latitude - mapCenterLatitude
      node.position.set(longitudeDelta * 5.456, 0, -latitudeDelta * 9.093)
      node.visible = deposit.remaining > 0
    })
    const terrainHoles: { x: number; z: number }[] = []
    const deepTerrainHoles: { x: number; z: number }[] = []
    excavations.forEach((excavation) => {
      let hole = runtime.excavationNodes.get(excavation.id)
      if (!hole) {
        hole = createExcavation(excavation.depth)
        runtime.excavationNodes.set(excavation.id, hole)
        runtime.scene.add(hole)
      } else if (hole.userData.depth !== excavation.depth) {
        runtime.scene.remove(hole)
        disposeObject(hole)
        hole = createExcavation(excavation.depth)
        runtime.excavationNodes.set(excavation.id, hole)
        runtime.scene.add(hole)
      }
      hole.userData.depth = excavation.depth
      const longitudeDelta = ((excavation.longitude - mapCenterLongitude + 540) % 360) - 180
      const latitudeDelta = excavation.latitude - mapCenterLatitude
      hole.position.set(longitudeDelta * 5.456, 0, -latitudeDelta * 9.093)
      terrainHoles.push({ x: hole.position.x, z: hole.position.z })
      if (excavation.depth > HAND_DIG_LIMIT) {
        deepTerrainHoles.push({ x: hole.position.x, z: hole.position.z })
      }
    })
    const terrainGeometry = createTerrainGeometry(terrainHoles)
    runtime.terrainGround.geometry.dispose()
    runtime.terrainGround.geometry = terrainGeometry
    const subsurfaceGeometry = createTerrainGeometry(deepTerrainHoles)
    runtime.subsurfaceGround.geometry.dispose()
    runtime.subsurfaceGround.geometry = subsurfaceGeometry
    if (jumping && runtime.jumpStartedAt === null) runtime.jumpStartedAt = performance.now()
    if (!jumping) runtime.jumpStartedAt = null
    runtime.farm.visible = farmBuilt
    runtime.tool.visible = operation === 'mine' || operation === 'ice' || operation === 'repair' || operation === 'shield'
    runtime.solarPanel.position.x = -5.5
  }, [playerLongitude, playerLatitude, baseLongitude, baseLatitude, mapCenterLongitude, mapCenterLatitude, habitatAnchor, resourceDeposits, excavations, farmBuilt, operation, jumping])

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    runtime.interior.visible = insideHabitat
    resourceDeposits.forEach((deposit) => {
      const node = runtime.resourceNodes.get(deposit.id)
      if (node) node.visible = deposit.remaining > 0
    })
  }, [insideHabitat, resourceDeposits])

  return (
    <div
      className={`surface-3d-scene planet-${planet.toLowerCase()}`}
      ref={hostRef}
      aria-label={`${planet} outpost in a 3D view`}
      data-view-mode={firstPerson ? 'first-person' : 'third-person'}
    >
      <div className="scene-readout">
        <span>3D EVA VIEW</span>
        <span>{insideHabitat ? 'Habitat interior · WASD / arrows walk · Mouse look · Q view · E exit' : `${firstPerson ? 'First-person' : 'Third-person'} · Q toggle view · Mouse look · Movement follows view · Space jump`}</span>
      </div>
    </div>
  )
}
