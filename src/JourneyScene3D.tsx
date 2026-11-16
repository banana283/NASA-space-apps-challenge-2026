import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type JourneyScreen = 'earth' | 'launch' | 'space' | 'landing' | 'summary'

type JourneyScene3DProps = {
  screen: JourneyScreen
  planet: 'Moon' | 'Mars'
  progress: number
  returningToEarth: boolean
  stationX: number
  stationDepth: number
  stationDoorOpen: boolean
  shipBoarded: boolean
  jumping: boolean
  onFirstPersonMove?: (dx: number, dy: number) => void
}

const standard = (color: number, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })
const CANADA_SURFACE_NORMAL = new THREE.Vector3(-0.11, 0.82, -0.56).normalize()
const CANADA_ROTATION_Y = 2.7
const EARTH_STATION_SCALE = 0.55

const createEarthTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null
  const ocean = context.createLinearGradient(0, 0, 0, 512)
  ocean.addColorStop(0, '#4bb7e5')
  ocean.addColorStop(0.55, '#217fc5')
  ocean.addColorStop(1, '#164f9a')
  context.fillStyle = ocean
  context.fillRect(0, 0, 1024, 512)
  context.fillStyle = '#62c875'
  const continents = [
    [[135, 85], [225, 58], [282, 88], [300, 137], [260, 181], [235, 231], [200, 220], [178, 174], [132, 145]],
    [[275, 228], [325, 253], [340, 300], [320, 365], [291, 420], [265, 380], [252, 319]],
    [[470, 85], [522, 75], [565, 92], [586, 128], [558, 151], [519, 143], [493, 115]],
    [[515, 155], [568, 167], [601, 223], [583, 273], [557, 326], [527, 304], [512, 242], [490, 199]],
    [[607, 101], [696, 82], [781, 103], [844, 143], [824, 184], [760, 192], [715, 169], [657, 182], [618, 145]],
    [[740, 235], [813, 228], [854, 256], [835, 288], [780, 282], [750, 264]],
  ]
  continents.forEach((points) => {
    context.beginPath()
    context.moveTo(points[0][0], points[0][1])
    points.slice(1).forEach(([x, y]) => context.lineTo(x, y))
    context.closePath()
    context.fill()
  })
  context.fillStyle = 'rgba(255,255,255,0.28)'
  context.beginPath()
  context.ellipse(510, 34, 430, 42, 0, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.ellipse(500, 476, 420, 36, 0, 0, Math.PI * 2)
  context.fill()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const makeRocket = () => {
  const rocket = new THREE.Group()
  const white = standard(0xe4e7e5, 0.38, 0.2)
  const dark = standard(0x465964, 0.45, 0.3)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.82, 2.2, 20), standard(0xd9e1df, 0.34, 0.2))
  nose.position.y = 5.2
  rocket.add(nose)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1, 5.8, 24), white)
  body.position.y = 1.3
  rocket.add(body)
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.99, 0.55, 24), standard(0x3f9cb5, 0.35, 0.15))
  stripe.position.y = 0.7
  rocket.add(stripe)
  const window = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), standard(0x326c85, 0.25, 0.3))
  window.scale.set(1, 1, 0.25)
  window.position.set(0, 3.2, 0.81)
  rocket.add(window)

  for (let index = 0; index < 3; index += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 1.25), dark)
    fin.position.set(0, -0.75, 0)
    fin.rotation.y = index * Math.PI * 2 / 3
    fin.translateZ(0.84)
    rocket.add(fin)
  }
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.37, 0.62, 16), dark)
  engine.position.y = -1.72
  rocket.add(engine)

  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xff9f40, transparent: true, opacity: 0.92 })
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.8, 16), flameMaterial)
  flame.rotation.x = Math.PI
  flame.position.y = -3.2
  rocket.add(flame)
  flame.visible = false
  rocket.userData.flame = flame
  return rocket
}

const makeAstronaut = () => {
  const group = new THREE.Group()
  const suit = standard(0xe1e7e2)
  const trim = standard(0x8c9a9b)
  const visor = standard(0x203944, 0.25, 0.25)
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.72, 4, 8), suit)
  body.position.y = 1.15
  group.add(body)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 16), suit)
  helmet.position.y = 2.02
  group.add(helmet)
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), visor)
  face.scale.set(1, 0.7, 0.45)
  face.position.set(0, 2.05, 0.28)
  group.add(face)
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.86, 0.34), trim)
  backpack.position.set(0, 1.22, -0.4)
  group.add(backpack)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 3, 8), trim)
    leg.position.set(side * 0.21, 0.4, 0)
    group.add(leg)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 3, 8), suit)
    arm.position.set(side * 0.52, 1.27, 0.06)
    arm.rotation.z = side * -0.22
    group.add(arm)
  }
  return group
}

const createStation = (doorOpen: boolean) => {
  const platform = new THREE.Group()
  const groundPad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 10), standard(0x52636c, 0.8, 0.3))
  groundPad.position.y = -0.18
  platform.add(groundPad)

  const building = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.1, 4.2), standard(0xb9c4c0, 0.72, 0.12))
  building.position.set(-0.4, 1.55, -1)
  platform.add(building)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.22, 4.5), standard(0x40545b, 0.6, 0.25))
  roof.position.set(-0.4, 3.18, -1)
  platform.add(roof)
  for (const x of [-1.8, -0.4, 1]) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.12), standard(0x6da9bb, 0.3, 0.25))
    window.position.set(x, 1.9, 1.12)
    platform.add(window)
  }

  const sideModule = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.1, 2.8), standard(0x89999a, 0.74, 0.12))
  sideModule.position.set(-4.4, 1.05, -1.2)
  platform.add(sideModule)

  const hatch = new THREE.Group()
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.3, 20), standard(0xa6b5b6, 0.5, 0.3))
  frame.rotation.z = Math.PI / 2
  frame.position.set(2.25, 0.9, -1)
  platform.add(frame)
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 20), standard(0x455b67, 0.4, 0.3))
  door.position.set(0.15, 0, 0)
  door.rotation.z = Math.PI / 2
  hatch.add(door)
  hatch.position.set(2.25, 0.9, -1)
  if (doorOpen) {
    hatch.rotation.y = -Math.PI * 0.42
  }
  platform.add(hatch)

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.16, 24), standard(0x37484e, 0.82, 0.18))
  pad.position.set(3.8, 0.05, 2.5)
  platform.add(pad)
  const padMarking = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 24), standard(0xe1d6a5, 0.6, 0.15))
  padMarking.rotation.x = Math.PI / 2
  padMarking.position.set(3.8, 0.15, 2.5)
  platform.add(padMarking)

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.4, 8), standard(0x82959b, 0.45, 0.35))
  mast.position.set(-5.4, 1.7, 2.8)
  platform.add(mast)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), standard(0xd0d5ce, 0.5, 0.2))
  dish.position.set(-5.4, 3.4, 2.8)
  dish.rotation.x = Math.PI
  platform.add(dish)

  return platform
}

const addCanadianStation = (earth: THREE.Mesh, station: THREE.Group, radius: number, scale: number) => {
  station.position.copy(CANADA_SURFACE_NORMAL.clone().multiplyScalar(radius))
  station.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), CANADA_SURFACE_NORMAL)
  station.scale.setScalar(scale)
  earth.add(station)
}

const createDestination = (planet: 'Moon' | 'Mars') => {
  const color = planet === 'Moon' ? 0xaaa79b : 0xb45f43
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(8, 40, 28),
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }),
  )
  sphere.userData.planet = planet
  return sphere
}

export default function JourneyScene3D({
  screen,
  planet,
  progress,
  returningToEarth,
  stationX,
  stationDepth,
  stationDoorOpen,
  shipBoarded,
  jumping,
  onFirstPersonMove,
}: JourneyScene3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const firstPersonRef = useRef(false)
  const lookYawRef = useRef(0)
  const lookPitchRef = useRef(0)
  const onFirstPersonMoveRef = useRef(onFirstPersonMove)
  const [firstPerson, setFirstPerson] = useState(false)
  const progressRef = useRef(progress)
  const stationXRef = useRef(stationX)
  const stationDepthRef = useRef(stationDepth)
  const boardedRef = useRef(shipBoarded)
  const jumpingRef = useRef(jumping)

  useEffect(() => {
    onFirstPersonMoveRef.current = onFirstPersonMove
  }, [onFirstPersonMove])

  useEffect(() => {
    if (screen !== 'earth') {
      firstPersonRef.current = false
      return
    }

    const handleViewToggle = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'q' || event.repeat) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      firstPersonRef.current = !firstPersonRef.current
      lookYawRef.current = 0
      lookPitchRef.current = 0
      setFirstPerson(firstPersonRef.current)
    }
    const handleMouseMove = (event: MouseEvent) => {
      if (!firstPersonRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      lookYawRef.current -= event.movementX * 0.0025
      lookPitchRef.current = Math.max(-1.35, Math.min(1.35, lookPitchRef.current - event.movementY * 0.0025))
    }
    const handleFirstPersonMovement = (event: KeyboardEvent) => {
      if (!firstPersonRef.current || boardedRef.current) return
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const right = key === 'arrowright' || key === 'd' ? 1 : key === 'arrowleft' || key === 'a' ? -1 : 0
      const forward = key === 'arrowup' || key === 'w' ? 1 : key === 'arrowdown' || key === 's' ? -1 : 0
      if ((right === 0 && forward === 0) || !onFirstPersonMoveRef.current) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const yaw = lookYawRef.current
      onFirstPersonMoveRef.current(
        right * Math.sin(yaw) + forward * Math.cos(yaw),
        -right * Math.cos(yaw) + forward * Math.sin(yaw),
      )
    }

    window.addEventListener('keydown', handleViewToggle)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('keydown', handleFirstPersonMovement, true)
    return () => {
      window.removeEventListener('keydown', handleViewToggle)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('keydown', handleFirstPersonMovement, true)
    }
  }, [screen])

  useEffect(() => {
    progressRef.current = progress
    stationXRef.current = stationX
    stationDepthRef.current = stationDepth
    boardedRef.current = shipBoarded
    jumpingRef.current = jumping
  }, [progress, stationX, stationDepth, shipBoarded, jumping])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(screen === 'earth' ? 0x07121d : 0x030916)
    scene.fog = screen === 'earth' ? new THREE.Fog(0x07121d, 45, 130) : null
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 200)
    camera.position.set(18, 10, 22)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xc4e4ff, 0x28323d, 2))
    const keyLight = new THREE.DirectionalLight(0xffedce, 3)
    keyLight.position.set(-14, 24, 10)
    scene.add(keyLight)

    const rocket = makeRocket()
    let astronaut = new THREE.Group()
    let earth: THREE.Mesh | null = null
    let earthStation: THREE.Group | null = null
    let destination: THREE.Mesh | null = null
    let ship: THREE.Group | null = null
    let flame: THREE.Mesh | null = null
    let summaryEarth: THREE.Mesh | null = null

    if (screen === 'earth') {
      earth = new THREE.Mesh(
        new THREE.SphereGeometry(12, 48, 32),
        new THREE.MeshStandardMaterial({ map: createEarthTexture(), roughness: 0.9 }),
      )
      earth.position.set(13, 8, -24)
      earth.rotation.y = CANADA_ROTATION_Y
      scene.add(earth)
      camera.lookAt(earth.position)
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(12.14, 40, 28),
        new THREE.MeshBasicMaterial({ color: 0x3b9dd5, transparent: true, opacity: 0.13, side: THREE.BackSide }),
      )
      atmosphere.position.copy(earth.position)
      scene.add(atmosphere)
      earthStation = createStation(stationDoorOpen)
      addCanadianStation(earth, earthStation, 12.1, EARTH_STATION_SCALE)
      rocket.position.set(3.8, 1.85, 2.5)
      astronaut = makeAstronaut()
      astronaut.scale.setScalar(1.4)
      astronaut.position.set(stationXRef.current * 0.11 - 5.5, 0, 2.2 - stationDepthRef.current * 0.55)
      earthStation.add(rocket)
      earthStation.add(astronaut)
    } else if (screen === 'launch') {
      if (returningToEarth) {
        destination = createDestination(planet)
        destination.position.set(0, -7, -15)
        scene.add(destination)
      } else {
        destination = new THREE.Mesh(
          new THREE.SphereGeometry(12, 40, 28),
          new THREE.MeshStandardMaterial({ map: createEarthTexture(), roughness: 0.9 }),
        )
        destination.position.set(0, -8, -17)
        scene.add(destination)
      }
      const launchPad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.8, 32), standard(0x55646b, 0.75, 0.3))
      launchPad.position.set(0, -0.4, returningToEarth ? -5 : 0)
      scene.add(launchPad)
      rocket.position.set(0, -1, returningToEarth ? -5 : 0)
      scene.add(rocket)
      flame = rocket.userData.flame
      if (flame) flame.visible = true
      camera.position.set(10, 7.5, 18)
      camera.lookAt(0, 3, 0)
    } else {
      const starGeometry = new THREE.BufferGeometry()
      const starPositions = new Float32Array(900 * 3)
      for (let index = 0; index < 900; index += 1) {
        starPositions[index * 3] = (Math.random() - 0.5) * 150
        starPositions[index * 3 + 1] = (Math.random() - 0.5) * 95
        starPositions[index * 3 + 2] = -Math.random() * 100
      }
      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xe4f0ff, size: 0.18 })))
      if (screen === 'summary' && returningToEarth) {
        summaryEarth = new THREE.Mesh(
          new THREE.SphereGeometry(12, 40, 28),
          new THREE.MeshStandardMaterial({ map: createEarthTexture(), roughness: 0.9 }),
        )
        summaryEarth.position.set(0, 0, -27)
        summaryEarth.rotation.y = CANADA_ROTATION_Y
        scene.add(summaryEarth)
        const station = createStation(false)
        addCanadianStation(summaryEarth, station, 12.1, EARTH_STATION_SCALE)
      } else {
        destination = returningToEarth
          ? new THREE.Mesh(
            new THREE.SphereGeometry(8, 40, 28),
            new THREE.MeshStandardMaterial({ map: createEarthTexture(), roughness: 0.9 }),
          )
          : createDestination(planet)
        destination.position.set(
          0,
          screen === 'landing' && !returningToEarth ? -7 : 0,
          screen === 'landing' ? -15 : -27,
        )
        scene.add(destination)
        if (screen === 'landing' && returningToEarth) {
          const station = createStation(false)
          destination.rotation.y = CANADA_ROTATION_Y
          addCanadianStation(destination, station, 8.1, EARTH_STATION_SCALE * (8 / 12))
        }
      }
      if (screen === 'space') {
        ship = new THREE.Group()
        const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 3.2, 4, 12), standard(0xdce3e2, 0.4, 0.25))
        hull.rotation.x = Math.PI / 2
        ship.add(hull)
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10), standard(0x317a99, 0.25, 0.3))
        cockpit.scale.set(1, 0.55, 0.65)
        cockpit.position.set(0, 0.2, 1.4)
        ship.add(cockpit)
        const solarWingMaterial = standard(0x2876a2, 0.42, 0.2)
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.1, 1.3), solarWingMaterial)
          wing.position.set(side * 3.6, 0, -0.3)
          ship.add(wing)
          const support = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.4), standard(0x9acadd, 0.3, 0.2))
          support.position.set(side * 3.6, 0.08, -0.3)
          ship.add(support)
        }
        scene.add(ship)
        camera.position.set(0, 4.8, 14)
        camera.lookAt(0, 0, -3)
      } else if (screen === 'landing') {
        rocket.position.set(0, 8, 4)
        scene.add(rocket)
        flame = rocket.userData.flame
        if (flame) flame.visible = true
        camera.position.set(0, 5, 18)
        camera.lookAt(0, 0, -5)
      }
    }

    if (screen === 'summary' && !returningToEarth) {
      camera.position.set(0, 4.8, 21)
      camera.lookAt(0, 1, -8)
    } else if (screen === 'earth' || (screen === 'summary' && returningToEarth)) {
      if (screen === 'earth' && earthStation) {
        camera.position.copy(earthStation.localToWorld(new THREE.Vector3(0, 11, 20)))
        camera.lookAt(earthStation.localToWorld(new THREE.Vector3(0, 1.4, 0)))
      } else {
        camera.position.set(0, 7.2, 16.5)
        camera.lookAt(0, 0, -10)
      }
    }

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
    let frameId = 0
    const clock = new THREE.Clock()
    const animate = () => {
      frameId = window.requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      const currentProgress = progressRef.current / 100
      if (screen === 'earth') {
        if (earth) earth.rotation.y = CANADA_ROTATION_Y + time * 0.002
        astronaut.position.x = stationXRef.current * 0.11 - 5.5
        astronaut.position.z = 2.2 - stationDepthRef.current * 0.55
        astronaut.position.y = jumpingRef.current ? 0.4 + Math.abs(Math.sin(time * 6)) * 0.5 : 0
        if (firstPersonRef.current && !boardedRef.current) {
          astronaut.visible = false
          const eye = new THREE.Vector3(astronaut.position.x, astronaut.position.y + 1.8, astronaut.position.z - 0.45)
          const lookDirection = new THREE.Vector3(
            Math.cos(lookYawRef.current) * Math.cos(lookPitchRef.current),
            Math.sin(lookPitchRef.current),
            -Math.sin(lookYawRef.current) * Math.cos(lookPitchRef.current),
          )
          camera.position.lerp(eye, 0.18)
          camera.lookAt(camera.position.clone().add(lookDirection))
        } else {
          astronaut.visible = !boardedRef.current
          if (earthStation) {
            camera.position.copy(earthStation.localToWorld(new THREE.Vector3(0, 11, 20)))
            camera.lookAt(earthStation.localToWorld(new THREE.Vector3(0, 1.4, 0)))
          }
        }
        rocket.rotation.y = Math.sin(time * 0.15) * 0.03
      }
      if (screen === 'launch') {
        rocket.position.y = -1 + currentProgress * 15
        if (flame) {
          const pulse = 0.82 + Math.abs(Math.sin(time * 15)) * 0.42
          flame.scale.set(pulse, pulse, pulse)
        }
        camera.position.x = 9 + currentProgress * 2.5
        camera.position.y = 7 + currentProgress * 3.2
        camera.lookAt(0, rocket.position.y + 2, 0)
      }
      if (screen === 'space' && ship) {
        ship.position.set(Math.sin(time * 0.12) * 0.45, Math.sin(time * 0.3) * 0.18, 8 - currentProgress * 22)
        ship.rotation.z = Math.sin(time * 0.2) * 0.025
        if (destination) destination.rotation.y = (returningToEarth ? CANADA_ROTATION_Y : 0) + time * 0.025
      }
      if (screen === 'landing') {
        rocket.position.y = 8 - currentProgress * 6.3
        rocket.position.z = 4 - currentProgress * 9
        if (flame) {
          const pulse = 0.82 + Math.abs(Math.sin(time * 15)) * 0.42
          flame.scale.set(pulse, pulse, pulse)
        }
        if (destination) destination.rotation.y = (returningToEarth ? CANADA_ROTATION_Y : 0) + time * 0.02
      }
      if (screen === 'summary' && destination) destination.rotation.y = time * 0.018
      if (summaryEarth) summaryEarth.rotation.y = CANADA_ROTATION_Y + time * 0.02
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose()
            material.dispose()
          })
        }
      })
      renderer.dispose()
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
    }
  }, [screen, planet, stationDoorOpen, returningToEarth])

  return (
    <div className={`journey-scene-3d journey-${screen}`} aria-hidden="true" ref={hostRef}>
      {screen === 'earth' && (
        <div className="scene-readout">
          <span>{firstPerson ? 'First-person' : 'Third-person'}</span>
          <span>Q toggle view · Mouse look · Movement follows view</span>
        </div>
      )}
    </div>
  )
}
