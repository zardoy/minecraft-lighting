import { describe, test, expect } from 'vitest'
import { World, TEST_BLOCKS, CHUNK_SIZE } from './engine'

describe('Minecraft Light Engine', () => {
    test('single glowstone block light propagation', () => {
        const world = new World()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

        // Get a slice of light levels around the glowstone
        const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 | 12 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |"
        `)
    })

    test('light blocked by stone block', () => {
        const world = new World()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a stone block at (5, 64, 6) to block light
        world.setBlock(5, 64, 6, TEST_BLOCKS.stone)

        const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 | 12 |
          | 11 | 12 | 13 | 14 | 15 |  0 | 14 | 13 | 12 | 11 | 10 |
          | 10 | 11 | 12 | 13 | 14 | 13 | 13 | 12 | 11 | 10 |  9 |
          |  9 | 10 | 11 | 12 | 13 | 12 | 12 | 11 | 10 |  9 |  8 |
          |  8 |  9 | 10 | 11 | 12 | 11 | 11 | 10 |  9 |  8 |  7 |
          |  7 |  8 |  9 | 10 | 11 | 10 | 10 |  9 |  8 |  7 |  6 |"
        `)
    })

    test('light filtered by water block', () => {
        const world = new World()

        // Place a glowstone block at (5, 64, 5)
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)

        // Place a water block at (5, 64, 6) to filter light
        world.setBlock(5, 64, 6, TEST_BLOCKS.water)

        const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 | 12 |
          | 11 | 12 | 13 | 14 | 15 | 13 | 14 | 13 | 12 | 11 | 10 |
          | 10 | 11 | 12 | 13 | 14 | 13 | 13 | 12 | 11 | 10 |  9 |
          |  9 | 10 | 11 | 12 | 13 | 12 | 12 | 11 | 10 |  9 |  8 |
          |  8 |  9 | 10 | 11 | 12 | 11 | 11 | 10 |  9 |  8 |  7 |
          |  7 |  8 |  9 | 10 | 11 | 10 | 10 |  9 |  8 |  7 |  6 |"
        `)
    })

    test('light propagation across chunk boundaries', () => {
        const world = new World()

        // Place a glowstone block at the edge of a chunk
        const chunkEdge = CHUNK_SIZE - 1
        world.setBlock(chunkEdge, 64, chunkEdge, TEST_BLOCKS.glowstone)

        // Get light levels across chunk boundary
        const lightLevels = world.getLightLevelsString(chunkEdge - 5, chunkEdge - 5, 64, chunkEdge + 5, chunkEdge + 5, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 | 12 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 | 11 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |  8 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 11 | 10 |  9 |  8 |  7 |"
        `)
    })

    test('multiple light sources', () => {
        const world = new World()

        // Place two glowstone blocks near each other
        world.setBlock(5, 64, 5, TEST_BLOCKS.glowstone)
        world.setBlock(7, 64, 5, TEST_BLOCKS.glowstone)

        const lightLevels = world.getLightLevelsString(0, 0, 64, 10, 10, 'blockLight')
        expect(lightLevels).toMatchInlineSnapshot(`
          "|  7 |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 |
          | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 15 | 15 | 14 |
          | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 15 | 15 | 14 | 13 |
          | 10 | 11 | 12 | 13 | 14 | 15 | 15 | 15 | 14 | 13 | 12 |
          |  9 | 10 | 11 | 12 | 13 | 14 | 15 | 14 | 13 | 12 | 11 |
          |  8 |  9 | 10 | 11 | 12 | 13 | 14 | 13 | 12 | 11 | 10 |
          |  7 |  8 |  9 | 10 | 11 | 12 | 13 | 12 | 11 | 10 |  9 |"
        `)
    })

    test('removing light source', () => {
        const world = new World()

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
