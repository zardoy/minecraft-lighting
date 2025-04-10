import { world } from 'prismarine-world'
import PrismarineChunk from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { LightWorld } from './engine'
import { WorldBlock, ExternalWorld } from './externalWorld'
import { IndexedData } from 'minecraft-data'

interface WorldOptions {
    height?: number
    minY?: number
    enableSkyLight?: boolean
}

export const convertPrismarineBlockToWorldBlock = (stateId: number, mcData: IndexedData): WorldBlock => {
    const blockData = mcData.blocksByStateId[stateId]!
    let emitLight = blockData.emitLight;
    // todo disabled for perf for now
    if (blockData.name === 'redstone_ore') {
        emitLight = 0;
    }
    const worldBlock = {
        name: blockData.name,
        id: blockData.id,
        isOpaque: !blockData.transparent,
        isLightSource: emitLight > 0,
        lightEmission: emitLight ?? 0,
        filterLight: blockData.filterLight ?? 1,
    }
    return worldBlock
}

export const createLightEngineForSyncWorld = (world: world.WorldSync, mcData: IndexedData, options: WorldOptions = {}) => {
    const Chunk = PrismarineChunk(mcData.version.minecraftVersion!)
    const WORLD_HEIGHT = options.height ?? 256
    const WORLD_MIN_Y = options.minY ?? -64

    let skipLightGetBlockWorkaroundPerfJustWhy = false
    const patchLightUpdate = (fn) => {
        const oldEmit = world['_emitBlockUpdate']
        world['_emitBlockUpdate'] = () => { }
        skipLightGetBlockWorkaroundPerfJustWhy = true
        fn()
        world['_emitBlockUpdate'] = oldEmit
        skipLightGetBlockWorkaroundPerfJustWhy = false
    }
    const externalWorld: ExternalWorld = {
        SUPPORTS_SKY_LIGHT: options.enableSkyLight ?? true,
        WORLD_HEIGHT: WORLD_HEIGHT,
        WORLD_MIN_Y: WORLD_MIN_Y,
        getBlock(x, y, z) {
            const block = world.getBlockStateId(new Vec3(x, y, z))
            if (!block) return undefined
            return convertPrismarineBlockToWorldBlock(block, mcData)
        },
        setBlock(x, y, z, blockId) {
            throw new Error('Not implemented')
        },
        getChunk(chunkX, chunkZ) {
            let chunk = world.getColumn(chunkX, chunkZ)
            if (!chunk) {
                chunk = new Chunk({ x: chunkX, z: chunkZ, minY: WORLD_MIN_Y, worldHeight: WORLD_HEIGHT })
                world.setColumn(chunkX, chunkZ, chunk, false)
                const oldLoad = chunk['load'].bind(chunk)
                // chunk['load'] = (...args) => {
                //     // oldLoad(...args)
                // }
            }
            // dont waste time parsing lights since we do them ourselves
            chunk['loadParsedLight'] = () => { }
            const chunkPosStart = new Vec3(chunkX * 16, 0, chunkZ * 16)

            if (!chunk['getBlockPatched']) {
                const oldGetBlock = chunk.getBlock
                chunk.getBlock = (...args: [any, any]) => {
                    if (skipLightGetBlockWorkaroundPerfJustWhy) return null!
                    return oldGetBlock.call(chunk, ...args)
                }
            }
            chunk['getBlockPatched'] = true

            return {
                position: { x: chunkX, z: chunkZ },
                hasLightFromEngine: chunk['hasLightFromEngine'],
                getBlock: (x, y, z) => {
                    const block = world.getBlockStateId(chunkPosStart.offset(x, y, z))
                    if (!block) return undefined
                    return convertPrismarineBlockToWorldBlock(block, mcData)
                },
                getBlockLight: (x, y, z) => {
                    return world.getBlockLight(chunkPosStart.offset(x, y, z))
                },
                setBlockLight: (x, y, z, value) => {
                    if (value) {
                        chunk['hasLightFromEngine'] = true
                    }
                    world.setBlockLight(chunkPosStart.offset(x, y, z), Math.max(value, 7))
                },
                getSunLight: (x, y, z) => {
                    return world.getSkyLight(chunkPosStart.offset(x, y, z))
                },
                setSunLight: (x, y, z, value) => {
                    if (value) {
                        chunk['hasLightFromEngine'] = true
                    }
                    world.setSkyLight(chunkPosStart.offset(x, y, z), value)
                },
            }
        },
        getBlockLight(x, y, z) {
            return world.getBlockLight(new Vec3(x, y, z))
        },
        setBlockLight(x, y, z, value) {
            patchLightUpdate(() => {
                world.setBlockLight(new Vec3(x, y, z), value)
            })
        },
        getSunLight(x, y, z) {
            return world.getSkyLight(new Vec3(x, y, z))
        },
        setSunLight(x, y, z, value) {
            patchLightUpdate(() => {
                world.setSkyLight(new Vec3(x, y, z), value)
            })
        },
        hasChunk(x, z) {
            return !!world.getColumn(x, z)
        },
    }
    return new LightWorld(externalWorld)
}

export const fillColumnWithZeroLight = (world: ExternalWorld, startChunkX: number, startChunkZ: number) => {
    const chunk = world.getChunk(startChunkX, startChunkZ)
    if (chunk?.['hasLightFromEngine']) {
        return
    }
    for (let x = startChunkX * 16; x < (startChunkX + 1) * 16; x++) {
        for (let z = startChunkZ * 16; z < (startChunkZ + 1) * 16; z++) {
            for (let y = world.WORLD_MIN_Y; y < world.WORLD_HEIGHT; y++) {
                world.setBlockLight(x, y, z, 0)
            }
        }
    }
}
