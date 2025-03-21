import { Bot } from "mineflayer";
import { LightWorld } from './engine';
import { createLightEngineForSyncWorld, fillColumnWithZeroLight } from './prismarineShim';
import minecraftData from 'minecraft-data'
import { Vec3 } from 'vec3';

export default () => {
    return (bot: Bot) => {
        // bot.on('login', () => {
        //     const data = minecraftData(bot.version)
        //     bot.lightEngine = createLightEngineForSyncWorld(bot.world, data, {
        //         enableSkyLight: false,
        //         minY: 0,
        //         height: 256,
        //     })
        //     bot.light = {
        //         promises: []
        //     }
        // })

        // const onChunkReady = (chunkX: number, chunkZ: number) => {
        //     bot.emit('chunkLightReady', chunkX, chunkZ)
        // }

        // const recomputeChunksLater = {} as Record<string, {x: number, z: number}[]>
        // const calculateLightChunk = async (pos: Vec3) => {
        //     const chunkX = Math.floor(pos.x / 16)
        //     const chunkZ = Math.floor(pos.z / 16)
        //     const affectedChunks = (await bot.lightEngine.receiveUpdateColumn(chunkX, chunkZ)) ?? []
        //     onChunkReady(chunkX, chunkZ)
        //     for (const chunk of affectedChunks) {
        //         if (bot.world.getColumn(chunk.x, chunk.z)) {
        //             onChunkReady(chunk.x, chunk.z)
        //         } else {
        //             recomputeChunksLater[chunk.x + ',' + chunk.z] ??= []
        //             recomputeChunksLater[chunk.x + ',' + chunk.z]!.push({ x: chunkX, z: chunkZ })
        //         }
        //     }
        // }
        // const onChunkLoad = (chunkX: number, chunkZ: number) => {
        //     fillColumnWithZeroLight(bot.lightEngine.externalWorld, chunkX, chunkZ)
        //     bot.light.promises.push(calculateLightChunk(new Vec3(chunkX * 16, 0, chunkZ * 16)))
        // }
        // bot.on('chunkColumnLoad', (pos) => {
        //     const chunkX = Math.floor(pos.x / 16)
        //     const chunkZ = Math.floor(pos.z / 16)
        //     onChunkLoad(chunkX, chunkZ)
        // })
    }
}

declare module 'mineflayer' {
    interface BotEvents {
        chunkLightReady: (chunkX: number, chunkZ: number) => void
    }
    interface Bot {
        lightEngine: LightWorld
        light: {
            promises: Promise<void>[]
        }
    }
}
