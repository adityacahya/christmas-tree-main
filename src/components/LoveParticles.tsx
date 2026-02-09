import { useMemo, useRef } from "react"
import { Points, PointMaterial } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

export default function LoveParticles({ count = 30000 }) {
  const ref = useRef<THREE.Points>(null!)

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const t = Math.random() * Math.PI * 2

      const x = 16 * Math.pow(Math.sin(t), 3)
      const y =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)

      const z = (Math.random() - 0.5) * 6

      arr[i * 3] = x * 0.13
      arr[i * 3 + 1] = y * 0.13
      arr[i * 3 + 2] = z
    }

    return arr
  }, [count])

  useFrame(() => {
    ref.current.rotation.y += 0.002
  })

  return (
    <Points ref={ref} positions={positions} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#ff2f68"
        size={0.045}
        sizeAttenuation
        depthWrite={false}
      />
    </Points>
  )
}
