import MinecraftData from 'minecraft-data'
import WorldLoader, { world as worldType } from 'prismarine-world'
import ChunkLoader from 'prismarine-chunk'
import { createWorkerProxy } from './workerProxy'
import { createLightEngineForSyncWorld, dumpPrismarineChunkLights, McData, WorldOptions } from './prismarineShim'
import { Vec3 } from 'vec3'

let initialized = false
let initializedPromise: Promise<void>

const toMajorVersion = version => {
    const [a, b] = (String(version)).split('.')
    return `${a}.${b}`
}

let world: worldType.WorldSync
let Chunk: typeof import('prismarine-chunk/types/index').PCChunk
let lightEngine: ReturnType<typeof createLightEngineForSyncWorld>
const init = async (version: string, options: WorldOptions, mcData?: McData) => {
    MinecraftData
    let resolve!: (value: void) => void
    initializedPromise = new Promise((r) => {
        resolve = r
    })
    initialized = false
    try {
        // globalThis.allLoadedMcData = {
        //     [version]: mcData,
        //     [toMajorVersion(version)]: mcData,
        // }
        await globalThis._LOAD_MC_DATA?.()
        const World = (WorldLoader as any)(version)
        world = new World(version).sync
        Chunk = (ChunkLoader as any)(version)
        lightEngine = createLightEngineForSyncWorld(world, MinecraftData(version), options)
        initialized = true
        resolve()
    } catch (err) {
        console.warn('Light engine worker thread failed to initialize:')
        console.error(err)
    }
}


export default createWorkerProxy({
    initialize: init,
    loadChunk: async (chunkX: number, chunkZ: number, json: string, doLighting: boolean) => {
        if (!initialized) return
        await initializedPromise
        world.setColumn(chunkX, chunkZ, Chunk.fromJson(json) as any, false)
        if (doLighting) {
            const chunks = await lightEngine.receiveUpdateColumn(chunkX, chunkZ) ?? []
            console.log('lighting done')
            return chunks.map(({ x, z }) => ({
                chunkX: x,
                chunkZ: z,
                data: dumpPrismarineChunkLights(world, x, z)
            }))
        }
        return []
    },
    setBlock: async (x: number, y: number, z: number, blockId: number) => {
        if (!initialized) return
        await initializedPromise
        world.setBlockStateId(new Vec3(x, y, z), blockId)
        const {affectedChunks} = await lightEngine.setBlockUpdateChunkIfNeeded(x, y, z) ?? {}
        return {
            affectedChunks: (affectedChunks ?? []).map(({ x, z }) => ({
            chunkX: x,
                chunkZ: z,
                data: dumpPrismarineChunkLights(world, x, z)
            }))
        }
    },
    unloadChunk: async (chunkX: number, chunkZ: number) => {
        if (!initialized) return
        await initializedPromise
        world.unloadColumn(chunkX, chunkZ)
        lightEngine.columnCleanup(chunkX, chunkZ)
    },
})
