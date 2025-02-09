import { describe, test, expect } from 'vitest'
import { LightWorld, TEST_BLOCKS, CHUNK_SIZE } from './engine'

const getTestLightLevels = (world: LightWorld, isSkyLight: boolean = false, x: number = 0, z: number = 0) => {
    const lightLevels = world.getLightLevelsString(x, z, 64, 10, 10, isSkyLight ? 'skyLight' : 'blockLight')
    // remove second char
    return lightLevels.replace(/\|/, '')
}

describe('Block Light', () => {
    test('single glowstone block light propagation', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

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

    test.only('single glowstone block light propagation negative x,z', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(-55, 64, -55, TEST_BLOCKS.glowstone)

        // Get a slice of light levels around the glowstone
        const lightLevels = getTestLightLevels(world, false, -60, -60)
        expect(lightLevels).toMatchInlineSnapshot(`
          "  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |  0 |
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

    test('light blocked by stone block', () => {
        const world = new LightWorld()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a stone block at (5, 64, 6) to block light
        world.setBlock(5, 64, 6, TEST_BLOCKS.stone)

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
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a water block at (5, 64, 6) to filter light
        world.setBlock(5, 64, 6, TEST_BLOCKS.water)

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
        world.setBlock(chunkEdge, 64, chunkEdge, TEST_BLOCKS.glowstone)

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
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)
        world.setBlock(7, 64, 5, TEST_BLOCKS.glowstone)

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

    test('removing light source', () => {
        const world = new LightWorld()

        // Place and then remove a glowstone block
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)
        world.setBlock(5, 64, 5, TEST_BLOCKS.air)

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

describe.todo('Sky Light', () => {
  test('single glowstone block sky light propagation', () => {
    const world = new LightWorld()

    // Place a glowstone block at (5, 64, 5)
    world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

    // Get a slice of light levels around the glowstone
    const lightLevels = getTestLightLevels(world, true)
  })
})
