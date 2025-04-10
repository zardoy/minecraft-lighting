import { test, expect } from 'vitest'
import { WorldLightHolder } from './worldLightHolder'

test('worldLightHolder', () => {
    const worldLightHolder = new WorldLightHolder(256, -64)
    worldLightHolder.setBlockLight(0, 0, 0, 10)
    expect(worldLightHolder.getBlockLight(0, 0, 0)).toBe(10)
})

test('worldLightHolder dump and load', () => {
    const worldLightHolder = new WorldLightHolder(256, -64)
    worldLightHolder.setBlockLight(0, -56, 0, 10)
    const dumped = worldLightHolder.dumpChunk(0, 0)!

    const worldLightHolder2 = new WorldLightHolder(0, 0) // ignored since we load it
    worldLightHolder2.loadChunk(dumped)
    expect(worldLightHolder2.getBlockLight(0, -56, 0)).toBe(10)
})
