import { createBot } from 'mineflayer'
import { createLightEngineForSyncWorld, fillColumnWithZeroLight } from '../src/prismarineShim'
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'

const bot = createBot({
    host: 'grim.mcraft.fun',
    username: 'bot',
})

bot.on('login', () => {
    const data = minecraftData(bot.version)
    const lightWorld = createLightEngineForSyncWorld(bot.world, data, {
        enableSkyLight: true,
        minY: 0,
        height: 256,
    })
    const onChunkReady = (chunkX: number, chunkZ: number) => {
        // console.log(`chunk ${chunkX},${chunkZ} ready`)
    }

    const recomputeChunksLater = {} as Record<string, {x: number, z: number}[]>
    const promises = [] as Promise<void>[]
    let i = 0
    const calculateLightChunk = async (pos: Vec3) => {
        let k = i++
        const chunkX = Math.floor(pos.x / 16)
        const chunkZ = Math.floor(pos.z / 16)
        // fillColumnWithZeroLight(lightWorld.externalWorld, chunkX, chunkZ)

        console.log('processing', k, chunkX, chunkZ)
        const affectedChunks = (await lightWorld.receiveUpdateColumn(chunkX, chunkZ)) ?? []
        console.log('processed', k, chunkX, chunkZ)
        onChunkReady(chunkX, chunkZ)
        for (const chunk of affectedChunks) {
            if (bot.world.getColumn(chunk.x, chunk.z)) {
                onChunkReady(chunk.x, chunk.z)
            } else {
                recomputeChunksLater[chunk.x + ',' + chunk.z] ??= []
                recomputeChunksLater[chunk.x + ',' + chunk.z].push({ x: chunkX, z: chunkZ })
            }
        }
    }
    let totalTime = 0
    const gotChunkOverNetwork = (chunkX: number, chunkZ: number) => {
        calculateLightChunk(new Vec3(chunkX * 16, 0, chunkZ * 16))
        // let start = performance.now()
        // for (let x = chunkX * 16; x < (chunkX + 1) * 16; x++) {
        //     for (let z = chunkZ * 16; z < (chunkZ + 1) * 16; z++) {
        //         for (let y = lightWorld.WORLD_MIN_Y; y < lightWorld.WORLD_HEIGHT; y++) {
        //             bot.world.getBlockStateId(new Vec3(x, y, z))
        //         }
        //     }
        // }
        // const end = performance.now()
        // totalTime += end - start
    }
    bot._client.on('map_chunk', ({ x, z }) => gotChunkOverNetwork(x, z))
    bot._client.on('map_chunk_bulk', ({ meta }) => {
        for (const chunk of meta) {
            gotChunkOverNetwork(chunk.x, chunk.z)
        }
    })
    // bot.on('chunkColumnLoad', (pos) => {
    //     const chunkX = Math.floor(pos.x / 16)
    //     const chunkZ = Math.floor(pos.z / 16)
    //     promises.push(calculateLightChunk(pos))
    // })
    bot.waitForChunksToLoad().then(async () => {
        console.log('chunks loaded')
        await Promise.all(promises)
        console.log(lightWorld.getLightLevelsString(-5, -5, 5, 10, 10, 'skyLight'))
        console.log(bot.settings.viewDistance, lightWorld.chunksProcessed)
        console.log(lightWorld.getPerformanceStats())
        console.log('total time', totalTime)
    })
})

bot.on('spawn', () => {
    console.log('spawned')
})
