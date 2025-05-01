import { describe, test, expect } from 'vitest'
import { LightWorld } from './engine'
import { TEST_BLOCKS, CHUNK_SIZE } from './externalWorld'
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import { createLightEngineForSyncWorld } from './prismarineShim'
import { getPrismarineSyncWorld } from './prismarineWorld'

const mcData = minecraftData('1.19.4')
const getSyncWorldTest = () => {
  const syncWorld = getPrismarineSyncWorld('1.19.4')
  return syncWorld
}

const getTestLightLevels = (world: LightWorld, isSkyLight: boolean = false, x: number = 0, z: number = 0) => {
    const lightLevels = world.getLightLevelsString(x, z, 64, 10, 10, isSkyLight ? 'skyLight' : 'blockLight')
    // remove second char
    return lightLevels.replace(/\|/, '')
}

describe('Block Light', () => {
    test('single glowstone block light propagation', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)

        // Get a slice of light levels around the glowstone
        const lightLevels = getTestLightLevels(world)
        expect(lightLevels).toMatchInlineSnapshot(`
          "  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
          |  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |"
        `)
    })

    test('single glowstone block light propagation negative x,z', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlockLegacy(-5, 64, -5, TEST_BLOCKS.glowstone)

        // Get a slice of light levels around the glowstone
        const lightLevels = getTestLightLevels(world, false, -10, -10)
        // todo: fix this
        expect(lightLevels).toMatchInlineSnapshot(`
          "  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 | -- |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 | -- |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 | -- |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 | -- |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 | -- |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | -- |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 | -- |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 | -- |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 | -- |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 | -- |
          | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |"
        `)
    })

    test.todo('light blocked by stone block', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a stone block at (5, 64, 6) to block light
        world.setBlockLegacy(5, 64, 6, TEST_BLOCKS.stone)

        const lightLevels = getTestLightLevels(world)
        expect(lightLevels).toMatchInlineSnapshot(`
          "  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 |  0 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 11 | 12 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 10 | 11 | 10 |  9 |  8 |  7 |
          |  6 |  7 |  8 |  9 | 10 |  9 | 10 |  9 |  8 |  7 |  6 |
          |  5 |  6 |  7 |  8 |  9 |  8 |  9 |  8 |  7 |  6 |  5 |"
        `)
    })

    test('light filtered by water block', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a water block at (5, 64, 6) to filter light
        world.setBlockLegacy(5, 64, 6, TEST_BLOCKS.water)

        const lightLevels = getTestLightLevels(world)
        expect(lightLevels).toMatchInlineSnapshot(`
          "  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
          |  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |"
        `)
    })

    test('light propagation across chunk boundaries', () => {
        const world = new LightWorld()

        // Place a glowstone block at the edge of a chunk
        const chunkEdge = CHUNK_SIZE - 1
        world.setBlockLegacy(chunkEdge, 64, chunkEdge, TEST_BLOCKS.glowstone)

        // Get light levels across chunk boundary
        const lightLevels = getTestLightLevels(world)
        expect(lightLevels).toMatchInlineSnapshot(`
          "  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  1 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  1 |  2 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  1 |  2 |  3 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  1 |  2 |  3 |  4 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  1 |  2 |  3 |  4 |  5 |"
        `)
    })

    test('multiple light sources', () => {
        const world = new LightWorld()

        // Place two glowstone blocks near each other
        world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)
        world.setBlockLegacy(7, 64, 5, TEST_BLOCKS.glowstone)

        const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  5 |  6 |  7 |  8 |  9 | 10 |  9 | 10 |  9 |  8 |  7 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 14 | 13 | 12 | 11 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 15 | 14 | 13 | 12 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 14 | 13 | 12 | 11 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 13 | 12 | 11 | 10 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 12 | 11 | 10 |  9 |
          |  6 |  7 |  8 |  9 | 10 | 11 | 10 | 11 | 10 |  9 |  8 |
          |  5 |  6 |  7 |  8 |  9 | 10 |  9 | 10 |  9 |  8 |  7 |"
        `)
    })

  describe.skip('Legacy block updates', () => {
    test('removing light source', () => {
      const world = new LightWorld()

      // Place and then remove a glowstone block
      world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)
      world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.air)

      const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
      expect(lightLevels).toMatchInlineSnapshot(`
          "|  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
          |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |"
        `)
    })
  })
})

describe('External world sync prismarine integration', () => {
  test.skip('single glowstone block light propagation', async () => {
    const syncWorldTest = getSyncWorldTest();
    const  lightWorld  = createLightEngineForSyncWorld(syncWorldTest, mcData)

    syncWorldTest.setBlockStateId(new Vec3(5, 64, 5), mcData.blocksByName['glowstone']!.defaultState)

    await lightWorld.receiveUpdateColumn(0, 0)

    // Get a slice of light levels around the glowstone
    const lightLevels = getTestLightLevels(lightWorld)
    expect(lightLevels).toMatchInlineSnapshot(`
      "  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |
      |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
      |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
      |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
      |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
      | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
      |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
      |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
      |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
      |  6 |  7 |  8 |  9 | 10 | 11 | 10 |  9 |  8 |  7 |  6 |
      |  5 |  6 |  7 |  8 |  9 | 10 |  9 |  8 |  7 |  6 |  5 |"
    `)
  })
})

describe.todo('Sky Light', () => {
  test('single glowstone block sky light propagation', () => {
    const world = new LightWorld()

    // Place a glowstone block at (5, 64, 5)
    world.setBlockLegacy(5, 64, 5, TEST_BLOCKS.glowstone)

    // Get a slice of light levels around the glowstone
    const lightLevels = getTestLightLevels(world, true)
  })
})
