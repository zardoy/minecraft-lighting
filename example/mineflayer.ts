import { createBot } from 'mineflayer'
import { createLightEngineForSyncWorld, fillColumnWithZeroLight } from '../src/prismarineShim'
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'

const bot = createBot({
    host: 'localhost',
    username: 'bot',
})

bot.on('login', () => {
    const data = minecraftData(bot.version)
    const lightWorld = createLightEngineForSyncWorld(bot.world, data, {
        enableSkyLight: false,
        minY: 0,
        height: 256,
    })
    const onChunkReady = (chunkX: number, chunkZ: number) => {
        // console.log(`chunk ${chunkX},${chunkZ} ready`)
    }

    const recomputeChunksLater = {} as Record<string, {x: number, z: number}[]>
    const promises = [] as Promise<void>[]
    const calculateLightChunk = async (pos: Vec3) => {
        const chunkX = Math.floor(pos.x / 16)
        const chunkZ = Math.floor(pos.z / 16)
        const affectedChunks = await lightWorld.receiveUpdateColumn(chunkX, chunkZ)
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
    bot.on('chunkColumnLoad', (pos) => {
        const chunkX = Math.floor(pos.x / 16)
        const chunkZ = Math.floor(pos.z / 16)
        fillColumnWithZeroLight(lightWorld.externalWorld, chunkX, chunkZ)
        promises.push(calculateLightChunk(pos))
    })
    bot.waitForChunksToLoad().then(async () => {
        console.log('chunks loaded')
        await Promise.all(promises)
        console.log(lightWorld.getLightLevelsString(-5, -5, 5, 10, 10, 'blockLight'))
    })
})

bot.on('spawn', () => {
    console.log('spawned')
})
