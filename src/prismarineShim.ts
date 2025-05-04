import { world } from 'prismarine-world'
import { Vec3 } from 'vec3'
import { LightWorld } from './engine'
import { WorldBlock, ExternalWorld } from './externalWorld'
import { IndexedData } from 'minecraft-data'
import { useWorkerProxy } from './workerProxy'
import type prismarineWorkerType from './prismarineWorker.worker'
import ChunkLoader from 'prismarine-chunk'
import BitArray from 'prismarine-chunk/src/pc/common/BitArrayNoSpan'

export interface WorldOptions {
    height?: number
    minY?: number
    enableSkyLight?: boolean

    writeLightToOriginalWorld?: boolean
}

export type McData = Pick<IndexedData, 'blocksByStateId'>

export const convertPrismarineBlockToWorldBlock = (stateId: number, mcData: McData): WorldBlock => {
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

export function posInChunk (x: number, y: number, z: number) {
    return {
        x: x & 15,
        y: y,
        z: z & 15,
    }
}

export const createLightEngineForSyncWorld = (world: world.WorldSync, mcData: McData, options: WorldOptions = {}) => {
    const WORLD_HEIGHT = options.height ?? 320
    const WORLD_MIN_Y = options.minY ?? -64

    let skipLightGetBlockWorkaroundPerfJustWhy = false
    const patchLightUpdate = (fn) => {
        const oldEmit = world['_emitBlockUpdate']
        world['_emitBlockUpdate'] = () => { }
        skipLightGetBlockWorkaroundPerfJustWhy = true
        try {
            fn()
        } finally {
            world['_emitBlockUpdate'] = oldEmit
            skipLightGetBlockWorkaroundPerfJustWhy = false
        }
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
            // no-op
        },
        getChunk(chunkX, chunkZ) {
            let chunk = world.getColumn(chunkX, chunkZ)
            if (!chunk) {
                return undefined
                // TODO why it fixes?
                // chunk = new Chunk({ x: chunkX, z: chunkZ, minY: WORLD_MIN_Y, worldHeight: WORLD_HEIGHT })
                // world.setColumn(chunkX, chunkZ, chunk, false)
                // const oldLoad = chunk['load'].bind(chunk)

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
                //     if (options.writeLightToOriginalWorld) {
                //         return world.getBlockLight(chunkPosStart.offset(x, y, z))
                //     } else {
                //         return engine.worldLightHolder.getBlockLight(chunkPosStart.x + x, y, chunkPosStart.z + z)
                //     }
                },
                setBlockLight: (x, y, z, value) => {
                    chunk.setBlockLight(new Vec3(x, y, z), value)
                    // patchLightUpdate(() => {
                    //     world.setBlockLight(chunkPosStart.offset(x, y, z), value)
                    // })
                    // if (options.writeLightToOriginalWorld) {
                    //     if (value) {
                    //         chunk['hasLightFromEngine'] = true
                    //     }
                    //     world.setBlockLight(chunkPosStart.offset(x, y, z), value)
                    // } else {
                    //     engine.worldLightHolder.setBlockLight(chunkPosStart.x + x, y, chunkPosStart.z + z, value)
                    // }
                },
                getSunLight: (x, y, z) => {
                    return chunk.getSkyLight(new Vec3(x, y, z))
                    // if (options.writeLightToOriginalWorld) {
                    //     return world.getSkyLight(chunkPosStart.offset(x, y, z))
                    // } else {
                    //     return engine.worldLightHolder.getSkyLight(chunkPosStart.x + x, y, chunkPosStart.z + z)
                    // }
                },
                setSunLight: (x, y, z, value) => {
                    chunk.setSkyLight(new Vec3(x, y, z), value)
                    // patchLightUpdate(() => {
                    //     world.setSkyLight(chunkPosStart.offset(x, y, z), value)
                    // })
                    // if (options.writeLightToOriginalWorld) {
                    //     if (value) {
                    //         chunk['hasLightFromEngine'] = true
                    //     }
                    //     world.setSkyLight(chunkPosStart.offset(x, y, z), value)
                    // } else {
                    //     engine.worldLightHolder.setSkyLight(chunkPosStart.x + x, y, chunkPosStart.z + z, value)
                    // }
                },
            }
        },
        getBlockLight(x, y, z) {
            if (options.writeLightToOriginalWorld) {
                return world.getBlockLight(new Vec3(x, y, z))
            } else {
                return engine.worldLightHolder.getBlockLight(x, y, z)
            }
        },
        setBlockLight(x, y, z, value) {
            if (options.writeLightToOriginalWorld) {
                patchLightUpdate(() => {
                    world.setBlockLight(new Vec3(x, y, z), value)
                })
            } else {
                engine.worldLightHolder.setBlockLight(x, y, z, value)
            }
        },
        getSunLight(x, y, z) {
            const chunk = this?.getChunk(Math.floor(x / 16), Math.floor(z / 16))
            if (!chunk) return 0
            const pos = posInChunk(x, y, z)
            return chunk.getSunLight(pos.x, pos.y, pos.z)
            // if (options.writeLightToOriginalWorld) {
            //     return world.getSkyLight(new Vec3(x, y, z))
            // } else {
            //     return engine.worldLightHolder.getSkyLight(x, y, z)
            // }
        },
        setSunLight(x, y, z, value) {
            const chunk = this?.getChunk(Math.floor(x / 16), Math.floor(z / 16))
            if (!chunk) throw new Error('Chunk not found')
            const pos = posInChunk(x, y, z)
            chunk.setSunLight(pos.x, pos.y, pos.z, value)
            // patchLightUpdate(() => {
            //     world.setSkyLight(new Vec3(x, y, z), value)
            // })
            // if (options.writeLightToOriginalWorld) {
            //     patchLightUpdate(() => {
            //         world.setSkyLight(new Vec3(x, y, z), value)
            //     })
            // } else {
            //     engine.worldLightHolder.setSkyLight(x, y, z, value)
            // }
        },
        hasChunk(x, z) {
            return !!world.getColumn(x, z)
        },
    }
    const engine = new LightWorld(externalWorld)
    return engine
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

export interface ChunkUpdateFromWorker {
    chunkX: number
    chunkZ: number
}

interface LightEngineWorkerMainMethods {
    initialize(options: WorldOptions): void
    loadChunk(chunkX: number, chunkZ: number, doLighting: boolean): Promise<ChunkUpdateFromWorker[]>
    // todo do batching!
    setBlock(x: number, y: number, z: number, blockId: number): Promise<ChunkUpdateFromWorker[]>
    unloadChunk(chunkX: number, chunkZ: number): void
    destroy(): void
    // getLightsLevel
    // getPerformanceStats
    // dumpChunkLights
}

export const dumpPrismarineChunkLights = (world: world.WorldSync, chunkX: number, chunkZ: number) => {
    const chunk = world.getColumn(chunkX, chunkZ) as any
    return chunk.dumpLightNew()
    // return chunk.toJson()
}

interface LightData {
    skyLightMask: number[]
    blockLightMask: number[]
    emptySkyLightMask: number[]
    emptyBlockLightMask: number[]
}

// export const loadPrismarineChunkLights = (world: world.WorldSync, chunkX: number, chunkZ: number, lightDump: LightData, Chunk: typeof import('prismarine-chunk/types/index').PCChunk) => {
//     const chunk = world.getColumn(chunkX, chunkZ) as any
//     if (!chunk) return
//     if (chunk.loadLight) {
//         chunk.loadLight(lightDump, lightData.skyLightMask, lightData.blockLightMask, lightData.emptySkyLightMask, lightData.emptyBlockLightMask)
//     } else {
//         chunk.loadParsedLight(lightData.skyLight, lightData.blockLight, lightData.skyLightMask, lightData.blockLightMask, lightData.emptySkyLightMask, lightData.emptyBlockLightMask)
//     }

//     // world.setColumn(chunkX, chunkZ, Chunk.fromJson(json) as any, false)
// }

export const createPrismarineLightEngineWorker = (worker: Worker, world: world.WorldSync, mcData: IndexedData) => {
    const proxy = useWorkerProxy<typeof prismarineWorkerType>(worker)
    const version = mcData.version.minecraftVersion!
    const Chunk = (ChunkLoader as any)(version)

    const methods: LightEngineWorkerMainMethods = {
        initialize(options: WorldOptions) {
            proxy.initialize(version, options, { blocksByStateId: mcData.blocksByStateId })
        },
        async loadChunk(chunkX: number, chunkZ: number, doLighting: boolean): Promise<ChunkUpdateFromWorker[]> {
            const column = world.getColumn(chunkX, chunkZ)
            const json = column.toJson()
            const chunks = await proxy.loadChunk(chunkX, chunkZ, json, doLighting) ?? []
            chunks.forEach(({ chunkX, chunkZ, data }) => {
                const chunk = world.getColumn(chunkX, chunkZ) as any
                if (!chunk) return
                chunk.loadLightNew(data)
            })
            return chunks
        },
        async setBlock(x, y, z, blockId) {
            const {affectedChunks: chunks} = await proxy.setBlock(x, y, z, blockId) ?? {}
            if (!chunks) return []
            chunks.forEach(({ chunkX, chunkZ, data }) => {
                const chunk = world.getColumn(chunkX, chunkZ) as any
                if (!chunk) return
                chunk.loadLightNew(data)
            })
            return chunks
        },
        unloadChunk(chunkX, chunkZ) {
            proxy.unloadChunk(chunkX, chunkZ)
        },
        destroy() {
            worker.terminate()
        },
    }

    return {
        ...methods,
    }
}
