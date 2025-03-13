import { world } from 'prismarine-world'
import { Vec3 } from 'vec3'
import { LightWorld } from './engine'
import { WorldBlock, ExternalWorld } from './externalWorld'

interface WorldOptions {
    height?: number
    minY?: number
    enableSkyLight?: boolean
}

export const convertPrismarineBlockToWorldBlock = (block: any, mcData: any): WorldBlock => {
    const blockData = mcData.blocks[block.type]
    let emitLight = blockData.emitLight;
    // todo
    if (block.name === 'redstone_ore') {
        emitLight = 0;
    }
    const worldBlock = {
        name: block.name,
        id: block.type,
        isOpaque: !block.transparent,
        isLightSource: emitLight > 0,
        lightEmission: emitLight ?? 0,
        filterLight: blockData.filterLight ?? 1,
    }
    return worldBlock
}

export const createLightEngineForSyncWorld = (world: world.WorldSync, mcData: any, options: WorldOptions = {}) => {
    const externalWorld: ExternalWorld = {
        SUPPORTS_SKY_LIGHT: options.enableSkyLight ?? true,
        WORLD_HEIGHT: options.height ?? 256,
        WORLD_MIN_Y: options.minY ?? -64,
        getBlock(x, y, z) {
            const block = world.getBlock(new Vec3(x, y, z))
            if (!block) return undefined
            return convertPrismarineBlockToWorldBlock(block, mcData)
        },
        setBlock(x, y, z, blockId) {
            throw new Error('Not implemented')
        },
        getChunk(chunkX, chunkZ) {
            const chunk = world.getColumn(chunkX, chunkZ)
            if (!chunk) return undefined
            const chunkPosStart = new Vec3(chunkX * 16, 0, chunkZ * 16)
            return {
                position: { x: chunkX, z: chunkZ },
                getBlock: (x, y, z) => {
                    const block = world.getBlock(chunkPosStart.offset(x, y, z))
                    if (!block) return undefined
                    return convertPrismarineBlockToWorldBlock(block, mcData)
                },
                getBlockLight: (x, y, z) => {
                    return world.getBlockLight(chunkPosStart.offset(x, y, z))
                },
                setBlockLight: (x, y, z, value) => {
                    world.setBlockLight(chunkPosStart.offset(x, y, z), value)
                },
                getSunLight: (x, y, z) => {
                    return world.getSkyLight(chunkPosStart.offset(x, y, z))
                },
                setSunLight: (x, y, z, value) => {
                    world.setSkyLight(chunkPosStart.offset(x, y, z), value)
                },
            }
        },
        getBlockLight(x, y, z) {
            return world.getBlockLight(new Vec3(x, y, z))
        },
        setBlockLight(x, y, z, value) {
            const oldEmit = world['_emitBlockUpdate']
            world['_emitBlockUpdate'] = () => { }
            world.setBlockLight(new Vec3(x, y, z), value)
            world['_emitBlockUpdate'] = oldEmit
        },
        getSunLight(x, y, z) {
            return world.getSkyLight(new Vec3(x, y, z))
        },
        setSunLight(x, y, z, value) {
            const oldEmit = world['_emitBlockUpdate']
            world['_emitBlockUpdate'] = () => { }
            world.setSkyLight(new Vec3(x, y, z), value)
            world['_emitBlockUpdate'] = oldEmit
        },
        hasChunk(x, z) {
            return !!world.getColumn(x, z)
        },
    }
    return new LightWorld(externalWorld)
}

export const fillColumnWithZeroLight = (world: ExternalWorld, startChunkX: number, startChunkZ: number) => {
    for (let x = startChunkX * 16; x < (startChunkX + 1) * 16; x++) {
        for (let z = startChunkZ * 16; z < (startChunkZ + 1) * 16; z++) {
            for (let y = world.WORLD_MIN_Y; y < world.WORLD_HEIGHT; y++) {
                world.setBlockLight(x, y, z, 0)
            }
        }
    }
}
